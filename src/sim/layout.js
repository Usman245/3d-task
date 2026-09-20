import { AGENTS, EDGES } from './pipeline.js'

/**
 * Derives node positions from the graph structure — longest-path layering,
 * then each layer spread evenly around the horizontal axis.
 *
 * Computed rather than hand-placed so that editing `EDGES` re-arranges the
 * diagram correctly. Pure arithmetic: no Three.js here, the scene reads these
 * as plain {x, y}.
 */
const COLUMN_GAP = 3.1
const ROW_GAP = 2.4

export function computeLayout() {
  const layers = assignLayers()
  const byLayer = new Map()

  for (const agent of AGENTS) {
    const layer = layers.get(agent.id)
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(agent.id)
  }

  const lastLayer = Math.max(...layers.values())
  const positions = new Map()

  for (const [layer, ids] of byLayer) {
    ids.forEach((id, row) => {
      positions.set(id, {
        x: (layer - lastLayer / 2) * COLUMN_GAP,
        // Centre the layer: a lone node sits on the axis, a pair straddles it.
        y: -(row - (ids.length - 1) / 2) * ROW_GAP,
      })
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
