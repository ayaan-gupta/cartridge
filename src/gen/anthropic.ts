/**
 * The language-model generator. The model never writes game code. It fills
 * in a manifest, constrained by a JSON schema derived from the same Zod
 * schema the validator uses, and whatever comes back goes through that
 * validator like any other input.
 *
 * NOT EXERCISED AGAINST THE LIVE API in this repository's test run: there
 * was no key on the build machine. The request shape is covered by a test
 * with a stub client, and `npm run eval -- --live` runs the 50-prompt
 * acceptance set against the real model when a key is present.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { manifestSchema } from '@/cart/schema'
import { LILY_PAD_DASH } from '@/cart/templates'
import type { ManifestGenerator } from './types'

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

type Json = { [key: string]: unknown }
const isJson = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Structured outputs accept a subset of JSON Schema: no numeric or length
 * limits, no tuples, no oneOf. This rewrites a schema into that subset and
 * moves every limit it removes into the description, so the model still
 * reads "between 30 and 120" even though the API will not enforce it. The
 * validator enforces it afterwards.
 */
export function toOutputSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toOutputSchema)
  if (!isJson(node)) return node
  const out: Json = {}
  const notes: string[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue
    if (key === 'minimum' || key === 'maximum') continue
    if (key === 'minLength' || key === 'maxLength' || key === 'minItems' || key === 'maxItems') continue
    if (key === 'pattern') {
      notes.push('A hex colour such as #a1b2c3.')
      continue
    }
    if (key === 'prefixItems') {
      const items = value as unknown[]
      out.items = toOutputSchema(items[0])
      notes.push(`Exactly ${items.length} items.`)
      continue
    }
    if (key === 'items' && value === false) continue
    if (key === 'oneOf') {
      out.anyOf = toOutputSchema(value)
      continue
    }
    out[key] = toOutputSchema(value)
  }
  if (typeof node.minimum === 'number' && typeof node.maximum === 'number') notes.push(`Between ${node.minimum} and ${node.maximum}.`)
  if (typeof node.maxLength === 'number') notes.push(`At most ${node.maxLength} characters.`)
  if (typeof node.maxItems === 'number' && !('prefixItems' in node)) notes.push(`Between ${node.minItems ?? 0} and ${node.maxItems} items.`)
  if (notes.length > 0) out.description = [node.description, ...notes].filter(Boolean).join(' ')
  return out
}

export const OUTPUT_SCHEMA = toOutputSchema(z.toJSONSchema(manifestSchema)) as Json

export const SYSTEM_PROMPT = `You design tiny Game Boy style games. You are given a one-sentence idea and you return a cart manifest: a small JSON description that a fixed engine runs. You never write code.

THE ENGINE
- The screen is 160x144 with a 16 pixel status strip, so 10 by 8 tiles of 16 pixels are visible. Maps are 10 to 20 tiles wide and 8 to 18 tall, and the camera follows the player.
- view "side": gravity, A jumps, B runs. view "top": free movement in four directions, A dashes, B runs.
- map.rows has exactly map.h strings of exactly map.w characters. "." is empty, "#" is solid tile A, "=" is tile B (solid or decoration, set by map.tileB).
- Positions are whole tiles, x from the left and y from the top. Speeds are pixels per second (a tile is 16 pixels).
- Entities, one behaviour each: player (exactly one), goal (exactly one), patrol (walks an axis, turns at walls or after "range" tiles, or wraps round the map like traffic), chase (follows the player inside "range" tiles, must be slower than 0.9 times the player), falling (drops from where it is placed, lands, returns after "every" seconds), spawner (emits a patrol or falling mover every "every" seconds, spread randomly over "spread" tiles), collectible (worth points), hazard (a w by h block that hurts).
- patrol, falling and spawned movers hurt on touch, or count as pickups when touch is "collect". Use sprite "item" for those.
- The player wins by touching the goal while it is open. rules.goal.opens: "always", "collect" (after amount pickups), "score" (at amount points), "survive" (after amount seconds). Losing all lives or running out of rules.timer seconds loses.
- A hit costs a life and sends the player back to the start.

WHAT MAKES A GOOD CART
- It must be winnable without losing a life. A bot will play it and reject it otherwise. Leave room to dodge, keep jumps short, never wall off the goal.
- In the side view the player can jump about 2.5 tiles high and 2 tiles across at speed 75. Give every platform a floor to stand on, and put the player on solid ground.
- Nothing may start inside a solid tile.
- Use the three enemy sprites for three different kinds of thing from the idea, and say what each is in art.enemies, in order.
- art strings are short noun phrases for a pixel artist: "green frog", "red car", "lily pad".
- palette is four colours, lightest first, that suit the idea.
- title is at most 24 characters, in capitals. blurb is one sentence.

AN EXAMPLE
Idea: "a frog dodging cars to reach a lily pad"
${JSON.stringify(LILY_PAD_DASH)}`

/** The one SDK call this module makes, so a test can stand in for it. */
export interface MessagesClient {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> }
}

export interface AnthropicOptions {
  client?: MessagesClient
  model?: string
  effort?: 'low' | 'medium' | 'high'
}

export class AnthropicGenerator implements ManifestGenerator {
  readonly name = 'anthropic'
  readonly model: string
  private readonly client: MessagesClient
  private readonly effort: 'low' | 'medium' | 'high'

  constructor(options: AnthropicOptions = {}) {
    this.model = options.model ?? process.env.CARTRIDGE_MODEL ?? DEFAULT_MODEL
    this.effort = options.effort ?? 'medium'
    // With no arguments the SDK reads ANTHROPIC_API_KEY from the environment.
    this.client = options.client ?? new Anthropic()
  }

  async generate(prompt: string): Promise<unknown> {
    let message: Anthropic.Message
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Idea: ${JSON.stringify(prompt)}` }],
        output_config: { effort: this.effort, format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      })
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new Error('The Anthropic API key was rejected.')
      if (error instanceof Anthropic.RateLimitError) throw new Error('The Anthropic API is rate limiting this key.')
      if (error instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Anthropic API.')
      if (error instanceof Anthropic.APIError) throw new Error(`The Anthropic API returned ${error.status}: ${error.message}`)
      throw error
    }
    // A refusal or a cut-off reply does not have to match the schema.
    if (message.stop_reason === 'refusal') throw new Error('The model declined this prompt.')
    if (message.stop_reason === 'max_tokens') throw new Error('The model ran out of room before finishing the manifest.')
    const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!block) throw new Error('The model returned no text.')
    return JSON.parse(block.text) as unknown
  }
}
