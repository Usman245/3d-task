import './style.css'

import { Vector3 } from 'three'

import { createSimulation } from './sim/simulation.js'
import { computeLayout } from './sim/layout.js'
import { AGENTS } from './sim/pipeline.js'

import { createViewport } from './scene/viewport.js'
import { createLights } from './scene/lights.js'
import { createBackdrop } from './scene/backdrop.js'
import { createNodes, CARD } from './scene/nodes.js'
import { createEdges } from './scene/edges.js'

import { createRoster } from './ui/roster.js'
import { createLog } from './ui/log.js'
import { createRunBar } from './ui/runbar.js'
import { createLabels } from './ui/labels.js'

import { prefersReducedMotion } from './tokens.js'

/**
 * Composition root.
 *
 * This is the only module that knows all three layers exist. The simulation
 * publishes; the 3D scene and the DOM panel each subscribe. Neither view calls
 * the other, and the simulation imports neither — which is why the panel and
 * the scene can never disagree about an agent's state, and why pointing this at
 * a real orchestrator would mean replacing `src/sim/` and nothing else.
 */

const el = (id) => document.getElementById(id)

const agentNames = new Map(AGENTS.map((agent) => [agent.id, agent.name]))

// ---------------------------------------------------------------- simulation
const sim = createSimulation()

// --------------------------------------------------------------------- scene
const viewport = createViewport(el('viewport'))

let orientation = orientationFor(el('stage'))
const initialLayout = computeLayout(orientation)

const nodes = createNodes(initialLayout, orientation)
const edges = createEdges((agentId) => nodes.positionOf(agentId), orientation)

viewport.scene.add(createBackdrop(), ...createLights(), edges.group, nodes.group)
viewport.setFraming(framingFor(initialLayout, orientation))

// The graph re-flows when the viewport becomes taller than it is wide, which is
// what a phone in portrait gives us. Driven by the measured box rather than a
// CSS breakpoint, so it also covers a narrow desktop window or a split screen.
// Cards keep their state across the switch: state lives in each node, not in
// its position, so a run in progress simply carries on along the new path.
viewport.onResize(() => {
  const next = orientationFor(el('stage'))
  if (next === orientation) return
  orientation = next

  const layout = computeLayout(next)
  nodes.setLayout(layout, next)
  edges.setLayout((agentId) => nodes.positionOf(agentId), next)
  labels.setCompact(next === 'vertical')
  viewport.setFraming(framingFor(layout, next))
})

// ------------------------------------------------------------------------ ui
const roster = createRoster(el('roster'), el('roster-count'))
const log = createLog(el('log'), el('log-count'))
const labels = createLabels(el('labels'))
const runBar = createRunBar({
  idEl: el('run-id'),
  statusEl: el('run-status'),
  elapsedEl: el('run-elapsed'),
  progressEl: el('run-progress'),
})

labels.setCompact(orientation === 'vertical')

if (prefersReducedMotion) document.body.classList.add('reduce-motion')

// --------------------------------------------------------------- wiring
sim.on('run:start', (event) => {
  runBar.start(event.runId)
  edges.reset()
  log.runBoundary(`run #${event.runId.toString(16).padStart(4, '0')} started`, event.startedAt)
})

sim.on('agent:state', (event) => {
  nodes.setState(event.agentId, event.state)
  labels.setState(event.agentId, event.state)
  roster.setState(event)
  log.agentState(event)
  runBar.setProgress(roster.progress())
})

sim.on('handoff:start', (event) => {
  edges.beginHandoff(event.id)
  log.handoff(event, agentNames)
})

sim.on('handoff:end', (event) => {
  edges.endHandoff(event.id)
})

sim.on('run:end', (event) => {
  runBar.end(event.status)
  if (event.blocked.length > 0) roster.markBlocked(event.blocked)
  log.runBoundary(
    `run ${event.status} · ${(event.durationMs / 1000).toFixed(2)}s`,
    event.at,
    event.status === 'completed' ? 'text-state-completed' : 'text-state-failed',
  )
})

// ------------------------------------------------------------------ the loop
let paused = false
const projected = { x: 0, y: 0 }
const labelAnchor = new Vector3()

viewport.onFrame((delta, elapsed) => {
  if (!paused) sim.tick(delta * 1000)

  nodes.update(delta, elapsed, viewport.reducedMotion)
  edges.update(sim, viewport.reducedMotion)
  roster.tick(sim)
  runBar.tick(sim.elapsed)

  for (const agent of AGENTS) {
    labelAnchor.copy(nodes.positionOf(agent.id))
    labelAnchor.y -= CARD.height / 2 + 0.3
    viewport.project(labelAnchor, projected)
    labels.place(agent.id, projected.x, projected.y)
  }
})

// --------------------------------------------------------------- controls
const pauseButton = el('toggle-pause')
const connection = el('connection')

pauseButton.addEventListener('click', () => {
  paused = !paused
  pauseButton.textContent = paused ? 'resume' : 'pause'
  // Freezing the CSS pulse too keeps the panel honest: nothing should look
  // alive while the stream is stopped.
  document.body.classList.toggle('is-paused', paused)
  connection.lastChild.textContent = paused ? ' halted ' : ' streaming '
})

sim.start()

// Release GPU resources on hot reload so dev sessions do not leak contexts.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    nodes.dispose()
    edges.dispose()
    viewport.dispose()
  })
}

/**
 * Lay the pipeline out along whichever axis the viewport actually has room for.
 * The threshold sits slightly above square so a near-square box keeps the
 * left-to-right reading order, which is the more natural one for a pipeline.
 */
function orientationFor(stage) {
  return stage.clientWidth / Math.max(stage.clientHeight, 1) < 1.15
    ? 'vertical'
    : 'horizontal'
}

/** World-space box the camera must keep in shot, derived from the layout. */
function framingFor(positions, flow) {
  const xs = [...positions.values()].map((p) => p.x)
  const ys = [...positions.values()].map((p) => p.y)
  const vertical = flow === 'vertical'

  return {
    // The graph's own extent, cards included, in world units.
    width: Math.max(...xs) - Math.min(...xs) + CARD.width,
    height: Math.max(...ys) - Math.min(...ys) + CARD.height,

    // Pixel room for the label hanging under each card, plus surrounding air.
    // Stacked, width is the scarce axis and there is height to give away; side
    // by side it is the other way round. The vertical figure is the smallest
    // that never clips the bottom label on a 320x568 screen — anything larger
    // is scale taken off the cards for nothing.
    reserveX: vertical ? 44 : 170,
    reserveY: vertical ? 72 : 88,
  }
}
