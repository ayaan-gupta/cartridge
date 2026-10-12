'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { GameState } from '@/engine/types'
import type { CartRecord } from '@/lib/service'
import { Console } from './Console'

const MADE_BY: Record<string, string> = {
  offline: 'Offline generator',
  anthropic: 'Claude',
  hand: 'Written by hand',
  file: 'Imported .cart file',
}

export function Play({ record, bytes }: { record: CartRecord; bytes: number }) {
  const { manifest, report } = record
  const cart = useMemo(() => ({ manifest: record.manifest, sheet: record.sheet }), [record])
  const [watchSignal, setWatchSignal] = useState(0)
  const [watching, setWatching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [state, setState] = useState<GameState>('title')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0] as string)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const botSeconds = (report.botFrames / 60).toFixed(1)
  const fate = report.replaced !== 'no' ? 'Swapped for a cart the bot could win' : report.eased > 0 ? `Eased ${report.eased} ${report.eased === 1 ? 'notch' : 'notches'} until the bot could win` : 'Won by the bot as generated'
  const valid = report.firstTryValid ? 'Valid on the first try' : report.repaired ? 'Valid after one repair' : 'Fell back to a template'

  return (
    <div className="play">
      <div className="play-console">
        <Console cart={cart} tape={record.tape} watchSignal={watchSignal} onWatching={setWatching} onState={setState} />
      </div>
      <div className="play-info">
        <p className="eyebrow">{manifest.view === 'side' ? 'Side view' : 'Top view'} cartridge</p>
        <h1>{manifest.title}</h1>
        <p className="blurb">{manifest.blurb}</p>
        <ul className="facts">
          <li>{manifest.rules.timer} seconds</li>
          <li>
            {manifest.rules.lives} {manifest.rules.lives === 1 ? 'life' : 'lives'}
          </li>
          <li>{goalText(record)}</li>
        </ul>

        <div className="actions">
          <button type="button" className="button" onClick={copy}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a className="button quiet" href={`/api/carts/${record.id}/download`} download>
            Download .cart
          </a>
          <button type="button" className="button quiet" onClick={() => setWatchSignal((n) => n + 1)} disabled={watching}>
            {watching ? 'Bot is playing' : 'Watch the bot win'}
          </button>
        </div>
        <p className="hint" aria-live="polite">
          {watching ? 'Press any button to take over from where the bot is.' : state === 'won' ? 'You won. Press A to play again.' : state === 'lost' ? 'Press A to try again.' : state === 'title' ? 'Press A to start.' : ' '}
        </p>

        <h2>Controls</h2>
        <dl className="keys">
          <dt>Move</dt>
          <dd>
            <kbd>Arrows</kbd> or <kbd>W A S D</kbd>
          </dd>
          <dt>A: {manifest.view === 'side' ? 'jump' : 'dash'}</dt>
          <dd>
            <kbd>Z</kbd> or <kbd>Space</kbd>
          </dd>
          <dt>B: run</dt>
          <dd>
            <kbd>X</kbd> or <kbd>Shift</kbd>
          </dd>
        </dl>

        <h2>About this cartridge</h2>
        <dl className="about">
          <dt>Made by</dt>
          <dd>{MADE_BY[report.generator] ?? report.generator}</dd>
          <dt>Manifest</dt>
          <dd>
            {valid}, {bytes.toLocaleString('en-US')} bytes of JSON
          </dd>
          <dt>Win check</dt>
          <dd>
            {fate}, in {botSeconds} of {manifest.rules.timer} seconds
          </dd>
          <dt>Sprites</dt>
          <dd>{record.art.source === 'provider' || record.art.source === 'cache' ? 'Generated image, sliced to 16 pixel cells' : 'Drawn by the built-in artist'}</dd>
          <dt>Palette</dt>
          <dd className="swatches">
            {manifest.palette.map((color) => (
              <span key={color} style={{ background: color }} title={color} />
            ))}
          </dd>
        </dl>
        <p className="more">
          <Link href="/">Make your own</Link> or <Link href="/gallery">browse the shelf</Link>.
        </p>
      </div>
    </div>
  )
}

function goalText(record: CartRecord): string {
  const { opens, amount } = record.manifest.rules.goal
  const goal = record.manifest.art.goal
  if (opens === 'collect') return `Collect ${amount}, then reach the ${goal}`
  if (opens === 'score') return `Score ${amount}, then reach the ${goal}`
  if (opens === 'survive') return `Last ${amount} seconds, then reach the ${goal}`
  return `Reach the ${goal}`
}
