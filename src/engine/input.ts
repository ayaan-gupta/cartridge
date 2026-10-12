/** Mapping from physical input to the six buttons. Pure, so it can be tested. */
import type { Buttons } from './types'
import { BTN } from './types'

const KEYS: Record<string, number> = {
  ArrowUp: BTN.up,
  ArrowDown: BTN.down,
  ArrowLeft: BTN.left,
  ArrowRight: BTN.right,
  KeyW: BTN.up,
  KeyS: BTN.down,
  KeyA: BTN.left,
  KeyD: BTN.right,
  KeyZ: BTN.a,
  KeyK: BTN.a,
  Space: BTN.a,
  Enter: BTN.a,
  KeyX: BTN.b,
  KeyJ: BTN.b,
  ShiftLeft: BTN.b,
  ShiftRight: BTN.b,
}

/** The button for a KeyboardEvent.code, or 0 when the key is not ours. */
export function buttonForKey(code: string): Buttons {
  return KEYS[code] ?? 0
}

/**
 * Turns a touch on the d-pad into direction bits. `dx` and `dy` are the
 * offset from the centre of the pad and `radius` is half its width. The
 * middle is a dead zone, and the diagonals are real, so a thumb can roll
 * from one direction to the next without lifting.
 */
export function dpadButtons(dx: number, dy: number, radius: number): Buttons {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < radius * 0.22 && ay < radius * 0.22) return 0
  let buttons = 0
  // tan(22.5 degrees): inside that wedge of an axis the touch is not diagonal.
  const wedge = 0.4142
  if (ax > ay * wedge) buttons |= dx > 0 ? BTN.right : BTN.left
  if (ay > ax * wedge) buttons |= dy > 0 ? BTN.down : BTN.up
  return buttons
}

export const STEP_MS = 1000 / 60
const SLACK_MS = 1

/**
 * The fixed timestep. Given the time banked so far and the time since the
 * last display frame, says how many simulation steps to run. A little slack
 * stops a 59.9 Hz display from alternating between zero and two steps, and
 * the cap stops a long stall from turning into a burst of catching up.
 */
export function advance(banked: number, elapsedMs: number, maxSteps = 4): { steps: number; banked: number } {
  const total = banked + Math.min(Math.max(elapsedMs, 0), 250)
  const due = Math.floor((total + SLACK_MS) / STEP_MS)
  if (due > maxSteps) return { steps: maxSteps, banked: 0 }
  return { steps: due, banked: total - due * STEP_MS }
}
