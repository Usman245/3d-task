import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from 'three'
import { SURFACE_COLORS } from '../tokens.js'

/**
 * A fine dot grid behind the graph.
 *
 * Dots rather than ruled lines: a line grid draws boxes, and boxes behind a
 * diagram of boxes compete with the nodes for the eye. Dots give the same sense
 * of a measured workspace and the same depth cue without ever forming a shape.
 *
 * Kept close in tone to the surface so the cards stay the brightest thing on
 * the canvas, but light enough to actually register.
 */
const SPACING = 0.42
const EXTENT_X = 26
const EXTENT_Y = 15

export function createBackdrop() {
  const positions = []

  for (let x = -EXTENT_X; x <= EXTENT_X; x += SPACING) {
    for (let y = -EXTENT_Y; y <= EXTENT_Y; y += SPACING) {
      positions.push(x, y, 0)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))

  const material = new PointsMaterial({
    color: new Color(SURFACE_COLORS.grid),
    // Fixed pixel size: the dots are a flat backdrop, so they should not shrink
    // with perspective the way scene geometry does.
    size: 1.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })

  const points = new Points(geometry, material)
  points.position.z = -3.2
  return points
}
