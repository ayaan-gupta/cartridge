/**
 * From a generated sprite sheet to engine cells. The input is whatever an
 * image model returns: a grid of drawings on flat magenta, at any size, with
 * soft edges and colours that are only roughly the ones asked for. The output
 * is 16 by 16 cells of palette indices with hard edges.
 *
 *   1. find the key colour and work out how see-through each pixel is
 *   2. reduce the solid pixels to four colours and pair those with the palette
 *   3. cut the sheet into cells and shrink each one by majority vote
 *
 * Quantising before shrinking matters. Averaging a dark outline with a light
 * fill gives a mid tone that was never in the drawing, and then the nearest
 * palette colour to that is wrong. A vote between already-quantised pixels
 * cannot invent a colour.
 */
import { TRANSPARENT } from '@/engine/sheet'
import { TILE } from '@/engine/types'
import type { RGBAImage } from '@/lib/pixels'
import { hexToRgb } from '@/lib/pixels'
import type { RGB } from './quantize'
import { assignToPalette, histogram, medianCut, refine } from './quantize'

export type CellKind = 'sprite' | 'tile'
export interface Layout {
  cols: number
  rows: number
  kinds: CellKind[]
}

/** The PRD's sheet: player, three enemies, goal, two tiles, background. */
export const GENERATED_LAYOUT: Layout = { cols: 4, rows: 2, kinds: ['sprite', 'sprite', 'sprite', 'sprite', 'sprite', 'tile', 'tile', 'tile'] }

export interface Sliced {
  cells: Uint8Array[]
  /** True where a cell had nothing in it worth keeping. */
  empty: boolean[]
  key: RGB
  /** The four colours the image was reduced to, and the palette index each one got. */
  colors: RGB[]
  mapping: number[]
}

const magenta = (r: number, g: number, b: number) => Math.min(r, b) - g

/** The background colour, read from the border. Models rarely return exact #ff00ff. */
export function estimateKey(image: RGBAImage): RGB {
  const { width, height, data } = image
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const sample = (x: number, y: number) => {
    const o = (y * width + x) * 4
    rs.push(data[o] as number)
    gs.push(data[o + 1] as number)
    bs.push(data[o + 2] as number)
  }
  const stepX = Math.max(1, Math.floor(width / 64))
  const stepY = Math.max(1, Math.floor(height / 64))
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0)
    sample(x, height - 1)
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y)
    sample(width - 1, y)
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] as number
  const key: RGB = [median(rs), median(gs), median(bs)]
  // If the border is not magenta at all, assume a tile ran to the edge.
  return magenta(key[0], key[1], key[2]) >= 96 ? key : [255, 0, 255]
}

/**
 * Opacity per pixel, 0 to 255. A pixel is as transparent as it is magenta:
 * a half-and-half blend of sprite and background has half the background's
 * magenta-ness, whatever colour the sprite is. That turns a soft edge back
 * into a coverage value without knowing the sprite colour in advance.
 */
export function keyAlpha(image: RGBAImage, key: RGB): Uint8Array {
  const { data } = image
  const strength = Math.max(1, magenta(key[0], key[1], key[2]))
  const alpha = new Uint8Array(image.width * image.height)
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    const m = magenta(data[i] as number, data[i + 1] as number, data[i + 2] as number)
    const cover = 1 - Math.max(0, Math.min(1, m / strength))
    alpha[p] = Math.round(cover * (data[i + 3] as number))
  }
  return alpha
}

const SOLID = 192
const HALF = 128
/** Summed channel difference below which two nearby pixels count as the same flat colour. */
const FLAT = 40

export function sliceSheet(image: RGBAImage, palette: readonly string[], layout: Layout = GENERATED_LAYOUT): Sliced {
  const { width, height, data } = image
  const key = estimateKey(image)
  const alpha = keyAlpha(image, key)

  // Four colours, chosen from flat areas only. A soft edge between a dark
  // outline and a light fill is a smear of in-between colours, and there can
  // be more smear than outline. Counted in, it wins a palette slot of its own
  // and the two darkest tones get merged to pay for it.
  const solid = (p: number) => (alpha[p] as number) >= SOLID
  const reach = Math.max(1, Math.round(Math.min(width / layout.cols, height / layout.rows) / 64))
  const differs = (p: number, q: number) => {
    const a = p * 4
    const b = q * 4
    return Math.abs((data[a] as number) - (data[b] as number)) + Math.abs((data[a + 1] as number) - (data[b + 1] as number)) + Math.abs((data[a + 2] as number) - (data[b + 2] as number)) > FLAT
  }
  const flat = (p: number) => {
    if (!solid(p)) return false
    const x = p % width
    const y = (p - x) / width
    if (x < reach || y < reach || x >= width - reach || y >= height - reach) return false
    return !differs(p, p - reach) && !differs(p, p + reach) && !differs(p, p - reach * width) && !differs(p, p + reach * width)
  }
  let bins = histogram(data, flat)
  if (bins.reduce((sum, bin) => sum + bin.n, 0) < width * height * 0.02) bins = histogram(data, solid)
  const colors = refine(bins, medianCut(bins, 4))
  const mapping = assignToPalette(colors, palette.map(hexToRgb))
  const lut = new Map<number, number>()
  const indexOf = (r: number, g: number, b: number): number => {
    const code = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    let found = lut.get(code)
    if (found === undefined) {
      let best = 0
      let bestD = Number.POSITIVE_INFINITY
      colors.forEach((c, i) => {
        const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      found = mapping[best] ?? 0
      lut.set(code, found)
    }
    return found
  }

  // One palette index per source pixel. Edge pixels have the key colour
  // taken back out first, or their pink tinge would pick the wrong entry.
  const indexed = new Uint8Array(width * height).fill(TRANSPARENT)
  for (let p = 0, i = 0; p < indexed.length; p++, i += 4) {
    const a = alpha[p] as number
    if (a < HALF) continue
    let r = data[i] as number
    let g = data[i + 1] as number
    let b = data[i + 2] as number
    if (a < SOLID) {
      const t = a / 255
      r = Math.max(0, Math.min(255, (r - (1 - t) * key[0]) / t))
      g = Math.max(0, Math.min(255, (g - (1 - t) * key[1]) / t))
      b = Math.max(0, Math.min(255, (b - (1 - t) * key[2]) / t))
    }
    indexed[p] = indexOf(r, g, b)
  }

  const cells: Uint8Array[] = []
  const empty: boolean[] = []
  const cw = width / layout.cols
  const ch = height / layout.rows
  layout.kinds.forEach((kind, n) => {
    const x0 = (n % layout.cols) * cw
    const y0 = Math.floor(n / layout.cols) * ch
    // Sample a centred square, so a 3:2 sheet does not squash its cells.
    const side = Math.min(cw, ch)
    let sx = x0 + (cw - side) / 2
    let sy = y0 + (ch - side) / 2
    let size = side

    if (kind === 'sprite') {
      let left = width
      let right = -1
      let top = height
      let bottom = -1
      let count = 0
      for (let y = Math.floor(y0); y < Math.floor(y0 + ch); y++)
        for (let x = Math.floor(x0); x < Math.floor(x0 + cw); x++) {
          if ((alpha[y * width + x] as number) < HALF) continue
          count++
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      if (count < cw * ch * 0.01) {
        cells.push(new Uint8Array(TILE * TILE).fill(TRANSPARENT))
        empty.push(true)
        return
      }
      // A small drawing in a big cell is zoomed in on. One that already
      // fills its cell is sampled on the cell's own grid, which keeps
      // chunky pixel art aligned with the pixels it was drawn on.
      // A soft edge spills a pixel or two past where the drawing really ends,
      // so "outside the square" needs some slack before it means anything.
      const extent = Math.max(right - left + 1, bottom - top + 1)
      const slack = side * 0.04
      const outside = left < sx - slack || right >= sx + side + slack || top < sy - slack || bottom >= sy + side + slack
      if (extent < side * 0.6 || outside) {
        size = Math.min(Math.max(cw, ch), extent * 1.04)
        sx = (left + right + 1) / 2 - size / 2
        sy = (top + bottom + 1) / 2 - size / 2
      }
    }

    const cell = new Uint8Array(TILE * TILE).fill(TRANSPARENT)
    const step = size / TILE
    let solid = 0
    for (let ty = 0; ty < TILE; ty++)
      for (let tx = 0; tx < TILE; tx++) {
        // Vote over the middle of each block, away from its neighbours.
        const bx0 = Math.floor(sx + (tx + 0.2) * step)
        const bx1 = Math.max(bx0 + 1, Math.ceil(sx + (tx + 0.8) * step))
        const by0 = Math.floor(sy + (ty + 0.2) * step)
        const by1 = Math.max(by0 + 1, Math.ceil(sy + (ty + 0.8) * step))
        const votes = [0, 0, 0, 0]
        let total = 0
        for (let y = by0; y < by1; y++)
          for (let x = bx0; x < bx1; x++) {
            total++
            // Never read a neighbouring cell, however the window was placed.
            if (x < x0 || y < y0 || x >= x0 + cw || y >= y0 + ch) continue
            const v = indexed[y * width + x] as number
            if (v !== TRANSPARENT) votes[v] = (votes[v] as number) + 1
          }
        const opaque = (votes[0] as number) + (votes[1] as number) + (votes[2] as number) + (votes[3] as number)
        // A tile has no holes: any vote at all decides it.
        if (kind === 'tile' ? opaque === 0 : opaque * 2 < total) continue
        let winner = 0
        for (let v = 1; v < 4; v++) if ((votes[v] as number) > (votes[winner] as number)) winner = v
        cell[ty * TILE + tx] = winner
        solid++
      }
    if (kind === 'tile' && solid > 0 && solid < TILE * TILE) {
      const tally = [0, 0, 0, 0]
      for (const v of cell) if (v !== TRANSPARENT) tally[v] = (tally[v] as number) + 1
      const common = tally.indexOf(Math.max(...tally))
      for (let i = 0; i < cell.length; i++) if (cell[i] === TRANSPARENT) cell[i] = common
    }
    cells.push(cell)
    empty.push(kind === 'tile' ? solid < TILE * TILE * 0.5 : solid < 8)
  })
  return { cells, empty, key, colors, mapping }
}
