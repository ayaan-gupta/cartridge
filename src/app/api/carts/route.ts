import { failure, json } from '@/lib/respond'
import { getService, InputError } from '@/lib/service'

export const dynamic = 'force-dynamic'

/** The gallery: the most recent carts, newest first. */
export async function GET(): Promise<Response> {
  try {
    return json({ carts: await getService().recent() })
  } catch (error) {
    return failure(error)
  }
}

/** Makes a cart from a one-sentence prompt. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => {
      throw new InputError('Send JSON with a "prompt".')
    })) as { prompt?: unknown }
    const record = await getService().create(body?.prompt)
    return json({ id: record.id, title: record.manifest.title, url: `/c/${record.id}`, report: record.report }, 201)
  } catch (error) {
    return failure(error)
  }
}
