/**
 * From a sentence to a manifest that is known to be valid and known to be
 * winnable. The order is the PRD's: generate, validate, repair once, fall
 * back to a template. Then the part the PRD only implies: play it. A cart
 * the bot cannot win is eased, then replaced, until one can be won.
 */
import type { BotOptions } from '@/bot/bot'
import { solve } from '@/bot/bot'
import { repairManifest } from '@/cart/repair'
import { LIMITS, validateManifest } from '@/cart/schema'
import { FALLBACK_TEMPLATE } from '@/cart/templates'
import type { EntityDef, Manifest, Tape } from '@/engine/types'
import { composeManifest } from './offline'
import type { ManifestGenerator } from './types'

export interface CartReport {
  generator: string
  /** The generator's raw output passed validation untouched. */
  firstTryValid: boolean
  /** It failed, and one repair pass made it valid. */
  repaired: boolean
  /** Repair was not enough, so a template stood in. */
  fellBack: boolean
  /** What was wrong with the first try. */
  issues: string[]
  /** Rounds of easing before the bot could win. 0 means it won as generated. */
  eased: number
  /** Whether the cart had to be swapped for another one to be winnable. */
  replaced: 'no' | 'offline' | 'template'
  botFrames: number
  botExpansions: number
  /** Carts the bot tried before one could be won. */
  attempts: number
}

export interface Generated {
  manifest: Manifest
  /** The bot's winning run. Replays to a win on a fresh engine. */
  tape: Tape
  report: CartReport
}

const slower = (speed: number, factor: number) => Math.max(LIMITS.moverSpeed[0], Math.round(speed * factor))

/**
 * A gentler copy of any manifest. Round 1 slows things and adds time. Round 2
 * also removes chasers. Round 3 removes everything that hurts, which leaves
 * the bare level: if that cannot be won, the level itself is broken.
 */
export function easeManifest(manifest: Manifest, round: number): Manifest {
  const factor = round === 1 ? 0.8 : 0.6
  let entities: EntityDef[] = manifest.entities.map((e) => {
    if (e.behavior === 'patrol' || e.behavior === 'chase' || e.behavior === 'falling') return { ...e, speed: slower(e.speed, factor) }
    if (e.behavior === 'spawner') return { ...e, every: Math.min(LIMITS.every[1], e.every * (round === 1 ? 1.4 : 2)), emits: { ...e.emits, speed: slower(e.emits.speed, factor) } }
    return { ...e }
  })
  if (round >= 2) entities = entities.filter((e) => e.behavior !== 'chase')
  if (round >= 3) {
    entities = entities.filter((e) => {
      if (e.behavior === 'hazard') return false
      if ((e.behavior === 'patrol' || e.behavior === 'falling') && e.touch === 'hurt') return false
      if (e.behavior === 'spawner' && e.emits.touch === 'hurt') return false
      return true
    })
  }
  const timer = Math.min(LIMITS.timer[1], Math.round(manifest.rules.timer * (round === 1 ? 1.5 : 2)))
  return { ...manifest, entities, rules: { ...manifest.rules, timer } }
}

export async function generateManifest(prompt: string, generator: ManifestGenerator, bot: BotOptions = {}): Promise<Generated> {
  const issues: string[] = []
  let raw: unknown
  try {
    raw = await generator.generate(prompt)
  } catch (error) {
    issues.push(`generator failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  let first = validateManifest(raw)
  const firstTryValid = first.ok
  let repaired = false
  if (!first.ok) {
    issues.push(...first.issues)
    const second = validateManifest(repairManifest(raw))
    if (second.ok) {
      first = second
      repaired = true
    }
  }
  const fellBack = !first.ok
  // A failed LLM cart is better replaced by an offline cart for the same
  // prompt than by a fixed template, so that is tried first.
  const base = first.ok ? first.manifest : null

  const candidates: { manifest: () => Manifest; eased: number; replaced: CartReport['replaced'] }[] = []
  if (base) {
    candidates.push({ manifest: () => base, eased: 0, replaced: 'no' })
    for (const round of [1, 2, 3]) candidates.push({ manifest: () => easeManifest(base, round), eased: round, replaced: 'no' })
  }
  for (let ease = generator.name === 'offline' && base ? 1 : 0; ease <= 4; ease++) candidates.push({ manifest: () => composeManifest(prompt, ease), eased: ease, replaced: 'offline' })
  candidates.push({ manifest: () => FALLBACK_TEMPLATE, eased: 0, replaced: 'template' })

  let attempts = 0
  for (const candidate of candidates) {
    const manifest = candidate.manifest()
    if (!validateManifest(manifest).ok) continue
    attempts++
    const result = solve(manifest, bot)
    if (!result.won) continue
    return {
      manifest,
      tape: result.tape,
      report: {
        generator: generator.name,
        firstTryValid,
        repaired,
        fellBack,
        issues,
        eased: candidate.eased,
        replaced: candidate.replaced,
        botFrames: result.frames,
        botExpansions: result.expanded,
        attempts,
      },
    }
  }
  // The fallback template is tested to be winnable, so this is unreachable
  // unless someone breaks that test.
  throw new Error('No winnable cart could be produced, not even the fallback template.')
}
