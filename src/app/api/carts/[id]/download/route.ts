import { failure, json } from '@/lib/respond'
import { getService, toCartFile } from '@/lib/service'

export const dynamic = 'force-dynamic'

/** The .cart file: the whole game as one small JSON document. */
export async function GET(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params
    const record = await getService().get(id)
    if (!record) return json({ error: 'No cartridge with that id.' }, 404)
    const name = record.manifest.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cartridge'
    return new Response(JSON.stringify(toCartFile(record)), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.cart"`,
      },
    })
  } catch (error) {
    return failure(error)
  }
}
