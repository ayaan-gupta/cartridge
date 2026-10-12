/**
 * Measures the real play page under a 4x CPU throttle.
 *
 *   npm run build && npm run start &
 *   npm run perf
 *
 * This is the whole product, not just the engine: Next, React, the handheld
 * shell, the runner and the canvas, at a phone-sized viewport with a device
 * pixel ratio of 3. It is an emulation of a mid-range phone, not a phone.
 * Results go to docs/perf.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { FrameStats } from '../src/engine/runner'
import { launch } from './lib/browser'
import { throttleCpu } from './lib/perf'

const BASE = process.env.DEMO_URL ?? 'http://localhost:4103'
const RATE = Number(process.env.THROTTLE ?? 4)
const SECONDS = 10

interface Row extends FrameStats {
  title: string
  fps: number
}

async function main(): Promise<void> {
  const list = (await (await fetch(`${BASE}/api/carts`)).json()) as { carts: { id: string; title: string }[] }
  const picks = ['LILY PAD DASH', 'MOON MINER', 'GEM VAULT'].map((title) => list.carts.find((c) => c.title === title)).filter((c) => c !== undefined)
  if (picks.length === 0) throw new Error(`No carts found at ${BASE}. Is the server running?`)

  const browser = await launch()
  const rows: Row[] = []
  for (const rate of [1, RATE]) {
    for (const cart of picks) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
      await page.goto(`${BASE}/c/${cart.id}?perf=1`, { waitUntil: 'networkidle' })
      await throttleCpu(page, rate)
      await page.getByRole('button', { name: 'Watch the bot win' }).tap()
      await page.waitForTimeout(1500)
      await page.evaluate(() => (window as unknown as { __cartridge: { readStats(): unknown } }).__cartridge.readStats())
      // Keep the bot playing for the whole window: when a run ends, start it again.
      const until = Date.now() + SECONDS * 1000
      while (Date.now() < until) {
        await page.waitForTimeout(500)
        const idle = await page.getByRole('button', { name: 'Watch the bot win' }).isEnabled()
        if (idle) await page.getByRole('button', { name: 'Watch the bot win' }).tap()
      }
      const stats = (await page.evaluate(() => (window as unknown as { __cartridge: { readStats(): unknown } }).__cartridge.readStats())) as FrameStats
      await page.close()
      const row = { title: cart.title, ...stats, fps: 1000 / stats.intervalMs }
      rows.push(row)
      console.log(
        `${rate}x  ${cart.title.padEnd(14)} work ${stats.workMs.toFixed(2)} ms mean, ${stats.worstMs.toFixed(2)} ms worst of 16.67   ` +
          `${row.fps.toFixed(1)} fps   ${stats.late}/${stats.frames} frames late   ${stats.steps} steps`,
      )
    }
  }
  await browser.close()

  const half = rows.length / 2
  const out = path.join(process.cwd(), 'docs', 'perf.json')
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        what: 'Frame cost of the real play page in headless Chromium, 390x844 viewport at device pixel ratio 3, bot playing.',
        caveat: `CPU throttling through the DevTools protocol at ${RATE}x is an emulation of a mid-range phone, not a measurement on one. It slows JavaScript and layout on the main thread. It does not model a phone GPU, thermal limits or a 120 Hz panel.`,
        budgetMs: 1000 / 60,
        unthrottled: rows.slice(0, half),
        throttled: { rate: RATE, carts: rows.slice(half) },
      },
      null,
      2,
    )}\n`,
  )
  console.log(`\nwrote ${out}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
