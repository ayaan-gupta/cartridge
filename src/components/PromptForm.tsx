'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const EXAMPLES = [
  'a frog dodging cars to reach a lily pad',
  'a thief stealing every gem in a museum guarded by robots',
  'a knight climbing a tower full of goblins',
  'a baker catching falling cupcakes while dodging burnt cookies',
]

export function PromptForm() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const make = async (text: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/carts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: text }) })
      const body = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !body.id) throw new Error(body.error ?? 'That did not work. Try again.')
      router.push(`/c/${body.id}`)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work. Try again.')
      setBusy(false)
    }
  }

  return (
    <form
      className="prompt"
      onSubmit={(event) => {
        event.preventDefault()
        void make(prompt)
      }}
    >
      <label htmlFor="prompt" className="sr-only">
        Describe a game in one sentence
      </label>
      <div className="prompt-row">
        <input id="prompt" name="prompt" type="text" value={prompt} maxLength={200} autoComplete="off" placeholder="a frog dodging cars to reach a lily pad" onChange={(event) => setPrompt(event.target.value)} disabled={busy} />
        <button type="submit" className="button" disabled={busy || prompt.trim().length < 3}>
          {busy ? 'Making it' : 'Make cartridge'}
        </button>
      </div>
      <p className="prompt-error" role="alert">
        {error}
      </p>
      <ul className="examples" aria-label="Example prompts">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button type="button" onClick={() => setPrompt(example)} disabled={busy}>
              {example}
            </button>
          </li>
        ))}
      </ul>
    </form>
  )
}
