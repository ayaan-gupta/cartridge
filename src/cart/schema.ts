/**
 * The manifest schema and its validator. Shape is checked with Zod. The
 * rules Zod cannot express (rows the right length, exactly one player,
 * nothing buried in a wall) are checked by hand afterwards.
 */
import { z } from 'zod'
import type { EntityDef, Manifest } from '@/engine/types'
import { HAZARD_ICONS, ITEM_ICONS, MOVER_SPRITES, MUSIC } from '@/engine/types'

export const LIMITS = {
  title: 24,
  blurb: 90,
  art: 40,
  mapW: [10, 20],
  mapH: [8, 18],
  entities: 40,
  spawners: 6,
  playerSpeed: [30, 120],
  moverSpeed: [10, 160],
  jump: [1, 4],
  range: [0, 20],
  every: [0.5, 10],
  spread: [0, 10],
  points: [1, 100],
  lives: [1, 9],
  timer: [20, 300],
  amount: [0, 999],
  /** A chaser must be slower than the player or the game is not fair. */
  chaseRatio: 0.9,
  bytes: 20000,
} as const

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const between = ([lo, hi]: readonly [number, number]) => z.number().min(lo).max(hi)
const tileX = z.number().int().min(0).max(19)
const tileY = z.number().int().min(0).max(17)
const sprite = z.enum(MOVER_SPRITES)
const touch = z.enum(['hurt', 'collect'])
const axis = z.enum(['x', 'y'])
const dir = z.union([z.literal(1), z.literal(-1)])
const label = z.string().min(1).max(LIMITS.art)

const entity = z.discriminatedUnion('behavior', [
  z.strictObject({ behavior: z.literal('player'), x: tileX, y: tileY, speed: between(LIMITS.playerSpeed), jump: between(LIMITS.jump) }),
  z.strictObject({
    behavior: z.literal('patrol'),
    sprite,
    x: tileX,
    y: tileY,
    speed: between(LIMITS.moverSpeed),
    axis,
    dir,
    range: between(LIMITS.range),
    wrap: z.boolean(),
    touch,
  }),
  z.strictObject({ behavior: z.literal('chase'), sprite, x: tileX, y: tileY, speed: between(LIMITS.moverSpeed), range: between(LIMITS.range) }),
  z.strictObject({ behavior: z.literal('falling'), sprite, x: tileX, y: tileY, speed: between(LIMITS.moverSpeed), every: between(LIMITS.every), touch }),
  z.strictObject({
    behavior: z.literal('spawner'),
    x: tileX,
    y: tileY,
    every: between(LIMITS.every),
    spread: between(LIMITS.spread),
    emits: z.strictObject({ behavior: z.enum(['patrol', 'falling']), sprite, speed: between(LIMITS.moverSpeed), axis, dir, touch }),
  }),
  z.strictObject({ behavior: z.literal('collectible'), x: tileX, y: tileY, points: z.number().int().min(LIMITS.points[0]).max(LIMITS.points[1]) }),
  z.strictObject({ behavior: z.literal('goal'), x: tileX, y: tileY }),
  z.strictObject({ behavior: z.literal('hazard'), x: tileX, y: tileY, w: z.number().int().min(1).max(20), h: z.number().int().min(1).max(18) }),
])

export const manifestSchema = z.strictObject({
  v: z.literal(1),
  title: z.string().min(1).max(LIMITS.title),
  blurb: z.string().max(LIMITS.blurb),
  view: z.enum(['side', 'top']),
  palette: z.tuple([hex, hex, hex, hex]),
  music: z.enum(MUSIC),
  art: z.strictObject({
    player: label,
    enemies: z.tuple([label, label, label]),
    goal: label,
    tiles: z.tuple([label, label]),
    background: label,
    item: z.enum(ITEM_ICONS),
    hazard: z.enum(HAZARD_ICONS),
  }),
  map: z.strictObject({
    w: z.number().int().min(LIMITS.mapW[0]).max(LIMITS.mapW[1]),
    h: z.number().int().min(LIMITS.mapH[0]).max(LIMITS.mapH[1]),
    rows: z.array(z.string()).min(LIMITS.mapH[0]).max(LIMITS.mapH[1]),
    tileB: z.enum(['solid', 'deco']),
  }),
  entities: z.array(entity).min(2).max(LIMITS.entities),
  rules: z.strictObject({
    lives: z.number().int().min(LIMITS.lives[0]).max(LIMITS.lives[1]),
    timer: z.number().int().min(LIMITS.timer[0]).max(LIMITS.timer[1]),
    goal: z.strictObject({
      opens: z.enum(['always', 'collect', 'score', 'survive']),
      amount: z.number().int().min(LIMITS.amount[0]).max(LIMITS.amount[1]),
    }),
  }),
})

// The schema and the engine's own types must describe the same thing.
type Parsed = z.infer<typeof manifestSchema>
const _parsedIsManifest = (m: Parsed): Manifest => m
const _manifestIsParsed = (m: Manifest): Parsed => m
void _parsedIsManifest
void _manifestIsParsed

export type Validation = { ok: true; manifest: Manifest } | { ok: false; issues: string[] }

export function isSolid(manifest: Pick<Manifest, 'map'>, x: number, y: number): boolean {
  const c = manifest.map.rows[y]?.[x]
  return c === '#' || (c === '=' && manifest.map.tileB === 'solid')
}

/** How many pickups a cart can ever offer. Infinity when something keeps making them. */
export function pickupSupply(entities: readonly EntityDef[]): { count: number; points: number } {
  let count = 0
  let points = 0
  for (const e of entities) {
    if (e.behavior === 'collectible') {
      count++
      points += e.points
    } else if ((e.behavior === 'patrol' || e.behavior === 'falling') && e.touch === 'collect') {
      count++
      points += 10
    } else if (e.behavior === 'spawner' && e.emits.touch === 'collect') {
      count = Number.POSITIVE_INFINITY
      points = Number.POSITIVE_INFINITY
    }
  }
  return { count, points }
}

/** The rules a schema cannot say. Returns one sentence per problem. */
export function checkRules(m: Manifest): string[] {
  const issues: string[] = []
  const { w, h, rows } = m.map
  if (rows.length !== h) issues.push(`map.rows has ${rows.length} rows but map.h is ${h}`)
  rows.forEach((row, y) => {
    if (row.length !== w) issues.push(`map.rows[${y}] is ${row.length} wide but map.w is ${w}`)
    if (/[^.#=]/.test(row)) issues.push(`map.rows[${y}] has characters other than . # =`)
  })

  const players = m.entities.filter((e) => e.behavior === 'player')
  const goals = m.entities.filter((e) => e.behavior === 'goal')
  if (players.length !== 1) issues.push(`there must be exactly one player, found ${players.length}`)
  if (goals.length !== 1) issues.push(`there must be exactly one goal, found ${goals.length}`)
  if (m.entities.filter((e) => e.behavior === 'spawner').length > LIMITS.spawners) issues.push(`at most ${LIMITS.spawners} spawners`)

  m.entities.forEach((e, i) => {
    const name = `entities[${i}] (${e.behavior})`
    const ew = e.behavior === 'hazard' ? e.w : 1
    const eh = e.behavior === 'hazard' ? e.h : 1
    if (e.x + ew > w || e.y + eh > h) {
      issues.push(`${name} is outside the ${w} by ${h} map`)
      return
    }
    if (e.behavior !== 'hazard' && e.behavior !== 'spawner' && isSolid(m, e.x, e.y)) issues.push(`${name} is inside a solid tile at ${e.x},${e.y}`)
  })

  const player = players[0]
  if (player && player.behavior === 'player') {
    for (const e of m.entities)
      if (e.behavior === 'chase' && e.speed > player.speed * LIMITS.chaseRatio)
        issues.push(`a chaser at speed ${e.speed} is too fast for a player at speed ${player.speed}`)
  }

  const { opens, amount } = m.rules.goal
  const supply = pickupSupply(m.entities)
  if (opens === 'collect' && (amount < 1 || amount > supply.count)) issues.push(`goal needs ${amount} pickups but the cart offers ${supply.count}`)
  if (opens === 'score' && (amount < 1 || amount > supply.points)) issues.push(`goal needs ${amount} points but the cart offers ${supply.points}`)
  if (opens === 'survive' && (amount < 1 || amount > m.rules.timer - 5)) issues.push(`goal opens after ${amount}s, which leaves no time on a ${m.rules.timer}s clock`)

  const bytes = manifestBytes(m)
  if (bytes > LIMITS.bytes) issues.push(`manifest is ${bytes} bytes, over the ${LIMITS.bytes} byte limit`)
  return issues
}

export function manifestBytes(manifest: Manifest): number {
  return new TextEncoder().encode(JSON.stringify(manifest)).length
}

export function validateManifest(input: unknown): Validation {
  const parsed = manifestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`) }
  }
  const issues = checkRules(parsed.data)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, manifest: parsed.data }
}
