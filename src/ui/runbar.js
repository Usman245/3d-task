import { STATE_TEXT, seconds } from './format.js'

/** Run header: id, terminal status, live elapsed clock and a completion bar. */
export function createRunBar({ idEl, statusEl, elapsedEl, progressEl }) {
  function setStatus(text, className) {
    statusEl.textContent = text
    statusEl.className = `text-[10px] tracking-[0.14em] uppercase ${className}`
  }

  return {
    start(runId) {
      // Hex reads like a real run identifier and stays a fixed width.
      idEl.textContent = `run #${runId.toString(16).padStart(4, '0')}`
      setStatus('running', STATE_TEXT.running)
      progressEl.style.width = '0%'
      progressEl.className = 'h-px bg-state-running transition-[width] duration-300'
    },

    end(status) {
      setStatus(status, STATE_TEXT[status])
      progressEl.className = `h-px transition-[width] duration-300 ${
        status === 'completed' ? 'bg-state-completed' : 'bg-state-failed'
      }`
    },

    setProgress(fraction) {
      progressEl.style.width = `${Math.round(fraction * 100)}%`
    },

    tick(elapsedMs) {
      elapsedEl.textContent = seconds(elapsedMs)
    },
  }
}
