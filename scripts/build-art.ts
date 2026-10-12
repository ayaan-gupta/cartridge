/**
 * Draws the interim design-time art into assets/interim.
 *
 *   npm run art
 *
 * Each file here has a matching request in assets/prompts.md. When the
 * requested image is saved under assets/generated at the same relative path,
 * it takes over without any code change.
 */
import path from 'node:path'
import { defaultSheetImage, dpad, emptyShelf, iconSheetImage, logo, lostCart, roundButton } from '../src/art/draw'
import { writePng } from './lib/png'

const OUT = path.join(process.cwd(), 'assets', 'interim')

async function main(): Promise<void> {
  const files: [string, { width: number; height: number; data: Uint8Array | Uint8ClampedArray }][] = [
    ['logo.png', logo().scaled(8)],
    ['shell/dpad.png', dpad().scaled(8)],
    ['shell/button.png', roundButton().scaled(8)],
    ['ui/lost-cart.png', lostCart().scaled(8)],
    ['ui/empty-shelf.png', emptyShelf().scaled(8)],
    ['sprites/default-sheet.png', defaultSheetImage(16)],
    ['sprites/icons.png', iconSheetImage(16)],
  ]
  for (const [name, image] of files) {
    await writePng(path.join(OUT, name), image)
    console.log(`${name.padEnd(28)} ${image.width}x${image.height}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
