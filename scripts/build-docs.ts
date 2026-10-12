/**
 * Draws the still images in docs/ that do not need a running server.
 *
 *   npm run docs
 *
 *   docs/carts.png             eight generated carts, each a third of the way through the bot's run
 *   docs/sprites.png           every hand-authored shape in the sprite library
 *   docs/sprite-pipeline.png   a soft, off-palette "generated" sheet beside what the slicer makes of it
 */
import path from 'node:path'
import { replay } from '../src/bot/bot'
import { Engine } from '../src/engine/engine'
import { Renderer } from '../src/engine/render'
import { packSheet, TRANSPARENT } from '../src/engine/sheet'
import { SCREEN_H, SCREEN_W, TILE } from '../src/engine/types'
import { composeManifest, OfflineGenerator } from '../src/gen/offline'
import { generateManifest } from '../src/gen/pipeline'
import type { RGBAImage } from '../src/lib/pixels'
import { hexToRgb, indexedToRgba } from '../src/lib/pixels'
import { GENERATED_CELLS } from '../src/sprites/sheet'
import { sliceSheet } from '../src/sprites/slice'
import { composeSheet, paint, synthCells } from '../src/sprites/synth'
import { CHARACTERS, GOALS, HAZARDS, ITEMS } from '../src/sprites/templates'
import { generatedLike } from '../tests/synthetic'
import { writePng } from './lib/png'

const OUT = path.join(process.cwd(), 'docs')
const PAPER = '#f3f0e8'

function sheetOf(width: number, height: number, hex: string): RGBAImage {
  const [r, g, b] = hexToRgb(hex)
  const data = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) data.set([r, g, b, 255], p * 4)
  return { width, height, data }
}

function paste(onto: RGBAImage, image: RGBAImage, left: number, top: number): void {
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const s = (y * image.width + x) * 4
      if ((image.data[s + 3] as number) === 0) continue
      onto.data.set(image.data.subarray(s, s + 4), ((top + y) * onto.width + left + x) * 4)
    }
}

const PROMPTS = [
  'a frog dodging cars to reach a lily pad',
  'an astronaut collecting stars while avoiding asteroids',
  'a knight climbing a tower full of goblins to rescue the princess',
  'a baker catching falling cupcakes while dodging burnt cookies',
  'a kid running from zombies in a graveyard to reach the gate',
  'a robot jumping across factory conveyor belts to reach the exit',
  'a snowman surviving a blizzard until morning',
  'a mole digging through a cave collecting crystals and avoiding bats',
]

async function carts(): Promise<void> {
  const scale = 2
  const pad = 16
  const w = SCREEN_W * scale
  const h = SCREEN_H * scale
  const board = sheetOf(4 * (w + pad) + pad, 2 * (h + pad) + pad, PAPER)
  for (const [i, prompt] of PROMPTS.entries()) {
    const { manifest, tape } = await generateManifest(prompt, new OfflineGenerator())
    const game = new Engine(manifest)
    const renderer = new Renderer(packSheet(composeSheet(synthCells(manifest))))
    const stop = replay(manifest, tape).frames / 3
    game.start()
    let frame = 0
    for (let t = 0; t + 1 < tape.length && frame < stop; t += 2) for (let f = 0; f < (tape[t + 1] as number) && frame < stop; f++, frame++) game.step(tape[t] as number)
    paste(board, indexedToRgba(renderer.draw(game, frame), SCREEN_W, SCREEN_H, manifest.palette, scale), pad + (i % 4) * (w + pad), pad + Math.floor(i / 4) * (h + pad))
  }
  await writePng(path.join(OUT, 'carts.png'), board)
}

async function sprites(): Promise<void> {
  const shapes = [...Object.values(CHARACTERS), ...Object.values(GOALS), ...Object.values(ITEMS), ...Object.values(HAZARDS)]
  const cols = 12
  const scale = 5
  const pad = 10
  const cell = TILE * scale
  const board = sheetOf(cols * (cell + pad) + pad, Math.ceil(shapes.length / cols) * (cell + pad) + pad, '#e0f8d0')
  shapes.forEach((shape, i) => {
    const drawn = indexedToRgba(paint(shape, { a: 1, b: 2, c: 0, e: 0, p: 3, m: 3 }), TILE, TILE, ['#e0f8d0', '#88c070', '#346856', '#081820'], scale)
    paste(board, drawn, pad + (i % cols) * (cell + pad), pad + Math.floor(i / cols) * (cell + pad))
  })
  await writePng(path.join(OUT, 'sprites.png'), board)
}

async function pipeline(): Promise<void> {
  const manifest = composeManifest('a frog dodging cars to reach a lily pad')
  const cells = GENERATED_CELLS.map((name) => synthCells(manifest)[name])
  const input = generatedLike(cells, manifest.palette, { cols: 4, cellW: 128, cellH: 128, blur: 3, noise: 8, shift: 18 })
  const sliced = sliceSheet(input, manifest.palette)
  const scale = 8
  const output = sheetOf(4 * TILE * scale, 2 * TILE * scale, '#ffffff')
  sliced.cells.forEach((cell, i) => {
    // Transparent pixels are shown as a light checkerboard so they read as "nothing here".
    const shown = indexedToRgba(cell, TILE, TILE, manifest.palette, scale)
    for (let y = 0; y < TILE * scale; y++)
      for (let x = 0; x < TILE * scale; x++) {
        if (cell[Math.floor(y / scale) * TILE + Math.floor(x / scale)] !== TRANSPARENT) continue
        const tone = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 236 : 250
        shown.data.set([tone, tone, tone, 255], (y * shown.width + x) * 4)
      }
    paste(output, shown, (i % 4) * TILE * scale, Math.floor(i / 4) * TILE * scale)
  })
  const pad = 24
  const board = sheetOf(input.width + output.width + pad * 3, input.height + pad * 2, PAPER)
  paste(board, input, pad, pad)
  paste(board, output, input.width + pad * 2, pad)
  await writePng(path.join(OUT, 'sprite-pipeline.png'), board)
}

async function main(): Promise<void> {
  await carts()
  await sprites()
  await pipeline()
  console.log(`wrote carts.png, sprites.png and sprite-pipeline.png to ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
