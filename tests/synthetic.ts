/**
 * Draws the kind of picture an image model returns, from cells whose right
 * answer is known: a grid on magenta that is not quite magenta, colours that
 * are not quite the palette, soft edges, and noise.
 */
import { TRANSPARENT } from '@/engine/sheet'
import { Rng } from '@/engine/rng'
import { TILE } from '@/engine/types'
import type { RGBAImage } from '@/lib/pixels'
import { hexToRgb } from '@/lib/pixels'

export interface FakeOptions {
  cols: number
  /** Width and height of each grid cell in the output, in pixels. */
  cellW: number
  cellH: number
  /** Side of the drawing inside its cell. Defaults to the smaller cell dimension. */
  drawn?: number
  key?: [number, number, number]
  /** How far each palette colour is pushed off its true value. */
  shift?: number
  /** Per-pixel noise, plus or minus. */
  noise?: number
  /** Box blur radius in pixels, which is what makes the edges soft. */
  blur?: number
  seed?: number
}

export function generatedLike(cells: Uint8Array[], palette: readonly string[], options: FakeOptions): RGBAImage {
  const { cols, cellW, cellH } = options
  const drawn = options.drawn ?? Math.min(cellW, cellH)
  const key = options.key ?? [247, 12, 238]
  const shift = options.shift ?? 14
  const noise = options.noise ?? 6
  const blur = options.blur ?? 2
  const rng = new Rng(options.seed ?? 1)
  const rows = Math.ceil(cells.length / cols)
  const width = cols * cellW
  const height = rows * cellH
  // Each palette entry leans a different way, the way a model's "dark green" is never your dark green.
  const lean: [number, number, number][] = [[-1, 0.5, -0.8], [0.9, -0.6, 0.7], [-0.7, 1, 0.4], [1, 0.8, -1]]
  const colors = palette.map(hexToRgb).map((c, i) => c.map((v, ch) => Math.max(0, Math.min(255, v + ((lean[i] as number[])[ch] as number) * shift))))

  const hard = new Float32Array(width * height * 3)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const n = Math.floor(y / cellH) * cols + Math.floor(x / cellW)
      const lx = (x % cellW) - (cellW - drawn) / 2
      const ly = (y % cellH) - (cellH - drawn) / 2
      let c: number[] = key
      const cell = cells[n]
      if (cell && lx >= 0 && ly >= 0 && lx < drawn && ly < drawn) {
        const v = cell[Math.floor((ly / drawn) * TILE) * TILE + Math.floor((lx / drawn) * TILE)] as number
        if (v !== TRANSPARENT) c = colors[v] as number[]
      }
      hard.set(c, (y * width + x) * 3)
    }

  const pass = (src: Float32Array, dx: number, dy: number): Float32Array => {
    if (blur === 0) return src
    const out = new Float32Array(src.length)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let ch = 0; ch < 3; ch++) {
          let sum = 0
          for (let k = -blur; k <= blur; k++) {
            const sx = Math.max(0, Math.min(width - 1, x + k * dx))
            const sy = Math.max(0, Math.min(height - 1, y + k * dy))
            sum += src[(sy * width + sx) * 3 + ch] as number
          }
          out[(y * width + x) * 3 + ch] = sum / (blur * 2 + 1)
        }
    return out
  }
  const soft = pass(pass(hard, 1, 0), 0, 1)

  const data = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    for (let ch = 0; ch < 3; ch++) data[p * 4 + ch] = Math.max(0, Math.min(255, Math.round((soft[p * 3 + ch] as number) + (rng.next() * 2 - 1) * noise)))
    data[p * 4 + 3] = 255
  }
  return { width, height, data }
}

/** Fraction of pixels on which two sets of cells agree. */
export function agreement(a: Uint8Array[], b: Uint8Array[]): number {
  let same = 0
  let total = 0
  a.forEach((cell, i) => {
    for (let p = 0; p < cell.length; p++) {
      total++
      if (cell[p] === (b[i] as Uint8Array)[p]) same++
    }
  })
  return same / total
}
