/**
 * Getting a cart its sprites. An image provider is asked first if there is
 * one; its picture is keyed, quantised and sliced into cells. With no
 * provider, or when it fails, the built-in synthesiser draws the sheet. Any
 * single cell that comes back empty is filled from the fixed default set, so
 * one bad drawing never costs the whole sheet.
 */
import { packSheet } from '@/engine/sheet'
import type { CellName, HazardIcon, ItemIcon, Manifest, Sheet } from '@/engine/types'
import { CELLS } from '@/engine/types'
import type { RGBAImage } from '@/lib/pixels'
import type { KV } from '@/store/kv'
import { GENERATED_LAYOUT, sliceSheet } from './slice'
import type { Cell, Cells } from './synth'
import { composeSheet, defaultCells, iconCell, synthCells } from './synth'

/** Something that can paint a sprite sheet from a text prompt. */
export interface SpriteProvider {
  readonly name: string
  generate(prompt: string): Promise<RGBAImage>
}

/** Design-time art read from disk. Without it the same drawings come from code. */
export interface ArtAssets {
  defaults: Cells
  icons: Partial<Record<ItemIcon | HazardIcon, Cell>>
}

export interface SheetResult {
  sheet: Sheet
  /** provider: freshly generated. cache: generated earlier for the same prompt. synth: drawn by the built-in artist. */
  source: 'provider' | 'cache' | 'synth'
  /** Why the provider was not used, when one was configured. */
  note?: string
  /** Cells taken from the default set because the generated one was empty. */
  borrowed: CellName[]
}

export interface SheetOptions {
  provider?: SpriteProvider | null
  cache?: KV
  assets?: ArtAssets
}

/** The eight cells an image model is asked for, in sheet order. */
export const GENERATED_CELLS: CellName[] = ['player', 'enemy1', 'enemy2', 'enemy3', 'goal', 'tileA', 'tileB', 'background']

/** The one prompt per cart. The style bible is spelled out every time. */
export function spritePrompt(manifest: Manifest): string {
  const art = manifest.art
  return [
    'A sprite sheet for a Game Boy era handheld game, laid out as a grid of 4 columns and 2 rows of equal cells on a flat, pure magenta (#FF00FF) background.',
    'Style: chunky pixel art, strong readable silhouettes, hard pixel edges, no anti-aliasing, no gradients, no dithering noise, no text, no labels, no lines between cells.',
    `Use only these four colours, plus the magenta background: ${manifest.palette.join(', ')}. Never use magenta, pink or purple inside a drawing.`,
    'Every character is drawn once, facing right, centred, filling most of its cell, with magenta all around it.',
    `Row 1, left to right: ${art.player} (the hero); ${art.enemies[0]}; ${art.enemies[1]}; ${art.enemies[2]}.`,
    `Row 2, left to right: ${art.goal} (the goal the hero is trying to reach); a square tile of ${art.tiles[0]} that fills its whole cell edge to edge; a square tile of ${art.tiles[1]} that fills its whole cell edge to edge; a quiet, low-contrast, seamless square pattern of ${art.background} that fills its whole cell.`,
  ].join(' ')
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sheetCacheKey(prompt: string): Promise<string> {
  return `sheet-${(await sha256(prompt)).slice(0, 32)}`
}

function withIcons(cells: Cells, manifest: Manifest, assets?: ArtAssets): Cells {
  return {
    ...cells,
    item: assets?.icons[manifest.art.item] ?? iconCell(manifest.art.item),
    hazard: assets?.icons[manifest.art.hazard] ?? iconCell(manifest.art.hazard),
  }
}

/** Turns a generated picture into a full set of cells for this cart. */
export function cellsFromImage(image: RGBAImage, manifest: Manifest, assets?: ArtAssets): { cells: Cells; borrowed: CellName[] } {
  const sliced = sliceSheet(image, manifest.palette, GENERATED_LAYOUT)
  const fallback = assets?.defaults ?? defaultCells()
  const borrowed: CellName[] = []
  const cells = { ...fallback }
  GENERATED_CELLS.forEach((name, i) => {
    if (sliced.empty[i]) borrowed.push(name)
    else cells[name] = sliced.cells[i] as Cell
  })
  return { cells: withIcons(cells, manifest, assets), borrowed }
}

export async function buildSheet(manifest: Manifest, options: SheetOptions = {}): Promise<SheetResult> {
  const { provider, cache, assets } = options
  const synth = (note?: string): SheetResult => ({
    sheet: packSheet(composeSheet(withIcons(synthCells(manifest), manifest, assets))),
    source: 'synth',
    note,
    borrowed: [],
  })
  if (!provider) return synth()

  const prompt = spritePrompt(manifest)
  const key = await sheetCacheKey(prompt)
  const cached = await cache?.get<{ sheet: Sheet; borrowed: CellName[] }>(key)
  if (cached) return { sheet: cached.sheet, source: 'cache', borrowed: cached.borrowed }

  let image: RGBAImage
  try {
    image = await provider.generate(prompt)
  } catch (error) {
    return synth(`${provider.name} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const { cells, borrowed } = cellsFromImage(image, manifest, assets)
  // A picture with nothing usable in it is a failure too.
  if (borrowed.length >= GENERATED_CELLS.length - 1) return synth(`${provider.name} returned a sheet with nothing in it`)
  const sheet = packSheet(composeSheet(cells))
  await cache?.set(key, { sheet, borrowed })
  return { sheet, source: 'provider', borrowed }
}

/** Every cell name in sheet order, for callers that lay sheets out themselves. */
export const SHEET_CELLS = CELLS
