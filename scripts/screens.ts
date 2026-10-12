/**
 * Takes the README screenshots from a running server.
 *
 *   npm run build && npm run start &
 *   npm run screens
 */
import path from 'node:path'
import { launch } from './lib/browser'

const BASE = process.env.DEMO_URL ?? 'http://localhost:4103'
const OUT = process.env.SHOT_DIR ?? path.join(process.cwd(), 'docs')

async function main(): Promise<void> {
  const browser = await launch()
  const made = await fetch(`${BASE}/api/carts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a knight climbing a tower full of goblins to rescue the princess' }) })
  const { id } = (await made.json()) as { id: string }

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
  await desktop.goto(BASE, { waitUntil: 'networkidle' })
  await desktop.waitForTimeout(1500)
  await desktop.screenshot({ path: path.join(OUT, 'home.png') })
  await desktop.goto(`${BASE}/c/${id}`, { waitUntil: 'networkidle' })
  await desktop.waitForTimeout(600)
  await desktop.screenshot({ path: path.join(OUT, 'play-title.png') })
  await desktop.getByRole('button', { name: 'Watch the bot win' }).click()
  await desktop.waitForTimeout(2600)
  await desktop.screenshot({ path: path.join(OUT, 'play.png') })
  await desktop.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' })
  await desktop.screenshot({ path: path.join(OUT, 'gallery.png'), fullPage: true })
  await desktop.goto(`${BASE}/c/nothere0`, { waitUntil: 'networkidle' })
  await desktop.screenshot({ path: path.join(OUT, 'not-found.png') })

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  await phone.goto(`${BASE}/c/${id}`, { waitUntil: 'networkidle' })
  await phone.getByRole('button', { name: 'Watch the bot win' }).scrollIntoViewIfNeeded()
  await phone.getByRole('button', { name: 'Watch the bot win' }).tap()
  await phone.evaluate(() => window.scrollTo(0, 0))
  await phone.waitForTimeout(2200)
  await phone.screenshot({ path: path.join(OUT, 'phone-play.png') })
  await phone.goto(BASE, { waitUntil: 'networkidle' })
  await phone.waitForTimeout(1200)
  await phone.screenshot({ path: path.join(OUT, 'phone-home.png'), fullPage: true })
  await phone.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' })
  await phone.screenshot({ path: path.join(OUT, 'phone-gallery.png') })

  await browser.close()
  console.log(`screenshots written to ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
