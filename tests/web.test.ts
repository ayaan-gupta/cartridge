import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { replay } from '@/bot/bot'
import { validateManifest } from '@/cart/schema'
import { noteFrequency, parseDrums, parseTrack, TUNES } from '@/engine/audio'
import { paletteWords } from '@/engine/runner'
import { MUSIC } from '@/engine/types'
import { OfflineGenerator } from '@/gen/offline'
import { PROMPTS_50 } from '@/gen/prompts50'
import { integerScale, screenScale } from '@/lib/scale'
import type { CartFile } from '@/lib/service'
import { CartService, cleanPrompt, generatorFromEnv, InputError, RECENT_LIMIT, toCartFile } from '@/lib/service'
import type { KV } from '@/store/kv'
import { FileKV, kvFromEnv, MemoryKV, RestKV } from '@/store/kv'
import { room } from './helpers'

function service(kv: KV = new MemoryKV(), start = Date.UTC(2026, 0, 1)) {
  let tick = 0
  return new CartService({ kv, generator: new OfflineGenerator(), provider: null, art: async () => undefined, now: () => new Date(start + tick++ * 1000) })
}

describe('the key-value store', () => {
  const stores: [string, () => KV][] = [
    ['memory', () => new MemoryKV()],
    ['file', () => new FileKV(mkdtempSync(path.join(tmpdir(), 'cartridge-kv-')))],
  ]
  for (const [name, make] of stores) {
    it(`${name}: stores, overwrites and deletes JSON values`, async () => {
      const kv = make()
      expect(await kv.get('missing')).toBeNull()
      await kv.set('cart-abc', { title: 'A', rows: ['#.#'] })
      expect(await kv.get('cart-abc')).toEqual({ title: 'A', rows: ['#.#'] })
      await kv.set('cart-abc', [1, 2, 3])
      expect(await kv.get('cart-abc')).toEqual([1, 2, 3])
      await kv.delete('cart-abc')
      expect(await kv.get('cart-abc')).toBeNull()
    })
  }

  it('file: survives a restart and keeps hostile keys inside its folder', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cartridge-kv-'))
    await new FileKV(dir).set('../../escape', { ok: true })
    await new FileKV(dir).set('recent', ['x'])
    expect(await new FileKV(dir).get('../../escape')).toEqual({ ok: true })
    expect(await new FileKV(dir).get('recent')).toEqual(['x'])
    const files = readdirSync(dir)
    expect(files.length).toBe(2)
    expect(files.every((f) => f.endsWith('.json') && !f.includes('/'))).toBe(true)
  })

  it('picks the file store by default and the hosted one when it is configured', () => {
    expect(kvFromEnv({} as NodeJS.ProcessEnv).name).toBe('file')
    expect(kvFromEnv({ KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' } as unknown as NodeJS.ProcessEnv).name).toBe('rest')
  })

  it('rest: sends Redis commands over HTTP (stub fetch, never the network)', async () => {
    const sent: unknown[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      const command = JSON.parse(String(init.body)) as string[]
      sent.push({ url, auth: (init.headers as Record<string, string>).authorization, command })
      return new Response(JSON.stringify({ result: command[0] === 'GET' ? JSON.stringify({ a: 1 }) : 'OK' }))
    }) as unknown as typeof fetch
    const kv = new RestKV('https://kv.example/', 'secret', fetcher)
    await kv.set('k', { a: 1 })
    expect(await kv.get('k')).toEqual({ a: 1 })
    await kv.delete('k')
    expect(sent).toEqual([
      { url: 'https://kv.example', auth: 'Bearer secret', command: ['SET', 'k', '{"a":1}'] },
      { url: 'https://kv.example', auth: 'Bearer secret', command: ['GET', 'k'] },
      { url: 'https://kv.example', auth: 'Bearer secret', command: ['DEL', 'k'] },
    ])
  })
})

describe('the cart service', () => {
  it('starts a new shelf with the three hand-written carts', async () => {
    const recent = await service().recent()
    expect(recent.map((c) => c.title)).toEqual(['LILY PAD DASH', 'MOON MINER', 'GEM VAULT'])
  })

  it('makes a cart, stores it and gives it a short stable id', async () => {
    const carts = service()
    const record = await carts.create('  a frog   dodging cars to reach a lily pad ')
    expect(record.id).toMatch(/^[0-9a-z]{8}$/)
    expect(record.prompt).toBe('a frog dodging cars to reach a lily pad')
    expect(record.createdAt).toMatch(/^2026-01-01T/)
    expect(await carts.get(record.id)).toEqual(record)
    expect(validateManifest(record.manifest).ok).toBe(true)
    expect(replay(record.manifest, record.tape).state).toBe('won')
    expect(record.art).toMatchObject({ source: 'synth', borrowed: [] })
    expect(await carts.get('nope')).toBeNull()
    expect(await carts.get('../recent')).toBeNull()
  })

  it('gives the same prompt the same link and does not list it twice', async () => {
    const carts = service()
    const first = await carts.create('a knight climbing a tower')
    await carts.create('a bee collecting honey')
    const again = await carts.create('A knight climbing a tower')
    expect(again.id).toBe(first.id)
    expect(again.createdAt).toBe(first.createdAt)
    const recent = await carts.recent()
    expect(recent.filter((c) => c.id === first.id).length).toBe(1)
    // Making it again brings it back to the front.
    expect(recent[0]?.id).toBe(first.id)
    expect(recent.length).toBe(5)
  })

  it('keeps the last fifty on the shelf, and older carts still open by link', async () => {
    const carts = service()
    const made: string[] = []
    for (const prompt of PROMPTS_50) made.push((await carts.create(prompt)).id)
    for (const prompt of ['a snail racing a slug', 'an owl delivering letters at night', 'a robot vacuum escaping a cat']) made.push((await carts.create(prompt)).id)
    const recent = await carts.recent()
    expect(recent.length).toBe(RECENT_LIMIT)
    expect(recent[0]?.id).toBe(made[made.length - 1])
    expect(recent.map((c) => c.id)).toEqual(made.slice(-RECENT_LIMIT).reverse())
    expect(recent.some((c) => c.title === 'LILY PAD DASH')).toBe(false)
    const oldest = await carts.get(made[0] as string)
    expect(oldest?.manifest.title).toMatch(/^FROG /)
  })

  it('does not lose entries when carts are made at the same moment', async () => {
    const carts = service()
    const prompts = PROMPTS_50.slice(0, 12)
    const records = await Promise.all(prompts.map((prompt) => carts.create(prompt)))
    const recent = await carts.recent()
    for (const record of records) expect(recent.some((c) => c.id === record.id)).toBe(true)
    expect(recent.length).toBe(15)
  })

  it('persists through the file store across restarts', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cartridge-shelf-'))
    const record = await service(new FileKV(dir)).create('a mole digging through a cave collecting crystals')
    const later = service(new FileKV(dir))
    expect((await later.get(record.id))?.manifest).toEqual(record.manifest)
    expect((await later.recent())[0]?.id).toBe(record.id)
    expect((await later.recent()).length).toBe(4)
  })

  it('refuses prompts that are empty, enormous or not text', () => {
    expect(cleanPrompt('  a  cat ')).toBe('a cat')
    for (const bad of ['', '  ', 'a', 'x'.repeat(201), null, 42, { prompt: 'x' }]) expect(() => cleanPrompt(bad)).toThrow(InputError)
  })

  it('uses the offline generator unless a key or an explicit choice says otherwise', () => {
    expect(generatorFromEnv({} as NodeJS.ProcessEnv).name).toBe('offline')
    expect(generatorFromEnv({ CARTRIDGE_GENERATOR: 'offline', ANTHROPIC_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv).name).toBe('offline')
    expect(generatorFromEnv({ ANTHROPIC_API_KEY: 'test-key' } as unknown as NodeJS.ProcessEnv).name).toBe('anthropic')
  })
})

describe('the .cart file', () => {
  it('is one small JSON document that another shelf can import', async () => {
    const record = await service().create('a pirate running across the deck dodging crabs to reach the treasure')
    const file = toCartFile(record)
    const text = JSON.stringify(file)
    expect(text.length).toBeLessThan(20000)
    expect(file).toMatchObject({ format: 'cartridge', version: 1, meta: { generator: 'offline' } })

    const other = service()
    const imported = await other.importCart(JSON.parse(text))
    expect(imported.id).toBe(record.id)
    expect(imported.manifest).toEqual(record.manifest)
    expect(imported.report.generator).toBe('file')
    expect((await other.recent())[0]?.id).toBe(record.id)
  })

  it('does not trust what is in the file', async () => {
    const carts = service()
    const record = await carts.create('a kid running from zombies in a graveyard to reach the gate')
    const file = toCartFile(record)

    await expect(carts.importCart({ hello: 'world' })).rejects.toThrow(/not a .cart file/)
    await expect(carts.importCart('cart')).rejects.toThrow(InputError)
    await expect(carts.importCart({ ...file, manifest: { ...file.manifest, script: 'boom' } })).rejects.toThrow(/not valid/)

    // A recording that does not win is ignored and the bot plays instead.
    const lying = await carts.importCart({ ...file, tape: [0, 10] })
    expect(replay(lying.manifest, lying.tape).state).toBe('won')
    expect(lying.report.botExpansions).toBeGreaterThan(0)

    // A broken sheet is redrawn rather than rendered as noise.
    const blank = await carts.importCart({ ...file, sheet: { w: 4, h: 4, px: '!!', mask: '' } })
    expect(blank.art.source).toBe('synth')
    expect(blank.sheet).toEqual(record.sheet)

    // A cart that cannot be won never reaches the shelf.
    const sealed: CartFile = { ...file, tape: [], manifest: room([], { map: { w: 10, h: 8, rows: ['##########', '#........#', '#........#', '#........#', '#.....####', '#.....#..#', '#.....#..#', '##########'], tileB: 'solid' } }) }
    await expect(carts.importCart(sealed)).rejects.toThrow(/cannot be won/)
    expect((await carts.recent()).some((c) => c.title === 'TEST ROOM')).toBe(false)
  })
})

describe('the HTTP routes', () => {
  type Handler = (request: Request, context: { params: Promise<Record<string, unknown>> }) => Promise<Response>
  type RouteModule = { GET?: Handler; POST?: Handler }
  const routes: Record<string, RouteModule> = {}
  const call = (name: string, method: 'GET' | 'POST', params: Record<string, unknown> = {}, init: RequestInit = {}, query = '') =>
    (routes[name]?.[method] as Handler)(new Request(`http://localhost:4103/${query}`, { method, ...init }), { params: Promise.resolve(params) })

  beforeAll(async () => {
    process.env.CARTRIDGE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'cartridge-http-'))
    delete process.env.ANTHROPIC_API_KEY
    routes.carts = (await import('@/app/api/carts/route')) as unknown as RouteModule
    routes.cart = (await import('@/app/api/carts/[id]/route')) as unknown as RouteModule
    routes.download = (await import('@/app/api/carts/[id]/download/route')) as unknown as RouteModule
    routes.label = (await import('@/app/api/carts/[id]/label/route')) as unknown as RouteModule
    routes.import = (await import('@/app/api/carts/import/route')) as unknown as RouteModule
    routes.art = (await import('@/app/art/[...path]/route')) as unknown as RouteModule
  })

  const post = (prompt: unknown) => call('carts', 'POST', {}, { body: JSON.stringify({ prompt }), headers: { 'content-type': 'application/json' } })

  it('makes a cart and serves it back by id', async () => {
    const made = await post('a frog dodging cars to reach a lily pad')
    expect(made.status).toBe(201)
    const { id, url, title } = (await made.json()) as { id: string; url: string; title: string }
    expect(url).toBe(`/c/${id}`)
    expect(title).toMatch(/^FROG /)

    const fetched = await call('cart', 'GET', { id })
    expect(fetched.status).toBe(200)
    expect(fetched.headers.get('cache-control')).toContain('immutable')
    expect(((await fetched.json()) as { manifest: { title: string } }).manifest.title).toBe(title)

    const list = (await (await call('carts', 'GET')).json()) as { carts: { id: string }[] }
    expect(list.carts[0]?.id).toBe(id)
    expect(list.carts.length).toBe(4)
  })

  it('answers bad input with a 400 and a sentence, and unknown ids with a 404', async () => {
    for (const bad of ['', 'x'.repeat(500), 7]) {
      const response = await post(bad)
      expect(response.status).toBe(400)
      expect(((await response.json()) as { error: string }).error.length).toBeGreaterThan(10)
    }
    expect((await call('carts', 'POST', {}, { body: 'not json' })).status).toBe(400)
    for (const name of ['cart', 'download', 'label']) expect((await call(name, 'GET', { id: 'zzzzzzzz' })).status).toBe(404)
    expect((await call('cart', 'GET', { id: '../../etc/passwd' })).status).toBe(404)
  })

  it('downloads a .cart file that imports back to the same cart', async () => {
    const { id } = (await (await post('a mouse sneaking through a maze to find the cheese past the cats')).json()) as { id: string }
    const download = await call('download', 'GET', { id })
    expect(download.headers.get('content-disposition')).toMatch(/^attachment; filename="mouse-[a-z]+\.cart"$/)
    const text = await download.text()
    expect(text.length).toBeLessThan(20000)
    expect(JSON.parse(text)).toMatchObject({ format: 'cartridge', version: 1 })

    const imported = await call('import', 'POST', {}, { body: text })
    expect(imported.status).toBe(201)
    expect(((await imported.json()) as { id: string }).id).toBe(id)
    expect((await call('import', 'POST', {}, { body: '{"format":"zip"}' })).status).toBe(400)
    expect((await call('import', 'POST', {}, { body: 'x'.repeat(70000) })).status).toBe(400)
  })

  it('draws a label: the opening frame as a PNG at a whole-number scale', async () => {
    const { id } = (await (await post('a knight climbing a tower full of goblins')).json()) as { id: string }
    const label = await call('label', 'GET', { id })
    expect(label.headers.get('content-type')).toBe('image/png')
    const meta = await sharp(Buffer.from(await label.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([320, 288])
    const big = await call('label', 'GET', { id }, {}, '?scale=4')
    expect((await sharp(Buffer.from(await big.arrayBuffer())).metadata()).width).toBe(640)
    const silly = await call('label', 'GET', { id }, {}, '?scale=2.5')
    expect((await sharp(Buffer.from(await silly.arrayBuffer())).metadata()).width).toBe(320)
  })

  it('serves design-time art, and nothing else, from the assets folders', async () => {
    const logo = await call('art', 'GET', { path: ['logo.png'] })
    expect(logo.status).toBe(200)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect(logo.headers.get('x-cartridge-art')).toBe('interim')
    expect((await call('art', 'GET', { path: ['shell', 'dpad.png'] })).status).toBe(200)
    for (const bad of [['..', 'package.json'], ['..', '..', 'LICENSE'], ['logo.svg'], ['missing.png'], ['shell', '..', '..', 'prompts.md']]) expect((await call('art', 'GET', { path: bad })).status).toBe(404)
  })
})

describe('the handheld', () => {
  it('scales the screen by whole numbers only', () => {
    expect(integerScale(320, 600)).toBe(2)
    expect(integerScale(319, 600)).toBe(1)
    expect(integerScale(354, 514)).toBe(2)
    expect(integerScale(1200, 500)).toBe(3)
    expect(integerScale(2000, 2000)).toBe(4)
    expect(integerScale(2000, 2000, 2)).toBe(2)
    expect(integerScale(100, 100)).toBe(1)
  })

  it('picks a scale from the window, not from its own container', () => {
    // Phones: edge to edge at twice size from 356px up, including the common 360 and 390.
    expect(screenScale(360, 780)).toBe(2)
    expect(screenScale(390, 844)).toBe(2)
    expect(screenScale(430, 932)).toBe(2)
    expect(screenScale(320, 568)).toBe(1)
    // A phone on its side has the width but not the height.
    expect(screenScale(844, 390)).toBe(1)
    // Tablets and laptops.
    expect(screenScale(768, 1024)).toBe(4)
    expect(screenScale(1280, 720)).toBe(2)
    expect(screenScale(1280, 860)).toBe(3)
    expect(screenScale(1920, 1080)).toBe(3)
    expect(screenScale(1920, 1080, 2)).toBe(2)
  })

  it('packs palette colours in the byte order a canvas wants', () => {
    const words = paletteWords(['#ff8000', '#000000', '#102030', '#ffffff'])
    const bytes = new Uint8Array(words.buffer)
    expect([...bytes.slice(0, 4)]).toEqual([255, 128, 0, 255])
    expect([...bytes.slice(8, 12)]).toEqual([16, 32, 48, 255])
  })
})

describe('the four chiptune loops', () => {
  it('has one tune per music id, each eight bars of eighth notes on every channel', () => {
    expect(Object.keys(TUNES).sort()).toEqual([...MUSIC].sort())
    for (const id of MUSIC) {
      const tune = TUNES[id]
      for (const track of [tune.lead, tune.harmony, tune.bass]) expect(parseTrack(track).steps, id).toBe(64)
      expect(parseDrums(tune.drums).length).toBe(64)
      expect(tune.bpm).toBeGreaterThan(60)
    }
  })

  it('parses every token into a note in a sensible range, or a rest', () => {
    for (const id of MUSIC) {
      const tune = TUNES[id]
      for (const track of [tune.lead, tune.harmony, tune.bass]) {
        for (const token of track.split(/\s+/)) if (!['|', '.', '-', ''].includes(token)) expect(noteFrequency(token), `${id} ${token}`).toBeGreaterThan(60)
        for (const note of parseTrack(track).notes) {
          expect(note.frequency).toBeLessThan(2200)
          expect(note.length).toBeGreaterThanOrEqual(1)
          expect(note.step + note.length).toBeLessThanOrEqual(64)
        }
      }
      expect(parseTrack(tune.lead).notes.length).toBeGreaterThanOrEqual(16)
      for (const hit of parseDrums(tune.drums)) expect(['k', 's', 'h', '.']).toContain(hit)
    }
  })

  it('tunes are distinct, and held notes are one long note, not several', () => {
    expect(new Set(MUSIC.map((id) => TUNES[id].lead)).size).toBe(4)
    expect(parseTrack('C4 - - . E4 .').notes).toEqual([
      { step: 0, length: 3, frequency: noteFrequency('C4') },
      { step: 4, length: 1, frequency: noteFrequency('E4') },
    ])
    expect(noteFrequency('A4')).toBe(440)
    expect(noteFrequency('C5')).toBeCloseTo(523.25, 1)
    expect(noteFrequency('H9')).toBe(0)
  })
})
