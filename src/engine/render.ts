/**
 * Draws a game into a 160 by 144 buffer of palette indices. The browser turns
 * that buffer into pixels with a four-entry lookup, and tests hash it as it
 * is, so what a test sees is exactly what a player sees.
 */
import type { Engine, Ent, Spec } from './engine'
import { drawText, textWidth, wrapText } from './font'
import { cellOrigin, TRANSPARENT, unpackSheet } from './sheet'
import type { CellName, Sheet } from './types'
import { CELLS, HUD_H, SCREEN_H, SCREEN_W, TILE, VIEW_H } from './types'

// Local copies. Under some loaders an imported constant is a property lookup
// on a module object every time it is read, which matters in a pixel loop.
const W = SCREEN_W
const H = SCREEN_H
const CELL = TILE
const VIEW = VIEW_H
const HUD = HUD_H
const CLEAR = TRANSPARENT

const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000']
const GEM = ['00100', '01110', '11111', '01110', '00100']
const CLOCK = ['01110', '10101', '10111', '10001', '01110']

export class Renderer {
  readonly fb = new Uint8Array(W * H)
  private readonly sheet: Uint8Array
  private readonly sheetW: number
  /** Offset of each cell's first pixel inside the unpacked sheet. */
  private readonly origins = new Map<CellName, number>()

  constructor(sheet: Sheet) {
    this.sheet = unpackSheet(sheet)
    this.sheetW = sheet.w
    for (const name of CELLS) {
      const o = cellOrigin(name)
      this.origins.set(name, o.y * sheet.w + o.x)
    }
  }

  /** `tick` only drives blinking and bobbing, never the game itself. */
  draw(game: Engine, tick: number): Uint8Array {
    if (game.state === 'title') {
      this.title(game, tick)
      return this.fb
    }
    this.world(game, tick)
    this.hud(game)
    if (game.state === 'won') this.banner('YOU WIN', `SCORE ${game.score}`, 'A: PLAY AGAIN', tick)
    if (game.state === 'lost') {
      const reason = game.lives <= 0 ? 'GAME OVER' : 'TIME UP'
      this.banner(reason, `SCORE ${game.score}`, 'A: TRY AGAIN', tick)
    }
    return this.fb
  }

  /** Where the camera sits for the current player position. */
  camera(game: Engine): { x: number; y: number } {
    const x = Math.floor(game.p.x) + CELL / 2 - W / 2
    const y = Math.floor(game.p.y) + CELL / 2 - VIEW / 2
    return {
      x: Math.max(0, Math.min(game.pxW - W, x)),
      y: Math.max(0, Math.min(game.pxH - VIEW, y)),
    }
  }

  private world(game: Engine, tick: number): void {
    const cam = this.camera(game)
    // The backdrop drifts at half speed in the side view and is the floor in the top view.
    const bx = game.side ? cam.x >> 1 : cam.x
    const by = game.side ? cam.y >> 1 : cam.y
    for (let y = -(by % CELL); y < VIEW; y += CELL)
      for (let x = -(bx % CELL); x < W; x += CELL) this.cell('background', x, y)

    const tx0 = Math.floor(cam.x / CELL)
    const ty0 = Math.floor(cam.y / CELL)
    for (let ty = ty0; ty <= ty0 + VIEW / CELL && ty < game.mapH; ty++)
      for (let tx = tx0; tx <= tx0 + W / CELL && tx < game.mapW; tx++) {
        const t = game.tiles[ty * game.mapW + tx]
        if (t) this.cell(t === 1 ? 'tileA' : 'tileB', tx * CELL - cam.x, ty * CELL - cam.y)
      }

    // Static things first so anything that moves is drawn over them.
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < game.ents.length; i++) {
        const e = game.ents[i] as Ent
        if (!e.alive) continue
        const s = game.specs[e.s] as Spec
        const still = s.kind === 'hazard' || s.kind === 'collectible' || s.kind === 'goal'
        if (s.kind === 'spawner' || still !== (pass === 0)) continue
        this.entity(game, e, s, i, cam.x, cam.y, tick)
      }

    const p = game.p
    if (game.state === 'lost' && game.lives <= 0) return
    if (p.invuln > 0 && ((p.invuln >> 2) & 1) === 1) return
    const bob = p.moving && (!game.side || p.ground) && ((tick >> 3) & 1) === 1 ? 1 : 0
    this.cell('player', Math.floor(p.x) - cam.x, Math.floor(p.y) - cam.y - bob, p.face < 0)
  }

  private entity(game: Engine, e: Ent, s: Spec, i: number, cx: number, cy: number, tick: number): void {
    const x = Math.floor(e.x) - cx
    const y = Math.floor(e.y) - cy
    if (x <= -s.w || y <= -s.h || x >= W || y >= VIEW) return
    if (s.kind === 'hazard') {
      for (let oy = 0; oy < s.h; oy += CELL) for (let ox = 0; ox < s.w; ox += CELL) this.cell('hazard', x + ox, y + oy)
    } else if (s.kind === 'goal') {
      this.cell('goal', x, y, false, !game.goalOpen)
    } else if (s.kind === 'collectible') {
      this.cell('item', x, y - (((tick >> 4) + i) & 1))
    } else {
      this.cell(s.sprite, x, y, !s.axisY && e.dir < 0)
    }
  }

  /** Copies one 16 by 16 cell into the world area, clipped to it. */
  private cell(name: CellName, dx: number, dy: number, flip = false, stipple = false): void {
    const origin = this.origins.get(name) as number
    const sheet = this.sheet
    const fb = this.fb
    const stride = this.sheetW
    const x0 = dx < 0 ? -dx : 0
    const x1 = dx + CELL > W ? W - dx : CELL
    for (let y = 0; y < CELL; y++) {
      const py = dy + y
      if (py < 0 || py >= VIEW) continue
      const row = (py + HUD) * W + dx
      const src = origin + y * stride
      for (let x = x0; x < x1; x++) {
        if (stipple && ((dx + x + py) & 1) === 1) continue
        const v = sheet[src + (flip ? CELL - 1 - x : x)] as number
        if (v !== CLEAR) fb[row + x] = v
      }
    }
  }

  private rect(x: number, y: number, w: number, h: number, color: number): void {
    for (let py = Math.max(0, y); py < Math.min(H, y + h); py++)
      this.fb.fill(color, py * W + Math.max(0, x), py * W + Math.min(W, x + w))
  }

  private icon(rows: string[], x: number, y: number, color: number): void {
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '1') this.fb[(y + r) * W + x + c] = color
    })
  }

  private text(text: string, x: number, y: number, color: number, scale = 1): void {
    drawText(this.fb, W, H, text, x, y, color, scale)
  }

  private centred(text: string, y: number, color: number, scale = 1): void {
    this.text(text, Math.floor((W - textWidth(text, scale)) / 2), y, color, scale)
  }

  private hud(game: Engine): void {
    this.rect(0, 0, W, HUD, 3)
    this.rect(0, HUD - 1, W, 1, 2)
    const shown = Math.min(game.lives, 5)
    for (let i = 0; i < shown; i++) this.icon(HEART, 4 + i * 9, 5, 0)

    this.text(String(game.score).padStart(4, '0'), 56, 5, 0)

    const goal = game.manifest.rules.goal
    let progress = ''
    if (goal.opens === 'collect') progress = `${Math.min(game.collected, goal.amount)}/${goal.amount}`
    if (goal.opens === 'score') progress = `${Math.min(game.score, goal.amount)}/${goal.amount}`
    if (goal.opens === 'survive') progress = String(Math.max(0, goal.amount - Math.floor(game.frame / 60)))
    if (progress) {
      this.icon(goal.opens === 'survive' ? CLOCK : GEM, 84, 5, game.goalOpen ? 1 : 0)
      this.text(game.goalOpen ? 'GO' : progress, 91, 5, game.goalOpen ? 1 : 0)
    }

    const time = String(game.secondsLeft)
    const urgent = game.secondsLeft <= 10 && game.state === 'playing' && ((game.frame >> 4) & 1) === 1
    this.text(time, W - 4 - textWidth(time), 5, urgent ? 1 : 0)
    this.text('T', W - 9 - textWidth(time), 5, 1)
  }

  private banner(title: string, line: string, hint: string, tick: number): void {
    this.rect(22, 50, 116, 52, 0)
    this.rect(24, 52, 112, 48, 3)
    this.centred(title, 58, 0, 2)
    this.centred(line, 76, 1)
    if (((tick >> 5) & 1) === 0) this.centred(hint, 88, 0)
  }

  private title(game: Engine, tick: number): void {
    const m = game.manifest
    this.fb.fill(0)
    this.rect(0, 0, W, 4, 3)
    this.rect(0, 6, W, 1, 2)
    this.rect(0, H - 4, W, 4, 3)
    this.rect(0, H - 7, W, 1, 2)

    const lines = wrapText(m.title, 19)
    let y = lines.length > 1 ? 16 : 24
    for (const line of lines.slice(0, 2)) {
      this.centred(line, y, 3, 2)
      y += 14
    }

    // The cast, so the first thing you see is what you will be playing with.
    const cast: CellName[] = ['player', 'enemy1', 'enemy2', 'enemy3', 'goal']
    const row = 54 - HUD
    this.rect(24, 50, 112, 24, 1)
    this.rect(25, 51, 110, 22, 0)
    cast.forEach((name, i) => {
      const hop = name === 'player' && ((tick >> 4) & 1) === 1 ? 1 : 0
      this.cell(name, 32 + i * 20, row - hop)
    })

    let by = 82
    for (const line of wrapText(m.blurb, 34).slice(0, 3)) {
      this.centred(line, by, 2)
      by += 8
    }
    const controls = game.side ? 'A JUMP   B RUN' : 'A DASH   B RUN'
    this.centred(controls, 112, 2)
    if (((tick >> 5) & 1) === 0) this.centred('PRESS A TO START', 124, 3)
  }
}
