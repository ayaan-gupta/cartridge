/**
 * Records docs/demo.gif by driving the real app in a headless browser.
 *
 *   npm run build && npm run start &     (in one terminal)
 *   npm run demo                          (in another)
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { launch } from './lib/browser'
import type { Frame } from './lib/gif'
import { encodeGif } from './lib/gif'

const BASE = process.env.DEMO_URL ?? 'http://localhost:4103'
const WIDTH = 960
const HEIGHT = 640

async function main() {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
  const frames: Frame[] = []

  const shoot = async (delay: number) => {
    const png = await page.screenshot({ type: 'png' })
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    frames.push({ rgba: new Uint8Array(data), delay })
  }
  /** Films for a while. The delay written to each frame is the time it really took. */
  const hold = async (ms: number, every = 110) => {
    const end = Date.now() + ms
    let last = Date.now()
    while (Date.now() < end) {
      await page.waitForTimeout(Math.max(0, every - (Date.now() - last)))
      const now = Date.now()
      await shoot(Math.max(40, now - last))
      last = now
    }
  }
  const make = async (prompt: string) => {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await hold(900)
    await page.click('#prompt')
    for (const char of prompt) {
      await page.keyboard.type(char)
      await shoot(55)
    }
    await hold(350)
    await page.keyboard.press('Enter')
    await page.waitForURL('**/c/*')
    await page.waitForLoadState('networkidle')
    await hold(1500)
    await page.getByRole('button', { name: 'Watch the bot win' }).click()
  }

  await make('a frog dodging cars to reach a lily pad')
  await hold(4200)
  await make('a knight climbing a tower full of goblins to rescue the princess')
  await hold(6200)
  await page.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' })
  await hold(2200)

  await browser.close()
  const gif = encodeGif(frames, WIDTH, HEIGHT)
  const out = path.join(process.cwd(), 'docs', 'demo.gif')
  writeFileSync(out, gif)
  console.log(`${frames.length} frames, ${(gif.length / 1024 / 1024).toFixed(2)} MB -> ${out}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
