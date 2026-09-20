import { AmbientLight, DirectionalLight } from 'three'

/**
 * Deliberately dim.
 *
 * The state colour is carried by emission and bloom, so these lights exist only
 * to give the hex prisms enough shading to read as solid objects. Lighting them
 * properly would wash out exactly the signal the dashboard is built on.
 */
export function createLights() {
  const ambient = new AmbientLight(0xffffff, 0.35)

  const key = new DirectionalLight(0xc8d4ff, 1.1)
  key.position.set(4, 6, 8)

  const rim = new DirectionalLight(0x4a5c8a, 0.35)
  rim.position.set(-5, -3, -4)

  return [ambient, key, rim]
}
