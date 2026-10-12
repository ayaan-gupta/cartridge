/**
 * Packing and unpacking sprite sheets. In memory a sheet is one byte per
 * pixel: 0 to 3 are palette indices and 4 is "nothing here". In a cart it is
 * two bit planes in base64: 2 bits of colour and 1 bit of mask per pixel.
 */
import type { CellName, Sheet } from './types'
import { CELLS, SHEET_COLS, SHEET_H, SHEET_W, TILE } from './types'

export const TRANSPARENT = 4

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function packSheet(pixels: Uint8Array, w = SHEET_W, h = SHEET_H): Sheet {
  const px = new Uint8Array(Math.ceil((w * h) / 4))
  const mask = new Uint8Array(Math.ceil((w * h) / 8))
  for (let i = 0; i < w * h; i++) {
    const v = pixels[i] as number
    if (v === TRANSPARENT) continue
    px[i >> 2] = (px[i >> 2] as number) | ((v & 3) << ((i & 3) * 2))
    mask[i >> 3] = (mask[i >> 3] as number) | (1 << (i & 7))
  }
  return { w, h, px: toBase64(px), mask: toBase64(mask) }
}

export function unpackSheet(sheet: Sheet): Uint8Array {
  const px = fromBase64(sheet.px)
  const mask = fromBase64(sheet.mask)
  const out = new Uint8Array(sheet.w * sheet.h)
  for (let i = 0; i < out.length; i++) {
    const opaque = ((mask[i >> 3] ?? 0) >> (i & 7)) & 1
    out[i] = opaque ? ((px[i >> 2] ?? 0) >> ((i & 3) * 2)) & 3 : TRANSPARENT
  }
  return out
}

/** Top-left pixel of a named cell inside the sheet. */
export function cellOrigin(name: CellName): { x: number; y: number } {
  const i = CELLS.indexOf(name)
  return { x: (i % SHEET_COLS) * TILE, y: Math.floor(i / SHEET_COLS) * TILE }
}
