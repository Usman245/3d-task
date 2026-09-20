import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubicBezierCurve3,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { EDGES, edgeId } from '../sim/pipeline.js'
import { STATE_COLORS, SURFACE_COLORS } from '../tokens.js'
import { CARD } from './nodes.js'

/**
 * Edges, and the handoff animation that runs along them.
 *
 * Each edge leaves the source card's outgoing port and arrives at the target's
 * incoming one as a cubic bezier whose tangents follow the flow axis — the
 * shape every workflow canvas uses, and the reason the fan-out from `parse`
 * reads as two branches of one flow instead of two unrelated diagonals.
 *
 * The travelling pulse is positioned from the simulation's own handoff
 * progress, so what you see arriving at a node is the same clock that decides
 * when that node starts running: the animation is the timeline, not a
 * decoration layered over it.
 */

const CURVE_SEGMENTS = 64
const PORT_GAP = 0.055
const pulseGeometry = new SphereGeometry(0.062, 12, 12)

export function createEdges(positionOf, orientation) {
  const group = new Group()
  const edges = new Map()

  for (const edge of EDGES) {
    const lineMaterial = new LineBasicMaterial({
      color: new Color(SURFACE_COLORS.edge),
      transparent: true,
      opacity: 0.9,
    })

    // Allocated once at full segment count; re-laying out rewrites these
    // vertices in place rather than building new geometry.
    const lineGeometry = new BufferGeometry()
    lineGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array((CURVE_SEGMENTS + 1) * 3), 3),
    )

    const pulseMaterial = new MeshBasicMaterial({
      color: new Color(STATE_COLORS.completed),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    const pulse = new Mesh(pulseGeometry, pulseMaterial)
    pulse.visible = false

    group.add(new Line(lineGeometry, lineMaterial), pulse)

    edges.set(edgeId(edge.from, edge.to), {
      from: edge.from,
      to: edge.to,
      curve: null,
      lineMaterial,
      lineGeometry,
      pulseMaterial,
      pulse,
      active: false,
    })
  }

  const api = {
    group,

    /**
     * Rebuild every curve for the current node positions and flow axis. Called
     * again on orientation change; edge state (in flight or not) is untouched,
     * so a handoff mid-transit simply continues along the new path.
     */
    setLayout(nextPositionOf, nextOrientation) {
      const vertical = nextOrientation === 'vertical'

      for (const edge of edges.values()) {
        const from = nextPositionOf(edge.from)
        const to = nextPositionOf(edge.to)

        // Leave and arrive at the ports, not the card centres, so the line
        // meets the node where the little circle is.
        const start = vertical
          ? new Vector3(from.x, from.y - CARD.height / 2 - PORT_GAP, 0)
          : new Vector3(from.x + CARD.width / 2 + PORT_GAP, from.y, 0)
        const end = vertical
          ? new Vector3(to.x, to.y + CARD.height / 2 + PORT_GAP, 0)
          : new Vector3(to.x - CARD.width / 2 - PORT_GAP, to.y, 0)

        // Pull the control points straight out along the flow. The flatter the
        // handles, the more the curve reads as "flows onward" than "wanders".
        const span = vertical ? start.y - end.y : end.x - start.x
        const reach = Math.max(span * 0.5, 0.5)

        edge.curve = new CubicBezierCurve3(
          start,
          vertical
            ? new Vector3(start.x, start.y - reach, 0)
            : new Vector3(start.x + reach, start.y, 0),
          vertical
            ? new Vector3(end.x, end.y + reach, 0)
            : new Vector3(end.x - reach, end.y, 0),
          end,
        )

        const attribute = edge.lineGeometry.getAttribute('position')
        const point = new Vector3()
        for (let i = 0; i <= CURVE_SEGMENTS; i += 1) {
          edge.curve.getPoint(i / CURVE_SEGMENTS, point)
          attribute.setXYZ(i, point.x, point.y, point.z)
        }
        attribute.needsUpdate = true
        edge.lineGeometry.computeBoundingSphere()
      }
    },

    beginHandoff(id) {
      const edge = edges.get(id)
      edge.active = true
      edge.pulse.visible = true
    },

    endHandoff(id) {
      const edge = edges.get(id)
      edge.active = false
      edge.pulse.visible = false
      edge.pulseMaterial.opacity = 0
    },

    /** Back to the idle look at the start of each run. */
    reset() {
      for (const edge of edges.values()) {
        edge.active = false
        edge.pulse.visible = false
        edge.pulseMaterial.opacity = 0
        edge.lineMaterial.color.set(SURFACE_COLORS.edge)
        edge.lineMaterial.opacity = 0.9
      }
    },

    update(sim, reducedMotion) {
      for (const [id, edge] of edges) {
        if (!edge.active) continue

        const progress = sim.handoffProgress(id)
        if (progress === null) continue

        if (reducedMotion) {
          // No travelling dot when motion is suppressed. The edge still lights
          // up, so the handoff is reported — just as a change of state rather
          // than as something moving across the screen.
          edge.pulse.visible = false
          edge.lineMaterial.color.set(STATE_COLORS.completed)
          edge.lineMaterial.opacity = 0.75
          continue
        }

        edge.curve.getPoint(progress, edge.pulse.position)

        // Fade in and out at the ends so the pulse appears to leave one card
        // and be absorbed by the next, rather than popping in mid-air.
        const ends = Math.min(progress, 1 - progress) / 0.15
        edge.pulseMaterial.opacity = Math.min(1, ends) * 0.95

        // The line lights up behind the pulse: the edge itself records which
        // way the work flowed, and stays lit for the rest of the run.
        edge.lineMaterial.color.set(STATE_COLORS.completed)
        edge.lineMaterial.opacity = 0.25 + progress * 0.5
      }
    },

    dispose() {
      for (const edge of edges.values()) {
        edge.lineMaterial.dispose()
        edge.lineGeometry.dispose()
        edge.pulseMaterial.dispose()
      }
      pulseGeometry.dispose()
    },
  }

  api.setLayout(positionOf, orientation)
  return api
}
