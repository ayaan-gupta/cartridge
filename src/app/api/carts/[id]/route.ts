import { failure, json } from '@/lib/respond'
import { getService } from '@/lib/service'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params
    const record = await getService().get(id)
    if (!record) return json({ error: 'No cartridge with that id.' }, 404)
    // A cart never changes once made: its id is a hash of its contents.
    return json(record, 200, { 'cache-control': 'public, max-age=3600, immutable' })
  } catch (error) {
    return failure(error)
  }
}
