import { failure, json } from '@/lib/respond'
import { getService, InputError } from '@/lib/service'

export const dynamic = 'force-dynamic'

/** Takes a .cart file and puts it on the shelf, if it is valid and can be won. */
export async function POST(request: Request): Promise<Response> {
  try {
    const text = await request.text()
    if (text.length > 60000) throw new InputError('That file is too large to be a cart.')
    let file: unknown
    try {
      file = JSON.parse(text)
    } catch {
      throw new InputError('That is not a .cart file.')
    }
    const record = await getService().importCart(file)
    return json({ id: record.id, title: record.manifest.title, url: `/c/${record.id}` }, 201)
  } catch (error) {
    return failure(error)
  }
}
