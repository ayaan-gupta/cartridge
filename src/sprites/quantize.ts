/**
 * Colour reduction for generated sprite sheets: cut the image's colours into
 * four boxes, then give each box one of the cart's four palette colours.
 * Pure arithmetic on byte arrays, so it runs anywhere.
 */

export type RGB = [number, number, number]

/** sRGB to Oklab. Distances in Oklab track what the eye calls "close". */
export function oklab([r, g, b]: RGB): RGB {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lr = lin(r)
  const lg = lin(g)
  const lb = lin(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

export function distance(a: RGB, b: RGB): number {
  const p = oklab(a)
  const q = oklab(b)
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
}

export function nearest(color: RGB, palette: readonly RGB[]): number {
  let best = 0
  let bestD = Number.POSITIVE_INFINITY
  for (let i = 0; i < palette.length; i++) {
    const d = distance(color, palette[i] as RGB)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** One distinct colour (at 5 bits a channel) and how many pixels had it. */
export interface Bin {
  r: number
  g: number
  b: number
  n: number
}

/** Buckets pixels by their top five bits per channel. `keep` filters by pixel index. */
export function histogram(data: Uint8Array | Uint8ClampedArray, keep: (pixel: number) => boolean): Bin[] {
  const sums = new Map<number, Bin>()
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (!keep(p)) continue
    const r = data[i] as number
    const g = data[i + 1] as number
    const b = data[i + 2] as number
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const bin = sums.get(key)
    if (bin) {
      bin.r += r
      bin.g += g
      bin.b += b
      bin.n++
    } else sums.set(key, { r, g, b, n: 1 })
  }
  return [...sums.values()].map((bin) => ({ r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n, n: bin.n }))
}

type Channel = 'r' | 'g' | 'b'
const CHANNELS: Channel[] = ['r', 'g', 'b']

function spread(box: Bin[]): { channel: Channel; range: number; error: number } {
  let channel: Channel = 'r'
  let range = -1
  let error = 0
  const total = box.reduce((sum, bin) => sum + bin.n, 0)
  for (const c of CHANNELS) {
    let lo = 255
    let hi = 0
    let mean = 0
    for (const bin of box) {
      lo = Math.min(lo, bin[c])
      hi = Math.max(hi, bin[c])
      mean += bin[c] * bin.n
    }
    mean /= total
    for (const bin of box) error += (bin[c] - mean) ** 2 * bin.n
    if (hi - lo > range) {
      range = hi - lo
      channel = c
    }
  }
  return { channel, range, error }
}

/**
 * Median cut. The classic version splits the widest box at its population
 * median, which goes wrong when one colour dominates: the median lands inside
 * that one colour and two of the four boxes are spent telling it apart from
 * itself. `variance` mode keeps the box-and-axis structure but puts each cut
 * where it leaves the least error on both sides, and always cuts the box with
 * the most error. That is the mode the sheet pipeline uses.
 */
export function medianCut(bins: Bin[], k: number, mode: 'variance' | 'median' = 'variance'): RGB[] {
  if (bins.length === 0) return []
  let boxes: Bin[][] = [bins]
  while (boxes.length < k) {
    let pick = -1
    let score = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      const s = spread(box)
      const value = mode === 'variance' ? s.error : s.range
      if (value > score) {
        score = value
        pick = i
      }
    })
    if (pick < 0) break
    const box = boxes[pick] as Bin[]
    const { channel } = spread(box)
    const sorted = [...box].sort((a, b) => a[channel] - b[channel])
    let cut = 1
    if (mode === 'median') {
      const half = sorted.reduce((sum, bin) => sum + bin.n, 0) / 2
      let seen = 0
      for (let i = 0; i < sorted.length - 1; i++) {
        seen += (sorted[i] as Bin).n
        cut = i + 1
        if (seen >= half) break
      }
    } else {
      // Otsu's threshold along the chosen channel: the cut with the least error on both sides.
      let n = 0
      let sum = 0
      let sq = 0
      for (const bin of sorted) {
        n += bin.n
        sum += bin[channel] * bin.n
        sq += bin[channel] ** 2 * bin.n
      }
      let ln = 0
      let lsum = 0
      let lsq = 0
      let best = Number.POSITIVE_INFINITY
      for (let i = 0; i < sorted.length - 1; i++) {
        const bin = sorted[i] as Bin
        ln += bin.n
        lsum += bin[channel] * bin.n
        lsq += bin[channel] ** 2 * bin.n
        const rn = n - ln
        const error = lsq - lsum ** 2 / ln + (sq - lsq) - (sum - lsum) ** 2 / rn
        if (error < best) {
          best = error
          cut = i + 1
        }
      }
    }
    boxes = [...boxes.slice(0, pick), sorted.slice(0, cut), sorted.slice(cut), ...boxes.slice(pick + 1)]
  }
  return boxes.map((box) => {
    const n = box.reduce((sum, bin) => sum + bin.n, 0)
    return [box.reduce((s, bin) => s + bin.r * bin.n, 0) / n, box.reduce((s, bin) => s + bin.g * bin.n, 0) / n, box.reduce((s, bin) => s + bin.b * bin.n, 0) / n] as RGB
  })
}

/**
 * A few rounds of k-means over the histogram. Median cut puts each colour in
 * roughly the right box. This moves each box's colour to the middle of the
 * pixels that actually chose it.
 */
export function refine(bins: Bin[], reps: readonly RGB[], rounds = 4): RGB[] {
  let centres = reps.map((c) => [...c] as RGB)
  for (let round = 0; round < rounds; round++) {
    const sums = centres.map(() => [0, 0, 0, 0])
    for (const bin of bins) {
      let best = 0
      let bestD = Number.POSITIVE_INFINITY
      centres.forEach((c, i) => {
        const d = (c[0] - bin.r) ** 2 + (c[1] - bin.g) ** 2 + (c[2] - bin.b) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      const sum = sums[best] as number[]
      sum[0] = (sum[0] as number) + bin.r * bin.n
      sum[1] = (sum[1] as number) + bin.g * bin.n
      sum[2] = (sum[2] as number) + bin.b * bin.n
      sum[3] = (sum[3] as number) + bin.n
    }
    centres = centres.map((c, i) => {
      const [r, g, b, n] = sums[i] as [number, number, number, number]
      return n > 0 ? ([r / n, g / n, b / n] as RGB) : c
    })
  }
  return centres
}

/**
 * Gives each representative colour its own palette entry, choosing the
 * pairing with the least total distance. Plain "nearest colour" would let two
 * shades of a generated image collapse onto one palette entry and leave
 * another unused, which flattens a sprite. With at most four of each there
 * are at most 24 pairings to try.
 */
export function assignToPalette(reps: readonly RGB[], palette: readonly RGB[]): number[] {
  const cost = reps.map((rep) => palette.map((color) => distance(rep, color)))
  let best: number[] = reps.map((rep) => nearest(rep, palette))
  let bestCost = Number.POSITIVE_INFINITY
  const used = new Array<boolean>(palette.length).fill(false)
  const current: number[] = []
  const search = (i: number, total: number) => {
    if (total >= bestCost) return
    if (i === reps.length) {
      bestCost = total
      best = [...current]
      return
    }
    for (let p = 0; p < palette.length; p++) {
      if (used[p]) continue
      used[p] = true
      current.push(p)
      search(i + 1, total + ((cost[i] as number[])[p] as number))
      current.pop()
      used[p] = false
    }
  }
  if (reps.length <= palette.length) search(0, 0)
  return best
}
