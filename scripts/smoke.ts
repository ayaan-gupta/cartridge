/**
 * Plays the real app the way a person would, on a desktop and on a phone,
 * and fails if anything does not respond. Needs a running server.
 *
 *   npm run build && npm run start &
 *   npm run smoke
 */
import { launch } from './lib/browser'

const BASE = process.env.DEMO_URL ?? 'http://localhost:4103'

type Probe = { state: string; x: number; y: number; watching: boolean }
const probe = `(() => { const r = window.__cartridge; return { state: r.engine.state, x: r.engine.p.x, y: r.engine.p.y, watching: r.watching } })()`

function check(what: string, ok: boolean): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) process.exitCode = 1
}

async function main(): Promise<void> {
  const browser = await launch()
  const errors: string[] = []

  // ---- desktop: make a cart from the home page, play it with the keyboard ----
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  desktop.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  desktop.on('pageerror', (error) => errors.push(error.message))
  await desktop.goto(BASE, { waitUntil: 'networkidle' })
  await desktop.fill('#prompt', 'a robot jumping across factory conveyor belts to reach the exit')
  await desktop.keyboard.press('Enter')
  await desktop.waitForURL('**/c/*')
  const url = desktop.url()
  check(`home page makes a cart and lands on ${new URL(url).pathname}`, /\/c\/[0-9a-z]{8}$/.test(url))
  await desktop.goto(`${url}?perf=1`, { waitUntil: 'networkidle' })
  const scale = await desktop.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    return { css: canvas.getBoundingClientRect().width / canvas.width, rendering: getComputedStyle(canvas).imageRendering }
  })
  check(`desktop screen is at three times size with hard pixels (${scale.css}x, ${scale.rendering})`, scale.css === 3 && scale.rendering === 'pixelated')
  let before = (await desktop.evaluate(probe)) as Probe
  check('cart opens on its title card', before.state === 'title')
  await desktop.keyboard.press('KeyZ')
  await desktop.waitForTimeout(300)
  before = (await desktop.evaluate(probe)) as Probe
  check('Z starts the game', before.state === 'playing')
  await desktop.waitForTimeout(400)
  before = (await desktop.evaluate(probe)) as Probe
  await desktop.keyboard.down('Space')
  await desktop.waitForTimeout(150)
  const jumping = (await desktop.evaluate(probe)) as Probe
  await desktop.keyboard.up('Space')
  check(`space jumps in a side-view cart (${before.y} to ${jumping.y})`, jumping.y < before.y - 8)
  await desktop.waitForTimeout(700)
  before = (await desktop.evaluate(probe)) as Probe
  await desktop.keyboard.down('ArrowRight')
  await desktop.waitForTimeout(300)
  await desktop.keyboard.up('ArrowRight')
  let after = (await desktop.evaluate(probe)) as Probe
  check(`holding the right arrow moves the player (${before.x} to ${after.x})`, after.x > before.x + 10)
  await desktop.getByRole('button', { name: 'Watch the bot win' }).click()
  await desktop.waitForTimeout(400)
  check('the bot can be asked to play', ((await desktop.evaluate(probe)) as Probe).watching)
  await desktop.keyboard.press('ArrowLeft')
  await desktop.waitForTimeout(200)
  check('any key takes the game back from the bot', !((await desktop.evaluate(probe)) as Probe).watching)
  const download = await desktop.evaluate(async () => {
    const link = document.querySelector('a[download]') as HTMLAnchorElement
    const response = await fetch(link.href)
    return { disposition: response.headers.get('content-disposition'), format: ((await response.json()) as { format: string }).format }
  })
  check(`the download link serves a .cart file (${download.disposition})`, download.format === 'cartridge' && /\.cart"$/.test(download.disposition ?? ''))

  // ---- phone: the same cart by its share link, played by touch ----
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  phone.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  phone.on('pageerror', (error) => errors.push(error.message))
  await phone.goto(`${url}?perf=1`, { waitUntil: 'networkidle' })
  const fit = await phone.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const shell = document.querySelector('.console') as HTMLElement
    return { css: canvas.getBoundingClientRect().width / canvas.width, shell: shell.getBoundingClientRect().width, page: document.documentElement.scrollWidth, view: window.innerWidth }
  })
  check(`phone screen is at twice size and the handheld fits (${fit.css}x, shell ${fit.shell}px of ${fit.view}px)`, fit.css === 2 && fit.shell <= fit.view && fit.page <= fit.view)
  await phone.getByRole('button', { name: 'A button' }).tap()
  await phone.waitForTimeout(300)
  before = (await phone.evaluate(probe)) as Probe
  check('tapping A starts the game', before.state === 'playing')
  // Hold the right arm of the d-pad with a real touch point.
  const pad = await phone.locator('.dpad').boundingBox()
  if (!pad) throw new Error('no d-pad')
  const session = await phone.context().newCDPSession(phone)
  const touch = (type: string, x: number, y: number) => session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] } as never)
  await touch('touchStart', pad.x + pad.width * 0.88, pad.y + pad.height * 0.5)
  await phone.waitForTimeout(500)
  after = (await phone.evaluate(probe)) as Probe
  check(`holding the d-pad's right arm moves the player (${before.x} to ${after.x})`, after.x > before.x + 10)
  // Slide the same finger to the left arm without lifting.
  await touch('touchMove', pad.x + pad.width * 0.12, pad.y + pad.height * 0.5)
  await phone.waitForTimeout(500)
  const back = (await phone.evaluate(probe)) as Probe
  check(`sliding to the left arm reverses without lifting (${after.x} to ${back.x})`, back.x < after.x - 10)
  await touch('touchEnd', 0, 0)
  await phone.waitForTimeout(200)
  const still = (await phone.evaluate(probe)) as Probe
  await phone.waitForTimeout(250)
  check('lifting the finger stops the player', Math.abs(((await phone.evaluate(probe)) as Probe).x - still.x) < 0.5)

  // ---- the gallery and a dead link ----
  await desktop.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' })
  const cards = await desktop.locator('.cart').count()
  const labels = await desktop.evaluate(() => [...document.querySelectorAll('.cart-label img')].every((img) => (img as HTMLImageElement).naturalWidth === 320))
  check(`the gallery shows the new cart among ${cards}, each with a rendered label`, cards >= 4 && labels)
  const missing = await desktop.goto(`${BASE}/c/zzzzzzzz`)
  check('a dead share link is a 404 with a way home', missing?.status() === 404 && (await desktop.getByRole('link', { name: 'Make a cartridge' }).count()) === 1)

  check(`no errors in either browser console${errors.length ? `: ${errors.join(' | ')}` : ''}`, errors.filter((e) => !e.includes('404')).length === 0)
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
