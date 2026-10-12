/**
 * The key-value store behind share links, the gallery and the sprite cache.
 * Three implementations: memory for tests, files for a clean clone, and a
 * REST client for a hosted store. Values are JSON.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface KV {
  readonly name: string
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}

export class MemoryKV implements KV {
  readonly name = 'memory'
  private readonly data = new Map<string, string>()
  async get<T>(key: string): Promise<T | null> {
    const text = this.data.get(key)
    return text === undefined ? null : (JSON.parse(text) as T)
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }
}

/** One JSON file per key. Writes go to a temporary file first, then rename over the old one. */
export class FileKV implements KV {
  readonly name = 'file'
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    // Keys become file names, so anything that is not plainly safe is escaped.
    return path.join(this.dir, `${key.replace(/[^a-zA-Z0-9._-]/g, (c) => `~${c.charCodeAt(0).toString(16)}`)}.json`)
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.file(key), 'utf8')) as T
    } catch {
      return null
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const target = this.file(key)
    const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(temporary, JSON.stringify(value))
    await rename(temporary, target)
  }
  async delete(key: string): Promise<void> {
    await unlink(this.file(key)).catch(() => undefined)
  }
}

/**
 * The slot for a hosted store: anything that speaks the Upstash Redis REST
 * protocol, which includes Vercel KV. NOT TESTED against a live service.
 * Only the request shapes are covered, with a stub fetch.
 */
export class RestKV implements KV {
  readonly name = 'rest'
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async command<T>(parts: (string | number)[]): Promise<T> {
    const response = await this.fetcher(this.url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(parts),
    })
    if (!response.ok) throw new Error(`The key-value store returned ${response.status}`)
    return ((await response.json()) as { result: T }).result
  }
  async get<T>(key: string): Promise<T | null> {
    const text = await this.command<string | null>(['GET', key])
    return text === null ? null : (JSON.parse(text) as T)
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.command(['SET', key, JSON.stringify(value)])
  }
  async delete(key: string): Promise<void> {
    await this.command(['DEL', key])
  }
}

/** Picks a store from the environment. Files under .data unless a hosted store is configured. */
export function kvFromEnv(env: NodeJS.ProcessEnv = process.env): KV {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) return new RestKV(env.KV_REST_API_URL, env.KV_REST_API_TOKEN)
  return new FileKV(env.CARTRIDGE_DATA_DIR ?? path.join(process.cwd(), '.data'))
}
