import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CubicBezierCurve3,
  Float32BufferAttribute,
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
 * Each edge leaves the source card's right port and arrives at the target's
 * left port as a cubic bezier with horizontal tangents — the shape every
 * workflow canvas uses, and the reason the fan-out from `parse` reads as two
 * branches of one flow instead of two unrelated diagonals.
 *
 * The travelling pulse is positioned from the simulation's own handoff
 * progress, so what you see arriving at a node is the same clock that decides
 * when that node starts running: the animation is the timeline, not a
 * decoration layered over it.
 */

const CURVE_SEGMENTS = 64
const PORT_GAP = 0.055
const pulseGeometry = new SphereGeometry(0.062, 12, 12)

export function createEdges(positionOf) {
  const group = new Group()
  const edges = new Map()

  for (const edge of EDGES) {
    const id = edgeId(edge.from, edge.to)
    const from = positionOf(edge.from)
    const to = positionOf(edge.to)

    const start = new Vector3(from.x + CARD.width / 2 + PORT_GAP, from.y, 0)
    const end = new Vector3(to.x - CARD.width / 2 - PORT_GAP, to.y, 0)

    // Pull the control points straight out sideways. The flatter the handles,
    // the more the curve reads as "flows left to right" rather than "wanders".
    const reach = Math.max((end.x - start.x) * 0.5, 0.55)
    const curve = new CubicBezierCurve3(
      start,
      new Vector3(start.x + reach, start.y, 0),
      new Vector3(end.x - reach, end.y, 0),
      end,
    )

    const points = curve.getPoints(CURVE_SEGMENTS)
    const lineGeometry = new BufferGeometry()
    lineGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3),
    )

    const lineMaterial = new LineBasicMaterial({
      color: new Color(SURFACE_COLORS.edge),
      transparent: true,
      opacity: 0.9,
    })

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

    edges.set(id, { curve, lineMaterial, lineGeometry, pulseMaterial, pulse, active: false })
  }

  return {
    group,

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
}
