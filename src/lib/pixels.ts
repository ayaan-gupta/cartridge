/** Small helpers for turning palette-index buffers into real pixels. */

export interface RGBAImage {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Expands an index buffer to RGBA at an integer scale. Index 4 and above is
 * drawn with `empty`, which defaults to fully transparent.
 */
export function indexedToRgba(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: readonly string[],
  scale = 1,
  empty: [number, number, number, number] = [0, 0, 0, 0],
): RGBAImage {
  const colors = palette.map(hexToRgb)
  const out = new Uint8Array(width * scale * height * scale * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x] as number
      const c = colors[v]
      const r = c ? c[0] : empty[0]
      const g = c ? c[1] : empty[1]
      const b = c ? c[2] : empty[2]
      const a = c ? 255 : empty[3]
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) {
          const o = ((y * scale + sy) * width * scale + x * scale + sx) * 4
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
          out[o + 3] = a
        }
    }
  return { width: width * scale, height: height * scale, data: out }
}
