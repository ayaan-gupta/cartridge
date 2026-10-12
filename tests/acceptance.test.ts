/**
 * The PRD's acceptance tests about generation, run on the offline generator.
 * `npm run eval -- --live` runs the same evaluation against the real model.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { replay } from '@/bot/bot'
import { validateManifest } from '@/cart/schema'
import type { EvalSummary } from '@/gen/evaluate'
import { evaluatePrompts } from '@/gen/evaluate'
import { composeManifest, OfflineGenerator } from '@/gen/offline'
import { generateManifest } from '@/gen/pipeline'
import { PROMPTS_50 } from '@/gen/prompts50'

describe('acceptance: fifty varied prompts', () => {
  let summary: EvalSummary
  beforeAll(async () => {
    summary = await evaluatePrompts(PROMPTS_50, new OfflineGenerator())
  })

  it('uses fifty distinct prompts', () => {
    expect(PROMPTS_50.length).toBe(50)
    expect(new Set(PROMPTS_50.map((p) => p.toLowerCase())).size).toBe(50)
  })

  it('produces fifty valid manifests: at least 95% on the first try, 100% after repair', () => {
    expect(summary.prompts).toBe(50)
    expect(summary.validFirstTry / 50).toBeGreaterThanOrEqual(0.95)
    expect(summary.validAfterRepair).toBe(50)
    expect(summary.fellBackToTemplate).toBe(0)
    expect(summary.shippedValid).toBe(50)
  })

  it('ships only carts the bot wins inside the time limit', () => {
    expect(summary.shippedWinnable).toBe(50)
    for (const row of summary.rows) {
      expect(row.replayWon, row.prompt).toBe(true)
      expect(row.botSeconds, row.prompt).toBeLessThan(row.timerSeconds)
    }
  })

  it('keeps every cart under 20 KB of JSON', () => {
    expect(summary.maxBytes).toBeLessThan(20000)
    for (const row of summary.rows) expect(row.bytes, row.prompt).toBeLessThan(20000)
  })

  it('is varied: every archetype, many palettes, mostly distinct titles', () => {
    expect(Object.keys(summary.archetypes).length).toBe(7)
    expect(summary.distinctPalettes).toBeGreaterThanOrEqual(10)
    expect(summary.distinctTitles).toBeGreaterThanOrEqual(45)
    expect(new Set(summary.rows.map((r) => r.view)).size).toBe(2)
  })

  it('wins from a recording, not from the search, so the proof can be replayed anywhere', async () => {
    for (const prompt of PROMPTS_50.slice(0, 10)) {
      const { manifest, tape } = await generateManifest(prompt, new OfflineGenerator())
      const first = replay(manifest, tape)
      const second = replay(JSON.parse(JSON.stringify(manifest)), [...tape])
      expect(first).toEqual(second)
      expect(first.state).toBe('won')
      expect(validateManifest(manifest).ok).toBe(true)
      expect(tape.length % 2).toBe(0)
    }
  })

  it('does not win by accident: the same carts are lost by doing nothing', () => {
    for (const prompt of PROMPTS_50) {
      const manifest = composeManifest(prompt)
      expect(replay(manifest, [0, manifest.rules.timer * 60 + 10]).state, prompt).toBe('lost')
    }
  })
})
