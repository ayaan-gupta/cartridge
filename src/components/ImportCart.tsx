'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

/** Opens a .cart file from disk: the other half of "Download .cart". */
export function ImportCart() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const open = async (file: File | undefined) => {
    if (!file) return
    setMessage('Checking that cart')
    try {
      const response = await fetch('/api/carts/import', { method: 'POST', body: await file.text() })
      const body = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !body.id) throw new Error(body.error ?? 'That file could not be opened.')
      router.push(`/c/${body.id}`)
    } catch (problem) {
      setMessage(problem instanceof Error ? problem.message : 'That file could not be opened.')
    }
    if (input.current) input.current.value = ''
  }

  return (
    <span className="import">
      <button type="button" className="link" onClick={() => input.current?.click()}>
        Open a .cart file
      </button>
      <input ref={input} type="file" accept=".cart,application/json" className="sr-only" tabIndex={-1} aria-label="Choose a .cart file" onChange={(event) => void open(event.target.files?.[0])} />
      <span className="import-note" role="status">
        {message}
      </span>
    </span>
  )
}
