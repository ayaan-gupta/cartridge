/**
 * Measures what one frame costs in Node: simulation alone, drawing alone,
 * and the bot's search on each hand-written cart.
 *
 *   npm run bench
 */
import { solve } from '../src/bot/bot'
import { TEMPLATES } from '../src/cart/templates'
import { Engine } from '../src/engine/engine'
import { Renderer } from '../src/engine/render'
import { packSheet } from '../src/engine/sheet'
import { BTN } from '../src/engine/types'
import { composeSheet, synthCells } from '../src/sprites/synth'

const FRAMES = 20000

for (const manifest of TEMPLATES) {
  const game = new Engine(manifest)
  const renderer = new Renderer(packSheet(composeSheet(synthCells(manifest))))
  const buttons = (i: number) => [BTN.right, BTN.right | BTN.a, BTN.up, 0, BTN.left, BTN.down][(i >> 5) % 6] as number

  game.start()
  let began = performance.now()
  for (let i = 0; i < FRAMES; i++) {
    if (game.state !== 'playing') game.start()
    game.step(buttons(i))
  }
  const stepUs = ((performance.now() - began) / FRAMES) * 1000

  game.start()
  for (let i = 0; i < 90; i++) game.step(buttons(i))
  began = performance.now()
  for (let i = 0; i < FRAMES; i++) renderer.draw(game, i)
  const drawUs = ((performance.now() - began) / FRAMES) * 1000

  began = performance.now()
  const bot = solve(manifest)
  const botMs = performance.now() - began

  console.log(
    `${manifest.title.padEnd(16)} step ${stepUs.toFixed(2)} us   draw ${drawUs.toFixed(1)} us   ` +
      `frame ${((stepUs + drawUs) / 1000).toFixed(4)} ms of 16.667   bot ${bot.won ? 'won' : bot.reason} in ${bot.frames} frames, ${bot.expanded} expansions, ${botMs.toFixed(0)} ms`,
  )
}
