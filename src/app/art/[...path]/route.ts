import { readFile } from 'node:fs/promises'
import { resolveAsset } from '@/sprites/assets'

/**
 * Serves design-time art. A file in assets/generated wins over the file of
 * the same name in assets/interim, so delivered art needs no code change.
 */
export async function GET(_: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params
  const relative = path.join('/')
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.png$/.test(relative)) return new Response('Not found', { status: 404 })
  const file = resolveAsset(relative)
  if (!file) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(await readFile(file)), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300', 'x-cartridge-art': file.includes('/generated/') ? 'generated' : 'interim' },
  })
}
