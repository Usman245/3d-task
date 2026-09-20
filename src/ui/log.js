import { STATE_TEXT, clockTime } from './format.js'

/**
 * The live event log.
 *
 * Note what this module is *not* doing: the simulation never emits a "log
 * event". It emits domain events, and the log derives readable lines from them
 * here. Formatting is a presentation concern, so it lives with the other
 * presentation code — and the simulation stays something you could point at a
 * real socket without editing.
 */

const MAX_LINES = 120

const STATUS_LABEL = {
  pending: 'QUEUED',
  running: 'RUNNING',
  completed: 'OK',
  failed: 'FAILED',
}

export function createLog(root, countEl) {
  let count = 0

  /** Autoscroll only while the reader is already at the bottom, as a terminal does. */
  function atBottom() {
    return root.scrollHeight - root.scrollTop - root.clientHeight < 32
  }

  function append(node) {
    const stick = atBottom()
    root.appendChild(node)
    count += 1
    countEl.textContent = String(count)

    while (root.children.length > MAX_LINES) root.removeChild(root.firstChild)
    if (stick) root.scrollTop = root.scrollHeight
  }

  function line({ at, name, status, statusClass, message }) {
    const li = document.createElement('li')
    li.className = 'flex gap-2 py-px'
    li.innerHTML = `
      <span class="shrink-0 text-ink-faint tabular-nums">${clockTime(at)}</span>
      <span class="w-14 shrink-0 ${statusClass}">${status}</span>
      <span class="min-w-0 flex-1">
        <span class="text-ink-base">${name}</span>
        <span class="text-ink-dim"> ${message}</span>
      </span>
    `
    append(li)
  }

  return {
    agentState(event) {
      // The initial pending sweep at run start is bookkeeping, not activity.
      if (event.quiet) return

      const message =
        event.state === 'failed'
          ? `${event.reason}${event.willRetry ? ' · scheduling retry' : ' · giving up'}`
          : event.state === 'completed'
            ? `${event.action} · ${(event.durationMs / 1000).toFixed(2)}s`
            : event.state === 'running' && event.attempt > 1
              ? `${event.action} · attempt ${event.attempt}`
              : event.action

      line({
        at: event.at,
        name: event.name,
        status: STATUS_LABEL[event.state],
        statusClass: STATE_TEXT[event.state],
        message,
      })
    },

    handoff(event, agentNames) {
      line({
        at: event.at,
        name: agentNames.get(event.from),
        status: 'HANDOFF',
        statusClass: 'text-ink-dim',
        message: `→ ${agentNames.get(event.to)}`,
      })
    },

    runBoundary(text, at, tone = 'text-ink-faint') {
      const li = document.createElement('li')
      li.className = 'flex gap-2 py-1.5'
      li.innerHTML = `
        <span class="shrink-0 text-ink-faint tabular-nums">${clockTime(at)}</span>
        <span class="min-w-0 flex-1 border-t border-surface-line pt-1.5 ${tone} tracking-[0.14em] uppercase text-[10px]">${text}</span>
      `
      append(li)
    },
  }
}
