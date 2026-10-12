/**
 * One pass of deterministic repair. It takes whatever a generator produced
 * and pushes it toward a valid manifest: clamps numbers, pads rows, drops a
 * second player, digs entities out of walls, fixes a goal rule that asks for
 * more than the cart offers. It never invents a level. If the input is not
 * recognisably a manifest, it comes back unchanged and the caller falls
 * through to a template.
 */
import type { EntityDef, Manifest } from '@/engine/types'
import { HAZARD_ICONS, ITEM_ICONS, MOVER_SPRITES, MUSIC } from '@/engine/types'
import { isSolid, LIMITS, pickupSupply } from './schema'

type Loose = Record<string, unknown>
const DEFAULT_PALETTE: Manifest['palette'] = ['#e0f8d0', '#88c070', '#346856', '#081820']

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, fallback: number, [lo, hi]: readonly [number, number], whole = false): number {
  let n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  if (!Number.isFinite(n)) n = fallback
  n = Math.max(lo, Math.min(hi, n))
  return whole ? Math.round(n) : Math.round(n * 100) / 100
}

function text(v: unknown, fallback: string, max: number): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return (s || fallback).slice(0, max)
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}

function repairPalette(v: unknown): Manifest['palette'] {
  if (!Array.isArray(v)) return DEFAULT_PALETTE
  const colors = v
    .filter((c): c is string => typeof c === 'string')
    .map((c) => (c.startsWith('#') ? c : `#${c}`).toLowerCase())
    .map((c) => (/^#[0-9a-f]{3}$/.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c))
    .filter((c) => /^#[0-9a-f]{6}$/.test(c))
  if (new Set(colors).size < 4) return DEFAULT_PALETTE
  // Lightest first is what the engine and the sprite artist both assume.
  const four = [...new Set(colors)].slice(0, 4).sort((a, b) => luminance(b) - luminance(a))
  return four as Manifest['palette']
}

function repairRows(map: Loose, side: boolean): { w: number; h: number; rows: string[] } {
  const given = Array.isArray(map.rows) ? map.rows.filter((r): r is string => typeof r === 'string') : []
  const widest = given.reduce((m, r) => Math.max(m, r.length), 0)
  const w = num(given.length > 0 ? widest : map.w, 10, LIMITS.mapW, true)
  const h = num(given.length > 0 ? given.length : map.h, 8, LIMITS.mapH, true)
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    const row = (given[y] ?? '').replace(/[^.#=]/g, '.')
    rows.push(row.padEnd(w, '.').slice(0, w))
  }
  // A side-view level with no floor at all is a pit. Give it one.
  if (side && given.length === 0) rows[h - 1] = '#'.repeat(w)
  return { w, h, rows }
}

function nearestFree(m: Pick<Manifest, 'map'>, x: number, y: number, taken: Set<number>, needFloor: boolean): { x: number; y: number } {
  const { w, h } = m.map
  let best = { x, y }
  let bestScore = Number.POSITIVE_INFINITY
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      if (isSolid(m, tx, ty) || taken.has(ty * w + tx)) continue
      const floorless = needFloor && !isSolid(m, tx, ty + 1) ? 50 : 0
      const score = Math.abs(tx - x) + Math.abs(ty - y) + floorless
      if (score < bestScore) {
        bestScore = score
        best = { x: tx, y: ty }
      }
    }
  return best
}

function repairEntity(raw: Loose, w: number, h: number): EntityDef | null {
  const x = num(raw.x, 0, [0, w - 1], true)
  const y = num(raw.y, 0, [0, h - 1], true)
  const sprite = oneOf(raw.sprite, MOVER_SPRITES, 'enemy1')
  const touch = oneOf(raw.touch, ['hurt', 'collect'] as const, 'hurt')
  const axis = oneOf(raw.axis, ['x', 'y'] as const, 'x')
  const dir = raw.dir === -1 || raw.dir === '-1' ? -1 : 1
  switch (raw.behavior) {
    case 'player':
      return { behavior: 'player', x, y, speed: num(raw.speed, 70, LIMITS.playerSpeed), jump: num(raw.jump, 2.5, LIMITS.jump) }
    case 'patrol':
      return { behavior: 'patrol', sprite, x, y, speed: num(raw.speed, 40, LIMITS.moverSpeed), axis, dir, range: num(raw.range, 0, LIMITS.range), wrap: raw.wrap === true, touch }
    case 'chase':
      return { behavior: 'chase', sprite, x, y, speed: num(raw.speed, 30, LIMITS.moverSpeed), range: num(raw.range, 4, LIMITS.range) }
    case 'falling':
      return { behavior: 'falling', sprite, x, y, speed: num(raw.speed, 90, LIMITS.moverSpeed), every: num(raw.every, 2, LIMITS.every), touch }
    case 'spawner': {
      const e = isObject(raw.emits) ? raw.emits : {}
      return {
        behavior: 'spawner',
        x,
        y,
        every: num(raw.every, 2, LIMITS.every),
        spread: num(raw.spread, 2, LIMITS.spread),
        emits: {
          behavior: oneOf(e.behavior, ['patrol', 'falling'] as const, 'falling'),
          sprite: oneOf(e.sprite, MOVER_SPRITES, 'enemy1'),
          speed: num(e.speed, 60, LIMITS.moverSpeed),
          axis: oneOf(e.axis, ['x', 'y'] as const, 'y'),
          dir: e.dir === -1 || e.dir === '-1' ? -1 : 1,
          touch: oneOf(e.touch, ['hurt', 'collect'] as const, 'hurt'),
        },
      }
    }
    case 'collectible':
      return { behavior: 'collectible', x, y, points: num(raw.points, 10, LIMITS.points, true) }
    case 'goal':
      return { behavior: 'goal', x, y }
    case 'hazard':
      return { behavior: 'hazard', x, y, w: num(raw.w, 1, [1, w - x], true), h: num(raw.h, 1, [1, h - y], true) }
    default:
      return null
  }
}

export function repairManifest(input: unknown): unknown {
  if (!isObject(input)) return input
  const side = input.view === 'side'
  const map = repairRows(isObject(input.map) ? input.map : {}, side)
  const shell = { map: { ...map, tileB: oneOf(isObject(input.map) ? input.map.tileB : undefined, ['solid', 'deco'] as const, 'solid') } }
  const { w, h } = map

  // Entities: coerce each one, then enforce the "exactly one" rules.
  const rawEntities = Array.isArray(input.entities) ? input.entities.filter(isObject) : []
  let entities = rawEntities.map((e) => repairEntity(e, w, h)).filter((e): e is EntityDef => e !== null)
  const keepFirst = (behavior: 'player' | 'goal') => {
    let seen = false
    entities = entities.filter((e) => {
      if (e.behavior !== behavior) return true
      if (seen) return false
      seen = true
      return true
    })
  }
  keepFirst('player')
  keepFirst('goal')
  let spawners = 0
  entities = entities.filter((e) => e.behavior !== 'spawner' || ++spawners <= LIMITS.spawners)

  // Dig things out of walls, players and goals first so they get the best spots.
  const taken = new Set<number>()
  const settle = (e: EntityDef) => {
    if (e.behavior === 'hazard' || e.behavior === 'spawner') return
    if (isSolid(shell, e.x, e.y) || ((e.behavior === 'player' || e.behavior === 'goal') && taken.has(e.y * w + e.x))) {
      const spot = nearestFree(shell, e.x, e.y, taken, side && e.behavior === 'player')
      e.x = spot.x
      e.y = spot.y
    }
    if (e.behavior === 'player' || e.behavior === 'goal') taken.add(e.y * w + e.x)
  }
  if (!entities.some((e) => e.behavior === 'player')) {
    const spot = nearestFree(shell, 1, h - 2, taken, side)
    entities.unshift({ behavior: 'player', x: spot.x, y: spot.y, speed: 70, jump: 2.5 })
  }
  for (const e of entities) if (e.behavior === 'player') settle(e)
  if (!entities.some((e) => e.behavior === 'goal')) {
    const spot = nearestFree(shell, w - 2, side ? h - 2 : 1, taken, side)
    entities.push({ behavior: 'goal', x: spot.x, y: spot.y })
  }
  for (const e of entities) if (e.behavior === 'goal') settle(e)
  for (const e of entities) if (e.behavior !== 'player' && e.behavior !== 'goal') settle(e)

  // Keep the cast small enough, never dropping the player or the goal.
  if (entities.length > LIMITS.entities) {
    const core = entities.filter((e) => e.behavior === 'player' || e.behavior === 'goal')
    const rest = entities.filter((e) => e.behavior !== 'player' && e.behavior !== 'goal')
    entities = [...core, ...rest.slice(0, LIMITS.entities - core.length)]
  }

  const player = entities.find((e) => e.behavior === 'player')
  if (player && player.behavior === 'player') {
    const cap = Math.floor(player.speed * LIMITS.chaseRatio)
    for (const e of entities) if (e.behavior === 'chase' && e.speed > cap) e.speed = Math.max(LIMITS.moverSpeed[0], cap)
  }

  const rules = isObject(input.rules) ? input.rules : {}
  const goalRule = isObject(rules.goal) ? rules.goal : {}
  const timer = num(rules.timer, 60, LIMITS.timer, true)
  let opens = oneOf(goalRule.opens, ['always', 'collect', 'score', 'survive'] as const, 'always')
  let amount = num(goalRule.amount, 0, LIMITS.amount, true)
  const supply = pickupSupply(entities)
  if (opens === 'collect') amount = Math.min(Math.max(amount, 1), supply.count)
  if (opens === 'score') amount = Math.min(Math.max(amount, 1), supply.points)
  if (opens === 'survive') amount = Math.min(Math.max(amount, 1), timer - 5)
  if ((opens === 'collect' || opens === 'score') && amount < 1) opens = 'always'
  if (opens === 'always') amount = 0

  const art = isObject(input.art) ? input.art : {}
  const list = (v: unknown, n: number, fallback: string[]): string[] => {
    const given = Array.isArray(v) ? v : []
    return Array.from({ length: n }, (_, i) => text(given[i], fallback[i] as string, LIMITS.art))
  }

  return {
    v: 1,
    title: text(input.title, 'UNTITLED', LIMITS.title),
    blurb: text(input.blurb, 'A tiny game.', LIMITS.blurb),
    view: side ? 'side' : 'top',
    palette: repairPalette(input.palette),
    music: oneOf(input.music, MUSIC, 'overworld'),
    art: {
      player: text(art.player, 'hero', LIMITS.art),
      enemies: list(art.enemies, 3, ['slime', 'bat', 'spiky ball']) as [string, string, string],
      goal: text(art.goal, 'flag', LIMITS.art),
      tiles: list(art.tiles, 2, ['brick', 'grass']) as [string, string],
      background: text(art.background, 'sky', LIMITS.art),
      item: oneOf(art.item, ITEM_ICONS, 'coin'),
      hazard: oneOf(art.hazard, HAZARD_ICONS, 'spike'),
    },
    map: shell.map,
    entities,
    rules: { lives: num(rules.lives, 3, LIMITS.lives, true), timer, goal: { opens, amount } },
  } satisfies Manifest
}
