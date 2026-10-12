import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { RGBAImage } from '../../src/lib/pixels'

export async function toPng(image: RGBAImage): Promise<Buffer> {
  return sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

export async function writePng(file: string, image: RGBAImage): Promise<void> {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, await toPng(image))
}
