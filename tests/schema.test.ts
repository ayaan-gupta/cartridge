import { describe, expect, it } from 'vitest'
import { repairManifest } from '@/cart/repair'
import { checkRules, manifestBytes, validateManifest } from '@/cart/schema'
import { GEM_VAULT, LILY_PAD_DASH, MOON_MINER } from '@/cart/templates'
import { Rng } from '@/engine/rng'
import type { Manifest } from '@/engine/types'
import { composeManifest } from '@/gen/offline'
import { PROMPTS_50 } from '@/gen/prompts50'
import { clone, damage, MUTATIONS } from './damage'
import { room } from './helpers'

const issuesOf = (input: unknown): string[] => {
  const result = validateManifest(input)
  return result.ok ? [] : result.issues
}

describe('validation', () => {
  it('accepts a correct manifest and hands it back typed', () => {
    const result = validateManifest(room())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.entities[0]?.behavior).toBe('player')
  })

  it('rejects things that are not manifests at all', () => {
    for (const junk of [null, undefined, 42, 'cart', [], {}, { v: 2 }]) expect(validateManifest(junk).ok).toBe(false)
  })

  it('rejects unknown behaviours, unknown keys and out-of-range numbers', () => {
    const teleporter = clone(room())
    teleporter.entities.push({ behavior: 'teleporter', x: 2, y: 2 })
    expect(issuesOf(teleporter).join(' ')).toMatch(/entities/)

    const extra = clone(room())
    extra.script = 'alert(1)'
    expect(validateManifest(extra).ok).toBe(false)

    const fast = clone(room())
    fast.entities[0].speed = 5000
    expect(validateManifest(fast).ok).toBe(false)

    const colours = clone(room())
    colours.palette = ['red', 'green', 'blue', 'black']
    expect(validateManifest(colours).ok).toBe(false)
  })

  it('checks the rules a schema cannot say', () => {
    const short = clone(room())
    short.map.rows[3] = '#....#'
    expect(issuesOf(short).join(' ')).toMatch(/wide/)

    const twins = room([{ behavior: 'player', x: 3, y: 3, speed: 60, jump: 2 }])
    expect(checkRules(twins).join(' ')).toMatch(/exactly one player/)

    const buried = room([{ behavior: 'collectible', x: 0, y: 0, points: 10 }])
    expect(checkRules(buried).join(' ')).toMatch(/inside a solid tile/)

    const outside = room([{ behavior: 'hazard', x: 8, y: 6, w: 4, h: 1 }])
    expect(checkRules(outside).join(' ')).toMatch(/outside/)

    const greedy = room([{ behavior: 'collectible', x: 3, y: 3, points: 10 }], { rules: { lives: 3, timer: 60, goal: { opens: 'collect', amount: 5 } } })
    expect(checkRules(greedy).join(' ')).toMatch(/offers 1/)

    const unfair = room([{ behavior: 'chase', sprite: 'enemy1', x: 5, y: 5, speed: 60, range: 0 }])
    expect(checkRules(unfair).join(' ')).toMatch(/too fast/)

    const forever = room([], { rules: { lives: 3, timer: 30, goal: { opens: 'survive', amount: 30 } } })
    expect(checkRules(forever).join(' ')).toMatch(/no time/)
  })

  it('counts a spawner of pickups as an endless supply', () => {
    const rain = room([{ behavior: 'spawner', x: 5, y: 1, every: 1, spread: 2, emits: { behavior: 'falling', sprite: 'item', speed: 60, axis: 'y', dir: 1, touch: 'collect' } }], {
      rules: { lives: 3, timer: 60, goal: { opens: 'score', amount: 200 } },
    })
    expect(checkRules(rain)).toEqual([])
  })

  it('keeps every hand-written cart far under 20 KB', () => {
    for (const manifest of [LILY_PAD_DASH, MOON_MINER, GEM_VAULT]) expect(manifestBytes(manifest)).toBeLessThan(4000)
  })
})

describe('repair', () => {
  it('leaves a valid manifest meaning the same thing', () => {
    for (const manifest of [LILY_PAD_DASH, MOON_MINER, GEM_VAULT]) expect(repairManifest(manifest)).toEqual(manifest)
  })

  it('passes non-objects through untouched so the caller can fall back', () => {
    expect(repairManifest('nope')).toBe('nope')
    expect(repairManifest(null)).toBe(null)
  })

  it('fixes each kind of damage on its own', () => {
    const rng = new Rng(7)
    MUTATIONS.forEach((mutate, i) => {
      const broken = clone(GEM_VAULT)
      mutate(broken, rng)
      const result = validateManifest(repairManifest(broken))
      expect(result.ok, `mutation ${i}: ${result.ok ? '' : result.issues.join('; ')}`).toBe(true)
    })
  })

  it('turns a short hex or an unsorted palette into four colours, lightest first', () => {
    const broken = clone(room())
    broken.palette = ['#000', '#fff', '#888', '#ccc']
    const fixed = repairManifest(broken) as Manifest
    expect(fixed.palette).toEqual(['#ffffff', '#cccccc', '#888888', '#000000'])
  })

  it('digs a buried player out and gives a side-view player a floor', () => {
    const broken = clone(MOON_MINER)
    broken.entities[0].x = 0
    broken.entities[0].y = 7
    const fixed = repairManifest(broken) as Manifest
    const player = fixed.entities.find((e) => e.behavior === 'player')
    expect(player).toBeDefined()
    expect(fixed.map.rows[player?.y ?? 0]?.[player?.x ?? 0]).toBe('.')
    expect(fixed.map.rows[(player?.y ?? 0) + 1]?.[player?.x ?? 0]).toBe('#')
  })

  it('makes valid manifests out of fifty generated carts with random damage', () => {
    const rng = new Rng(2026)
    let wasBroken = 0
    let fixed = 0
    for (const prompt of PROMPTS_50) {
      const broken = clone(composeManifest(prompt))
      damage(broken, rng)
      if (validateManifest(broken).ok) continue
      wasBroken++
      const result = validateManifest(repairManifest(broken))
      expect(result.ok, `${prompt}: ${result.ok ? '' : result.issues.join('; ')}`).toBe(true)
      if (result.ok) fixed++
    }
    expect(wasBroken).toBeGreaterThan(40)
    expect(fixed).toBe(wasBroken)
  })
})
