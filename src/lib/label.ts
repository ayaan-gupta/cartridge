/** A cart's label: the opening moment of the game, as a PNG. Server only. */
import sharp from 'sharp'
import { Engine } from '@/engine/engine'
import { Renderer } from '@/engine/render'
import type { Cart } from '@/engine/types'
import { SCREEN_H, SCREEN_W } from '@/engine/types'
import { indexedToRgba } from './pixels'

export async function labelPng(cart: Cart, scale = 2): Promise<Buffer> {
  const game = new Engine(cart.manifest)
  game.start()
  // A few frames in, so spawners and patrols are on screen and nothing is mid-blink.
  for (let i = 0; i < 45; i++) game.step(0)
  const image = indexedToRgba(new Renderer(cart.sheet).draw(game, 0), SCREEN_W, SCREEN_H, cart.manifest.palette, scale)
  return sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, colours: 8 })
    .toBuffer()
}
