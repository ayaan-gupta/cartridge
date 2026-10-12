/**
 * The acceptance run: push a list of prompts through the whole pipeline and
 * count what happened. The test suite and `npm run eval` both call this, so
 * the number in the notes and the number the tests assert are the same number.
 */
import { replay } from '@/bot/bot'
import { manifestBytes, validateManifest } from '@/cart/schema'
import { readPrompt } from './brief'
import type { CartReport } from './pipeline'
import { generateManifest } from './pipeline'
import type { ManifestGenerator } from './types'

export interface EvalRow {
  prompt: string
  title: string
  archetype: string
  view: string
  bytes: number
  entities: number
  timerSeconds: number
  botSeconds: number
  /** The cart that shipped passes the validator. */
  valid: boolean
  /** The winning recording was replayed on a fresh engine and won again, inside the clock, with every life left. */
  replayWon: boolean
  report: CartReport
  ms: number
}

export interface EvalSummary {
  generator: string
  prompts: number
  validFirstTry: number
  validAfterRepair: number
  fellBackToTemplate: number
  generatorErrors: number
  winnableAsGenerated: number
  winnableAfterEasing: number
  replaced: number
  shippedValid: number
  shippedWinnable: number
  maxBytes: number
  meanBytes: number
  distinctTitles: number
  distinctPalettes: number
  archetypes: Record<string, number>
  totalMs: number
  rows: EvalRow[]
}

export async function evaluatePrompts(prompts: readonly string[], generator: ManifestGenerator): Promise<EvalSummary> {
  const rows: EvalRow[] = []
  const palettes = new Set<string>()
  const began = performance.now()
  for (const prompt of prompts) {
    const t = performance.now()
    const { manifest, tape, report } = await generateManifest(prompt, generator)
    const again = replay(manifest, tape)
    palettes.add(manifest.palette.join(''))
    rows.push({
      prompt,
      title: manifest.title,
      archetype: readPrompt(prompt).archetype,
      view: manifest.view,
      bytes: manifestBytes(manifest),
      entities: manifest.entities.length,
      timerSeconds: manifest.rules.timer,
      botSeconds: Math.round((again.frames / 60) * 10) / 10,
      valid: validateManifest(manifest).ok,
      replayWon: again.state === 'won' && again.lives === manifest.rules.lives && again.frames <= manifest.rules.timer * 60,
      report,
      ms: Math.round(performance.now() - t),
    })
  }
  const count = (test: (row: EvalRow) => boolean) => rows.filter(test).length
  const archetypes: Record<string, number> = {}
  for (const row of rows) archetypes[row.archetype] = (archetypes[row.archetype] ?? 0) + 1
  return {
    generator: generator.name,
    prompts: rows.length,
    validFirstTry: count((r) => r.report.firstTryValid),
    validAfterRepair: count((r) => r.report.firstTryValid || r.report.repaired),
    fellBackToTemplate: count((r) => r.report.fellBack),
    generatorErrors: count((r) => r.report.issues.some((i) => i.startsWith('generator failed'))),
    winnableAsGenerated: count((r) => r.report.replaced === 'no' && r.report.eased === 0),
    winnableAfterEasing: count((r) => r.report.replaced === 'no' && r.report.eased > 0),
    replaced: count((r) => r.report.replaced !== 'no'),
    shippedValid: count((r) => r.valid),
    shippedWinnable: count((r) => r.replayWon),
    maxBytes: Math.max(...rows.map((r) => r.bytes)),
    meanBytes: Math.round(rows.reduce((sum, r) => sum + r.bytes, 0) / rows.length),
    distinctTitles: new Set(rows.map((r) => r.title)).size,
    distinctPalettes: palettes.size,
    archetypes,
    totalMs: Math.round(performance.now() - began),
    rows,
  }
}
