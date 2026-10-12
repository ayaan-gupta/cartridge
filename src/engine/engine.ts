/**
 * The simulation. One call to step() is one sixtieth of a second, and the
 * result depends only on the manifest and the buttons passed in. No clock,
 * no DOM, no Math.random, no trig. That is what lets the same code run in a
 * browser at 60 FPS and in Node under the win-check bot.
 */
import { hashString, nextRandom } from './rng'
import type { Behavior, Buttons, CellName, EntityDef, GameEvent, GameState, Manifest } from './types'
import { BTN, FPS as FRAMES_PER_SECOND, MAX_ENTITIES, TILE as TILE_SIZE } from './types'

// Local copies. Under some loaders an imported constant is a property lookup
// on a module object every time it is read, and this file is the hot loop.
const TILE = TILE_SIZE
const FPS = FRAMES_PER_SECOND
const UP = BTN.up
const DOWN = BTN.down
const LEFT = BTN.left
const RIGHT = BTN.right
const A = BTN.a
const B = BTN.b

const GRAVITY = 0.25
const MAX_FALL = 4
const JUMP_CUT = 1.5
const COYOTE = 5
const BUFFER = 5
const RUN = 1.5
const DASH_SPEED = 2.5
const DASH_FRAMES = 8
const DASH_COOLDOWN = 36
const INVULNERABLE = 45
const TOUCH_NONE = 0
const TOUCH_HURT = 1
const TOUCH_COLLECT = 2

interface Box {
  ox: number
  oy: number
  w: number
  h: number
}
const SIDE_BOX: Box = { ox: 3, oy: 2, w: 10, h: 14 }
const TOP_BOX: Box = { ox: 3, oy: 5, w: 10, h: 10 }
const MOVER_BOX: Box = { ox: 2, oy: 2, w: 12, h: 12 }

/** Everything about an entity that never changes while the game runs. */
export interface Spec {
  kind: Behavior
  sprite: CellName
  /** Pixels per frame, in eighths, so positions stay exact. */
  speed: number
  axisY: boolean
  dir: number
  rangePx: number
  wrap: boolean
  touch: number
  points: number
  w: number
  h: number
  everyFrames: number
  spreadPx: number
  /** Index of the spec this one spawns, or -1. */
  emit: number
  /** Walks on the ground and turns at ledges instead of stepping off. */
  walker: boolean
  spawned: boolean
}

/** Everything about an entity that does change. */
export interface Ent {
  s: number
  x: number
  y: number
  ox: number
  oy: number
  dir: number
  t: number
  alive: boolean
}

export interface Player {
  x: number
  y: number
  vy: number
  face: number
  fx: number
  fy: number
  ground: boolean
  moving: boolean
  coyote: number
  buffer: number
  dash: number
  dashCd: number
  invuln: number
}

/** Eight numbers per entity, flat, so thousands of snapshots stay cheap. */
const ENT_FIELDS = 8

export interface Snapshot {
  ents: Float64Array
  p: Player
  state: GameState
  frame: number
  score: number
  lives: number
  collected: number
  goalOpen: boolean
  rng: number
  prev: Buttons
}

/** Pixels per second in the manifest become eighths of a pixel per frame. */
export function pxPerFrame(pxPerSecond: number): number {
  return Math.max(1, Math.round((pxPerSecond / FPS) * 8)) / 8
}

export function jumpVelocity(tiles: number): number {
  return Math.round(Math.sqrt(2 * GRAVITY * tiles * TILE) * 8) / 8
}

export class Engine {
  readonly manifest: Manifest
  readonly side: boolean
  readonly mapW: number
  readonly mapH: number
  readonly pxW: number
  readonly pxH: number
  readonly tiles: Uint8Array
  readonly specs: Spec[] = []
  /** Frames on the clock. */
  readonly limit: number
  readonly startX: number
  readonly startY: number
  readonly speed: number
  readonly jumpV: number
  readonly box: Box
  private readonly solidB: boolean
  private readonly initial: Ent[] = []
  private readonly seed: number

  ents: Ent[] = []
  p: Player
  state: GameState = 'title'
  frame = 0
  score = 0
  lives = 0
  collected = 0
  goalOpen = false
  /** Sound cues raised by the most recent step. */
  events: GameEvent[] = []
  private rng = 0
  private prev: Buttons = 0
  private blocked = false

  constructor(manifest: Manifest) {
    this.manifest = manifest
    this.side = manifest.view === 'side'
    this.box = this.side ? SIDE_BOX : TOP_BOX
    this.mapW = manifest.map.w
    this.mapH = manifest.map.h
    this.pxW = this.mapW * TILE
    this.pxH = this.mapH * TILE
    this.solidB = manifest.map.tileB === 'solid'
    this.limit = manifest.rules.timer * FPS
    this.seed = hashString(JSON.stringify(manifest))

    this.tiles = new Uint8Array(this.mapW * this.mapH)
    for (let y = 0; y < this.mapH; y++) {
      const row = manifest.map.rows[y] ?? ''
      for (let x = 0; x < this.mapW; x++) {
        const c = row[x]
        this.tiles[y * this.mapW + x] = c === '#' ? 1 : c === '=' ? 2 : 0
      }
    }

    let sx = 0
    let sy = 0
    let speed = 1
    let jump = 2.5
    for (const def of manifest.entities) {
      if (def.behavior === 'player') {
        sx = def.x * TILE
        sy = def.y * TILE
        speed = pxPerFrame(def.speed)
        jump = def.jump
        continue
      }
      const spec = this.specFor(def)
      if (def.behavior === 'spawner') {
        const e = def.emits
        this.specs.push({
          ...blankSpec(e.behavior, e.sprite),
          speed: pxPerFrame(e.speed),
          axisY: e.behavior === 'falling' || e.axis === 'y',
          dir: e.dir,
          touch: e.touch === 'collect' ? TOUCH_COLLECT : TOUCH_HURT,
          points: 10,
          spawned: true,
        })
        spec.emit = this.specs.length - 1
      }
      this.specs.push(spec)
      this.initial.push({
        s: this.specs.length - 1,
        x: def.x * TILE,
        y: def.y * TILE,
        ox: def.x * TILE,
        oy: def.y * TILE,
        dir: spec.dir,
        t: def.behavior === 'spawner' ? Math.min(30, spec.everyFrames) : spec.kind === 'falling' ? spec.everyFrames : 0,
        alive: true,
      })
    }
    this.startX = sx
    this.startY = sy
    this.speed = speed
    this.jumpV = jumpVelocity(jump)
    this.p = this.freshPlayer()
    this.reset()
  }

  private specFor(def: Exclude<EntityDef, { behavior: 'player' }>): Spec {
    switch (def.behavior) {
      case 'patrol': {
        const below = this.solid(def.x, def.y + 1)
        return {
          ...blankSpec('patrol', def.sprite),
          speed: pxPerFrame(def.speed),
          axisY: def.axis === 'y',
          dir: def.dir,
          rangePx: def.range * TILE,
          wrap: def.wrap,
          touch: def.touch === 'collect' ? TOUCH_COLLECT : TOUCH_HURT,
          points: 10,
          walker: this.side && def.axis === 'x' && !def.wrap && below,
        }
      }
      case 'chase':
        return { ...blankSpec('chase', def.sprite), speed: pxPerFrame(def.speed), rangePx: def.range * TILE, touch: TOUCH_HURT }
      case 'falling':
        return {
          ...blankSpec('falling', def.sprite),
          speed: pxPerFrame(def.speed),
          axisY: true,
          everyFrames: Math.round(def.every * FPS),
          touch: def.touch === 'collect' ? TOUCH_COLLECT : TOUCH_HURT,
          points: 10,
        }
      case 'spawner':
        return {
          ...blankSpec('spawner', 'enemy1'),
          everyFrames: Math.max(10, Math.round(def.every * FPS)),
          spreadPx: def.spread * TILE,
        }
      case 'collectible':
        return { ...blankSpec('collectible', 'item'), touch: TOUCH_COLLECT, points: def.points }
      case 'goal':
        return blankSpec('goal', 'goal')
      case 'hazard':
        return { ...blankSpec('hazard', 'hazard'), touch: TOUCH_HURT, w: def.w * TILE, h: def.h * TILE }
    }
  }

  private freshPlayer(): Player {
    return {
      x: this.startX,
      y: this.startY,
      vy: 0,
      face: 1,
      fx: 1,
      fy: 0,
      ground: false,
      moving: false,
      coyote: 0,
      buffer: 0,
      dash: 0,
      dashCd: 0,
      invuln: 0,
    }
  }

  /** Back to the title card with a fresh world. */
  reset(): void {
    this.ents = this.initial.map((e) => ({ ...e }))
    this.p = this.freshPlayer()
    this.state = 'title'
    this.frame = 0
    this.score = 0
    this.lives = this.manifest.rules.lives
    this.collected = 0
    this.goalOpen = this.manifest.rules.goal.opens === 'always'
    this.rng = this.seed
    this.prev = 0
    this.events = []
  }

  /** Skips the title card. Every play starts from the same seed. */
  start(): void {
    this.reset()
    this.state = 'playing'
    this.events.push('start')
  }

  get secondsLeft(): number {
    return Math.max(0, Math.ceil((this.limit - this.frame) / FPS))
  }

  snapshot(): Snapshot {
    const data = new Float64Array(this.ents.length * ENT_FIELDS)
    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i] as Ent
      const o = i * ENT_FIELDS
      data[o] = e.s
      data[o + 1] = e.x
      data[o + 2] = e.y
      data[o + 3] = e.ox
      data[o + 4] = e.oy
      data[o + 5] = e.dir
      data[o + 6] = e.t
      data[o + 7] = e.alive ? 1 : 0
    }
    return {
      ents: data,
      p: { ...this.p },
      state: this.state,
      frame: this.frame,
      score: this.score,
      lives: this.lives,
      collected: this.collected,
      goalOpen: this.goalOpen,
      rng: this.rng,
      prev: this.prev,
    }
  }

  restore(s: Snapshot): void {
    const data = s.ents
    const count = data.length / ENT_FIELDS
    if (this.ents.length > count) this.ents.length = count
    for (let i = 0; i < count; i++) {
      const o = i * ENT_FIELDS
      let e = this.ents[i]
      if (!e) {
        e = { s: 0, x: 0, y: 0, ox: 0, oy: 0, dir: 1, t: 0, alive: true }
        this.ents[i] = e
      }
      e.s = data[o] as number
      e.x = data[o + 1] as number
      e.y = data[o + 2] as number
      e.ox = data[o + 3] as number
      e.oy = data[o + 4] as number
      e.dir = data[o + 5] as number
      e.t = data[o + 6] as number
      e.alive = data[o + 7] === 1
    }
    this.p = { ...s.p }
    this.state = s.state
    this.frame = s.frame
    this.score = s.score
    this.lives = s.lives
    this.collected = s.collected
    this.goalOpen = s.goalOpen
    this.rng = s.rng
    this.prev = s.prev
  }

  solid(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return false
    const t = this.tiles[ty * this.mapW + tx]
    return t === 1 || (t === 2 && this.solidB)
  }

  /** Advance one frame. */
  step(buttons: Buttons): void {
    this.events.length = 0
    const pressedA = (buttons & A) !== 0 && (this.prev & A) === 0
    this.prev = buttons
    if (this.state !== 'playing') {
      if (pressedA) this.start()
      return
    }
    if (this.frame >= this.limit) return this.lose()
    this.movePlayer(buttons, pressedA)
    if (this.state !== 'playing') return
    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i] as Ent
      if (e.alive) this.moveEntity(e, this.specs[e.s] as Spec)
    }
    this.frame++
    this.updateGoal()
    this.touchEntities()
  }

  // ---- collision ----

  private sweepX(x: number, y: number, b: Box, dx: number): number {
    this.blocked = false
    const nx = x + dx
    if (dx === 0) return nx
    const top = Math.floor((y + b.oy) / TILE)
    const bottom = Math.floor((y + b.oy + b.h - 0.01) / TILE)
    const edge = dx > 0 ? nx + b.ox + b.w - 0.01 : nx + b.ox
    const tx = Math.floor(edge / TILE)
    for (let ty = top; ty <= bottom; ty++) {
      if (this.solid(tx, ty)) {
        this.blocked = true
        return dx > 0 ? tx * TILE - b.ox - b.w : (tx + 1) * TILE - b.ox
      }
    }
    return nx
  }

  private sweepY(x: number, y: number, b: Box, dy: number): number {
    this.blocked = false
    const ny = y + dy
    if (dy === 0) return ny
    const left = Math.floor((x + b.ox) / TILE)
    const right = Math.floor((x + b.ox + b.w - 0.01) / TILE)
    const edge = dy > 0 ? ny + b.oy + b.h - 0.01 : ny + b.oy
    const ty = Math.floor(edge / TILE)
    for (let tx = left; tx <= right; tx++) {
      if (this.solid(tx, ty)) {
        this.blocked = true
        return dy > 0 ? ty * TILE - b.oy - b.h : (ty + 1) * TILE - b.oy
      }
    }
    return ny
  }

  // ---- player ----

  private movePlayer(buttons: Buttons, pressedA: boolean): void {
    const p = this.p
    const b = this.box
    if (p.invuln > 0) p.invuln--
    const ix = (buttons & RIGHT ? 1 : 0) - (buttons & LEFT ? 1 : 0)
    const iy = (buttons & DOWN ? 1 : 0) - (buttons & UP ? 1 : 0)
    const speed = this.speed * (buttons & B ? RUN : 1)
    if (ix !== 0) p.face = ix
    let dx: number
    let dy: number

    if (this.side) {
      dx = ix * speed
      p.moving = ix !== 0
      if (pressedA) p.buffer = BUFFER
      else if (p.buffer > 0) p.buffer--
      if (p.ground) p.coyote = COYOTE
      else if (p.coyote > 0) p.coyote--
      if (p.buffer > 0 && p.coyote > 0) {
        p.vy = -this.jumpV
        p.buffer = 0
        p.coyote = 0
        this.events.push('jump')
      }
      if (!(buttons & A) && p.vy < -JUMP_CUT) p.vy = -JUMP_CUT
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL)
      dy = p.vy
    } else {
      if (ix !== 0 || iy !== 0) {
        p.fx = ix
        p.fy = iy
      }
      if (p.dashCd > 0) p.dashCd--
      if (pressedA && p.dashCd === 0) {
        p.dash = DASH_FRAMES
        p.dashCd = DASH_COOLDOWN
        this.events.push('dash')
      }
      const diagonal = ix !== 0 && iy !== 0 ? 0.75 : 1
      dx = ix * speed * diagonal
      dy = iy * speed * diagonal
      if (p.dash > 0) {
        p.dash--
        const d = p.fx !== 0 && p.fy !== 0 ? 0.75 : 1
        dx = p.fx * this.speed * DASH_SPEED * d
        dy = p.fy * this.speed * DASH_SPEED * d
      }
      p.moving = dx !== 0 || dy !== 0
    }

    p.x = this.sweepX(p.x, p.y, b, dx)
    p.x = Math.max(-b.ox, Math.min(this.pxW - b.ox - b.w, p.x))
    p.y = this.sweepY(p.x, p.y, b, dy)
    if (this.side) {
      p.ground = this.blocked && dy > 0
      if (this.blocked) p.vy = 0
      if (p.y < -TILE) {
        p.y = -TILE
        p.vy = 0
      }
      if (p.y > this.pxH) this.hurt(true)
    } else {
      p.y = Math.max(-b.oy, Math.min(this.pxH - b.oy - b.h, p.y))
    }
  }

  private hurt(always = false): void {
    const p = this.p
    if (p.invuln > 0 && !always) return
    this.lives--
    this.events.push('hurt')
    if (this.lives <= 0) return this.lose()
    const face = p.face
    this.p = this.freshPlayer()
    this.p.face = face
    this.p.invuln = INVULNERABLE
  }

  private lose(): void {
    this.state = 'lost'
    this.events.push('lose')
  }

  // ---- everything else ----

  private moveEntity(e: Ent, s: Spec): void {
    switch (s.kind) {
      case 'patrol':
        return s.spawned ? this.moveShot(e, s) : this.movePatrol(e, s)
      case 'chase':
        return this.moveChase(e, s)
      case 'falling':
        return this.moveFalling(e, s)
      case 'spawner':
        if (e.t > 0) e.t--
        else {
          this.spawn(e, s)
          e.t = s.everyFrames
        }
    }
  }

  private movePatrol(e: Ent, s: Spec): void {
    const step = s.speed * e.dir
    const nx = s.axisY ? e.x : e.x + step
    const ny = s.axisY ? e.y + step : e.y
    if (s.wrap) {
      const span = s.axisY ? this.pxH : this.pxW
      const pos = s.axisY ? ny : nx
      const wrapped = pos > span ? -TILE : pos < -TILE ? span : pos
      if (s.axisY) e.y = wrapped
      else e.x = wrapped
      return
    }
    // The pixel just past the leading edge decides whether the way is clear.
    const lead = step > 0 ? TILE - 1 : 0
    const px = s.axisY ? nx + 8 : nx + lead
    const py = s.axisY ? ny + lead : ny + 8
    const tx = Math.floor(px / TILE)
    const ty = Math.floor(py / TILE)
    const travelled = (s.axisY ? ny - e.oy : nx - e.ox) * s.dir
    let turn = px < 0 || py < 0 || px >= this.pxW || py >= this.pxH || this.solid(tx, ty)
    if (s.rangePx > 0 && (travelled > s.rangePx || travelled < 0)) turn = true
    if (s.walker && !this.solid(tx, ty + 1)) turn = true
    if (turn) e.dir = -e.dir
    else {
      e.x = nx
      e.y = ny
    }
  }

  /** A spawned mover travels in a straight line and disappears at a wall or edge. */
  private moveShot(e: Ent, s: Spec): void {
    const step = s.speed * e.dir
    if (s.axisY) e.y += step
    else e.x += step
    const gone = e.x < -TILE || e.y < -TILE || e.x > this.pxW || e.y > this.pxH
    if (gone || this.solid(Math.floor((e.x + 8) / TILE), Math.floor((e.y + 8) / TILE))) e.alive = false
  }

  private moveChase(e: Ent, s: Spec): void {
    const p = this.p
    const near = s.rangePx === 0 || (Math.abs(p.x - e.x) <= s.rangePx && Math.abs(p.y - e.y) <= s.rangePx)
    const tx = near ? p.x : e.ox
    const ty = near ? p.y : e.oy
    const speed = near ? s.speed : s.speed / 2
    const dx = Math.max(-speed, Math.min(speed, tx - e.x))
    const dy = Math.max(-speed, Math.min(speed, ty - e.y))
    if (dx !== 0) e.dir = dx > 0 ? 1 : -1
    e.x = this.sweepX(e.x, e.y, MOVER_BOX, dx)
    e.y = this.sweepY(e.x, e.y, MOVER_BOX, dy)
  }

  private moveFalling(e: Ent, s: Spec): void {
    if (e.t > 0) {
      e.t--
      return
    }
    e.y += s.speed
    const landed = e.y > this.pxH || this.solid(Math.floor((e.x + 8) / TILE), Math.floor((e.y + 14) / TILE))
    if (!landed) return
    if (s.spawned) e.alive = false
    else {
      e.y = e.oy
      e.t = s.everyFrames
    }
  }

  private random(): number {
    const r = nextRandom(this.rng)
    this.rng = r.state
    return r.value
  }

  private spawn(from: Ent, s: Spec): void {
    const spec = this.specs[s.emit] as Spec
    const halfTiles = Math.round(s.spreadPx / 8)
    const offset = halfTiles > 0 ? (Math.floor(this.random() * (halfTiles * 2 + 1)) - halfTiles) * 8 : 0
    // Things spread across their direction of travel.
    let x = from.x + (spec.axisY ? offset : 0)
    let y = from.y + (spec.axisY ? 0 : offset)
    x = Math.max(0, Math.min(this.pxW - TILE, x))
    y = Math.max(0, Math.min(this.pxH - TILE, y))
    const fresh: Ent = { s: s.emit, x, y, ox: x, oy: y, dir: spec.dir, t: 0, alive: true }
    const free = this.ents.findIndex((e) => !e.alive && (this.specs[e.s] as Spec).spawned)
    if (free >= 0) this.ents[free] = fresh
    else if (this.ents.length < MAX_ENTITIES) this.ents.push(fresh)
  }

  private updateGoal(): void {
    if (this.goalOpen) return
    const { opens, amount } = this.manifest.rules.goal
    const open =
      (opens === 'collect' && this.collected >= amount) ||
      (opens === 'score' && this.score >= amount) ||
      (opens === 'survive' && this.frame >= amount * FPS)
    if (open) {
      this.goalOpen = true
      this.events.push('open')
    }
  }

  private touchEntities(): void {
    const b = this.box
    const left = this.p.x + b.ox
    const top = this.p.y + b.oy
    const right = left + b.w
    const bottom = top + b.h
    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i] as Ent
      if (!e.alive) continue
      const s = this.specs[e.s] as Spec
      if (s.kind === 'spawner') continue
      // Pickups and the goal are generous, things that hurt are forgiving.
      const inset = s.touch === TOUCH_HURT ? 3 : 1
      if (right <= e.x + inset || left >= e.x + s.w - inset) continue
      if (bottom <= e.y + inset || top >= e.y + s.h - inset) continue
      if (s.kind === 'goal') {
        if (this.goalOpen) return this.win()
      } else if (s.touch === TOUCH_COLLECT) {
        e.alive = false
        this.collected++
        this.score += s.points
        this.events.push('collect')
        this.updateGoal()
      } else if (s.touch === TOUCH_HURT) {
        this.hurt()
        if (this.state !== 'playing' || this.p.invuln > 0) return
      }
    }
  }

  private win(): void {
    this.state = 'won'
    this.score += this.secondsLeft * 5
    this.events.push('win')
  }
}

function blankSpec(kind: Behavior, sprite: CellName): Spec {
  return {
    kind,
    sprite,
    speed: 0,
    axisY: false,
    dir: 1,
    rangePx: 0,
    wrap: false,
    touch: TOUCH_NONE,
    points: 0,
    w: TILE,
    h: TILE,
    everyFrames: 0,
    spreadPx: 0,
    emit: -1,
    walker: false,
    spawned: false,
  }
}
