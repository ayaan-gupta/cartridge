/**
 * Renders things to PNG so they can be looked at without a browser.
 *
 *   npm run shot -- sheet            every shape in the sprite library
 *   npm run shot -- carts            title card and first frame of each template
 *   npm run shot -- prompt "a frog dodging cars"   a generated cart, mid-game
 */
import path from 'node:path'
import { replay } from '../src/bot/bot'
import { TEMPLATES } from '../src/cart/templates'
import { OfflineGenerator } from '../src/gen/offline'
import { generateManifest } from '../src/gen/pipeline'
import { Engine } from '../src/engine/engine'
import { Renderer } from '../src/engine/render'
import { packSheet, TRANSPARENT } from '../src/engine/sheet'
import { SCREEN_H, SCREEN_W, SHEET_H, SHEET_W, TILE } from '../src/engine/types'
import { indexedToRgba } from '../src/lib/pixels'
import { composeSheet, paint, synthCells } from '../src/sprites/synth'
import { CHARACTERS, GOALS, HAZARDS, ITEMS } from '../src/sprites/templates'
import { writePng } from './lib/png'

const OUT = process.env.SHOT_DIR ?? path.join(process.cwd(), '.cache', 'shots')
const DMG = ['#e0f8d0', '#88c070', '#346856', '#081820']

async function library(): Promise<void> {
  const shapes = [...Object.values(CHARACTERS), ...Object.values(GOALS), ...Object.values(ITEMS), ...Object.values(HAZARDS)]
  const cols = 9
  const rows = Math.ceil(shapes.length / cols)
  const pad = 2
  const w = cols * (TILE + pad) + pad
  const h = rows * (TILE + pad) + pad
  const sheet = new Uint8Array(w * h).fill(0)
  shapes.forEach((shape, i) => {
    const cell = paint(shape, { a: 1, b: 2, c: 0, e: 0, p: 3, m: 3 })
    const ox = pad + (i % cols) * (TILE + pad)
    const oy = pad + Math.floor(i / cols) * (TILE + pad)
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const v = cell[y * TILE + x] as number
        if (v !== TRANSPARENT) sheet[(oy + y) * w + ox + x] = v
      }
  })
  await writePng(path.join(OUT, 'library.png'), indexedToRgba(sheet, w, h, DMG, 6))
}

async function carts(): Promise<void> {
  for (const manifest of TEMPLATES) {
    const pixels = composeSheet(synthCells(manifest))
    const sheet = packSheet(pixels)
    const slug = manifest.title.toLowerCase().replace(/\s+/g, '-')
    await writePng(path.join(OUT, `${slug}-sheet.png`), indexedToRgba(pixels, SHEET_W, SHEET_H, manifest.palette, 6, [255, 0, 255, 255]))
    const engine = new Engine(manifest)
    const renderer = new Renderer(sheet)
    await writePng(path.join(OUT, `${slug}-title.png`), indexedToRgba(renderer.draw(engine, 0), SCREEN_W, SCREEN_H, manifest.palette, 3))
    engine.start()
    for (let i = 0; i < 40; i++) engine.step(0)
    await writePng(path.join(OUT, `${slug}-play.png`), indexedToRgba(renderer.draw(engine, 40), SCREEN_W, SCREEN_H, manifest.palette, 3))
  }
}

/** A generated cart, drawn a third of the way through the bot's winning run. */
async function prompts(list: string[]): Promise<void> {
  for (const prompt of list) {
    const { manifest, tape } = await generateManifest(prompt, new OfflineGenerator())
    const sheet = packSheet(composeSheet(synthCells(manifest)))
    const engine = new Engine(manifest)
    const renderer = new Renderer(sheet)
    const total = replay(manifest, tape).frames
    engine.start()
    let frame = 0
    for (let i = 0; i + 1 < tape.length && frame < total / 3; i += 2)
      for (let f = 0; f < (tape[i + 1] as number) && frame < total / 3; f++, frame++) engine.step(tape[i] as number)
    const slug = manifest.title.toLowerCase().replace(/\s+/g, '-')
    await writePng(path.join(OUT, `gen-${slug}.png`), indexedToRgba(renderer.draw(engine, frame), SCREEN_W, SCREEN_H, manifest.palette, 3))
    engine.reset()
    await writePng(path.join(OUT, `gen-${slug}-title.png`), indexedToRgba(renderer.draw(engine, 0), SCREEN_W, SCREEN_H, manifest.palette, 3))
    console.log(`${manifest.title}: ${slug}`)
  }
}

async function main(): Promise<void> {
  const what = process.argv[2] ?? 'carts'
  if (what === 'sheet') await library()
  else if (what === 'prompt') await prompts(process.argv.slice(3))
  else await carts()
  console.log(`wrote ${what} to ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
