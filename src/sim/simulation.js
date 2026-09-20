import { createEmitter } from './emitter.js'
import {
  AGENTS,
  FAILURE_REASONS,
  downstreamOf,
  edgeId,
  upstreamOf,
} from './pipeline.js'

/**
 * The run scheduler.
 *
 * Deliberately knows nothing about Three.js or the DOM: it advances a state
 * machine and emits plain, serialisable events. Both views subscribe to it, so
 * the 3D scene and the log panel cannot drift out of agreement — and replacing
 * this module with a websocket is the whole of the work to make the dashboard
 * real.
 *
 * Time is supplied by the caller (`tick(deltaMs)`) rather than read from a
 * clock. Pausing is then simply "stop calling tick", and the log timestamps
 * freeze along with the animation instead of racing ahead of it.
 *
 * Events
 *   run:start     { runId, startedAt }
 *   agent:state   { agentId, state, attempt, at, durationMs?, reason? }
 *   handoff:start { id, from, to, durationMs, at }
 *   handoff:end   { id, from, to, at }
 *   run:end       { runId, status, blocked, at, durationMs }
 */

const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 800
const HANDOFF_MS = 750
const RUN_RESTART_DELAY_MS = 3000

export function createSimulation() {
  const emitter = createEmitter()

  let agents = new Map()
  let handoffs = new Map()
  let clock = 0
  let wallBase = Date.now()
  let runId = 0
  let restartCountdown = null
  let random = mulberry32(Date.now() >>> 0)

  function timestamp() {
    return wallBase + clock
  }

  function setAgentState(agentId, state, extra = {}) {
    const agent = agents.get(agentId)
    agent.state = state
    emitter.emit('agent:state', {
      agentId,
      state,
      attempt: agent.attempt,
      action: agent.spec.action,
      name: agent.spec.name,
      at: timestamp(),
      ...extra,
    })
  }

  function startAgent(agentId) {
    const agent = agents.get(agentId)
    const [min, max] = agent.spec.duration
    agent.duration = min + random() * (max - min)
    agent.elapsed = 0
    agent.attempt += 1
    setAgentState(agentId, 'running', { durationMs: agent.duration })
  }

  function finishAgent(agentId) {
    const agent = agents.get(agentId)
    const base = agent.spec.failureRate ?? 0
    // A retry is far more likely to succeed than the first attempt — transient
    // faults are transient. Without this the loop stalls on the same node.
    const rate = agent.attempt > 1 ? base * 0.15 : base

    if (random() < rate) {
      const reason = FAILURE_REASONS[Math.floor(random() * FAILURE_REASONS.length)]
      const willRetry = agent.attempt < MAX_ATTEMPTS
      setAgentState(agentId, 'failed', { reason, willRetry })
      if (willRetry) agent.retryIn = RETRY_DELAY_MS
      return
    }

    setAgentState(agentId, 'completed', { durationMs: agent.duration })

    for (const to of downstreamOf(agentId)) {
      const id = edgeId(agentId, to)
      handoffs.set(id, { id, from: agentId, to, elapsed: 0, duration: HANDOFF_MS })
      emitter.emit('handoff:start', {
        id,
        from: agentId,
        to,
        durationMs: HANDOFF_MS,
        at: timestamp(),
      })
    }
  }

  /**
   * An agent starts only once every incoming edge has delivered its pulse — so
   * `index` genuinely waits on both `enrich` and `validate`. The downstream
   * agent flips to running when the pulse *lands*, not when the upstream
   * completes, which is what makes cause and effect read correctly on screen.
   */
  function tryStart(agentId) {
    const agent = agents.get(agentId)
    if (agent.state !== 'pending' || agent.retryIn > 0) return

    const ready = upstreamOf(agentId).every((from) =>
      agent.delivered.has(edgeId(from, agentId)),
    )
    if (ready) startAgent(agentId)
  }

  function tick(deltaMs) {
    if (restartCountdown !== null) {
      restartCountdown -= deltaMs
      if (restartCountdown <= 0) startRun()
      return
    }

    clock += deltaMs

    for (const agent of agents.values()) {
      if (agent.retryIn > 0) {
        agent.retryIn -= deltaMs
        if (agent.retryIn <= 0) {
          agent.retryIn = 0
          setAgentState(agent.spec.id, 'pending', { retrying: true })
          startAgent(agent.spec.id)
        }
        continue
      }

      if (agent.state !== 'running') continue
      agent.elapsed += deltaMs
      if (agent.elapsed >= agent.duration) finishAgent(agent.spec.id)
    }

    for (const handoff of [...handoffs.values()]) {
      handoff.elapsed += deltaMs
      if (handoff.elapsed < handoff.duration) continue

      handoffs.delete(handoff.id)
      agents.get(handoff.to).delivered.add(handoff.id)
      emitter.emit('handoff:end', {
        id: handoff.id,
        from: handoff.from,
        to: handoff.to,
        at: timestamp(),
      })
      tryStart(handoff.to)
    }

    if (isSettled()) endRun()
  }

  /** No agent running, nothing in transit, no retry queued: the run cannot advance. */
  function isSettled() {
    if (handoffs.size > 0) return false
    for (const agent of agents.values()) {
      if (agent.state === 'running' || agent.retryIn > 0) return false
    }
    return true
  }

  function endRun() {
    const status = agents.get('report').state === 'completed' ? 'completed' : 'failed'

    // Agents still pending at this point are blocked behind a failure and will
    // never run. Say so explicitly rather than leaving them looking queued.
    const blocked = [...agents.values()]
      .filter((agent) => agent.state === 'pending')
      .map((agent) => agent.spec.id)

    emitter.emit('run:end', {
      runId,
      status,
      blocked,
      at: timestamp(),
      durationMs: clock,
    })

    restartCountdown = RUN_RESTART_DELAY_MS
  }

  function startRun() {
    restartCountdown = null
    runId += 1
    clock = 0
    wallBase = Date.now()
    handoffs = new Map()
    random = mulberry32((Date.now() ^ (runId * 0x9e3779b9)) >>> 0)

    agents = new Map(
      AGENTS.map((spec) => [
        spec.id,
        {
          spec,
          state: 'pending',
          elapsed: 0,
          duration: 0,
          attempt: 0,
          retryIn: 0,
          delivered: new Set(),
        },
      ]),
    )

    emitter.emit('run:start', { runId, startedAt: timestamp() })
    for (const agent of agents.values()) {
      emitter.emit('agent:state', {
        agentId: agent.spec.id,
        name: agent.spec.name,
        action: agent.spec.action,
        state: 'pending',
        attempt: 0,
        at: timestamp(),
        quiet: true,
      })
    }

    // Roots have no incoming edges, so they are ready immediately.
    for (const agent of agents.values()) tryStart(agent.spec.id)
  }

  return {
    on: emitter.on,
    tick,
    start: startRun,

    /** Progress of a running agent, 0..1, for the views. */
    progressOf(agentId) {
      const agent = agents.get(agentId)
      if (!agent || agent.state !== 'running' || agent.duration === 0) return 0
      return Math.min(agent.elapsed / agent.duration, 1)
    },

    /** Milliseconds the current attempt has been running, for the live timer. */
    elapsedOf(agentId) {
      const agent = agents.get(agentId)
      return agent ? agent.elapsed : 0
    },

    /** Progress of an in-flight handoff, 0..1, or null when the edge is idle. */
    handoffProgress(id) {
      const handoff = handoffs.get(id)
      return handoff ? Math.min(handoff.elapsed / handoff.duration, 1) : null
    },

    get elapsed() {
      return clock
    },

    get runId() {
      return runId
    },
  }
}

/** Small seeded PRNG: runs vary, but a seed reproduces one exactly when debugging. */
function mulberry32(seed) {
  let a = seed
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
