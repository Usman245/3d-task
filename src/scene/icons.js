import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

/**
 * Agent glyphs.
 *
 * Presentation only, so it lives in the scene layer rather than in the pipeline
 * data — `src/sim/` stays free of anything to do with how an agent is drawn.
 *
 * The icons are SVG path data on a 24×24 grid, rendered to a canvas with
 * `Path2D` and used as a texture. No sprite sheet, no network request, and no
 * async load to sequence against the first frame: the texture is ready the
 * moment the node is built.
 */

const ICONS = {
  // download — pulling documents in
  ingest: {
    color: '#2dd4bf',
    paths: ['M12 3.5v10', 'M7.5 9l4.5 4.5L16.5 9', 'M4 18.5h16'],
  },
  // braces — extracting structure
  parse: {
    color: '#fb923c',
    paths: [
      'M9 4H8a2 2 0 0 0-2 2v3.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2V18a2 2 0 0 0 2 2h1',
      'M15 4h1a2 2 0 0 1 2 2v3.5a2 2 0 0 0 2 2 2 2 0 0 0-2 2V18a2 2 0 0 1-2 2h-1',
    ],
  },
  // sparkle — enrichment from an outside source
  enrich: {
    color: '#a78bfa',
    paths: ['M12 3l1.9 4.9L18.8 9.8l-4.9 1.9L12 16.6l-1.9-4.9L5.2 9.8l4.9-1.9z', 'M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z'],
  },
  // check in a circle — constraint checking
  validate: {
    color: '#38bdf8',
    paths: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M8.5 12.2l2.4 2.4 4.6-4.9'],
  },
  // database — writing embeddings
  index: {
    color: '#818cf8',
    paths: [
      'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z',
      'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
      'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    ],
  },
  // document — the run summary
  report: {
    color: '#f472b6',
    paths: ['M14 3H7.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13.5h6', 'M9 17h4'],
  },
}

const SIZE = 192

export function createIconTexture(agentId) {
  const icon = ICONS[agentId]
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const ctx = canvas.getContext('2d')
  const scale = SIZE / 24
  ctx.scale(scale, scale)

  ctx.strokeStyle = icon.color
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const path of icon.paths) ctx.stroke(new Path2D(path))

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // The plane is small on screen and never magnified much; linear filtering
  // without mipmaps keeps the strokes crisp rather than muddy.
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}
