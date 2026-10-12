/**
 * Anything that can turn a sentence into something manifest-shaped. The
 * result is `unknown` on purpose: nothing a generator returns is trusted
 * until the validator has been through it.
 */
export interface ManifestGenerator {
  readonly name: string
  generate(prompt: string): Promise<unknown>
}
