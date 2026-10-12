import { InputError } from './service'

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

/** Turns a thrown error into a response: 400 for bad input, 500 for anything else. */
export function failure(error: unknown): Response {
  if (error instanceof InputError) return json({ error: error.message }, 400)
  console.error(error)
  return json({ error: 'Something went wrong making that cartridge.' }, 500)
}
