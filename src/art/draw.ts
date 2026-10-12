/**
 * Design-time art, drawn in code. These are the interim versions of the
 * images requested in assets/prompts.md: a logo, the console's d-pad and
 * buttons, two small illustrations, and the built-in sprite sheets laid out
 * on magenta exactly as a generated sheet would be.
 *
 * `npm run art` writes them to assets/interim. Nothing here runs in the app.
 */
import { TRANSPARENT } from '@/engine/sheet'
import { TILE } from '@/engine/types'
import type { RGBAImage } from '@/lib/pixels'
import { hexToRgb } from '@/lib/pixels'
import { ICON_ORDER, REFERENCE_PALETTE } from '@/sprites/assets'
import { GENERATED_CELLS } from '@/sprites/sheet'
import type { Cell } from '@/sprites/synth'
import { defaultCells, iconCell } from '@/sprites/synth'

/** The interface palette: paper, shell, shadow, ink, and the one accent. */
export const UI = {
  paper: '#f3f0e8',
  shell: '#d9d5cc',
  edge: '#b9b4a8',
  shadow: '#8b8794',
  slate: '#50505a',
  ink: '#2b2a33',
  accent: '#a3214f',
  accentLight: '#c8497a',
  accentDark: '#6e1535',
} as const

/** A tiny true-colour canvas with hard edges only. */
export class Canvas {
  readonly data: Uint8Array
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4)
  }
  set(x: number, y: number, hex: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const [r, g, b] = hexToRgb(hex)
    const o = (Math.floor(y) * this.width + Math.floor(x)) * 4
    this.data[o] = r
    this.data[o + 1] = g
    this.data[o + 2] = b
    this.data[o + 3] = 255
  }
  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, hex)
  }
  disc(cx: number, cy: number, r: number, hex: string): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, hex)
  }
  /** Draws rows of characters, looking each one up in a legend. '.' is skipped. */
  stamp(rows: string[], x: number, y: number, legend: Record<string, string>): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const hex = legend[row[i] as string]
        if (hex) this.set(x + i, y + j, hex)
      }
    })
  }
  scaled(factor: number): RGBAImage {
    const out = new Uint8Array(this.width * factor * this.height * factor * 4)
    for (let y = 0; y < this.height * factor; y++)
      for (let x = 0; x < this.width * factor; x++) {
        const src = (Math.floor(y / factor) * this.width + Math.floor(x / factor)) * 4
        out.set(this.data.subarray(src, src + 4), (y * this.width * factor + x) * 4)
      }
    return { width: this.width * factor, height: this.height * factor, data: out }
  }
}

const LETTERS: Record<string, string[]> = {
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
}

const CARTRIDGE = [
  '.##########.',
  '#a.a.a.a.aa#',
  '#aaaaaaaaaa#',
  '#a########a#',
  '#a#pppppp#a#',
  '#a#pkppkp#a#',
  '#a#pppppp#a#',
  '#a#pkkkkp#a#',
  '#a########a#',
  '#aaaaaaaaaa#',
  '#aa######aa#',
  '.##......##.',
]

/** The wordmark: a cartridge and the name, with a one-pixel drop shadow. */
export function logo(): Canvas {
  const word = 'CARTRIDGE'
  const canvas = new Canvas(74, 13)
  canvas.stamp(CARTRIDGE, 0, 0, { '#': UI.ink, a: UI.accent, p: UI.paper, k: UI.ink })
  let x = 16
  for (const ch of word) {
    const glyph = LETTERS[ch] as string[]
    canvas.stamp(glyph, x + 1, 4, { '#': UI.accent })
    canvas.stamp(glyph, x, 3, { '#': UI.ink })
    x += (glyph[0] as string).length + 1
  }
  return canvas
}

/** The d-pad: a plus with a lit top-left edge, a shaded bottom-right, and a dimple. */
export function dpad(): Canvas {
  const size = 40
  const arm = 14
  const lo = (size - arm) / 2
  const canvas = new Canvas(size, size)
  const inPlus = (x: number, y: number) => (x >= lo && x < lo + arm && y >= 1 && y < size - 1) || (y >= lo && y < lo + arm && x >= 1 && x < size - 1)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!inPlus(x, y)) {
        // A one-pixel rim wherever the plus has a neighbour.
        if (inPlus(x - 1, y) || inPlus(x + 1, y) || inPlus(x, y - 1) || inPlus(x, y + 1)) canvas.set(x, y, '#17161c')
        continue
      }
      const lit = !inPlus(x - 1, y) || !inPlus(x, y - 1)
      const dim = !inPlus(x + 1, y) || !inPlus(x, y + 1)
      canvas.set(x, y, lit ? '#5d5b68' : dim ? '#1e1d25' : UI.ink)
    }
  canvas.disc(19.5, 19.5, 3.2, '#1e1d25')
  canvas.disc(19.5, 19.5, 1.6, '#3a3944')
  const arrow = (cx: number, cy: number, dx: number, dy: number) => {
    for (let k = 0; k < 3; k++) for (let s = -k; s <= k; s++) canvas.set(cx + (dx !== 0 ? -dx * k : s), cy + (dy !== 0 ? -dy * k : s), '#4a4854')
  }
  arrow(19, 5, 0, -1)
  arrow(19, 34, 0, 1)
  arrow(5, 19, -1, 0)
  arrow(34, 19, 1, 0)
  return canvas
}

/** A round action button with a highlight and a shadow. */
export function roundButton(): Canvas {
  const canvas = new Canvas(18, 18)
  canvas.disc(8.5, 8.5, 8.4, UI.accentDark)
  canvas.disc(8.5, 8.5, 7.4, UI.accent)
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 18; x++) {
      const d = (x - 8.5) ** 2 + (y - 8.5) ** 2
      if (d <= 7.4 ** 2 && d > 5.2 ** 2) {
        if (x + y < 13) canvas.set(x, y, UI.accentLight)
        if (x + y > 22) canvas.set(x, y, UI.accentDark)
      }
    }
  canvas.rect(5, 4, 3, 1, '#e59ab8')
  canvas.rect(4, 5, 1, 2, '#e59ab8')
  return canvas
}

const BIG_CART = [
  '..####################..',
  '.#aaaaaaaaaaaaaaaaaaaa#.',
  '#aa.aa.aa.aa.aa.aa.aaaa#',
  '#aa.aa.aa.aa.aa.aa.aaaa#',
  '#aaaaaaaaaaaaaaaaaaaaaa#',
  '#aa##################aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa#pppppppppppppppp#aa#',
  '#aa##################aa#',
  '#aaaaaaaaaaaaaaaaaaaaaa#',
  '#aaaaaaaaaaaaaaaaaaaaaa#',
  '#aaaa##############aaaa#',
  '#aaaa#ssssssssssss#aaaa#',
  '.####..............####.',
]

function bigCart(canvas: Canvas, x: number, y: number, body: string, face: string[]): void {
  canvas.stamp(BIG_CART, x, y, { '#': UI.ink, a: body, p: UI.paper, s: UI.shadow })
  canvas.stamp(face, x + 4, y + 6, { '#': UI.ink, a: UI.accent, s: UI.shadow })
}

const QUESTION = ['................', '.....######.....', '....##....##....', '..........##....', '.........##.....', '.......###......', '.......##.......', '................', '.......##.......', '.......##.......']
const SMILE = ['................', '................', '...##......##...', '...##......##...', '................', '................', '..#..........#..', '...##########...', '................', '................']
const ZED = ['................', '..........aaaa..', '............a...', '...........a....', '..####....aaaa..', '.....#..........', '....#...........', '...#............', '..####..........', '................']

/** For a share link that leads nowhere: a cartridge with a question on its label. */
export function lostCart(): Canvas {
  const canvas = new Canvas(40, 30)
  bigCart(canvas, 8, 2, UI.shell, QUESTION)
  canvas.rect(4, 26, 32, 1, UI.shadow)
  canvas.rect(8, 27, 24, 1, UI.edge)
  return canvas
}

/** For an empty gallery: three cartridges on a shelf, one of them asleep. */
export function emptyShelf(): Canvas {
  const canvas = new Canvas(88, 30)
  bigCart(canvas, 4, 2, UI.shell, ZED)
  bigCart(canvas, 32, 2, UI.edge, SMILE)
  bigCart(canvas, 60, 2, UI.shell, ZED)
  canvas.rect(0, 25, 88, 2, UI.ink)
  canvas.rect(2, 27, 84, 1, UI.shadow)
  return canvas
}

/** Lays cells out as a generated sheet would arrive: a grid on flat magenta. */
export function cellsOnMagenta(cells: Cell[], cols: number, scale: number): RGBAImage {
  const rows = Math.ceil(cells.length / cols)
  const colors = REFERENCE_PALETTE.map(hexToRgb)
  const width = cols * TILE * scale
  const height = rows * TILE * scale
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const n = Math.floor(y / (TILE * scale)) * cols + Math.floor(x / (TILE * scale))
      const cell = cells[n]
      const v = cell ? (cell[(Math.floor(y / scale) % TILE) * TILE + (Math.floor(x / scale) % TILE)] as number) : TRANSPARENT
      const c = v === TRANSPARENT ? ([255, 0, 255] as const) : (colors[v] as [number, number, number])
      data.set([c[0], c[1], c[2], 255], (y * width + x) * 4)
    }
  return { width, height, data }
}

export function defaultSheetImage(scale = 16): RGBAImage {
  const cells = defaultCells()
  return cellsOnMagenta(GENERATED_CELLS.map((name) => cells[name]), 4, scale)
}

export function iconSheetImage(scale = 16): RGBAImage {
  return cellsOnMagenta(ICON_ORDER.map((icon) => iconCell(icon)), 5, scale)
}
