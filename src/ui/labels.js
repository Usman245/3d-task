import { AGENTS } from '../sim/pipeline.js'
import { STATE_TEXT } from './format.js'

/**
 * Agent labels.
 *
 * These are HTML positioned over the canvas, not 3D text. A dashboard lives or
 * dies on legible type, and projected DOM gives crisp subpixel rendering, real
 * font features and the same Tailwind tokens as the side panel — none of which
 * a texture atlas or extruded geometry would.
 */
export function createLabels(root) {
  const labels = new Map()

  for (const agent of AGENTS) {
    const el = document.createElement('div')
    el.className = 'absolute top-0 left-0 whitespace-nowrap text-center will-change-transform'
    el.innerHTML = `
      <div data-name class="text-[11px] leading-none text-ink-bright">${agent.name}</div>
      <div data-state class="mt-1 text-[9px] leading-none tracking-[0.16em] uppercase ${STATE_TEXT.pending}">pending</div>
    `
    root.appendChild(el)
    labels.set(agent.id, {
      el,
      state: el.querySelector('[data-state]'),
    })
  }

  return {
    setState(agentId, state) {
      const label = labels.get(agentId)
      label.state.textContent = state
      label.state.className = `mt-1 text-[9px] leading-none tracking-[0.16em] uppercase ${STATE_TEXT[state]}`
    },

    /** Called per frame with the projected pixel position of each node. */
    place(agentId, x, y) {
      // transform rather than left/top keeps the label on the compositor and off
      // the layout path, which matters when it moves every frame. The -50% is
      // folded in here because an inline transform would override a Tailwind
      // `-translate-x-1/2` class outright.
      labels.get(agentId).el.style.transform =
        `translate(calc(${x}px - 50%), ${y}px)`
    },
  }
}
