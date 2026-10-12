import { labelPng } from '@/lib/label'
import { failure, json } from '@/lib/respond'
import { getService } from '@/lib/service'

export const dynamic = 'force-dynamic'

/** The opening frame of a cart as a PNG, for gallery cards and link previews. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params
    const record = await getService().get(id)
    if (!record) return json({ error: 'No cartridge with that id.' }, 404)
    const asked = Number(new URL(request.url).searchParams.get('scale') ?? 2)
    const scale = Number.isInteger(asked) && asked >= 1 && asked <= 6 ? asked : 2
    const png = await labelPng(record, scale)
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400, immutable' } })
  } catch (error) {
    return failure(error)
  }
}
