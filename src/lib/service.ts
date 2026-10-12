/**
 * Everything the web layer needs, behind one object: make a cart from a
 * prompt, fetch one by id, list the recent ones, import a .cart file. The
 * store, the generator, the image provider and the clock are all passed in,
 * so tests run it against memory with a fixed time.
 */
import { replay, solve } from '@/bot/bot'
import { validateManifest } from '@/cart/schema'
import { TEMPLATES } from '@/cart/templates'
import { unpackSheet } from '@/engine/sheet'
import type { CellName, Manifest, Sheet, Tape } from '@/engine/types'
import { SHEET_H, SHEET_W } from '@/engine/types'
import { AnthropicGenerator } from '@/gen/anthropic'
import { OfflineGenerator } from '@/gen/offline'
import type { CartReport } from '@/gen/pipeline'
import { generateManifest } from '@/gen/pipeline'
import type { ManifestGenerator } from '@/gen/types'
import { loadArt } from '@/sprites/assets'
import { providerFromEnv } from '@/sprites/provider'
import type { ArtAssets, SheetResult, SpriteProvider } from '@/sprites/sheet'
import { buildSheet } from '@/sprites/sheet'
import type { KV } from '@/store/kv'
import { kvFromEnv } from '@/store/kv'

export const RECENT_LIMIT = 50
export const PROMPT_LIMIT = 200

export interface CartRecord {
  id: string
  prompt: string
  createdAt: string
  manifest: Manifest
  sheet: Sheet
  /** The bot's winning run, which doubles as the proof that the cart can be won. */
  tape: Tape
  report: CartReport
  art: { source: SheetResult['source'] | 'file'; note?: string; borrowed: CellName[] }
}

export interface CartSummary {
  id: string
  title: string
  blurb: string
  view: Manifest['view']
  palette: Manifest['palette']
  createdAt: string
}

/** What a downloaded .cart file contains. */
export interface CartFile {
  format: 'cartridge'
  version: 1
  manifest: Manifest
  sheet: Sheet
  tape: Tape
  meta: { prompt: string; createdAt: string; generator: string }
}

/** A problem with what the caller sent, as opposed to a fault on our side. */
export class InputError extends Error {}

export function cleanPrompt(raw: unknown): string {
  if (typeof raw !== 'string') throw new InputError('Describe the game in a sentence.')
  const prompt = raw.replace(/\s+/g, ' ').trim()
  if (prompt.length < 3) throw new InputError('Describe the game in a sentence.')
  if (prompt.length > PROMPT_LIMIT) throw new InputError(`Keep it to one sentence, ${PROMPT_LIMIT} characters at most.`)
  return prompt
}

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Eight characters from a hash of the cart, so the same cart always gets the same link. */
export async function cartId(manifest: Manifest, sheet: Sheet): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([manifest, sheet]))))
  let id = ''
  for (let i = 0; i < 8; i++) id += ALPHABET[(bytes[i] as number) & 31]
  return id
}

export function toCartFile(record: CartRecord): CartFile {
  return {
    format: 'cartridge',
    version: 1,
    manifest: record.manifest,
    sheet: record.sheet,
    tape: record.tape,
    meta: { prompt: record.prompt, createdAt: record.createdAt, generator: record.report.generator },
  }
}

function sheetLooksRight(sheet: unknown): sheet is Sheet {
  if (typeof sheet !== 'object' || sheet === null) return false
  const s = sheet as Partial<Sheet>
  if (s.w !== SHEET_W || s.h !== SHEET_H || typeof s.px !== 'string' || typeof s.mask !== 'string') return false
  try {
    return unpackSheet(s as Sheet).length === SHEET_W * SHEET_H && s.px.length < 2000 && s.mask.length < 1000
  } catch {
    return false
  }
}

export interface ServiceDeps {
  kv: KV
  generator: ManifestGenerator
  provider: SpriteProvider | null
  art: () => Promise<ArtAssets | undefined>
  now: () => Date
}

export class CartService {
  private queue: Promise<unknown> = Promise.resolve()
  private seeded: Promise<void> | null = null

  constructor(private readonly deps: ServiceDeps) {}

  get generatorName(): string {
    return this.deps.generator.name
  }

  async create(rawPrompt: unknown): Promise<CartRecord> {
    const prompt = cleanPrompt(rawPrompt)
    await this.seed()
    const { manifest, tape, report } = await generateManifest(prompt, this.deps.generator)
    const art = await buildSheet(manifest, { provider: this.deps.provider, cache: this.deps.kv, assets: await this.deps.art() })
    return this.save({ prompt, manifest, sheet: art.sheet, tape, report, art: { source: art.source, note: art.note, borrowed: art.borrowed } })
  }

  /**
   * Accepts a .cart file from anywhere, which means trusting none of it. The
   * manifest is validated, the sheet is checked or redrawn, and the cart is
   * only stored if it can be won: by its own recording, or by the bot.
   */
  async importCart(file: unknown): Promise<CartRecord> {
    const loose = (typeof file === 'object' && file !== null ? file : {}) as Record<string, unknown>
    if (loose.format !== 'cartridge') throw new InputError('That is not a .cart file.')
    await this.seed()
    const checked = validateManifest(loose.manifest)
    if (!checked.ok) throw new InputError(`That cart is not valid: ${checked.issues.slice(0, 3).join('; ')}`)
    const manifest = checked.manifest
    const given = loose.tape
    let tape: Tape | null = null
    if (Array.isArray(given) && given.length <= 4000 && given.every((n) => Number.isInteger(n) && n >= 0 && n < 100000)) {
      const run = replay(manifest, given as Tape)
      if (run.state === 'won') tape = given as Tape
    }
    const report: CartReport = { generator: 'file', firstTryValid: true, repaired: false, fellBack: false, issues: [], eased: 0, replaced: 'no', botFrames: 0, botExpansions: 0, attempts: 1 }
    if (!tape) {
      const result = solve(manifest)
      if (!result.won) throw new InputError('That cart cannot be won, so it was not added.')
      tape = result.tape
      report.botExpansions = result.expanded
    }
    report.botFrames = replay(manifest, tape).frames
    const drawn = sheetLooksRight(loose.sheet)
    const sheet = drawn ? (loose.sheet as Sheet) : (await buildSheet(manifest, { assets: await this.deps.art() })).sheet
    const meta = (typeof loose.meta === 'object' && loose.meta !== null ? loose.meta : {}) as Record<string, unknown>
    const prompt = typeof meta.prompt === 'string' ? meta.prompt.slice(0, PROMPT_LIMIT) : manifest.blurb
    return this.save({ prompt, manifest, sheet, tape, report, art: { source: drawn ? 'file' : 'synth', borrowed: [] } })
  }

  private async save(parts: Omit<CartRecord, 'id' | 'createdAt'>): Promise<CartRecord> {
    const id = await cartId(parts.manifest, parts.sheet)
    const existing = await this.deps.kv.get<CartRecord>(`cart-${id}`)
    const record: CartRecord = existing ?? { id, createdAt: this.deps.now().toISOString(), ...parts }
    if (!existing) await this.deps.kv.set(`cart-${id}`, record)
    await this.remember(record)
    return record
  }

  /** Moves a cart to the front of the gallery. One writer at a time, so two requests cannot lose each other's entry. */
  private remember(record: CartRecord): Promise<void> {
    const task = this.queue.then(async () => {
      const list = (await this.deps.kv.get<CartSummary[]>('recent')) ?? []
      const { id, createdAt, manifest } = record
      const summary: CartSummary = { id, title: manifest.title, blurb: manifest.blurb, view: manifest.view, palette: manifest.palette, createdAt }
      await this.deps.kv.set('recent', [summary, ...list.filter((s) => s.id !== id)].slice(0, RECENT_LIMIT))
    })
    this.queue = task.catch(() => undefined)
    return task
  }

  async get(id: string): Promise<CartRecord | null> {
    if (!/^[0-9a-z]{8}$/.test(id)) return null
    await this.seed()
    return this.deps.kv.get<CartRecord>(`cart-${id}`)
  }

  async recent(): Promise<CartSummary[]> {
    await this.seed()
    return (await this.deps.kv.get<CartSummary[]>('recent')) ?? []
  }

  /** A new shelf starts with the three hand-written carts on it. */
  private seed(): Promise<void> {
    this.seeded ??= (async () => {
      if ((await this.deps.kv.get<CartSummary[]>('recent')) !== null) return
      await this.deps.kv.set('recent', [])
      for (const manifest of [...TEMPLATES].reverse()) {
        const result = solve(manifest)
        const art = await buildSheet(manifest, { assets: await this.deps.art() })
        const report: CartReport = { generator: 'hand', firstTryValid: true, repaired: false, fellBack: false, issues: [], eased: 0, replaced: 'no', botFrames: result.frames, botExpansions: result.expanded, attempts: 1 }
        await this.save({ prompt: manifest.blurb, manifest, sheet: art.sheet, tape: result.tape, report, art: { source: 'synth', borrowed: [] } })
      }
    })()
    return this.seeded
  }
}

/** The generator the environment asks for. Offline unless a key is present or one is named. */
export function generatorFromEnv(env: NodeJS.ProcessEnv = process.env): ManifestGenerator {
  const choice = env.CARTRIDGE_GENERATOR ?? 'auto'
  if (choice === 'anthropic' || (choice === 'auto' && env.ANTHROPIC_API_KEY)) return new AnthropicGenerator()
  return new OfflineGenerator()
}

// Next gives each route its own copy of a module in development, so the one
// service lives on globalThis.
const holder = globalThis as unknown as { __cartridge?: CartService }

export function getService(): CartService {
  if (!holder.__cartridge) {
    let art: Promise<ArtAssets> | null = null
    holder.__cartridge = new CartService({
      kv: kvFromEnv(),
      generator: generatorFromEnv(),
      provider: providerFromEnv(),
      art: () => {
        art ??= loadArt()
        return art
      },
      now: () => new Date(),
    })
  }
  return holder.__cartridge
}
