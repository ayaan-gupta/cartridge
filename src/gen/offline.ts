/**
 * The offline generator. It turns a prompt into a manifest with no model and
 * no network: read the prompt for a hero, foes, a goal and a setting, pick one
 * of seven level archetypes, and build a level for it from a seed that is the
 * hash of the prompt. Same prompt, same cart, every time.
 *
 * `ease` asks for a gentler version of the same cart. The pipeline raises it
 * when the bot cannot win, so every archetype has to get simpler as it grows.
 */
import { hashString, Rng } from '@/engine/rng'
import type { EntityDef, Manifest, MoverSprite } from '@/engine/types'
import type { Archetype, Brief } from './brief'
import { itemIconFor, readPrompt } from './brief'
import type { ManifestGenerator } from './types'

interface Level {
  view: Manifest['view']
  map: Manifest['map']
  entities: EntityDef[]
  rules: Manifest['rules']
}

class Grid {
  readonly cells: string[][]
  constructor(
    readonly w: number,
    readonly h: number,
    fill = '.',
  ) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
  }
  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? '#'
  }
  set(x: number, y: number, c: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) (this.cells[y] as string[])[x] = c
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c)
  }
  open(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.get(x, y) === '.'
  }
  rows(): string[] {
    return this.cells.map((row) => row.join(''))
  }
  /** True when every open tile can be walked to from the first one. */
  connected(): boolean {
    let start = -1
    let total = 0
    for (let i = 0; i < this.w * this.h; i++)
      if (this.open(i % this.w, Math.floor(i / this.w))) {
        total++
        if (start < 0) start = i
      }
    if (start < 0) return false
    const seen = new Set([start])
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head] as number
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = (at % this.w) + dx
        const ny = Math.floor(at / this.w) + dy
        const n = ny * this.w + nx
        if (!this.open(nx, ny) || seen.has(n)) continue
        seen.add(n)
        queue.push(n)
      }
    }
    return seen.size === total
  }
}

const SPRITES: MoverSprite[] = ['enemy1', 'enemy2', 'enemy3']
const five = (n: number) => Math.round(n / 5) * 5

function goalRule(wantsCollect: boolean, pickups: number): Manifest['rules']['goal'] {
  return wantsCollect && pickups >= 2 ? { opens: 'collect', amount: pickups } : { opens: 'always', amount: 0 }
}

// ---- crosser: lanes of traffic between the start and the goal ----

function crosser(rng: Rng, d: number, ease: number, brief: Brief): Level {
  const w = 10
  const groups = ease >= 3 ? 2 : rng.range(2, 3)
  const size = ease >= 2 ? 2 : rng.range(2, 3)
  const h = 2 + groups * (size + 1)
  const grid = new Grid(w, h)
  const entities: EntityDef[] = []

  // A hedge with gaps guards the far side.
  grid.rect(0, 1, w, 1, '#')
  const goalX = rng.range(2, 7)
  const gaps = new Set([goalX, rng.range(1, 3), rng.range(6, 8)])
  for (const x of gaps) {
    grid.set(x, 1, '.')
    grid.set(x + 1, 1, '.')
  }
  grid.set(0, 0, '#')
  grid.set(w - 1, 0, '#')

  let y = 2
  let lane = rng.int(2)
  const medians: number[] = []
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < size; i++, y++, lane++) {
      const most = ease >= 3 ? 1 : ease >= 1 || d < 0.6 ? 2 : 3
      const count = rng.range(1, most)
      const speed = five(rng.range(28, 45 + Math.round(d * 35)) * (1 - 0.15 * Math.min(ease, 3)))
      const offset = rng.int(w)
      const sprite = speed < 38 ? 'enemy2' : speed > 60 ? 'enemy3' : 'enemy1'
      for (let c = 0; c < count; c++) {
        const x = (offset + Math.round((c * w) / count)) % w
        entities.push({ behavior: 'patrol', sprite, x, y, speed: Math.max(20, speed), axis: 'x', dir: lane % 2 === 0 ? 1 : -1, range: 0, wrap: true, touch: 'hurt' })
      }
    }
    grid.rect(0, y, w, 1, '=')
    medians.push(y)
    y++
  }

  const startY = h - 1
  let pickups = 0
  for (const my of medians.filter((m) => m !== startY)) {
    entities.push({ behavior: 'collectible', x: rng.range(0, w - 1), y: my, points: 10 })
    pickups++
  }
  entities.push({ behavior: 'collectible', x: goalX === 4 ? 6 : 4, y: 0, points: 20 })
  pickups++
  if (ease === 0 && medians.length > 1 && rng.chance(0.4)) {
    const my = medians[0] as number
    const hx = rng.range(0, w - 2)
    if (!entities.some((e) => e.behavior === 'collectible' && e.y === my && e.x >= hx && e.x < hx + 2)) entities.push({ behavior: 'hazard', x: hx, y: my, w: 2, h: 1 })
  }

  entities.unshift({ behavior: 'player', x: rng.range(3, 6), y: startY, speed: five(rng.range(68, 80)), jump: 2 }, { behavior: 'goal', x: goalX, y: 0 })
  return {
    view: 'top',
    map: { w, h, rows: grid.rows(), tileB: 'deco' },
    entities,
    rules: { lives: 3, timer: 30 + h * 4 + 15 * ease, goal: goalRule(brief.wantsCollect && ease < 2, pickups) },
  }
}

// ---- platformer: a strip of ground with gaps, steps, walkers and coins ----

function platformer(rng: Rng, d: number, ease: number, brief: Brief): Level {
  const w = 20
  const h = 8
  const floor = 6
  // top[x] is the row of the ground surface in column x, or h for a pit.
  const top: number[] = Array.from({ length: w }, () => floor)
  const grid = new Grid(w, h)
  const entities: EntityDef[] = []
  const coins: [number, number][] = []
  let x = 3
  let last = ''
  let walkers = 0
  while (x < 15) {
    const options = ['gap', 'gap', 'plateau', 'block', 'walker', 'walker', 'platform', 'platform']
    if (ease < 2) options.push('spikes')
    const feature = rng.pick(options.filter((o) => o !== last))
    last = feature
    if (feature === 'gap') {
      top[x] = h
      top[x + 1] = h
      coins.push([x, 4])
      if (ease === 0 && rng.chance(0.35 + d * 0.3)) entities.push({ behavior: 'patrol', sprite: 'enemy2', x, y: 1, speed: five(rng.range(30, 45)), axis: 'y', dir: 1, range: 3, wrap: false, touch: 'hurt' })
      x += 4
    } else if (feature === 'plateau') {
      const width = rng.range(3, 4)
      for (let i = 0; i < width && x + i < 16; i++) top[x + i] = floor - 1
      coins.push([x + 1, floor - 3])
      x += width + 1
    } else if (feature === 'block') {
      top[x] = floor - 1
      x += 3
    } else if (feature === 'walker') {
      const run = rng.range(4, 5)
      if (ease < 3 && walkers < 3) {
        entities.push({ behavior: 'patrol', sprite: 'enemy1', x: x + 1, y: floor - 1, speed: five(rng.range(25, 30 + Math.round(d * 15))), axis: 'x', dir: 1, range: run - 2, wrap: false, touch: 'hurt' })
        walkers++
      }
      x += run
    } else if (feature === 'platform') {
      const width = rng.range(2, 3)
      for (let i = 0; i < width; i++) {
        grid.set(x + i, floor - 2, '=')
        coins.push([x + i, floor - 3])
      }
      x += width + 1
    } else {
      entities.push({ behavior: 'hazard', x: x + 1, y: floor - 1, w: 1, h: 1 })
      x += 4
    }
  }
  for (let cx = 0; cx < w; cx++) for (let cy = top[cx] as number; cy < h; cy++) grid.set(cx, cy, '#')
  if (ease < 2 && rng.chance(0.5)) {
    const fx = rng.range(5, 14)
    if ((top[fx] as number) < h) entities.push({ behavior: 'falling', sprite: 'enemy3', x: fx, y: 0, speed: five(rng.range(100, 130)), every: rng.range(3, 5) / 2, touch: 'hurt' })
  }
  const kept = coins.filter(([cx, cy]) => grid.open(cx, cy) && !entities.some((e) => e.x === cx && e.y === cy)).slice(0, 10)
  for (const [cx, cy] of kept) entities.push({ behavior: 'collectible', x: cx, y: cy, points: 10 })

  entities.unshift({ behavior: 'player', x: 1, y: floor - 1, speed: five(rng.range(68, 80)), jump: rng.chance(0.3) ? 3 : 2.5 }, { behavior: 'goal', x: 18, y: floor - 1 })
  return {
    view: 'side',
    map: { w, h, rows: grid.rows(), tileB: 'solid' },
    entities,
    rules: { lives: 3, timer: 60 + 15 * ease, goal: goalRule(brief.wantsCollect && ease === 0, kept.length) },
  }
}

// ---- climber: zigzag ledges up a tall shaft ----

function climber(rng: Rng, d: number, ease: number, brief: Brief): Level {
  const w = 10
  const levels = ease >= 2 ? 4 : rng.range(5, 7)
  const h = 4 + levels * 2
  const grid = new Grid(w, h)
  const entities: EntityDef[] = []
  grid.rect(0, h - 2, w, 2, '#')
  let left = rng.chance(0.5)
  let pickups = 0
  let walkers = 0
  let goal = { x: 0, y: 0 }
  for (let i = 1; i <= levels; i++) {
    const y = h - 2 - i * 2
    const length = rng.range(5, 6)
    const x0 = left ? 0 : w - length
    grid.rect(x0, y, length, 1, i % 2 === 0 ? '=' : '#')
    const outer = left ? 0 : w - 1
    if (i === levels) goal = { x: outer, y: y - 1 }
    else {
      entities.push({ behavior: 'collectible', x: outer, y: y - 1, points: 10 })
      pickups++
      if (length >= 6 && ease < 3 && walkers < (ease >= 1 ? 1 : 2) && rng.chance(0.5 + d * 0.3)) {
        entities.push({ behavior: 'patrol', sprite: 'enemy1', x: x0 + 2, y: y - 1, speed: five(rng.range(22, 32)), axis: 'x', dir: 1, range: 2, wrap: false, touch: 'hurt' })
        walkers++
      }
    }
    left = !left
  }
  if (ease < 2) {
    const flyers = ease === 0 && d > 0.5 ? 2 : 1
    for (let i = 0; i < flyers; i++) {
      const level = rng.range(2, levels - 1)
      entities.push({ behavior: 'patrol', sprite: 'enemy2', x: rng.range(0, w - 1), y: h - 2 - level * 2 - 1, speed: five(rng.range(32, 48)), axis: 'x', dir: i % 2 === 0 ? 1 : -1, range: 0, wrap: true, touch: 'hurt' })
    }
  }
  if (ease === 0 && rng.chance(0.6)) entities.push({ behavior: 'falling', sprite: 'enemy3', x: rng.range(3, 6), y: 0, speed: five(rng.range(90, 120)), every: rng.range(4, 6) / 2, touch: 'hurt' })

  entities.unshift({ behavior: 'player', x: rng.range(4, 5), y: h - 3, speed: five(rng.range(68, 76)), jump: rng.chance(0.4) ? 3 : 2.5 }, { behavior: 'goal', x: goal.x, y: goal.y })
  return {
    view: 'side',
    map: { w, h, rows: grid.rows(), tileB: 'solid' },
    entities,
    rules: { lives: 3, timer: 60 + levels * 8 + 15 * ease, goal: goalRule(brief.wantsCollect && ease === 0, pickups) },
  }
}

// ---- maze: two-tile corridors, pickups to gather, an exit that opens ----

function maze(rng: Rng, d: number, ease: number, brief: Brief): Level {
  const sizes: [number, number][] = [[4, 3], [5, 4], [6, 5]]
  const [cx, cy] = sizes[ease >= 2 ? 0 : Math.min(2, Math.floor(d * 3))] as [number, number]
  const w = cx * 3 + 1
  const h = cy * 3 + 1
  const grid = new Grid(w, h, '#')
  const cell = (i: number, j: number) => j * cx + i
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) grid.rect(i * 3 + 1, j * 3 + 1, 2, 2, '.')
  const links = new Set<string>()
  const join = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a]
    links.add(`${lo}-${hi}`)
    const i = lo % cx
    const j = Math.floor(lo / cx)
    if (hi === lo + 1) grid.rect(i * 3 + 3, j * 3 + 1, 1, 2, '.')
    else grid.rect(i * 3 + 1, j * 3 + 3, 2, 1, '.')
  }
  const neighbours = (c: number): number[] => {
    const i = c % cx
    const j = Math.floor(c / cx)
    const out: number[] = []
    if (i > 0) out.push(c - 1)
    if (i < cx - 1) out.push(c + 1)
    if (j > 0) out.push(c - cx)
    if (j < cy - 1) out.push(c + cx)
    return out
  }
  // A depth-first walk makes a maze with exactly one route between any two cells.
  const visited = new Set([0])
  const stack = [0]
  while (stack.length > 0) {
    const at = stack[stack.length - 1] as number
    const fresh = neighbours(at).filter((n) => !visited.has(n))
    if (fresh.length === 0) {
      stack.pop()
      continue
    }
    const next = rng.pick(fresh)
    join(at, next)
    visited.add(next)
    stack.push(next)
  }
  // Then knock out extra walls, so a guard in a corridor can be walked around.
  const extra = ease >= 1 ? 0.55 : 0.35
  for (let c = 0; c < cx * cy; c++)
    for (const n of neighbours(c)) if (n > c && !links.has(`${c}-${n}`) && rng.chance(extra)) join(c, n)

  const linked = (a: number, b: number) => links.has(a < b ? `${a}-${b}` : `${b}-${a}`)
  const distance = new Map([[0, 0]])
  const order = [0]
  for (let head = 0; head < order.length; head++) {
    const at = order[head] as number
    for (const n of neighbours(at)) {
      if (distance.has(n) || !linked(at, n)) continue
      distance.set(n, (distance.get(at) as number) + 1)
      order.push(n)
    }
  }
  const exit = order[order.length - 1] as number
  const spare = rng.shuffle(order.filter((c) => c !== 0 && c !== exit))
  const entities: EntityDef[] = []
  const tileOf = (c: number, dx = 0, dy = 0) => ({ x: (c % cx) * 3 + 1 + dx, y: Math.floor(c / cx) * 3 + 1 + dy })

  const pickups = Math.min(spare.length, ease >= 2 ? 4 : rng.range(5, 8))
  for (const c of spare.slice(0, pickups)) entities.push({ behavior: 'collectible', ...tileOf(c, rng.int(2), rng.int(2)), points: 10 })

  // Guards never share a cell with a pickup. A chaser camped on the thing
  // you need is a puzzle about luring it away, which is more than this
  // generator should ask of a one-sentence game.
  const far = spare.slice(pickups).filter((c) => (distance.get(c) as number) >= 2)
  const patrols = Math.max(0, 1 + Math.round(d * 2) - ease)
  for (const c of far.slice(0, patrols)) {
    const i = c % cx
    const across = (i > 0 && linked(c, c - 1) ? 1 : 0) + (i < cx - 1 && linked(c, c + 1) ? 1 : 0)
    const alongY = across === 0
    const spot = tileOf(c)
    if (entities.some((e) => e.x === spot.x && e.y === spot.y)) continue
    entities.push({ behavior: 'patrol', sprite: 'enemy1', ...spot, speed: five(rng.range(30, 45)), axis: alongY ? 'y' : 'x', dir: 1, range: 0, wrap: false, touch: 'hurt' })
  }
  const speed = five(rng.range(68, 78))
  const chasers = ease >= 2 ? 0 : d > 0.5 || brief.archetype === 'escape' ? 1 : 0
  for (const c of far.slice(patrols, patrols + chasers)) {
    const spot = tileOf(c, 1, 1)
    if (entities.some((e) => e.x === spot.x && e.y === spot.y)) continue
    entities.push({ behavior: 'chase', sprite: 'enemy2', ...spot, speed: five(speed * 0.5), range: rng.range(3, 4) })
  }
  if (ease === 0)
    for (const c of far.slice(patrols + chasers, patrols + chasers + rng.int(3))) {
      const spot = tileOf(c, 1, 0)
      if (!entities.some((e) => e.x === spot.x && e.y === spot.y)) entities.push({ behavior: 'hazard', ...spot, w: 1, h: 1 })
    }
  // A few wall tiles use the second tile, for texture.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid.get(x, y) === '#' && rng.chance(0.12)) grid.set(x, y, '=')

  entities.unshift({ behavior: 'player', x: 1, y: 1, speed, jump: 2 }, { behavior: 'goal', ...tileOf(exit, 1, 1) })
  return {
    view: 'top',
    map: { w, h, rows: grid.rows(), tileB: 'solid' },
    entities,
    rules: { lives: 3, timer: Math.min(300, 60 + cx * cy * 5 + 30 * ease), goal: { opens: 'collect', amount: pickups } },
  }
}

// ---- catcher: things fall, catch the good ones ----

function catcher(rng: Rng, d: number, ease: number): Level {
  const w = 10
  const h = 8
  const grid = new Grid(w, h)
  grid.rect(0, 6, w, 2, '#')
  const goalLeft = rng.chance(0.5)
  const entities: EntityDef[] = [
    { behavior: 'player', x: rng.range(4, 5), y: 5, speed: five(rng.range(75, 85)), jump: 2.5 },
    { behavior: 'goal', x: goalLeft ? 0 : w - 1, y: 5 },
    { behavior: 'spawner', x: rng.range(4, 5), y: 0, every: rng.range(12, 18) / 10, spread: 4, emits: { behavior: 'falling', sprite: 'item', speed: five(rng.range(45, 60)), axis: 'y', dir: 1, touch: 'collect' } },
  ]
  const droppers = ease >= 2 ? 0 : ease === 0 && d > 0.6 ? 2 : 1
  for (let i = 0; i < droppers; i++) {
    entities.push({
      behavior: 'spawner',
      x: i === 0 ? rng.range(2, 3) : rng.range(6, 7),
      y: 0,
      every: rng.range(16, 24) / 10 + 0.5 * ease,
      spread: rng.range(3, 4),
      emits: { behavior: 'falling', sprite: SPRITES[i] as MoverSprite, speed: five(rng.range(50, 65 + Math.round(d * 10))), axis: 'y', dir: 1, touch: 'hurt' },
    })
  }
  if (ease === 0 && rng.chance(0.3 + d * 0.3)) entities.push({ behavior: 'patrol', sprite: 'enemy3', x: goalLeft ? 7 : 2, y: 5, speed: 25, axis: 'x', dir: goalLeft ? -1 : 1, range: 3, wrap: false, touch: 'hurt' })
  const amount = ease >= 1 ? 30 : (5 + Math.round(d * 5)) * 10
  return {
    view: 'side',
    map: { w, h, rows: grid.rows(), tileB: 'solid' },
    entities,
    rules: { lives: 3, timer: five(rng.range(70, 90)) + 15 * ease, goal: { opens: 'score', amount } },
  }
}

// ---- escape: an open floor, something after you, a way out ----

function escape(rng: Rng, d: number, ease: number, brief: Brief): Level {
  const w = rng.pick([16, 18, 20])
  const h = rng.pick([10, 12])
  const grid = new Grid(w, h)
  for (let x = 0; x < w; x++) {
    grid.set(x, 0, '#')
    grid.set(x, h - 1, '#')
  }
  for (let y = 0; y < h; y++) {
    grid.set(0, y, '#')
    grid.set(w - 1, y, '#')
  }
  const start = { x: 1, y: Math.floor(h / 2) }
  const goal = { x: w - 2, y: rng.range(1, h - 2) }
  const keep = (x: number, y: number) => (Math.abs(x - start.x) <= 1 && Math.abs(y - start.y) <= 1) || (Math.abs(x - goal.x) <= 1 && Math.abs(y - goal.y) <= 1)
  for (let i = 0; i < Math.floor(w / 2) + 2; i++) {
    const wide = rng.chance(0.5)
    const bw = wide ? rng.range(2, 3) : 1
    const bh = wide ? 1 : rng.range(2, 3)
    const bx = rng.range(3, w - 3 - bw)
    const by = rng.range(1, h - 1 - bh)
    const cells: [number, number][] = []
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) cells.push([x, y])
    if (cells.some(([x, y]) => !grid.open(x, y) || keep(x, y))) continue
    const tile = rng.chance(0.4) ? '=' : '#'
    for (const [x, y] of cells) grid.set(x, y, tile)
    // Never let a block cut the floor in two.
    if (!grid.connected()) for (const [x, y] of cells) grid.set(x, y, '.')
  }

  const entities: EntityDef[] = []
  const used = new Set([`${start.x},${start.y}`, `${goal.x},${goal.y}`])
  const place = (x0: number, x1: number): { x: number; y: number } | null => {
    for (let tries = 0; tries < 40; tries++) {
      const x = rng.range(x0, x1)
      const y = rng.range(1, h - 2)
      if (!grid.open(x, y) || used.has(`${x},${y}`)) continue
      used.add(`${x},${y}`)
      return { x, y }
    }
    return null
  }
  const speed = five(rng.range(70, 80))
  const third = Math.floor(w / 3)
  const chasers = ease >= 3 ? 0 : ease >= 1 ? 1 : d > 0.6 ? 3 : 2
  for (let i = 0; i < chasers; i++) {
    const spot = place(third, w - 4)
    if (spot) entities.push({ behavior: 'chase', sprite: SPRITES[i % 2] as MoverSprite, ...spot, speed: five(speed * (0.5 + 0.12 * d)), range: ease >= 1 ? 4 : rng.range(5, 7) })
  }
  const patrols = ease >= 2 ? 0 : rng.range(1, 2)
  for (let i = 0; i < patrols; i++) {
    const spot = place(third + 1, w - 3)
    if (spot) entities.push({ behavior: 'patrol', sprite: 'enemy3', ...spot, speed: five(rng.range(35, 50)), axis: i % 2 === 0 ? 'y' : 'x', dir: 1, range: 0, wrap: false, touch: 'hurt' })
  }
  let keys = 0
  if (ease < 2 && (brief.wantsCollect || rng.chance(0.5)))
    for (const [x0, x1] of [[2, third], [third + 1, 2 * third], [2 * third + 1, w - 3]] as const) {
      const spot = place(x0, x1)
      if (!spot) continue
      entities.push({ behavior: 'collectible', ...spot, points: 20 })
      keys++
    }
  entities.unshift({ behavior: 'player', ...start, speed, jump: 2 }, { behavior: 'goal', ...goal })
  return {
    view: 'top',
    map: { w, h, rows: grid.rows(), tileB: 'solid' },
    entities,
    rules: { lives: 3, timer: five(rng.range(60, 75)) + 15 * ease, goal: keys >= 2 ? { opens: 'collect', amount: keys } : { opens: 'always', amount: 0 } },
  }
}

// ---- survive: things cross the arena until the way out opens ----

function survive(rng: Rng, d: number, ease: number): Level {
  const w = 12
  const h = 10
  const grid = new Grid(w, h)
  for (let x = 0; x < w; x++) {
    grid.set(x, 0, '#')
    grid.set(x, h - 1, '#')
  }
  for (let y = 0; y < h; y++) {
    grid.set(0, y, '#')
    grid.set(w - 1, y, '#')
  }
  const start = { x: 5, y: 5 }
  const goal = rng.pick([{ x: w - 2, y: h - 2 }, { x: w - 2, y: 1 }, { x: 1, y: h - 2 }])
  for (let i = 0; i < 3; i++) {
    const x = rng.range(3, w - 4)
    const y = rng.range(3, h - 4)
    if ((x !== start.x || y !== start.y) && (x !== goal.x || y !== goal.y)) grid.set(x, y, i === 0 ? '=' : '#')
  }
  const slow = 1 - 0.15 * Math.min(ease, 3)
  const entities: EntityDef[] = [
    { behavior: 'player', ...start, speed: five(rng.range(75, 85)), jump: 2 },
    { behavior: 'goal', ...goal },
    { behavior: 'spawner', x: 1, y: Math.floor(h / 2), every: rng.range(12, 18) / 10 + 0.4 * ease, spread: 3, emits: { behavior: 'patrol', sprite: 'enemy1', speed: five(rng.range(45, 65) * slow), axis: 'x', dir: 1, touch: 'hurt' } },
  ]
  if (ease < 3) entities.push({ behavior: 'spawner', x: Math.floor(w / 2), y: 1, every: rng.range(15, 22) / 10 + 0.4 * ease, spread: 4, emits: { behavior: 'patrol', sprite: 'enemy2', speed: five(rng.range(40, 60) * slow), axis: 'y', dir: 1, touch: 'hurt' } })
  if (ease === 0 && d > 0.55) entities.push({ behavior: 'spawner', x: w - 2, y: Math.floor(h / 2), every: rng.range(20, 28) / 10, spread: 3, emits: { behavior: 'patrol', sprite: 'enemy3', speed: five(rng.range(40, 55)), axis: 'x', dir: -1, touch: 'hurt' } })
  for (const spot of [{ x: 2, y: 2 }, { x: w - 3, y: 2 }, { x: 3, y: h - 3 }]) if (grid.open(spot.x, spot.y) && (spot.x !== goal.x || spot.y !== goal.y)) entities.push({ behavior: 'collectible', ...spot, points: 20 })
  const hold = ease >= 1 ? 15 : five(rng.range(20, 30))
  return {
    view: 'top',
    map: { w, h, rows: grid.rows(), tileB: 'solid' },
    entities,
    rules: { lives: 3, timer: hold + 25 + 10 * ease, goal: { opens: 'survive', amount: hold } },
  }
}

// ---- dressing a level as a cart ----

const SUFFIXES: Record<Archetype, string[]> = {
  crosser: ['DASH', 'CROSSING', 'RUSH', 'HOP'],
  platformer: ['RUN', 'QUEST', 'TREK', 'LEAP'],
  climber: ['CLIMB', 'ASCENT', 'SUMMIT', 'RISE'],
  maze: ['HEIST', 'MAZE', 'HUNT', 'VAULT'],
  catcher: ['CATCH', 'HARVEST', 'SHOWER', 'DROP'],
  escape: ['ESCAPE', 'CHASE', 'FLIGHT', 'GETAWAY'],
  survive: ['PANIC', 'STORM', 'SIEGE', 'STAND'],
}
const VEHICLES = /\b(cars?|trucks?|bus(es)?|taxis?|traffic|vans?|lorr(y|ies)|trains?|tractors?|scooters?|bikes?)\b/

function titleFor(brief: Brief, rng: Rng): string {
  const source = brief.hero || brief.foes[0] || brief.goal || brief.theme.name
  // "meteor shower" should title as METEOR, not SHOWER.
  const parts = source.split(' ').filter((w) => !/^(shower|storm|swarm|pack|herd|waves?|field|rain|of)$/.test(w))
  const word = (parts.pop() ?? 'HERO').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 12) || 'HERO'
  const suffixes = SUFFIXES[brief.archetype].filter((s) => s !== word)
  return `${word} ${rng.pick(suffixes)}`.slice(0, 24)
}

function blurbFor(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim()
  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1)
  const ended = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
  return ended.length <= 90 ? ended : `${ended.slice(0, 87).trimEnd()}...`
}

/** Builds a complete manifest for a prompt. Higher `ease` means a gentler cart. */
export function composeManifest(prompt: string, ease = 0): Manifest {
  const brief = readPrompt(prompt)
  const seed = hashString(prompt.trim().toLowerCase())
  const rng = new Rng(seed + ease * 7919)
  const d = Math.max(0, 0.3 + (((seed >>> 8) % 100) / 100) * 0.5 - 0.25 * ease)
  const builders: Record<Archetype, () => Level> = {
    crosser: () => crosser(rng, d, ease, brief),
    platformer: () => platformer(rng, d, ease, brief),
    climber: () => climber(rng, d, ease, brief),
    maze: () => maze(rng, d, ease, brief),
    catcher: () => catcher(rng, d, ease),
    escape: () => escape(rng, d, ease, brief),
    survive: () => survive(rng, d, ease),
  }
  const level = builders[brief.archetype]()
  const theme = brief.theme
  const naming = new Rng(seed)

  const foes = [...brief.foes]
  for (const fallback of theme.foes) if (foes.length < 3 && !foes.includes(fallback)) foes.push(fallback)
  const traffic = brief.archetype === 'crosser' && foes.some((f) => VEHICLES.test(f))
  const background = traffic ? 'asphalt road' : level.view === 'side' ? theme.sideBackground : theme.topBackground
  const clip = (s: string) => s.slice(0, 40)

  return {
    v: 1,
    title: titleFor(brief, naming),
    blurb: blurbFor(prompt),
    view: level.view,
    palette: theme.palette,
    music: brief.archetype === 'escape' || brief.archetype === 'survive' ? 'sprint' : brief.archetype === 'maze' ? 'cavern' : theme.music,
    art: {
      player: clip(brief.hero || theme.hero),
      enemies: [clip(foes[0] as string), clip(foes[1] as string), clip(foes[2] as string)],
      goal: clip(brief.goal || theme.goal),
      tiles: traffic ? ['hedge bush', 'grass verge'] : theme.tiles,
      background,
      item: itemIconFor(brief.item, theme.item),
      hazard: theme.hazard,
    },
    map: level.map,
    entities: level.entities,
    rules: level.rules,
  }
}

export class OfflineGenerator implements ManifestGenerator {
  readonly name = 'offline'
  async generate(prompt: string): Promise<unknown> {
    return composeManifest(prompt, 0)
  }
}
