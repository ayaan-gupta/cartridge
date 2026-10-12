/** FNV-1a. Good enough to turn a string into a seed or a short id. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * mulberry32, written so the whole generator state is one 32-bit number.
 * The engine keeps that number in its own state, which is what makes a
 * snapshot of a running game complete.
 */
export function nextRandom(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** A convenience wrapper for code that just wants a stream of numbers. */
export class Rng {
  private state: number
  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashString(seed) : seed >>> 0
  }
  next(): number {
    const r = nextRandom(this.state)
    this.state = r.state
    return r.value
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }
  /** Integer in [lo, hi], both ends included. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1)
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T
  }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      const a = items[i] as T
      items[i] = items[j] as T
      items[j] = a
    }
    return items
  }
}
