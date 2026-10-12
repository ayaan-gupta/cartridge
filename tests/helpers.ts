import { Engine } from '@/engine/engine'
import { hashString } from '@/engine/rng'
import type { Buttons, EntityDef, Manifest } from '@/engine/types'

/** A small walled room seen from above, with the player and goal in opposite corners. */
export function room(extra: EntityDef[] = [], patch: Partial<Manifest> = {}): Manifest {
  return {
    v: 1,
    title: 'TEST ROOM',
    blurb: 'A room for tests.',
    view: 'top',
    palette: ['#e0f8d0', '#88c070', '#346856', '#081820'],
    music: 'overworld',
    art: {
      player: 'hero',
      enemies: ['slime', 'bat', 'rock'],
      goal: 'flag',
      tiles: ['brick', 'grass'],
      background: 'floor',
      item: 'coin',
      hazard: 'spike',
    },
    map: {
      w: 10,
      h: 8,
      rows: [
        '##########',
        '#........#',
        '#........#',
        '#........#',
        '#........#',
        '#........#',
        '#........#',
        '##########',
      ],
      tileB: 'solid',
    },
    entities: [{ behavior: 'player', x: 1, y: 1, speed: 60, jump: 2.5 }, { behavior: 'goal', x: 8, y: 6 }, ...extra],
    rules: { lives: 3, timer: 60, goal: { opens: 'always', amount: 0 } },
    ...patch,
  }
}

/** A flat side-view strip: open sky over two rows of ground. */
export function strip(extra: EntityDef[] = [], patch: Partial<Manifest> = {}): Manifest {
  return room(extra, {
    view: 'side',
    map: {
      w: 12,
      h: 8,
      rows: [
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '############',
        '############',
      ],
      tileB: 'solid',
    },
    entities: [{ behavior: 'player', x: 1, y: 5, speed: 60, jump: 2.5 }, { behavior: 'goal', x: 10, y: 5 }, ...extra],
    ...patch,
  })
}

export function started(manifest: Manifest): Engine {
  const game = new Engine(manifest)
  game.start()
  return game
}

export function run(game: Engine, buttons: Buttons, frames: number): Engine {
  for (let i = 0; i < frames; i++) game.step(buttons)
  return game
}

export function digest(bytes: Uint8Array): number {
  let text = ''
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i] as number)
  return hashString(text)
}
