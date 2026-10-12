'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Chiptune } from '@/engine/audio'
import { buttonForKey, dpadButtons } from '@/engine/input'
import { Runner } from '@/engine/runner'
import type { Cart, GameEvent, GameState, Tape } from '@/engine/types'
import { BTN, SCREEN_H, SCREEN_W } from '@/engine/types'
import { screenScale } from '@/lib/scale'

export interface ConsoleProps {
  cart: Cart
  /** The bot's winning run. Needed for watch and attract modes. */
  tape?: Tape
  /** Play the recording on a loop until someone touches a control. */
  attract?: boolean
  /** Bumped by the parent to start the recording from the top. */
  watchSignal?: number
  maxScale?: number
  onWatching?: (watching: boolean) => void
  onState?: (state: GameState) => void
}

const MUTE_KEY = 'cartridge-muted'

export function Console({ cart, tape, attract = false, watchSignal = 0, maxScale = 4, onWatching, onState }: ConsoleProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const runner = useRef<Runner | null>(null)
  const audio = useRef<Chiptune | null>(null)
  const held = useRef({ keys: 0, pointers: new Map<number, number>() })
  const callbacks = useRef({ onWatching, onState })
  callbacks.current = { onWatching, onState }
  const [scale, setScale] = useState(2)
  const [pressed, setPressed] = useState(0)
  const [muted, setMuted] = useState(false)
  const [watching, setWatching] = useState(false)
  const [live, setLive] = useState(false)

  const sync = useCallback(() => {
    let buttons = held.current.keys
    for (const bits of held.current.pointers.values()) buttons |= bits
    runner.current?.hold(buttons)
    setPressed(buttons)
  }, [])

  /** Any real input wakes the sound up and takes the game back from the bot. */
  const engage = useCallback(() => {
    audio.current?.unlock()
    const r = runner.current
    if (r?.watching) {
      r.takeOver()
      setWatching(false)
      callbacks.current.onWatching?.(false)
    }
  }, [])

  const watch = useCallback(() => {
    const r = runner.current
    if (!r || !tape) return
    r.playTape(tape)
    setWatching(true)
    callbacks.current.onWatching?.(true)
  }, [tape])

  // The game itself. Rebuilt only when the cart changes.
  useEffect(() => {
    if (!canvas.current) return
    const sound = new Chiptune()
    audio.current = sound
    try {
      const saved = window.localStorage.getItem(MUTE_KEY) === '1'
      sound.setMuted(saved)
      setMuted(saved)
    } catch {
      // Private browsing can refuse storage. Sound simply starts on.
    }
    let state: GameState = 'title'
    let again: ReturnType<typeof setTimeout> | null = null
    const game = new Runner(canvas.current, cart, {
      onEvent: (event: GameEvent) => {
        sound.effect(event)
        if (event === 'start') sound.play(cart.manifest.music)
        if (event === 'win' || event === 'lose') sound.stop()
      },
      onTapeEnd: () => {
        setWatching(false)
        callbacks.current.onWatching?.(false)
        // In attract mode the recording comes round again after a pause.
        if (attract && tape) again = setTimeout(() => runner.current === game && !held.current.keys && game.playTape(tape), 2600)
      },
    })
    runner.current = game
    game.start()
    setLive(true)
    if (attract && tape) game.playTape(tape)
    // A hidden tab stops drawing, so it should stop singing too.
    const visibility = () => {
      if (document.hidden) sound.stop()
      else if (game.engine.state === 'playing') sound.play(cart.manifest.music)
    }
    document.addEventListener('visibilitychange', visibility)
    const poll = setInterval(() => {
      if (game.engine.state !== state) {
        state = game.engine.state
        callbacks.current.onState?.(state)
      }
    }, 150)
    if (new URLSearchParams(window.location.search).has('perf')) (window as unknown as { __cartridge?: Runner }).__cartridge = game
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', visibility)
      if (again) clearTimeout(again)
      game.stop()
      sound.dispose()
      runner.current = null
      audio.current = null
    }
  }, [cart, tape, attract])

  useEffect(() => {
    if (watchSignal > 0) watch()
  }, [watchSignal, watch])

  // The largest whole-number scale that fits, so every game pixel is the same size.
  useEffect(() => {
    const measure = () => setScale(screenScale(window.innerWidth, window.innerHeight, maxScale))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [maxScale])

  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    const down = (event: KeyboardEvent) => {
      const button = buttonForKey(event.code)
      if (!button || typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      // In attract mode the page still has to scroll, so keys wait for a click on the console.
      if (attract && !wrap.current?.contains(document.activeElement)) return
      event.preventDefault()
      engage()
      held.current.keys |= button
      sync()
    }
    const up = (event: KeyboardEvent) => {
      const button = buttonForKey(event.code)
      if (!button) return
      held.current.keys &= ~button
      sync()
    }
    const release = () => {
      held.current.keys = 0
      held.current.pointers.clear()
      sync()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
    }
  }, [attract, engage, sync])

  const pad = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const radius = box.width / 2
    held.current.pointers.set(event.pointerId, dpadButtons(event.clientX - box.left - radius, event.clientY - box.top - radius, radius))
    sync()
  }
  const padDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    engage()
    pad(event)
  }
  const lift = (event: React.PointerEvent<HTMLElement>) => {
    held.current.pointers.delete(event.pointerId)
    sync()
  }
  const press = (bit: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    engage()
    held.current.pointers.set(event.pointerId, bit)
    sync()
  }

  const toggleSound = () => {
    const next = !muted
    setMuted(next)
    audio.current?.unlock()
    audio.current?.setMuted(next)
    try {
      window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
    } catch {
      // Nothing to do: the choice just will not be remembered.
    }
  }
  const reset = () => {
    engage()
    audio.current?.stop()
    runner.current?.engine.reset()
  }

  const dir = (bit: number) => ((pressed & bit) !== 0 ? ' is-down' : '')
  const big = scale >= 2
  return (
    <div className={`console${big ? '' : ' is-small'}`} ref={wrap} style={{ ['--k' as string]: scale }} tabIndex={-1} onPointerDown={() => wrap.current?.focus({ preventScroll: true })}>
      <div className="bezel">
        <div className="bezel-top">
          <span className={`led${live ? ' is-on' : ''}`} aria-hidden="true" />
          <span className="bezel-label">{watching ? 'BOT PLAYING' : 'DOT MATRIX, FOUR SHADES'}</span>
        </div>
        <canvas ref={canvas} className="screen" width={SCREEN_W} height={SCREEN_H} aria-label={`${cart.manifest.title}, a game`} style={{ background: cart.manifest.palette[0] }} />
      </div>
      <div className="controls">
        <div className={`dpad${dir(BTN.up) && ' up'}${dir(BTN.down) && ' down'}${dir(BTN.left) && ' left'}${dir(BTN.right) && ' right'}`} onPointerDown={padDown} onPointerMove={(e) => held.current.pointers.has(e.pointerId) && pad(e)} onPointerUp={lift} onPointerCancel={lift} role="group" aria-label="Direction pad">
          <img src="/art/shell/dpad.png" alt="" draggable={false} />
        </div>
        <div className="ab">
          <button type="button" className={`round b${dir(BTN.b)}`} onPointerDown={press(BTN.b)} onPointerUp={lift} onPointerCancel={lift} aria-label="B button">
            <img src="/art/shell/button.png" alt="" draggable={false} />
            <span>B</span>
          </button>
          <button type="button" className={`round a${dir(BTN.a)}`} onPointerDown={press(BTN.a)} onPointerUp={lift} onPointerCancel={lift} aria-label="A button">
            <img src="/art/shell/button.png" alt="" draggable={false} />
            <span>A</span>
          </button>
        </div>
      </div>
      <div className="pills">
        <button type="button" className="pill" onClick={toggleSound} aria-pressed={!muted}>
          <i />
          {muted ? 'SOUND OFF' : 'SOUND ON'}
        </button>
        <button type="button" className="pill" onClick={reset}>
          <i />
          RESET
        </button>
      </div>
      <div className="grille" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}
