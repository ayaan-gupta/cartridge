/**
 * The 50-prompt acceptance run.
 *
 *   npm run eval                    offline generator, writes docs/eval-offline.json
 *   npm run eval -- --live          the real model, writes docs/eval-live.json
 *   npm run eval -- --random 400    offline generator on 400 prompts stitched together
 *                                   from word lists, to see how it does on sentences
 *                                   nobody tuned it for. Prints a summary, writes nothing.
 *
 * The live run needs ANTHROPIC_API_KEY and spends real tokens: fifty requests.
 * It refuses to start without a key rather than quietly testing the offline
 * generator under another name.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AnthropicGenerator } from '../src/gen/anthropic'
import { evaluatePrompts } from '../src/gen/evaluate'
import { OfflineGenerator } from '../src/gen/offline'
import { PROMPTS_50 } from '../src/gen/prompts50'
import { Rng } from '../src/engine/rng'

/** Prompts nobody wrote: a hero, a verb, a thing and a tail, picked from lists with a fixed seed. */
function randomPrompts(count: number): string[] {
  const rng = new Rng(4242)
  const heroes = ['a cat', 'an owl', 'a tiny robot', 'the last dragon', 'two snails', 'a sleepy wizard', 'grandma', 'a ball of yarn', 'a ghost', 'a pizza', 'a lost sock', 'a brave toaster', '']
  const verbs = ['dodging', 'collecting', 'escaping from', 'climbing', 'catching', 'crossing', 'surviving', 'jumping over', 'racing', 'stealing', 'looking for', 'running from', 'sneaking past', 'delivering']
  const things = ['lava', 'bees', 'the moon', 'traffic', 'falling pianos', 'ghosts', 'a haunted library', 'cheese', 'robots and lasers', 'a very tall tree', 'angry geese', 'every coin', 'a storm', 'sharks', 'the royal guards', 'meteors']
  const tails = ['to get home', 'before dawn', 'in space', 'under the sea', 'to reach the castle', 'while it rains frogs', 'in a maze', 'on a busy road', 'up a tower', '', '!!!']
  return Array.from({ length: count }, () => `${rng.pick(heroes)} ${rng.pick(verbs)} ${rng.pick(things)} ${rng.pick(tails)}`.trim())
}

async function main(): Promise<void> {
  const live = process.argv.includes('--live')
  if (live && !process.env.ANTHROPIC_API_KEY) {
    console.error('The live run needs ANTHROPIC_API_KEY. Nothing was run.')
    process.exit(2)
  }
  const generator = live ? new AnthropicGenerator() : new OfflineGenerator()
  const randomAt = process.argv.indexOf('--random')
  const random = randomAt >= 0 ? Number(process.argv[randomAt + 1] ?? 400) : 0
  const summary = await evaluatePrompts(random > 0 ? randomPrompts(random) : PROMPTS_50, generator)
  const pct = (n: number) => `${n}/${summary.prompts} (${Math.round((n / summary.prompts) * 1000) / 10}%)`

  for (const row of random > 0 ? [] : summary.rows) {
    const fate = row.report.replaced !== 'no' ? `replaced:${row.report.replaced}` : row.report.eased > 0 ? `eased:${row.report.eased}` : 'as generated'
    const valid = row.report.firstTryValid ? 'valid' : row.report.repaired ? 'repaired' : 'fell back'
    console.log(`${row.title.padEnd(24)} ${row.archetype.padEnd(10)} ${String(row.bytes).padStart(5)} B  ${valid.padEnd(9)} ${fate.padEnd(16)} bot ${String(row.botSeconds).padStart(5)}s of ${row.timerSeconds}s  ${row.prompt}`)
  }
  console.log('')
  console.log(`generator                 ${summary.generator}${live ? ` (${(generator as AnthropicGenerator).model})` : ''}`)
  console.log(`valid on the first try    ${pct(summary.validFirstTry)}`)
  console.log(`valid after one repair    ${pct(summary.validAfterRepair)}`)
  console.log(`fell back to a template   ${pct(summary.fellBackToTemplate)}`)
  console.log(`winnable as generated     ${pct(summary.winnableAsGenerated)}`)
  console.log(`winnable after easing     ${pct(summary.winnableAfterEasing)}`)
  console.log(`replaced to be winnable   ${pct(summary.replaced)}`)
  console.log(`shipped valid             ${pct(summary.shippedValid)}`)
  console.log(`shipped winnable by bot   ${pct(summary.shippedWinnable)}`)
  console.log(`manifest size             mean ${summary.meanBytes} B, max ${summary.maxBytes} B (limit 20000)`)
  console.log(`variety                   ${summary.distinctTitles} titles, ${summary.distinctPalettes} palettes, ${JSON.stringify(summary.archetypes)}`)
  console.log(`time                      ${summary.totalMs} ms in all, slowest cart ${Math.max(...summary.rows.map((r) => r.ms))} ms`)
  if (random > 0) return

  const out = path.join(process.cwd(), 'docs', live ? 'eval-live.json' : 'eval-offline.json')
  mkdirSync(path.dirname(out), { recursive: true })
  // Timings change from run to run, so they stay out of the committed file.
  const stable = { ...summary, totalMs: undefined, rows: summary.rows.map((r) => ({ ...r, ms: undefined })) }
  writeFileSync(out, `${JSON.stringify(stable, null, 2)}\n`)
  console.log(`\nwrote ${out}`)
  if (summary.shippedWinnable !== summary.prompts || summary.shippedValid !== summary.prompts) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
