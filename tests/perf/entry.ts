/**
 * The page-side half of the frame budget test. Bundled with esbuild and
 * loaded into a blank page, so it measures the engine's own runner and
 * nothing else: no React, no Next, no network.
 */
import type { FrameStats } from '@/engine/runner'
import { Runner } from '@/engine/runner'
import type { Cart, Tape } from '@/engine/types'

declare global {
  interface Window {
    runCart: (cart: Cart, tape: Tape, warmup: number, frames: number) => Promise<FrameStats>
  }
}

window.runCart = (cart, tape, warmup, frames) =>
  new Promise((resolve) => {
    const canvas = document.getElementById('screen') as HTMLCanvasElement
    const runner: Runner = new Runner(canvas, cart, { onTapeEnd: () => runner.playTape(tape) })
    runner.playTape(tape)
    runner.start()
    let seen = 0
    const tick = () => {
      seen++
      // Throw away the frames in which the JIT was still warming up.
      if (seen === warmup) runner.readStats()
      if (seen >= warmup + frames) {
        runner.stop()
        resolve(runner.readStats())
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
