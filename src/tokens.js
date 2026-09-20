/**
 * Reads the palette back out of CSS so Three.js materials and Tailwind classes
 * share one definition. The values live in `@theme` in `style.css`; nothing is
 * duplicated here.
 */
const css = getComputedStyle(document.documentElement)

function read(name) {
  const value = css.getPropertyValue(name).trim()
  if (!value) throw new Error(`Missing CSS custom property: ${name}`)
  return value
}

export const STATE_COLORS = {
  pending: read('--color-state-pending'),
  running: read('--color-state-running'),
  completed: read('--color-state-completed'),
  failed: read('--color-state-failed'),
}

export const SURFACE_COLORS = {
  void: read('--color-surface-void'),
  raised: read('--color-surface-raised'),
  line: read('--color-surface-line'),
  grid: read('--color-surface-grid'),
  edge: read('--color-surface-edge'),
  port: read('--color-surface-port'),
}

/** True when the visitor has asked the OS to reduce motion. */
export const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches
