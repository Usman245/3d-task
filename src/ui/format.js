/** Presentation helpers. Kept apart so the roster and the log format identically. */

/** `14:23:07.482` — millisecond precision, because an event log without it lies. */
export function clockTime(epochMs) {
  const date = new Date(epochMs)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

export function seconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`
}

/** Tailwind text colour utility for a state. One lookup, used by both views. */
export const STATE_TEXT = {
  pending: 'text-ink-dim',
  running: 'text-state-running',
  completed: 'text-state-completed',
  failed: 'text-state-failed',
}

export const STATE_BG = {
  pending: 'bg-state-pending',
  running: 'bg-state-running',
  completed: 'bg-state-completed',
  failed: 'bg-state-failed',
}
