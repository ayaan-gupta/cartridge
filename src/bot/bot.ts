/**
 * The win-check bot. It plays the real engine, not a model of it: a
 * best-first search over held button combinations, using snapshots to back
 * up. A cart is called winnable only when the bot has a recording that ends
 * on the goal with the clock still running and no life lost, and that
 * recording replays to the same result on a fresh engine.
 */
import type { Ent, Snapshot, Spec } from '@/engine/engine'
import { Engine } from '@/engine/engine'
import type { Buttons, GameState, Manifest, Tape } from '@/engine/types'
import { BTN, TILE } from '@/engine/types'

export interface BotOptions {
  /** How many positions the search may expand before giving up. */
  maxExpansions?: number
  /** Frames each button combination is held for. */
  hold?: number
}

export interface BotResult {
  won: boolean
  /** won, unreachable (walled off), exhausted (nowhere left to try) or budget. */
  reason: 'won' | 'unreachable' | 'exhausted' | 'budget'
  /** Frames the winning run takes. 0 when not won. */
  frames: number
  tape: Tape
  expanded: number
}

const SIDE_ACTIONS: Buttons[] = [BTN.right, BTN.right | BTN.a, BTN.left, BTN.left | BTN.a, BTN.a, 0]
const TOP_ACTIONS: Buttons[] = [
  BTN.up,
  BTN.right,
  BTN.down,
  BTN.left,
  BTN.up | BTN.right,
  BTN.up | BTN.left,
  BTN.down | BTN.right,
  BTN.down | BTN.left,
  0,
]
const FAR = 1e9
/** Frames of urgency per outstanding pickup. Larger than any walk across a map. */
const PER_ITEM = 4000

/** Steps from every open tile to the target tile, ignoring gravity. */
function distanceField(game: Engine, tx: number, ty: number): Float64Array {
  const field = new Float64Array(game.mapW * game.mapH).fill(FAR)
  if (tx < 0 || ty < 0 || tx >= game.mapW || ty >= game.mapH) return field
  const queue = [ty * game.mapW + tx]
  field[queue[0] as number] = 0
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number
    const x = at % game.mapW
    const y = Math.floor(at / game.mapW)
    const d = (field[at] as number) + 1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= game.mapW || ny >= game.mapH || game.solid(nx, ny)) continue
      const n = ny * game.mapW + nx
      if ((field[n] as number) <= d) continue
      field[n] = d
      queue.push(n)
    }
  }
  return field
}

class MinHeap {
  private keys: number[] = []
  private values: number[] = []
  get size(): number {
    return this.keys.length
  }
  push(key: number, value: number): void {
    let i = this.keys.length
    this.keys.push(key)
    this.values.push(value)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if ((this.keys[parent] as number) <= key) break
      this.keys[i] = this.keys[parent] as number
      this.values[i] = this.values[parent] as number
      i = parent
    }
    this.keys[i] = key
    this.values[i] = value
  }
  pop(): number {
    const top = this.values[0] as number
    const key = this.keys.pop() as number
    const value = this.values.pop() as number
    const n = this.keys.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let child = i * 2 + 1
        if (child >= n) break
        if (child + 1 < n && (this.keys[child + 1] as number) < (this.keys[child] as number)) child++
        if ((this.keys[child] as number) >= key) break
        this.keys[i] = this.keys[child] as number
        this.values[i] = this.values[child] as number
        i = child
      }
      this.keys[i] = key
      this.values[i] = value
    }
    return top
  }
}

/** Plays a recording on a fresh engine and reports how it ended. */
export function replay(manifest: Manifest, tape: Tape): { state: GameState; frames: number; score: number; lives: number } {
  const game = new Engine(manifest)
  game.start()
  for (let i = 0; i + 1 < tape.length && game.state === 'playing'; i += 2) {
    const buttons = tape[i] as number
    for (let f = 0; f < (tape[i + 1] as number) && game.state === 'playing'; f++) game.step(buttons)
  }
  return { state: game.state, frames: game.frame, score: game.score, lives: game.lives }
}

export function solve(manifest: Manifest, options: BotOptions = {}): BotResult {
  const maxExpansions = options.maxExpansions ?? 80000
  const game = new Engine(manifest)
  game.start()
  // Each held combination should move the player about half a tile, however
  // fast they are. Less than that and a move can fail to leave its own cell
  // in the visited set, which strands slow players at the start.
  const hold = options.hold ?? Math.max(4, Math.min(16, Math.round(7.5 / game.speed)))
  const lives = game.lives
  const actions = game.side ? SIDE_ACTIONS : TOP_ACTIONS
  const failed = (reason: BotResult['reason'], expanded: number): BotResult => ({ won: false, reason, frames: 0, tape: [], expanded })

  // What the search needs to know about the cart, worked out once.
  const goalEnt = game.ents.find((e) => (game.specs[e.s] as Spec).kind === 'goal') as Ent
  const goalField = distanceField(game, goalEnt.x / TILE, goalEnt.y / TILE)
  const itemFields = new Map<number, Float64Array>()
  const statics: number[] = []
  const chasers: number[] = []
  let timeMatters = manifest.rules.goal.opens === 'survive'
  game.ents.forEach((e, i) => {
    const s = game.specs[e.s] as Spec
    if (s.kind === 'collectible') {
      statics.push(i)
      itemFields.set(i, distanceField(game, e.x / TILE, e.y / TILE))
    }
    if (s.kind === 'chase') chasers.push(i)
    if (s.kind === 'patrol' || s.kind === 'chase' || s.kind === 'falling' || s.kind === 'spawner') timeMatters = true
  })
  const startTile = Math.floor((game.p.y + 8) / TILE) * game.mapW + Math.floor((game.p.x + 8) / TILE)
  if ((goalField[startTile] ?? FAR) >= FAR) return failed('unreachable', 0)

  const wait = timeMatters ? hold * 3 : hold
  const { opens, amount } = manifest.rules.goal

  // If the pickups the goal asks for are walled off, no amount of play helps.
  if (opens === 'collect' || opens === 'score') {
    let count = 0
    let points = 0
    game.ents.forEach((e, i) => {
      const s = game.specs[e.s] as Spec
      const field = itemFields.get(i)
      if (field && (field[startTile] ?? FAR) < FAR) {
        count++
        points += s.points
      } else if (!field && s.touch === 2) {
        count++
        points += s.points
      } else if (s.kind === 'spawner' && (game.specs[s.emit] as Spec).touch === 2) {
        count = Number.POSITIVE_INFINITY
        points = Number.POSITIVE_INFINITY
      }
    })
    if ((opens === 'collect' ? count : points) < amount) return failed('unreachable', 0)
  }

  /** Pixels to the target along the field, refined inside the current tile. */
  const along = (field: Float64Array): number => {
    const cx = game.p.x + 8
    const cy = Math.max(0, Math.min(game.pxH - 1, game.p.y + 8))
    const tx = Math.max(0, Math.min(game.mapW - 1, Math.floor(cx / TILE)))
    const ty = Math.floor(cy / TILE)
    let best = FAR
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx
      const ny = ty + dy
      if (nx < 0 || ny < 0 || nx >= game.mapW || ny >= game.mapH) continue
      const d = field[ny * game.mapW + nx] as number
      if (d >= FAR) continue
      const px = d * TILE + Math.abs(nx * TILE + 8 - cx) + Math.abs(ny * TILE + 8 - cy)
      if (px < best) best = px
    }
    return best
  }

  /** Estimated frames still needed. Lower is closer to winning. */
  const estimate = (): number => {
    if (game.goalOpen) return along(goalField) / game.speed
    if (opens === 'survive') return amount * 60 - game.frame + (along(goalField) / game.speed) * 0.25
    const need = opens === 'collect' ? amount - game.collected : Math.ceil((amount - game.score) / 10)
    let nearest = FAR
    for (let i = 0; i < game.ents.length; i++) {
      const e = game.ents[i] as Ent
      if (!e.alive) continue
      const s = game.specs[e.s] as Spec
      if (s.touch !== 2) continue
      const field = itemFields.get(i)
      const d = field && s.kind === 'collectible' ? along(field) : Math.abs(e.x - game.p.x) + Math.abs(e.y - game.p.y) * 0.5
      if (d < nearest) nearest = d
    }
    return need * PER_ITEM + (nearest >= FAR ? 600 : nearest / game.speed)
  }

  /**
   * What makes two positions "the same" for the search. Packed into one
   * number below 2^53: where the player is, how they are moving, how far the
   * clock has run, and a hash of which pickups are left and where chasers are.
   */
  const keyOf = (): number => {
    const p = game.p
    let mix = game.collected
    for (let i = 0; i < statics.length; i++) if ((game.ents[statics[i] as number] as Ent).alive) mix = (mix * 31 + i + 7) | 0
    for (const i of chasers) {
      const e = game.ents[i] as Ent
      mix = (Math.imul(mix, 131) + (e.x >> 4) * 64 + (e.y >> 4)) | 0
    }
    const cx = Math.max(0, Math.min(127, (p.x + 16) >> 2))
    const cy = Math.max(0, Math.min(127, (p.y + 32) >> 2))
    const air = game.side ? (Math.round(p.vy) + 8) * 2 + (p.ground ? 1 : 0) : 0
    const time = timeMatters ? Math.min(4095, Math.floor(game.frame / wait)) : 0
    return (((cx * 128 + cy) * 64 + air) * 4096 + time) * 262144 + (mix & 262143)
  }

  // A node is its parent plus one held combination. Only expanded nodes keep
  // a snapshot, which is what keeps a long search inside a sane amount of memory.
  const snaps = new Map<number, Snapshot>()
  const parents: number[] = [-1]
  const taken: Buttons[] = [0]
  const lengths: number[] = [0]
  const seen = new Set<number>([keyOf()])
  const open = new MinHeap()
  open.push(estimate(), 0)
  let expanded = 0

  const tapeTo = (node: number, lastButtons: Buttons, lastFrames: number): Tape => {
    const steps: [Buttons, number][] = [[lastButtons, lastFrames]]
    for (let n = node; n > 0; n = parents[n] as number) steps.push([taken[n] as number, lengths[n] as number])
    const tape: Tape = []
    for (let i = steps.length - 1; i >= 0; i--) {
      const [buttons, frames] = steps[i] as [Buttons, number]
      if (tape.length > 0 && tape[tape.length - 2] === buttons) tape[tape.length - 1] = (tape[tape.length - 1] as number) + frames
      else tape.push(buttons, frames)
    }
    return tape
  }

  while (open.size > 0) {
    if (expanded >= maxExpansions) return failed('budget', expanded)
    const node = open.pop()
    if (node > 0) {
      game.restore(snaps.get(parents[node] as number) as Snapshot)
      for (let f = 0; f < (lengths[node] as number); f++) game.step(taken[node] as number)
    }
    const from = game.snapshot()
    snaps.set(node, from)
    expanded++
    for (const buttons of actions) {
      game.restore(from)
      const frames = buttons === 0 ? wait : hold
      let used = 0
      while (used < frames && game.state === 'playing' && game.lives === lives) {
        game.step(buttons)
        used++
      }
      if (game.state === 'won') {
        const tape = tapeTo(node, buttons, used)
        const check = replay(manifest, tape)
        if (check.state === 'won' && check.lives === lives) return { won: true, reason: 'won', frames: check.frames, tape, expanded }
        continue
      }
      if (game.state !== 'playing' || game.lives !== lives) continue
      const key = keyOf()
      if (seen.has(key)) continue
      seen.add(key)
      parents.push(node)
      taken.push(buttons)
      lengths.push(used)
      open.push(game.frame * 0.5 + estimate(), parents.length - 1)
    }
  }
  return failed('exhausted', expanded)
}
