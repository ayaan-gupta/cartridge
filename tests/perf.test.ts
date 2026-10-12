/**
 * Acceptance: "Engine holds 60 FPS on a mid-range phone."
 *
 * There is no phone here, so this is an emulation and is labelled as one:
 * headless Chromium with the main thread throttled to a quarter speed through
 * the DevTools protocol, which is the usual stand-in for a mid-range phone.
 * It checks the two things 60 FPS means: each frame's work fits the 16.7 ms
 * budget with room to spare, and frames actually arrive 60 times a second.
 */
import path from 'node:path'
import { build } from 'esbuild'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { solve } from '@/bot/bot'
import { validateManifest } from '@/cart/schema'
import { TEMPLATES } from '@/cart/templates'
import { Engine } from '@/engine/engine'
import type { FrameStats } from '@/engine/runner'
import { packSheet } from '@/engine/sheet'
import type { Manifest, Tape } from '@/engine/types'
import { MAX_ENTITIES } from '@/engine/types'
import { composeSheet, synthCells } from '@/sprites/synth'
import { cachedChromium } from '../scripts/lib/browser'
import { stressManifest, throttleCpu } from '../scripts/lib/perf'

const BUDGET_MS = 1000 / 60

let browser: Browser | null = null
let bundle = ''

beforeAll(async () => {
  const out = await build({
    entryPoints: [path.join(process.cwd(), 'tests', 'perf', 'entry.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    alias: { '@': path.join(process.cwd(), 'src') },
  })
  bundle = out.outputFiles[0]?.text ?? ''
  try {
    browser = await chromium.launch({ executablePath: cachedChromium() })
  } catch (error) {
    console.warn(`No Chromium to launch, so the frame budget test is skipped: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
  }
})

afterAll(async () => {
  await browser?.close()
})

const IDLE: Tape = [0, 100000]

/** Plays a cart for `frames` display frames and reports what each one cost. */
async function measure(manifest: Manifest, tape: Tape, rate: number, frames = 300): Promise<FrameStats> {
  const page = await (browser as Browser).newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
  await page.setContent('<canvas id="screen" style="width:320px;height:288px;image-rendering:pixelated"></canvas>')
  await page.addScriptTag({ content: bundle })
  if (rate > 1) await throttleCpu(page, rate)
  const cart = { manifest, sheet: packSheet(composeSheet(synthCells(manifest))) }
  const stats = await page.evaluate(([c, t, f]) => window.runCart(c as never, t as never, 90, f as number), [cart, tape, frames] as const)
  await page.close()
  return stats
}

describe('frame budget under a 4x CPU throttle (emulated mid-range phone)', () => {
  it('bundles the engine for a browser with no dependencies at all', () => {
    expect(bundle.length).toBeGreaterThan(5000)
    expect(bundle.length).toBeLessThan(60000)
    expect(bundle).not.toMatch(/require\(|from "/)
  })

  it('has a stress cart that is legal and really does fill the engine', () => {
    const stress = stressManifest()
    const check = validateManifest(stress)
    expect(check.ok, check.ok ? '' : check.issues.join('; ')).toBe(true)
    expect(stress.entities.length).toBe(40)
    const game = new Engine(stress)
    game.start()
    let most = 0
    for (let i = 0; i < 1200; i++) {
      game.step(0)
      most = Math.max(most, game.ents.filter((e) => e.alive).length)
    }
    expect(game.state).toBe('playing')
    expect(game.lives).toBe(9)
    expect(most).toBeGreaterThan(55)
    expect(game.ents.length).toBeLessThanOrEqual(MAX_ENTITIES)
  })

  it('keeps every cart, including the stress cart, inside the budget at 60 frames a second', async (context) => {
    if (!browser) return context.skip()
    const rows: string[] = []
    const carts: [Manifest, Tape][] = [...TEMPLATES.map((m): [Manifest, Tape] => [m, solve(m).tape]), [stressManifest(), IDLE]]
    for (const [manifest, tape] of carts) {
      const stats = await measure(manifest, tape, 4)
      const fps = 1000 / stats.intervalMs
      rows.push(`${manifest.title.padEnd(14)} work ${stats.workMs.toFixed(2)} ms mean, ${stats.worstMs.toFixed(2)} ms worst, ${fps.toFixed(1)} fps, ${stats.late}/${stats.frames} late, ${stats.steps} steps`)
      expect(stats.frames).toBe(300)
      // The work for a frame is a small fraction of the frame.
      expect(stats.workMs, manifest.title).toBeLessThan(BUDGET_MS / 4)
      expect(stats.worstMs, manifest.title).toBeLessThan(BUDGET_MS)
      // And the frames arrive on time: 60 a second, with the simulation keeping pace.
      expect(fps, manifest.title).toBeGreaterThan(57)
      expect(fps, manifest.title).toBeLessThan(63)
      expect(stats.late / stats.frames, manifest.title).toBeLessThan(0.03)
      expect(Math.abs(stats.steps - stats.frames), manifest.title).toBeLessThanOrEqual(4)
    }
    console.log(`4x CPU throttle, headless Chromium, 390x844 at 3x:\n${rows.join('\n')}`)
  })

  it('costs more under the throttle than without it, which shows the throttle is real', async (context) => {
    if (!browser) return context.skip()
    const free = await measure(stressManifest(), IDLE, 1, 240)
    const slowed = await measure(stressManifest(), IDLE, 4, 240)
    console.log(`stress cart work per frame: ${free.workMs.toFixed(3)} ms unthrottled, ${slowed.workMs.toFixed(3)} ms at 4x`)
    expect(slowed.workMs).toBeGreaterThan(free.workMs * 1.8)
  })
})
