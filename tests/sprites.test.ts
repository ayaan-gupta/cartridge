import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { defaultSheetImage, iconSheetImage } from '@/art/draw'
import { manifestBytes } from '@/cart/schema'
import { GEM_VAULT, LILY_PAD_DASH, MOON_MINER } from '@/cart/templates'
import { TRANSPARENT, unpackSheet } from '@/engine/sheet'
import { CELLS, SHEET_H, SHEET_W, TILE } from '@/engine/types'
import { composeManifest } from '@/gen/offline'
import { PROMPTS_50 } from '@/gen/prompts50'
import type { RGBAImage } from '@/lib/pixels'
import { hexToRgb } from '@/lib/pixels'
import { ICON_LAYOUT, ICON_ORDER, loadArt, REFERENCE_PALETTE, resolveAsset } from '@/sprites/assets'
import { decodeImage, HttpImageProvider, providerFromEnv } from '@/sprites/provider'
import type { RGB } from '@/sprites/quantize'
import { assignToPalette, histogram, medianCut, nearest } from '@/sprites/quantize'
import type { SpriteProvider } from '@/sprites/sheet'
import { buildSheet, cellsFromImage, GENERATED_CELLS, sheetCacheKey, spritePrompt } from '@/sprites/sheet'
import { estimateKey, GENERATED_LAYOUT, keyAlpha, sliceSheet } from '@/sprites/slice'
import { composeSheet, defaultCells, iconCell, isDarkWorld, synthCells } from '@/sprites/synth'
import { MemoryKV } from '@/store/kv'
import { agreement, generatedLike } from './synthetic'

const flat = (width: number, height: number, color: RGB): RGBAImage => {
  const data = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) data.set([...color, 255], p * 4)
  return { width, height, data }
}
const truth = (manifest = LILY_PAD_DASH) => GENERATED_CELLS.map((name) => synthCells(manifest)[name])
const toPng = (image: RGBAImage) => sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer()

describe('keying out magenta', () => {
  it('finds a background that is only roughly magenta', () => {
    expect(estimateKey(flat(64, 64, [244, 8, 238]))).toEqual([244, 8, 238])
  })

  it('assumes pure magenta when the border is not a key colour at all', () => {
    expect(estimateKey(flat(64, 64, [40, 120, 60]))).toEqual([255, 0, 255])
  })

  it('reads coverage from how magenta a pixel is', () => {
    const image: RGBAImage = { width: 4, height: 1, data: new Uint8Array([255, 0, 255, 255, 52, 104, 86, 255, 154, 52, 170, 255, 224, 248, 208, 255]) }
    const alpha = keyAlpha(image, [255, 0, 255])
    expect(alpha[0]).toBe(0)
    expect(alpha[1]).toBe(255)
    // Halfway between #346856 and magenta. The estimate is exact for greys and
    // a little generous for greens, which have less than no magenta in them.
    expect(alpha[2]).toBeGreaterThan(110)
    expect(alpha[2]).toBeLessThan(170)
    expect(alpha[3]).toBe(255)
  })

  it('keeps pinks and purples that belong to a palette', () => {
    for (const hex of ['#f8a0c0', '#b04888', '#d07090', '#9080d8', '#403080']) {
      const [r, g, b] = hexToRgb(hex)
      const alpha = keyAlpha({ width: 1, height: 1, data: new Uint8Array([r, g, b, 255]) }, [255, 0, 255])
      expect(alpha[0], hex).toBeGreaterThan(160)
    }
  })
})

describe('colour reduction', () => {
  const cloud = (centres: RGB[], counts: number[]): Uint8Array => {
    const out: number[] = []
    let n = 7
    centres.forEach((c, i) => {
      for (let k = 0; k < (counts[i] as number); k++) {
        n = (n * 1103515245 + 12345) & 0x7fffffff
        const j = (v: number, s: number) => Math.max(0, Math.min(255, v + ((n >> s) % 13) - 6))
        out.push(j(c[0], 3), j(c[1], 9), j(c[2], 15), 255)
      }
    })
    return new Uint8Array(out)
  }
  const tones: RGB[] = [[224, 248, 208], [136, 192, 112], [52, 104, 86], [8, 24, 32]]

  it('finds four clusters of noisy colour', () => {
    const reps = medianCut(histogram(cloud(tones, [400, 400, 400, 400]), () => true), 4)
    expect(reps.length).toBe(4)
    for (const tone of tones) {
      const near = reps[nearest(tone, reps)] as RGB
      expect(Math.abs(near[0] - tone[0]) + Math.abs(near[1] - tone[1]) + Math.abs(near[2] - tone[2])).toBeLessThan(24)
    }
  })

  it('still finds them when one colour is most of the picture, where the classic median split does not', () => {
    const data = cloud(tones, [6000, 300, 300, 300])
    const good = medianCut(histogram(data, () => true), 4, 'variance')
    const classic = medianCut(histogram(data, () => true), 4, 'median')
    const found = (reps: RGB[]) => new Set(tones.map((tone) => nearest(tone, reps))).size
    expect(found(good)).toBe(4)
    expect(found(classic)).toBeLessThan(4)
  })

  it('returns fewer colours when the picture has fewer', () => {
    expect(medianCut(histogram(cloud([tones[0] as RGB, tones[3] as RGB], [50, 50]), () => true), 4).length).toBeLessThanOrEqual(4)
    expect(medianCut(histogram(flat(4, 4, [10, 20, 30]).data, () => true), 4)).toEqual([[10, 20, 30]])
    expect(medianCut([], 4)).toEqual([])
  })

  it('pairs each colour with its own palette entry', () => {
    const palette = tones
    // Two mid tones that are both nearest to the same entry.
    const reps: RGB[] = [[230, 240, 220], [150, 200, 130], [120, 180, 100], [20, 30, 40]]
    expect(nearest(reps[1] as RGB, palette)).toBe(nearest(reps[2] as RGB, palette))
    const mapping = assignToPalette(reps, palette)
    expect([...mapping].sort()).toEqual([0, 1, 2, 3])
    expect(mapping[0]).toBe(0)
    expect(mapping[3]).toBe(3)
  })

  it('maps onto a palette that looks nothing like the picture by keeping light to dark order', () => {
    const lava = ['#ffe8a0', '#f08030', '#a02820', '#280808'].map(hexToRgb)
    expect(assignToPalette(tones, lava)).toEqual([0, 1, 2, 3])
  })
})

describe('slicing a generated sheet', () => {
  it('recovers a sheet drawn with soft edges and off-palette colours', () => {
    const cells = truth()
    const image = generatedLike(cells, LILY_PAD_DASH.palette, { cols: 4, cellW: 128, cellH: 128, blur: 2, noise: 6, shift: 14 })
    const sliced = sliceSheet(image, LILY_PAD_DASH.palette)
    expect(sliced.empty).toEqual(new Array(8).fill(false))
    expect(sliced.key[0]).toBeGreaterThan(230)
    expect([...sliced.mapping].sort()).toEqual([0, 1, 2, 3])
    expect(agreement(sliced.cells, cells)).toBeGreaterThan(0.99)
    for (const cell of sliced.cells) for (const v of cell) expect(v).toBeLessThanOrEqual(TRANSPARENT)
  })

  it('leaves no magenta fringe and no holes', () => {
    const cells = truth(MOON_MINER)
    const image = generatedLike(cells, MOON_MINER.palette, { cols: 4, cellW: 256, cellH: 256, blur: 4, noise: 8, shift: 18, seed: 3 })
    const sliced = sliceSheet(image, MOON_MINER.palette)
    let stray = 0
    let holes = 0
    sliced.cells.forEach((cell, i) => {
      for (let p = 0; p < cell.length; p++) {
        const want = (cells[i] as Uint8Array)[p]
        if (want === TRANSPARENT && cell[p] !== TRANSPARENT) stray++
        if (want !== TRANSPARENT && cell[p] === TRANSPARENT) holes++
      }
    })
    expect(stray).toBeLessThanOrEqual(4)
    expect(holes).toBeLessThanOrEqual(4)
    // Tiles and the backdrop are solid edge to edge.
    for (const i of [5, 6, 7]) expect((sliced.cells[i] as Uint8Array).includes(TRANSPARENT)).toBe(false)
  })

  it('handles a 3:2 sheet, where cells are not square', () => {
    const cells = truth(GEM_VAULT)
    const image = generatedLike(cells, GEM_VAULT.palette, { cols: 4, cellW: 192, cellH: 256, blur: 3, seed: 5 })
    expect(image.width / image.height).toBeCloseTo(1.5)
    const sliced = sliceSheet(image, GEM_VAULT.palette)
    expect(agreement(sliced.cells.slice(0, 5), cells.slice(0, 5))).toBeGreaterThan(0.98)
  })

  it('zooms in on a small drawing lost in a big cell', () => {
    const cells = truth()
    const image = generatedLike(cells, LILY_PAD_DASH.palette, { cols: 4, cellW: 256, cellH: 256, drawn: 96, blur: 2 })
    const sliced = sliceSheet(image, LILY_PAD_DASH.palette)
    const player = sliced.cells[0] as Uint8Array
    const columns = new Set<number>()
    player.forEach((v, p) => {
      if (v !== TRANSPARENT) columns.add(p % TILE)
    })
    expect(columns.size).toBeGreaterThanOrEqual(13)
    expect(sliced.empty[0]).toBe(false)
  })

  it('flags an empty cell instead of inventing a sprite', () => {
    const cells = truth()
    cells[2] = new Uint8Array(TILE * TILE).fill(TRANSPARENT)
    const sliced = sliceSheet(generatedLike(cells, LILY_PAD_DASH.palette, { cols: 4, cellW: 128, cellH: 128 }), LILY_PAD_DASH.palette)
    expect(sliced.empty[2]).toBe(true)
    expect(sliced.empty.filter(Boolean).length).toBe(1)
  })

  it('gives back the built-in sheets exactly when they are read from their PNG files', async () => {
    const sheetFile = resolveAsset('sprites/default-sheet.png')
    const iconFile = resolveAsset('sprites/icons.png')
    expect(sheetFile).toMatch(/assets\/interim\/sprites\/default-sheet\.png$/)
    expect(iconFile).not.toBeNull()
    const sheet = sliceSheet(await decodeImage(readFileSync(sheetFile as string)), REFERENCE_PALETTE, GENERATED_LAYOUT)
    const defaults = defaultCells()
    GENERATED_CELLS.forEach((name, i) => expect((sheet.cells[i] as Uint8Array).join(''), name).toBe(defaults[name].join('')))
    const icons = sliceSheet(await decodeImage(readFileSync(iconFile as string)), REFERENCE_PALETTE, ICON_LAYOUT)
    ICON_ORDER.forEach((icon, i) => expect((icons.cells[i] as Uint8Array).join(''), icon).toBe(iconCell(icon).join('')))
    // And the files on disk are what the code would draw today.
    const same = async (file: string, drawn: RGBAImage) => Buffer.from((await decodeImage(readFileSync(file))).data).equals(Buffer.from(drawn.data))
    expect(await same(sheetFile as string, defaultSheetImage(16))).toBe(true)
    expect(await same(iconFile as string, iconSheetImage(16))).toBe(true)
  })
})

describe('design-time art on disk', () => {
  it('prefers a delivered file over the interim one, file by file', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cartridge-art-'))
    mkdirSync(path.join(root, 'assets', 'interim', 'sprites'), { recursive: true })
    mkdirSync(path.join(root, 'assets', 'generated', 'sprites'), { recursive: true })
    writeFileSync(path.join(root, 'assets', 'interim', 'sprites', 'default-sheet.png'), await toPng(defaultSheetImage(4)))
    writeFileSync(path.join(root, 'assets', 'interim', 'sprites', 'icons.png'), await toPng(iconSheetImage(4)))
    const before = await loadArt(root)
    expect([...before.defaults.player]).toEqual([...defaultCells().player])

    // "Deliver" a different default sheet: the moon miner's cast, soft edges and all.
    const delivered = generatedLike(truth(MOON_MINER), REFERENCE_PALETTE, { cols: 4, cellW: 128, cellH: 128, blur: 2 })
    writeFileSync(path.join(root, 'assets', 'generated', 'sprites', 'default-sheet.png'), await toPng(delivered))
    expect(resolveAsset('sprites/default-sheet.png', root)).toContain('generated')
    expect(resolveAsset('sprites/icons.png', root)).toContain('interim')
    const after = await loadArt(root)
    expect([...after.defaults.player]).not.toEqual([...before.defaults.player])
    expect(agreement([after.defaults.player], [synthCells(MOON_MINER).player])).toBeGreaterThan(0.98)
    expect([...(after.icons.coin as Uint8Array)]).toEqual([...iconCell('coin')])
  })

  it('falls back to the drawings in code when no file exists at all', async () => {
    const art = await loadArt(mkdtempSync(path.join(tmpdir(), 'cartridge-none-')))
    expect([...art.defaults.goal]).toEqual([...defaultCells().goal])
    expect(Object.keys(art.icons).sort()).toEqual([...ICON_ORDER].sort())
  })
})

describe('the built-in artist', () => {
  it('draws the same sheet for the same manifest and a different one for a different cart', () => {
    const a = composeSheet(synthCells(LILY_PAD_DASH))
    expect([...composeSheet(synthCells(LILY_PAD_DASH))]).toEqual([...a])
    expect([...composeSheet(synthCells(MOON_MINER))]).not.toEqual([...a])
    expect(a.length).toBe(SHEET_W * SHEET_H)
  })

  it('gives fifty carts close to fifty different sheets', () => {
    const sheets = new Set(PROMPTS_50.map((prompt) => composeSheet(synthCells(composeManifest(prompt))).join('')))
    expect(sheets.size).toBeGreaterThanOrEqual(48)
    const heroes = new Set(PROMPTS_50.map((prompt) => synthCells(composeManifest(prompt)).player.join('')))
    expect(heroes.size).toBeGreaterThanOrEqual(30)
  })

  it('keeps sprites cut out and tiles solid, and outlines every character', () => {
    for (const manifest of [LILY_PAD_DASH, MOON_MINER, GEM_VAULT]) {
      const cells = synthCells(manifest)
      for (const name of CELLS) for (const v of cells[name]) expect(v).toBeLessThanOrEqual(TRANSPARENT)
      for (const name of ['tileA', 'tileB', 'background'] as const) expect(cells[name].includes(TRANSPARENT)).toBe(false)
      for (const name of ['player', 'enemy1', 'enemy2', 'enemy3', 'goal'] as const) {
        expect(cells[name].includes(TRANSPARENT)).toBe(true)
        expect(cells[name].includes(3)).toBe(true)
      }
    }
  })

  it('draws light on dark for worlds that are dark', () => {
    expect(isDarkWorld(MOON_MINER)).toBe(true)
    expect(isDarkWorld(LILY_PAD_DASH)).toBe(false)
    expect(isDarkWorld(composeManifest('a knight climbing a tower'))).toBe(false)
    expect(synthCells(MOON_MINER).background[0]).toBe(3)
    expect(synthCells(LILY_PAD_DASH).background.filter((v) => v === 0).length).toBeGreaterThan(128)
  })
})

describe('the sprite adapter', () => {
  const good: SpriteProvider & { calls: string[] } = {
    name: 'fake',
    calls: [],
    async generate(prompt) {
      this.calls.push(prompt)
      return generatedLike(truth(MOON_MINER), LILY_PAD_DASH.palette, { cols: 4, cellW: 128, cellH: 128, blur: 2 })
    },
  }

  it('uses the built-in artist when no provider is configured', async () => {
    const result = await buildSheet(LILY_PAD_DASH)
    expect(result).toMatchObject({ source: 'synth', borrowed: [] })
    expect([...unpackSheet(result.sheet)]).toEqual([...composeSheet(synthCells(LILY_PAD_DASH))])
    expect(providerFromEnv({} as NodeJS.ProcessEnv)).toBeNull()
  })

  it('asks the provider once per prompt and caches the sheet by prompt hash', async () => {
    const cache = new MemoryKV()
    const first = await buildSheet(LILY_PAD_DASH, { provider: good, cache })
    expect(first.source).toBe('provider')
    expect(good.calls[0]).toBe(spritePrompt(LILY_PAD_DASH))
    const second = await buildSheet(LILY_PAD_DASH, { provider: good, cache })
    expect(second.source).toBe('cache')
    expect(second.sheet).toEqual(first.sheet)
    expect(good.calls.length).toBe(1)
    expect(await cache.get(await sheetCacheKey(spritePrompt(LILY_PAD_DASH)))).not.toBeNull()
    expect(await sheetCacheKey('a')).not.toBe(await sheetCacheKey('b'))

    const other = await buildSheet(GEM_VAULT, { provider: good, cache })
    expect(other.source).toBe('provider')
    expect(good.calls.length).toBe(2)
    // The provider's art was used, with the cart's own item and hazard icons added.
    const { cells } = cellsFromImage(await good.generate('x'), LILY_PAD_DASH)
    expect(agreement([cells.player], [synthCells(MOON_MINER).player])).toBeGreaterThan(0.98)
    expect([...cells.item]).toEqual([...iconCell(LILY_PAD_DASH.art.item)])
  })

  it('falls back to the built-in artist when the provider fails, and says why', async () => {
    const broken: SpriteProvider = { name: 'fake', generate: async () => Promise.reject(new Error('402 out of credit')) }
    const result = await buildSheet(LILY_PAD_DASH, { provider: broken, cache: new MemoryKV() })
    expect(result.source).toBe('synth')
    expect(result.note).toMatch(/fake failed: 402 out of credit/)
    expect([...unpackSheet(result.sheet)]).toEqual([...composeSheet(synthCells(LILY_PAD_DASH))])
  })

  it('treats a blank picture as a failure', async () => {
    const blank: SpriteProvider = { name: 'fake', generate: async () => flat(256, 128, [255, 0, 255]) }
    const result = await buildSheet(LILY_PAD_DASH, { provider: blank })
    expect(result.source).toBe('synth')
    expect(result.note).toMatch(/nothing in it/)
  })

  it('fills a single missing cell from the default set and keeps the rest', async () => {
    const cells = truth(MOON_MINER)
    cells[3] = new Uint8Array(TILE * TILE).fill(TRANSPARENT)
    const patchy: SpriteProvider = { name: 'fake', generate: async () => generatedLike(cells, LILY_PAD_DASH.palette, { cols: 4, cellW: 128, cellH: 128 }) }
    const result = await buildSheet(LILY_PAD_DASH, { provider: patchy })
    expect(result.source).toBe('provider')
    expect(result.borrowed).toEqual(['enemy3'])
    const sheet = unpackSheet(result.sheet)
    const cellAt = (index: number) => Array.from({ length: TILE * TILE }, (_, p) => sheet[(Math.floor(index / 4) * TILE + Math.floor(p / TILE)) * SHEET_W + (index % 4) * TILE + (p % TILE)] as number)
    expect(cellAt(3)).toEqual([...defaultCells().enemy3])
  })

  it('writes one prompt per cart that states the style bible, the palette and all eight cells', () => {
    const prompt = spritePrompt(LILY_PAD_DASH)
    for (const part of ['#FF00FF', '4 columns and 2 rows', 'no anti-aliasing', 'Game Boy', 'green frog', 'red car', 'delivery truck', 'fast racing car', 'lily pad', 'hedge bush', 'grass verge', 'asphalt road', ...LILY_PAD_DASH.palette]) {
      expect(prompt, part).toContain(part)
    }
    expect(spritePrompt(MOON_MINER)).not.toBe(prompt)
  })

  it('speaks the images protocol to a real endpoint (stub fetch, never the network)', async () => {
    const png = await toPng(generatedLike(truth(), LILY_PAD_DASH.palette, { cols: 4, cellW: 64, cellH: 64, blur: 1 }))
    const seen: { url: string; init: RequestInit }[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 })
    }) as unknown as typeof fetch
    const provider = new HttpImageProvider({ url: 'https://images.example/v1/images/generations', key: 'test-key', model: 'some-model', size: '1536x1024', fetcher })
    const image = await provider.generate('a sheet')
    expect([image.width, image.height]).toEqual([256, 128])
    expect(seen[0]?.url).toBe('https://images.example/v1/images/generations')
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({ model: 'some-model', prompt: 'a sheet', size: '1536x1024', n: 1 })
    expect((seen[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer test-key')

    const failing = new HttpImageProvider({ url: 'https://images.example', key: 'k', model: 'm', size: '1024x1024', fetcher: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch })
    await expect(failing.generate('x')).rejects.toThrow(/500/)
    expect(providerFromEnv({ SPRITE_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv)?.name).toBe('image-api')
  })

  it('keeps a whole cart, sprites included, well under 20 KB', async () => {
    for (const prompt of PROMPTS_50.slice(0, 12)) {
      const manifest = composeManifest(prompt)
      const { sheet } = await buildSheet(manifest)
      expect(manifestBytes(manifest) + JSON.stringify(sheet).length).toBeLessThan(6000)
      expect(sheet).toMatchObject({ w: SHEET_W, h: SHEET_H })
    }
  })
})
