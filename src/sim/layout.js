import { AGENTS, EDGES } from './pipeline.js'

/**
 * Derives node positions from the graph structure — longest-path layering,
 * then each layer spread evenly about the flow axis.
 *
 * Computed rather than hand-placed so that editing `EDGES` re-arranges the
 * diagram correctly. Pure arithmetic: no Three.js here, the scene reads these
 * as plain {x, y}.
 *
 * Two orientations, because the pipeline is five layers long and two wide. Laid
 * out left-to-right it is a roughly 5:1 letterbox, which on a portrait phone
 * would have to shrink until the cards were unreadable. Flowing it top-to-bottom
 * instead puts the long axis of the graph on the long axis of the screen. The
 * graph is identical either way — only the mapping from (layer, row) to (x, y)
 * changes.
 */
const SPACING = {
  // { along the flow, across it }
  horizontal: { major: 3.1, minor: 2.4 },
  // Wider across than the cards need: side-by-side nodes carry their labels
  // underneath, and a label is far wider than the card it belongs to, so the
  // spacing is set by the text rather than by the geometry. Width is free here
  // anyway — stacked, the camera is always height-constrained.
  vertical: { major: 2.85, minor: 4.2 },
}

export function computeLayout(orientation = 'horizontal') {
  const layers = assignLayers()
  const byLayer = new Map()

  for (const agent of AGENTS) {
    const layer = layers.get(agent.id)
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(agent.id)
  }

  const lastLayer = Math.max(...layers.values())
  const { major, minor } = SPACING[orientation]
  const positions = new Map()

  for (const [layer, ids] of byLayer) {
    ids.forEach((id, row) => {
      const along = (layer - lastLayer / 2) * major
      // Centre the layer: a lone node sits on the axis, a pair straddles it.
      const across = (row - (ids.length - 1) / 2) * minor

      positions.set(
        id,
        orientation === 'horizontal'
          ? { x: along, y: -across }
          : { x: across, y: -along },
      )
    })
  }

  return positions
}

/** Longest path from a root — guarantees every edge points forward a layer. */
function assignLayers() {
  const layers = new Map(AGENTS.map((agent) => [agent.id, 0]))

  // The graph is small and acyclic; relaxing |V| times is plenty and avoids
  // hauling in a topological sort for six nodes.
  for (let pass = 0; pass < AGENTS.length; pass += 1) {
    for (const { from, to } of EDGES) {
      const candidate = layers.get(from) + 1
      if (candidate > layers.get(to)) layers.set(to, candidate)
    }
  }

  return layers
}
