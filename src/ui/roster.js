import { AGENTS } from '../sim/pipeline.js'
import { STATE_BG, STATE_TEXT, seconds } from './format.js'

/**
 * The agent roster: one row per agent, showing its current state, the action it
 * is performing, and a live timer while it runs.
 *
 * Rows are built once and then mutated. Re-rendering the list on every event
 * would reset the scroll position and make the running timer flicker.
 */
export function createRoster(root, countEl) {
  const rows = new Map()

  for (const agent of AGENTS) {
    const li = document.createElement('li')
    li.className =
      'group flex items-start gap-2.5 px-4 py-1.5 transition-colors hover:bg-surface-raised'

    li.innerHTML = `
      <span data-dot class="mt-1.5 size-1.5 shrink-0 rounded-full ${STATE_BG.pending}"></span>
      <span class="min-w-0 flex-1">
        <span class="flex items-baseline justify-between gap-2">
          <span data-name class="truncate text-[11px] text-ink-bright">${agent.name}</span>
          <span data-timer class="shrink-0 text-[10px] text-ink-faint tabular-nums"></span>
        </span>
        <span data-action class="mt-0.5 block truncate text-[10px] text-ink-dim">queued</span>
      </span>
    `

    rows.set(agent.id, {
      dot: li.querySelector('[data-dot]'),
      timer: li.querySelector('[data-timer]'),
      action: li.querySelector('[data-action]'),
      state: 'pending',
    })
    root.appendChild(li)
  }

  function setState(event) {
    const row = rows.get(event.agentId)
    row.state = event.state
    row.dot.className = `mt-1.5 size-1.5 shrink-0 rounded-full ${STATE_BG[event.state]} ${
      event.state === 'running' ? 'animate-state-pulse' : ''
    }`

    row.action.className = `mt-0.5 block truncate text-[10px] ${
      event.state === 'failed' ? STATE_TEXT.failed : 'text-ink-dim'
    }`

    if (event.state === 'failed') {
      row.action.textContent = event.willRetry
        ? `${event.reason} — retrying`
        : event.reason
    } else if (event.state === 'running') {
      row.action.textContent =
        event.attempt > 1 ? `${event.action} (retry ${event.attempt - 1})` : event.action
    } else if (event.state === 'completed') {
      row.action.textContent = 'done'
      row.timer.textContent = seconds(event.durationMs)
    } else {
      row.action.textContent = 'queued'
      row.timer.textContent = ''
    }

    updateCount()
  }

  function updateCount() {
    const done = [...rows.values()].filter((row) => row.state === 'completed').length
    countEl.textContent = `${done}/${rows.size}`
    return done / rows.size
  }

  return {
    setState,

    /** Called each frame so the running row shows a live, pausable timer. */
    tick(sim) {
      for (const [id, row] of rows) {
        if (row.state !== 'running') continue
        row.timer.textContent = seconds(sim.elapsedOf(id))
      }
    },

    /** Marks agents that can never run because an upstream failed for good. */
    markBlocked(ids) {
      for (const id of ids) {
        const row = rows.get(id)
        row.action.className = `mt-0.5 block truncate text-[10px] ${STATE_TEXT.failed}`
        row.action.textContent = 'blocked — upstream failed'
      }
    },

    progress: updateCount,
  }
}
