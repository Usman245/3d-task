import {
  PerspectiveCamera,
  Scene,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SURFACE_COLORS, prefersReducedMotion } from '../tokens.js'

/**
 * Owns the renderer, the camera and the single render loop.
 *
 * The camera is fixed rather than orbit-controlled. This is a dashboard: the
 * composition is part of the design, and letting a viewer drag it out of
 * alignment would only invite them to break the thing they came to read.
 *
 * Sizing comes from a ResizeObserver on the container, not the window `resize`
 * event, so the viewport stays correct when the side panel or any other layout
 * changes size for reasons the window never hears about.
 */
export function createViewport(container) {
  const scene = new Scene()

  const camera = new PerspectiveCamera(34, 1, 0.1, 100)
  // Just off-axis: enough perspective to read as space, shallow enough that the
  // graph still reads as a diagram rather than a sculpture.
  camera.position.set(0, 1.1, 16)
  const target = new Vector3(0, 0, 0)
  camera.lookAt(target)

  // Bounding box the camera must keep in shot, in world units. Set by the
  // scene once the graph is laid out; see `setFraming`.
  let framing = { width: 14, height: 5 }

  const renderer = new WebGLRenderer({ antialias: true })
  // Beyond 2x the extra fragments cost far more than they show.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(SURFACE_COLORS.void)
  container.appendChild(renderer.domElement)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  // Bloom is what makes an emissive node read as "lit from within" rather than
  // "a brightly coloured shape". Kept restrained: the threshold sits above the
  // dark surfaces and the grid so only lit state colour blooms, and the
  // strength stops well short of blowing the node out to white — a glowing
  // blob loses the hexagon silhouette that identifies it as a node.
  //
  // No tone mapping, deliberately. ACES would roll the highlights off nicely
  // but it also shifts every colour, and these colours are the same tokens the
  // HTML panel uses. The two views agreeing matters more than the filmic curve.
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.4, 0.55)
  composer.addPass(bloom)

  // Timer rather than the (now deprecated) Clock. `connect` opts into the Page
  // Visibility API: while the tab is hidden the delta is held at zero and the
  // timer resets on return, so a backgrounded dashboard resumes where it left
  // off instead of fast-forwarding the whole pipeline the moment you look back.
  const timer = new Timer()
  timer.connect(document)

  const updaters = new Set()

  function resize() {
    const { clientWidth: width, clientHeight: height } = container
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    fitCamera()
    // `updateStyle` left on: without it the canvas keeps its intrinsic pixel
    // size as its CSS size, so on any display with devicePixelRatio > 1 the
    // scene renders oversized and clipped, and projected label positions drift
    // from the nodes by exactly that ratio.
    renderer.setSize(width, height)
    composer.setSize(width, height)
    bloom.resolution.set(width, height)
  }

  /**
   * Pulls the camera back until the whole graph is in shot. Solved from the
   * frustum rather than tuned by hand, so a narrow window or a different graph
   * cannot crop a node off the edge.
   */
  function fitCamera() {
    const halfFov = (camera.fov * Math.PI) / 360
    const forHeight = framing.height / 2 / Math.tan(halfFov)
    const forWidth = framing.width / 2 / (Math.tan(halfFov) * camera.aspect)
    camera.position.z = Math.max(forHeight, forWidth) * 1.1
    camera.lookAt(target)
    camera.updateProjectionMatrix()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  /** Advance every subscriber by `delta` seconds and draw one frame. */
  function step(delta) {
    for (const update of updaters) update(delta, timer.getElapsed())
    composer.render()
  }

  renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp)
    step(timer.getDelta())
  })

  return {
    scene,
    camera,
    renderer,
    reducedMotion: prefersReducedMotion,

    /** Register a per-frame callback. Returns an unsubscribe function. */
    onFrame(update) {
      updaters.add(update)
      return () => updaters.delete(update)
    },

    /** Declare the world-space box the camera must keep in shot. */
    setFraming(box) {
      framing = box
      resize()
    },

    /** Container-relative pixel position of a world point, for HTML labels. */
    project(position, out) {
      const ndc = position.clone().project(camera)
      out.x = (ndc.x * 0.5 + 0.5) * container.clientWidth
      out.y = (-ndc.y * 0.5 + 0.5) * container.clientHeight
      return out
    },

    dispose() {
      renderer.setAnimationLoop(null)
      timer.disconnect()
      observer.disconnect()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
