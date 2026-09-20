import { AGENTS } from '../sim/pipeline.js'
import { STATE_TEXT } from './format.js'

/**
 * Agent labels.
 *
 * These are HTML positioned over the canvas, not 3D text. A dashboard lives or
 * dies on legible type, and projected DOM gives crisp subpixel rendering, real
 * font features and the same Tailwind tokens as the side panel — none of which
 * a texture atlas or extruded geometry would.
 *
 * They are also the one part of the scene that does not scale with the camera:
 * the graph shrinks to fit the viewport, the type stays the size it was. That
 * is the point — text scaled down to 7px would be useless — but it means the
 * stacked layout has to earn its room a different way, by shortening the names.
 */

const BOX_CLASS =
  'absolute top-0 left-0 whitespace-nowrap text-center will-change-transform'

const NAME_CLASS = {
  full: 'text-[11px] leading-none text-ink-bright',
  compact: 'text-[12px] leading-none text-ink-bright',
}

const STATE_CLASS = {
  full: 'mt-1 text-[9px] leading-none tracking-[0.16em] uppercase',
  compact: 'mt-1.5 text-[10px] leading-none tracking-[0.16em] uppercase',
}

export function createLabels(root) {
  const labels = new Map()
  let mode = 'full'

  for (const agent of AGENTS) {
    const el = document.createElement('div')
    el.className = BOX_CLASS
    el.innerHTML = `
      <div data-name class="${NAME_CLASS.full}">${agent.name}</div>
      <div data-state class="${STATE_CLASS.full} ${STATE_TEXT.pending}">pending</div>
    `
    root.appendChild(el)
    labels.set(agent.id, {
      el,
      name: el.querySelector('[data-name]'),
      state: el.querySelector('[data-state]'),
      full: agent.name,
      // Every node here is an agent, so the suffix carries no information in
      // the diagram itself. Dropping it is what buys the room when the graph is
      // stacked; the roster and the log still carry the full name.
      short: agent.name.replace(/-agent$/, ''),
    })
  }

  return {
    /**
     * Switch to short names and larger type for the stacked layout.
     *
     * Counter-intuitively the compact mode uses a *bigger* font: dropping
     * `-agent` frees far more width than the extra point costs, so the label
     * ends up both shorter and easier to read on the screen that needs it most.
     */
    setCompact(compact) {
      mode = compact ? 'compact' : 'full'

      for (const label of labels.values()) {
        label.name.textContent = compact ? label.short : label.full
        label.name.className = NAME_CLASS[mode]
        // Re-apply the state class so the size change lands immediately rather
        // than waiting for the agent's next transition.
        const tone = label.state.className.split(' ').pop()
        label.state.className = `${STATE_CLASS[mode]} ${tone}`
      }
    },

    setState(agentId, state) {
      const label = labels.get(agentId)
      label.state.textContent = state
      label.state.className = `${STATE_CLASS[mode]} ${STATE_TEXT[state]}`
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
