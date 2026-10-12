/**
 * The browser half of the engine: a requestAnimationFrame loop that feeds
 * the fixed timestep, and a blit from palette indices to canvas pixels.
 * Nothing in here is needed to simulate a game, only to show one.
 */
import { Engine } from './engine'
import { advance } from './input'
import { Renderer } from './render'
import type { Buttons, Cart, GameEvent, Tape } from './types'
import { SCREEN_H, SCREEN_W } from './types'

export interface FrameStats {
  /** Display frames measured. */
  frames: number
  /** Mean milliseconds of simulation plus drawing per display frame. */
  workMs: number
  /** Worst single frame of work. */
  worstMs: number
  /** Mean milliseconds between display frames. */
  intervalMs: number
  /** Display frames that arrived more than half a frame late. */
  late: number
}

export interface RunnerOptions {
  onEvent?: (event: GameEvent) => void
  /** Called when a recording finishes or the game it was driving ends. */
  onTapeEnd?: () => void
}

/** Packs "#rrggbb" into the byte order a little-endian ImageData wants. */
export function paletteWords(palette: readonly string[]): Uint32Array {
  return Uint32Array.from(palette, (hex) => {
    const n = Number.parseInt(hex.replace('#', ''), 16)
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0
  })
}

export class Runner {
  readonly engine: Engine
  /** The buttons currently held. The page sets this from keys and touches. */
  buttons: Buttons = 0
  private readonly renderer: Renderer
  private readonly context: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly words: Uint32Array
  private readonly colors: Uint32Array
  private readonly options: RunnerOptions
  private handle = 0
  private last = 0
  private banked = 0
  private tick = 0
  private tape: Tape | null = null
  private tapeAt = 0
  private tapeLeft = 0
  private stats = { frames: 0, work: 0, worst: 0, interval: 0, late: 0 }

  constructor(canvas: HTMLCanvasElement, cart: Cart, options: RunnerOptions = {}) {
    canvas.width = SCREEN_W
    canvas.height = SCREEN_H
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('This browser cannot draw to a canvas.')
    this.context = context
    this.image = context.createImageData(SCREEN_W, SCREEN_H)
    this.words = new Uint32Array(this.image.data.buffer)
    this.colors = paletteWords(cart.manifest.palette)
    this.engine = new Engine(cart.manifest)
    this.renderer = new Renderer(cart.sheet)
    this.options = options
    this.present()
  }

  start(): void {
    if (this.handle) return
    this.last = 0
    this.handle = requestAnimationFrame(this.frame)
  }

  stop(): void {
    if (this.handle) cancelAnimationFrame(this.handle)
    this.handle = 0
  }

  /** Starts a fresh game and plays a recording into it instead of live input. */
  playTape(tape: Tape): void {
    this.tape = tape
    this.tapeAt = 0
    this.tapeLeft = 0
    this.engine.start()
    this.emit()
  }

  /** Drops any recording and hands control back to the player. */
  takeOver(): void {
    this.tape = null
  }

  get watching(): boolean {
    return this.tape !== null
  }

  /** Clears the frame statistics and returns what was gathered. */
  readStats(): FrameStats {
    const s = this.stats
    const n = Math.max(1, s.frames)
    const out = { frames: s.frames, workMs: s.work / n, worstMs: s.worst, intervalMs: s.interval / n, late: s.late }
    this.stats = { frames: 0, work: 0, worst: 0, interval: 0, late: 0 }
    return out
  }

  private nextButtons(): Buttons {
    const tape = this.tape
    if (!tape) return this.buttons
    while (this.tapeLeft === 0 && this.tapeAt + 1 < tape.length) {
      this.tapeLeft = tape[this.tapeAt + 1] as number
      this.tapeAt += 2
    }
    if (this.tapeLeft === 0 || this.engine.state !== 'playing') {
      this.tape = null
      this.options.onTapeEnd?.()
      return 0
    }
    this.tapeLeft--
    return tape[this.tapeAt - 2] as number
  }

  private emit(): void {
    const notify = this.options.onEvent
    if (notify) for (const event of this.engine.events) notify(event)
  }

  private present(): void {
    const fb = this.renderer.draw(this.engine, this.tick)
    const words = this.words
    const colors = this.colors
    for (let i = 0; i < fb.length; i++) words[i] = colors[fb[i] as number] as number
    this.context.putImageData(this.image, 0, 0)
  }

  private frame = (now: number): void => {
    this.handle = requestAnimationFrame(this.frame)
    const elapsed = this.last === 0 ? 1000 / 60 : now - this.last
    this.last = now
    const began = performance.now()
    const due = advance(this.banked, elapsed)
    this.banked = due.banked
    for (let i = 0; i < due.steps; i++) {
      this.engine.step(this.nextButtons())
      this.emit()
      this.tick++
    }
    if (due.steps > 0) this.present()
    const work = performance.now() - began
    const s = this.stats
    s.frames++
    s.work += work
    s.interval += elapsed
    if (work > s.worst) s.worst = work
    if (elapsed > 25) s.late++
  }
}
