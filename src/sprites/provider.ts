/**
 * The real image provider: a client for any image API that speaks the OpenAI
 * images protocol. It is switched on by setting SPRITE_API_KEY.
 *
 * NOT TESTED against a live service. There was no image key on the build
 * machine. The request shape and the decoding are covered with a stub fetch.
 * Everything downstream of it (keying, quantising, slicing, packing) is real
 * and tested on synthetic sheets.
 */
import type { RGBAImage } from '@/lib/pixels'
import type { SpriteProvider } from './sheet'

export interface HttpImageOptions {
  url: string
  key: string
  model: string
  size: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

/** Decodes PNG, JPEG or WebP bytes to raw RGBA. sharp is loaded only when needed. */
export async function decodeImage(bytes: Uint8Array): Promise<RGBAImage> {
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
}

export class HttpImageProvider implements SpriteProvider {
  readonly name = 'image-api'
  constructor(private readonly options: HttpImageOptions) {}

  async generate(prompt: string): Promise<RGBAImage> {
    const { url, key, model, size } = this.options
    const fetcher = this.options.fetcher ?? fetch
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 90000)
    const response = await fetcher(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
      signal,
    })
    if (!response.ok) throw new Error(`image API returned ${response.status}`)
    const body = (await response.json()) as { data?: { b64_json?: string; url?: string }[] }
    const first = body.data?.[0]
    if (first?.b64_json) return decodeImage(Uint8Array.from(Buffer.from(first.b64_json, 'base64')))
    if (first?.url) {
      const file = await fetcher(first.url, { signal })
      if (!file.ok) throw new Error(`image download returned ${file.status}`)
      return decodeImage(new Uint8Array(await file.arrayBuffer()))
    }
    throw new Error('image API returned no image')
  }
}

/** The provider the environment asks for, or null for the built-in artist. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): SpriteProvider | null {
  if (!env.SPRITE_API_KEY) return null
  return new HttpImageProvider({
    url: env.SPRITE_API_URL ?? 'https://api.openai.com/v1/images/generations',
    key: env.SPRITE_API_KEY,
    model: env.SPRITE_IMAGE_MODEL ?? 'gpt-image-1',
    // 3:2 is the closest common size to a 4 by 2 grid. The slicer copes with either.
    size: env.SPRITE_IMAGE_SIZE ?? '1536x1024',
  })
}
