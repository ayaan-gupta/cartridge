/**
 * Design-time art on disk. Each asset is looked for in assets/generated
 * first and assets/interim second, file by file, so delivered art replaces
 * the code-drawn version the moment it is saved. The two sprite sheets go
 * through the same slicing pipeline as a runtime-generated sheet.
 *
 * Server only: this reads files and decodes PNGs.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { HazardIcon, ItemIcon } from '@/engine/types'
import { decodeImage } from './provider'
import type { ArtAssets } from './sheet'
import { GENERATED_CELLS } from './sheet'
import type { Layout } from './slice'
import { GENERATED_LAYOUT, sliceSheet } from './slice'
import type { Cell, Cells } from './synth'
import { defaultCells, iconCell } from './synth'

/** The reference palette the design-time sheets are drawn in. Only the order of tones matters. */
export const REFERENCE_PALETTE = ['#e0f8d0', '#88c070', '#346856', '#081820'] as const

export const ICON_ORDER: (ItemIcon | HazardIcon)[] = ['coin', 'gem', 'star', 'heart', 'key', 'fruit', 'spike', 'flame', 'water', 'bolt']
export const ICON_LAYOUT: Layout = {
  cols: 5,
  rows: 2,
  kinds: ICON_ORDER.map((icon) => (icon === 'water' ? 'tile' : 'sprite')),
}

/** The path of an asset, preferring delivered art. Null when neither version exists. */
export function resolveAsset(relative: string, root = process.cwd()): string | null {
  for (const folder of ['generated', 'interim']) {
    const file = path.join(root, 'assets', folder, relative)
    if (existsSync(file)) return file
  }
  return null
}

export async function loadArt(root = process.cwd()): Promise<ArtAssets> {
  const defaults: Cells = defaultCells()
  const icons: Partial<Record<ItemIcon | HazardIcon, Cell>> = {}
  try {
    const file = resolveAsset('sprites/default-sheet.png', root)
    if (file) {
      const sliced = sliceSheet(await decodeImage(readFileSync(file)), REFERENCE_PALETTE, GENERATED_LAYOUT)
      GENERATED_CELLS.forEach((name, i) => {
        if (!sliced.empty[i]) defaults[name] = sliced.cells[i] as Cell
      })
    }
  } catch {
    // An unreadable file is the same as a missing one: the code-drawn set stands.
  }
  try {
    const file = resolveAsset('sprites/icons.png', root)
    if (file) {
      const sliced = sliceSheet(await decodeImage(readFileSync(file)), REFERENCE_PALETTE, ICON_LAYOUT)
      ICON_ORDER.forEach((icon, i) => {
        if (!sliced.empty[i]) icons[icon] = sliced.cells[i] as Cell
      })
    }
  } catch {
    // As above.
  }
  for (const icon of ICON_ORDER) icons[icon] ??= iconCell(icon)
  defaults.item = icons.coin as Cell
  defaults.hazard = icons.spike as Cell
  return { defaults, icons }
}
