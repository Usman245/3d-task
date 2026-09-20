import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from 'three'
import { STATE_COLORS, SURFACE_COLORS } from '../tokens.js'
import { createIconTexture } from './icons.js'

/**
 * One agent node, drawn as a workflow card.
 *
 * A rounded card with a glyph reads as "a step in a pipeline" the way a bare
 * solid never does — it is the vocabulary every orchestration canvas already
 * uses, so the diagram explains itself before anyone reads the labels.
 *
 * The card surface stays dark and neutral in every state. State is carried by
 * the border, which means a running node never has to shout in a colour that
 * fights the icon sitting on top of it.
 *
 *   surface  — dark plate, faint emissive wash in the state colour
 *   border   — full outline, dim in the state colour
 *   beam     — bright segment travelling that outline while the agent runs
 *   icon     — the agent's glyph, textured onto a plane in front of the card
 *   ports    — the small circles the edges dock into
 */

export const CARD = { width: 1.62, height: 1.24, radius: 0.3 }

/**
 * The card is flat, not an extruded box.
 *
 * An extruded card has side walls, and under perspective every card off the
 * centre axis shows the wall on its inward-facing side. Worse, the border is
 * drawn on the front face, so it projects inset from the card's silhouette —
 * which reads as a second border running through the body of the node rather
 * than as depth. Flattening the card makes the border and the silhouette the
 * same edge at every position on screen.
 *
 * Depth in this scene comes from the layout, the camera and the backdrop, none
 * of which can misalign an outline.
 */
const LAYER = 0.004

const OUTLINE_POINTS = 168
const BEAM_POINTS = 30
const BEAM_PERIOD = 1.15 // seconds for one lap

const cardGeometry = buildCardGeometry()
const outlinePath = buildOutlinePoints()
const borderGeometry = toLineGeometry(outlinePath)
// The beam window slides along a doubled copy of the loop, so it can cross the
// seam without the draw range having to wrap and visibly stutter.
const beamGeometry = toLineGeometry([...outlinePath, ...outlinePath])
const iconGeometry = new PlaneGeometry(0.56, 0.56)
const portGeometry = new CircleGeometry(0.055, 16)

export function createNodes(positions, orientation) {
  const group = new Group()
  const nodes = new Map()

  for (const agentId of positions.keys()) {
    const node = createNode(agentId)
    nodes.set(agentId, node)
    group.add(node.group)
  }

  const api = {
    group,

    /**
     * Move every card, and swap which edges the ports sit on. Called again
     * whenever the viewport changes orientation; the cards keep their state,
     * because state lives in each node's closure and not in its position.
     */
    setLayout(next, nextOrientation) {
      for (const [agentId, position] of next) {
        nodes.get(agentId).place(position, nextOrientation)
      }
    },

    setState(agentId, state) {
      nodes.get(agentId).setState(state)
    },

    /** World position of a node, used by the edges and the HTML labels. */
    positionOf(agentId) {
      return nodes.get(agentId).group.position
    },

    update(delta, elapsed, reducedMotion) {
      for (const node of nodes.values()) node.update(delta, elapsed, reducedMotion)
    },

    dispose() {
      for (const node of nodes.values()) node.dispose()
      cardGeometry.dispose()
      borderGeometry.dispose()
      beamGeometry.dispose()
      iconGeometry.dispose()
      portGeometry.dispose()
    },
  }

  api.setLayout(positions, orientation)
  return api
}

function createNode(agentId) {
  const group = new Group()

  const surfaceMaterial = new MeshStandardMaterial({
    color: new Color(SURFACE_COLORS.raised),
    emissive: new Color(STATE_COLORS.pending),
    emissiveIntensity: 0,
    roughness: 0.78,
    metalness: 0.08,
  })

  const borderMaterial = new LineBasicMaterial({
    color: new Color(STATE_COLORS.pending),
    transparent: true,
    opacity: 0.6,
  })

  const beamMaterial = new LineBasicMaterial({
    color: new Color(STATE_COLORS.running),
    transparent: true,
    opacity: 0,
  })

  const iconTexture = createIconTexture(agentId)
  const iconMaterial = new MeshBasicMaterial({
    map: iconTexture,
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
    depthWrite: false,
  })

  const portMaterial = new MeshBasicMaterial({
    color: new Color(SURFACE_COLORS.port),
    transparent: true,
    opacity: 0.9,
  })

  const surface = new Mesh(cardGeometry, surfaceMaterial)
  const border = new Line(borderGeometry, borderMaterial)
  const beam = new Line(beamGeometry, beamMaterial)
  const icon = new Mesh(iconGeometry, iconMaterial)

  border.position.z = LAYER
  beam.position.z = LAYER * 2
  icon.position.z = LAYER * 3

  const portIn = new Mesh(portGeometry, portMaterial)
  const portOut = new Mesh(portGeometry, portMaterial)

  group.add(surface, border, beam, icon, portIn, portOut)

  let state = 'pending'
  let sinceChange = 0
  let beamOffset = 0

  return {
    group,

    /** Position the card and dock its ports on the sides the flow uses. */
    place(position, orientation) {
      group.position.set(position.x, position.y, 0)

      if (orientation === 'horizontal') {
        portIn.position.set(-CARD.width / 2, 0, LAYER)
        portOut.position.set(CARD.width / 2, 0, LAYER)
      } else {
        portIn.position.set(0, CARD.height / 2, LAYER)
        portOut.position.set(0, -CARD.height / 2, LAYER)
      }
    },

    setState(next) {
      state = next
      sinceChange = 0

      const color = new Color(STATE_COLORS[next])
      surfaceMaterial.emissive.copy(color)
      borderMaterial.color.copy(color)
      beamMaterial.color.copy(color)

      // The glyph lifts out of the card as soon as the agent is doing anything,
      // and dims back down once it is finished, so the eye lands on live work.
      iconMaterial.opacity = next === 'pending' ? 0.62 : next === 'running' ? 1 : 0.85

      beamMaterial.opacity = 0
      beam.visible = next === 'running'
      if (next === 'running') beamOffset = 0
    },

    update(delta, elapsed, reducedMotion) {
      sinceChange += delta

      if (state === 'running') {
        surfaceMaterial.emissiveIntensity = reducedMotion
          ? 0.03
          : 0.028 + Math.sin(elapsed * 4.2) * 0.016
        // The resting outline drops right back while the beam is running, so
        // the bright segment reads as one travelling light rather than as a
        // slightly brighter patch of an already-lit border.
        borderMaterial.opacity = 0.16

        if (reducedMotion) {
          // With motion suppressed the beam would be a flicker, so show the
          // whole outline lit instead: still unmistakably "this one is live".
          beamGeometry.setDrawRange(0, OUTLINE_POINTS)
          beamMaterial.opacity = 0.95
          return
        }

        beamOffset = (beamOffset + (delta / BEAM_PERIOD) * OUTLINE_POINTS) % OUTLINE_POINTS
        beamGeometry.setDrawRange(Math.floor(beamOffset), BEAM_POINTS)
        beamMaterial.opacity = 0.95
        return
      }

      if (state === 'completed') {
        surfaceMaterial.emissiveIntensity = 0.022
        borderMaterial.opacity = 1
        return
      }

      if (state === 'failed') {
        // A hard flash on arrival decaying to a steady lit border, so a failure
        // catches the eye even if you were reading the log when it happened.
        const flash = Math.max(0, 1 - sinceChange * 2.6)
        surfaceMaterial.emissiveIntensity = 0.035 + (reducedMotion ? 0 : flash * 0.22)
        borderMaterial.opacity = 1
        return
      }

      surfaceMaterial.emissiveIntensity = 0
      borderMaterial.opacity = 0.5
    },

    dispose() {
      surfaceMaterial.dispose()
      borderMaterial.dispose()
      beamMaterial.dispose()
      iconMaterial.dispose()
      portMaterial.dispose()
      iconTexture.dispose()
    },
  }
}

/** Flat rounded rectangle. See the note on CARD for why it is not extruded. */
function buildCardGeometry() {
  return new ShapeGeometry(roundedRectShape(), 12)
}

function roundedRectShape() {
  const { width: w, height: h, radius: r } = CARD
  const x = w / 2
  const y = h / 2

  const shape = new Shape()
  shape.moveTo(-x + r, -y)
  shape.lineTo(x - r, -y)
  shape.quadraticCurveTo(x, -y, x, -y + r)
  shape.lineTo(x, y - r)
  shape.quadraticCurveTo(x, y, x - r, y)
  shape.lineTo(-x + r, y)
  shape.quadraticCurveTo(-x, y, -x, y - r)
  shape.lineTo(-x, -y + r)
  shape.quadraticCurveTo(-x, -y, -x + r, -y)
  return shape
}

/** Evenly spaced points around the card outline, used by the border and beam. */
function buildOutlinePoints() {
  const points = roundedRectShape().getSpacedPoints(OUTLINE_POINTS - 1)
  return points.flatMap((point) => [point.x, point.y, 0])
}

function toLineGeometry(flatPoints) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(flatPoints, 3))
  return geometry
}
