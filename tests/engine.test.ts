import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, jumpVelocity, pxPerFrame } from '@/engine/engine'
import { drawText, textWidth, wrapText } from '@/engine/font'
import { advance, buttonForKey, dpadButtons, STEP_MS } from '@/engine/input'
import { Renderer } from '@/engine/render'
import { packSheet, TRANSPARENT, unpackSheet } from '@/engine/sheet'
import type { Ent, Spec } from '@/engine/engine'
import { BTN, SCREEN_H, SCREEN_W, SHEET_H, SHEET_W, TILE } from '@/engine/types'
import { composeSheet, defaultCells } from '@/sprites/synth'
import { digest, room, run, started, strip } from './helpers'

const sheet = packSheet(composeSheet(defaultCells()))
const kindOf = (game: Engine, e: Ent) => (game.specs[e.s] as Spec).kind

describe('fixed timestep', () => {
  it('runs one step per 60 Hz display frame', () => {
    let banked = 0
    let steps = 0
    for (let i = 0; i < 600; i++) {
      const r = advance(banked, STEP_MS)
      banked = r.banked
      steps += r.steps
    }
    expect(steps).toBe(600)
  })

  it('runs every other frame on a 120 Hz display and twice per frame at 30 Hz', () => {
    let banked = 0
    let steps = 0
    for (let i = 0; i < 1200; i++) {
      const r = advance(banked, STEP_MS / 2)
      banked = r.banked
      steps += r.steps
    }
    expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1)
    expect(advance(0, STEP_MS * 2).steps).toBe(2)
  })

  it('does not alternate between zero and two steps on a slightly slow display', () => {
    let banked = 0
    const counts: number[] = []
    for (let i = 0; i < 300; i++) {
      const r = advance(banked, 16.72)
      banked = r.banked
      counts.push(r.steps)
    }
    expect(counts.filter((n) => n === 0).length).toBe(0)
    expect(counts.filter((n) => n === 2).length).toBeLessThanOrEqual(2)
  })

  it('caps the catch-up after a long stall', () => {
    const r = advance(0, 5000)
    expect(r.steps).toBe(4)
    expect(r.banked).toBe(0)
  })
})

describe('determinism', () => {
  it('gives the same picture for the same inputs, twice', () => {
    const play = () => {
      const game = started(strip([{ behavior: 'spawner', x: 6, y: 0, every: 0.5, spread: 3, emits: { behavior: 'falling', sprite: 'enemy3', speed: 90, axis: 'y', dir: 1, touch: 'hurt' } }]))
      const renderer = new Renderer(sheet)
      const hashes: number[] = []
      const tape = [BTN.right, 30, BTN.right | BTN.a, 12, 0, 20, BTN.left, 25, BTN.a, 8, BTN.right, 60]
      for (let i = 0; i < tape.length; i += 2) {
        run(game, tape[i] as number, tape[i + 1] as number)
        hashes.push(digest(renderer.draw(game, game.frame)))
      }
      return hashes
    }
    const first = play()
    expect(play()).toEqual(first)
    expect(new Set(first).size).toBeGreaterThan(3)
  })

  it('restores a snapshot exactly, including the random stream', () => {
    const manifest = strip([{ behavior: 'spawner', x: 6, y: 0, every: 0.4, spread: 4, emits: { behavior: 'falling', sprite: 'enemy3', speed: 60, axis: 'y', dir: 1, touch: 'collect' } }])
    const game = started(manifest)
    run(game, BTN.right, 50)
    const saved = game.snapshot()
    run(game, BTN.left | BTN.a, 120)
    const later = JSON.stringify(game.snapshot(), (_, v) => (v instanceof Float64Array ? [...v] : v))
    game.restore(saved)
    run(game, BTN.left | BTN.a, 120)
    expect(JSON.stringify(game.snapshot(), (_, v) => (v instanceof Float64Array ? [...v] : v))).toBe(later)
  })

  it('converts speeds to exact eighths of a pixel', () => {
    expect(pxPerFrame(60)).toBe(1)
    expect(pxPerFrame(75)).toBe(1.25)
    expect(pxPerFrame(1)).toBe(0.125)
    expect((jumpVelocity(2.5) * 8) % 1).toBe(0)
  })
})

describe('movement and collision', () => {
  it('keeps the player inside solid walls in the top view', () => {
    const game = started(room())
    run(game, BTN.right, 400)
    expect(game.p.x).toBe(8 * TILE + TILE - 3 - 10)
    run(game, BTN.up | BTN.left, 400)
    expect(game.p.x).toBe(TILE - 3)
    expect(game.p.y).toBe(TILE - 5)
  })

  it('lands on the ground and jumps to the height the manifest asks for', () => {
    const game = started(strip())
    run(game, 0, 30)
    expect(game.p.ground).toBe(true)
    const floor = game.p.y
    let peak = floor
    game.step(BTN.a)
    for (let i = 0; i < 80; i++) {
      game.step(BTN.a)
      peak = Math.min(peak, game.p.y)
    }
    const tiles = (floor - peak) / TILE
    expect(tiles).toBeGreaterThan(2.3)
    expect(tiles).toBeLessThan(2.9)
    expect(game.p.y).toBe(floor)
  })

  it('cuts a jump short when the button is released, and never double jumps', () => {
    const tap = started(strip())
    run(tap, 0, 30)
    const floor = tap.p.y
    tap.step(BTN.a)
    let peak = floor
    for (let i = 0; i < 80; i++) {
      tap.step(0)
      peak = Math.min(peak, tap.p.y)
    }
    expect((floor - peak) / TILE).toBeLessThan(1.2)

    const air = started(strip())
    run(air, 0, 30)
    air.step(BTN.a)
    run(air, BTN.a, 12)
    const rising = air.p.vy
    air.step(0)
    air.step(BTN.a)
    expect(air.p.vy).toBeGreaterThan(rising)
  })

  it('costs a life to fall off the bottom of a side-view map', () => {
    const manifest = strip([], {
      map: { w: 12, h: 8, rows: ['............', '............', '............', '............', '............', '............', '###.....####', '###.....####'], tileB: 'solid' },
    })
    const game = started(manifest)
    run(game, BTN.right, 75)
    expect(game.lives).toBe(2)
    expect(game.p.invuln).toBeGreaterThan(0)
    expect(game.p.y).toBeLessThan(6 * TILE)
  })
})

describe('behaviours', () => {
  it('patrol turns at walls and at the end of its range', () => {
    const game = started(room([
      { behavior: 'patrol', sprite: 'enemy1', x: 3, y: 3, speed: 60, axis: 'x', dir: 1, range: 0, wrap: false, touch: 'hurt' },
      { behavior: 'patrol', sprite: 'enemy1', x: 3, y: 5, speed: 60, axis: 'x', dir: 1, range: 2, wrap: false, touch: 'hurt' },
    ]))
    const [walls, ranged] = [game.ents[1] as Ent, game.ents[2] as Ent]
    let maxWalls = 0
    let minWalls = 999
    let maxRanged = 0
    let minRanged = 999
    for (let i = 0; i < 600; i++) {
      game.step(0)
      maxWalls = Math.max(maxWalls, walls.x)
      minWalls = Math.min(minWalls, walls.x)
      maxRanged = Math.max(maxRanged, ranged.x)
      minRanged = Math.min(minRanged, ranged.x)
    }
    expect(maxWalls).toBe(8 * TILE)
    expect(minWalls).toBe(TILE)
    expect(maxRanged).toBe(5 * TILE)
    expect(minRanged).toBe(3 * TILE)
  })

  it('a wrapping patrol leaves one edge and returns on the other', () => {
    const manifest = room([{ behavior: 'patrol', sprite: 'enemy1', x: 5, y: 3, speed: 120, axis: 'x', dir: 1, range: 0, wrap: true, touch: 'hurt' }], {
      map: { w: 10, h: 8, rows: Array.from({ length: 8 }, () => '..........'), tileB: 'solid' },
    })
    const game = started(manifest)
    const car = game.ents[1] as Ent
    const seen: number[] = []
    for (let i = 0; i < 200; i++) {
      game.step(0)
      seen.push(car.x)
    }
    expect(Math.max(...seen)).toBeGreaterThan(9 * TILE)
    expect(Math.min(...seen)).toBe(-TILE)
    expect(car.dir).toBe(1)
  })

  it('a walker turns at a ledge instead of stepping off', () => {
    const manifest = strip([{ behavior: 'patrol', sprite: 'enemy1', x: 5, y: 5, speed: 60, axis: 'x', dir: 1, range: 0, wrap: false, touch: 'hurt' }], {
      map: { w: 12, h: 8, rows: ['............', '............', '............', '............', '............', '............', '###.#####.##', '###.#####.##'], tileB: 'solid' },
    })
    const game = started(manifest)
    const walker = game.ents[1] as Ent
    const xs: number[] = []
    for (let i = 0; i < 400; i++) {
      game.step(0)
      xs.push(walker.x)
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(4 * TILE)
    expect(Math.max(...xs)).toBeLessThanOrEqual(8 * TILE)
    expect(walker.y).toBe(5 * TILE)
  })

  it('chase closes in on the player, but only inside its range', () => {
    const near = started(room([{ behavior: 'chase', sprite: 'enemy1', x: 6, y: 1, speed: 30, range: 0 }]))
    const hunter = near.ents[1] as Ent
    const before = Math.abs(hunter.x - near.p.x)
    run(near, 0, 60)
    expect(Math.abs(hunter.x - near.p.x)).toBeLessThan(before)

    const far = started(room([{ behavior: 'chase', sprite: 'enemy1', x: 8, y: 1, speed: 30, range: 2 }]))
    run(far, 0, 60)
    expect((far.ents[1] as Ent).x).toBe(8 * TILE)
  })

  it('falling drops, lands and goes back to the top', () => {
    const game = started(strip([{ behavior: 'falling', sprite: 'enemy3', x: 6, y: 0, speed: 120, every: 0.5, touch: 'hurt' }]))
    const rock = game.ents[1] as Ent
    const ys: number[] = []
    for (let i = 0; i < 300; i++) {
      game.step(0)
      ys.push(rock.y)
    }
    expect(Math.max(...ys)).toBeGreaterThan(4 * TILE)
    expect(ys.filter((y, i) => i > 0 && y === 0 && (ys[i - 1] as number) > 0).length).toBeGreaterThanOrEqual(2)
  })

  it('spawner emits movers that clean themselves up', () => {
    const game = started(strip([{ behavior: 'spawner', x: 6, y: 0, every: 0.5, spread: 4, emits: { behavior: 'falling', sprite: 'enemy3', speed: 120, axis: 'y', dir: 1, touch: 'hurt' } }], { rules: { lives: 9, timer: 300, goal: { opens: 'always', amount: 0 } } }))
    let most = 0
    const columns = new Set<number>()
    for (let i = 0; i < 1800; i++) {
      game.step(0)
      const live = game.ents.filter((e) => e.alive && kindOf(game, e) === 'falling')
      most = Math.max(most, live.length)
      for (const e of live) columns.add(e.x)
    }
    expect(most).toBeGreaterThan(0)
    expect(most).toBeLessThan(6)
    expect(game.ents.length).toBeLessThan(10)
    expect(columns.size).toBeGreaterThan(3)
  })
})

describe('rules', () => {
  it('collecting scores points and opens the goal', () => {
    const manifest = room([{ behavior: 'collectible', x: 3, y: 1, points: 25 }, { behavior: 'collectible', x: 5, y: 1, points: 25 }], {
      rules: { lives: 3, timer: 60, goal: { opens: 'collect', amount: 2 } },
    })
    const game = started(manifest)
    expect(game.goalOpen).toBe(false)
    run(game, BTN.right, 40)
    expect(game.score).toBe(25)
    expect(game.goalOpen).toBe(false)
    run(game, BTN.right, 40)
    expect(game.score).toBe(50)
    expect(game.goalOpen).toBe(true)
  })

  it('touching the goal wins only once it is open', () => {
    const locked = started(room([], { entities: [{ behavior: 'player', x: 1, y: 1, speed: 60, jump: 2 }, { behavior: 'goal', x: 3, y: 1 }], rules: { lives: 3, timer: 60, goal: { opens: 'survive', amount: 3 } } }))
    run(locked, BTN.right, 30)
    run(locked, 0, 100)
    expect(locked.state).toBe('playing')
    expect(locked.goalOpen).toBe(false)
    run(locked, 0, 60)
    expect(locked.state).toBe('won')
    expect(locked.score).toBeGreaterThan(0)

    const open = started(room([], { entities: [{ behavior: 'player', x: 1, y: 1, speed: 60, jump: 2 }, { behavior: 'goal', x: 3, y: 1 }] }))
    run(open, BTN.right, 60)
    expect(open.state).toBe('won')
  })

  it('hazards cost a life, send the player home, and grant a moment of safety', () => {
    const game = started(room([{ behavior: 'hazard', x: 3, y: 1, w: 5, h: 1 }]))
    run(game, BTN.right, 23)
    expect(game.lives).toBe(2)
    expect(game.p.x).toBe(TILE)
    expect(game.p.invuln).toBeGreaterThan(0)
    // Safety is brief: not long enough to stroll across five tiles of spikes.
    run(game, BTN.right, 400)
    expect(game.lives).toBe(0)
    expect(game.state).toBe('lost')
  })

  it('moving enemies hurt on contact', () => {
    const game = started(room([{ behavior: 'patrol', sprite: 'enemy1', x: 4, y: 1, speed: 60, axis: 'x', dir: -1, range: 0, wrap: false, touch: 'hurt' }]))
    run(game, 0, 60)
    expect(game.lives).toBe(2)
  })

  it('loses when the clock runs out', () => {
    const game = started(room([], { rules: { lives: 3, timer: 20, goal: { opens: 'always', amount: 0 } } }))
    run(game, 0, 20 * 60)
    expect(game.state).toBe('playing')
    expect(game.secondsLeft).toBe(0)
    game.step(0)
    expect(game.state).toBe('lost')
    expect(game.lives).toBe(3)
  })

  it('waits on the title card until A is pressed, then restarts the same way', () => {
    const game = new Engine(room())
    run(game, BTN.right, 30)
    expect(game.state).toBe('title')
    game.step(BTN.a)
    expect(game.state).toBe('playing')
    expect(game.frame).toBe(0)
  })
})

describe('rendering and sheets', () => {
  it('round-trips a sheet through its packed form', () => {
    const pixels = composeSheet(defaultCells())
    expect([...unpackSheet(packSheet(pixels))]).toEqual([...pixels])
    expect(pixels.includes(TRANSPARENT)).toBe(true)
    expect(pixels.length).toBe(SHEET_W * SHEET_H)
  })

  it('draws only the four palette indices, on every screen', () => {
    const game = new Engine(strip([{ behavior: 'collectible', x: 3, y: 5, points: 10 }]))
    const renderer = new Renderer(sheet)
    const screens = [renderer.draw(game, 0).slice()]
    game.start()
    run(game, BTN.right, 20)
    screens.push(renderer.draw(game, 20).slice())
    for (const fb of screens) {
      expect(fb.length).toBe(SCREEN_W * SCREEN_H)
      expect(Math.max(...fb)).toBeLessThanOrEqual(3)
    }
    expect(digest(screens[0] as Uint8Array)).not.toBe(digest(screens[1] as Uint8Array))
  })

  it('keeps the camera inside the map while following the player', () => {
    const manifest = strip([], {
      map: { w: 20, h: 8, rows: [...Array.from({ length: 6 }, () => '.'.repeat(20)), '#'.repeat(20), '#'.repeat(20)], tileB: 'solid' },
      entities: [{ behavior: 'player', x: 1, y: 5, speed: 60, jump: 2.5 }, { behavior: 'goal', x: 19, y: 5 }],
    })
    const game = started(manifest)
    const renderer = new Renderer(sheet)
    expect(renderer.camera(game).x).toBe(0)
    run(game, BTN.right, 200)
    expect(renderer.camera(game).x).toBeGreaterThan(0)
    run(game, BTN.right, 60)
    expect(renderer.camera(game).x).toBe(20 * TILE - SCREEN_W)
  })
})

describe('the pixel font', () => {
  const ink = (text: string) => {
    const w = textWidth(text)
    const fb = new Uint8Array(w * 5)
    drawText(fb, w, 5, text, 0, 0, 1)
    return Array.from({ length: 5 }, (_, y) => [...fb.slice(y * w, y * w + w)].join('')).join('/')
  }

  it('draws M, N, W and H so they cannot be mistaken for each other', () => {
    const shapes = ['M', 'N', 'W', 'H', 'U', 'V'].map(ink)
    expect(new Set(shapes).size).toBe(6)
    expect(ink('N')).toBe('1001/1101/1011/1001/1001')
    expect(ink('I')).toBe('111/010/010/010/111')
  })

  it('measures text by its real width, wide letters included', () => {
    expect(textWidth('')).toBe(0)
    expect(textWidth('A')).toBe(3)
    expect(textWidth('AB')).toBe(7)
    expect(textWidth('MN')).toBe(10)
    expect(textWidth('mn')).toBe(10)
    expect(textWidth('A B')).toBe(11)
    expect(textWidth('AB', 2)).toBe(14)
  })

  it('wraps at spaces to a pixel width, and never draws off the screen', () => {
    const lines = wrapText('A KNIGHT CLIMBING A TOWER FULL OF GOBLINS TO RESCUE THE PRINCESS.', 144)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line)).toBeLessThanOrEqual(144)
    expect(lines.join(' ')).toBe('A KNIGHT CLIMBING A TOWER FULL OF GOBLINS TO RESCUE THE PRINCESS.')
    for (const title of ['WWWWWWWWWWWWWWWWWWWWWWWW', 'MOUNTAINEERING MAMMOTHS', 'A B']) for (const line of wrapText(title, 148, 2)) expect(textWidth(line, 2)).toBeLessThanOrEqual(148)
    expect(wrapText('', 100)).toEqual([])
  })
})

describe('input', () => {
  it('maps keys to buttons', () => {
    expect(buttonForKey('ArrowLeft')).toBe(BTN.left)
    expect(buttonForKey('KeyZ')).toBe(BTN.a)
    expect(buttonForKey('KeyX')).toBe(BTN.b)
    expect(buttonForKey('KeyQ')).toBe(0)
  })

  it('reads a d-pad touch as one of eight directions with a dead centre', () => {
    expect(dpadButtons(2, 3, 40)).toBe(0)
    expect(dpadButtons(30, 2, 40)).toBe(BTN.right)
    expect(dpadButtons(-30, -4, 40)).toBe(BTN.left)
    expect(dpadButtons(1, -30, 40)).toBe(BTN.up)
    expect(dpadButtons(25, 25, 40)).toBe(BTN.right | BTN.down)
    expect(dpadButtons(-25, -22, 40)).toBe(BTN.left | BTN.up)
  })
})

describe('the engine stands alone', () => {
  const dir = path.join(process.cwd(), 'src', 'engine')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

  it('imports nothing outside its own folder', () => {
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8')
      for (const match of source.matchAll(/from '([^']+)'/g)) expect(match[1]?.startsWith('./'), `${file} imports ${match[1]}`).toBe(true)
    }
  })

  it('keeps the simulation free of the DOM, the clock and Math.random', () => {
    for (const file of ['engine.ts', 'render.ts', 'font.ts', 'sheet.ts', 'rng.ts', 'types.ts', 'input.ts']) {
      const source = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(source, file).not.toMatch(/\b(document|window|requestAnimationFrame|Date\.now|performance\.now|Math\.random|Math\.sin|Math\.cos)\b/)
    }
  })
})

describe('the runner, on a stand-in canvas', () => {
  /** Just enough of a canvas and a display for the runner to drive. */
  function harness() {
    const image = { data: new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4) }
    let blits = 0
    const canvas = { width: 0, height: 0, getContext: () => ({ createImageData: () => image, putImageData: () => blits++ }) }
    let pending: ((now: number) => void) | null = null
    let now = 1000
    const globals = globalThis as unknown as { requestAnimationFrame: unknown; cancelAnimationFrame: unknown }
    globals.requestAnimationFrame = (callback: (now: number) => void) => {
      pending = callback
      return 1
    }
    globals.cancelAnimationFrame = () => {
      pending = null
    }
    const frames = (count: number, interval = STEP_MS) => {
      for (let i = 0; i < count; i++) {
        now += interval
        const callback = pending
        pending = null
        callback?.(now)
      }
    }
    return { canvas: canvas as unknown as HTMLCanvasElement, image, frames, blits: () => blits }
  }

  it('does not lose a tap that goes down and up between two frames', async () => {
    const { Runner } = await import('@/engine/runner')
    const h = harness()
    const runner = new Runner(h.canvas, { manifest: strip(), sheet })
    runner.start()
    h.frames(3)
    expect(runner.engine.state).toBe('title')
    runner.hold(BTN.a)
    runner.hold(0)
    h.frames(1)
    expect(runner.engine.state).toBe('playing')
    // And the tap is spent: it does not turn into a held button.
    h.frames(30)
    const floor = runner.engine.p.y
    h.frames(30)
    expect(runner.engine.p.y).toBe(floor)
  })

  it('plays a recording to a win, draws in the cart palette, and reports what it cost', async () => {
    const { Runner } = await import('@/engine/runner')
    const { solve } = await import('@/bot/bot')
    const manifest = strip()
    const tape = solve(manifest).tape
    const h = harness()
    let ended = 0
    const events: string[] = []
    const runner = new Runner(h.canvas, { manifest, sheet }, { onTapeEnd: () => ended++, onEvent: (e) => events.push(e) })
    runner.start()
    runner.playTape(tape)
    expect(runner.watching).toBe(true)
    runner.hold(BTN.left)
    h.frames(400)
    expect(runner.engine.state).toBe('won')
    expect(ended).toBe(1)
    expect(runner.watching).toBe(false)
    expect(events).toContain('win')
    const stats = runner.readStats()
    expect(stats.frames).toBe(400)
    expect(stats.steps).toBe(400)
    expect(stats.late).toBe(0)
    expect(h.blits()).toBeGreaterThan(300)
    const colours = new Set<string>()
    for (let i = 0; i < h.image.data.length; i += 4) colours.add(`${h.image.data[i]},${h.image.data[i + 1]},${h.image.data[i + 2]}`)
    expect([...colours].sort()).toEqual(['136,192,112', '224,248,208', '52,104,86', '8,24,32'])
    expect(runner.readStats().frames).toBe(0)
  })

  it('hands control back mid-recording, from wherever the bot had got to', async () => {
    const { Runner } = await import('@/engine/runner')
    const { solve } = await import('@/bot/bot')
    const manifest = strip()
    const h = harness()
    const runner = new Runner(h.canvas, { manifest, sheet })
    runner.start()
    runner.playTape(solve(manifest).tape)
    h.frames(40)
    const x = runner.engine.p.x
    expect(x).toBeGreaterThan(TILE)
    runner.takeOver()
    runner.hold(BTN.left)
    h.frames(20)
    expect(runner.engine.p.x).toBeLessThan(x)
    expect(runner.engine.state).toBe('playing')
  })

  it('runs the simulation at 60 steps a second on a 120 Hz display', async () => {
    const { Runner } = await import('@/engine/runner')
    const h = harness()
    const runner = new Runner(h.canvas, { manifest: strip(), sheet })
    runner.start()
    runner.hold(BTN.a)
    h.frames(240, STEP_MS / 2)
    expect(Math.abs(runner.engine.frame - 120)).toBeLessThanOrEqual(2)
  })
})
