import { describe, expect, it } from 'vitest'
import { replay, solve } from '@/bot/bot'
import { manifestBytes, validateManifest } from '@/cart/schema'
import { FALLBACK_TEMPLATE, TEMPLATES } from '@/cart/templates'
import { Engine } from '@/engine/engine'
import { Renderer } from '@/engine/render'
import { packSheet } from '@/engine/sheet'
import { BTN } from '@/engine/types'
import { composeSheet, synthCells } from '@/sprites/synth'
import { room, strip } from './helpers'

describe('the three hand-written carts', () => {
  it('are valid manifests well under the size limit', () => {
    expect(TEMPLATES.length).toBe(3)
    for (const manifest of TEMPLATES) {
      const result = validateManifest(manifest)
      expect(result.ok, result.ok ? '' : result.issues.join('; ')).toBe(true)
      expect(manifestBytes(manifest)).toBeLessThan(20000)
    }
    expect(new Set(TEMPLATES.map((m) => m.view)).size).toBe(2)
  })

  it('are each won by the bot inside the time limit, without losing a life', () => {
    for (const manifest of TEMPLATES) {
      const result = solve(manifest)
      expect(result.won, `${manifest.title}: ${result.reason}`).toBe(true)
      expect(result.frames).toBeLessThan(manifest.rules.timer * 60)
      const again = replay(manifest, result.tape)
      expect(again.state).toBe('won')
      expect(again.lives).toBe(manifest.rules.lives)
      expect(again.frames).toBe(result.frames)
    }
  })

  it('cannot be won by standing still or by holding one direction', () => {
    for (const manifest of TEMPLATES)
      for (const buttons of [0, BTN.right, BTN.up]) expect(replay(manifest, [buttons, manifest.rules.timer * 60 + 10]).state).toBe('lost')
  })

  it('simulate and draw a frame far inside the 16.7 ms budget in Node', () => {
    for (const manifest of TEMPLATES) {
      const game = new Engine(manifest)
      const renderer = new Renderer(packSheet(composeSheet(synthCells(manifest))))
      game.start()
      const frames = 3000
      const began = performance.now()
      for (let i = 0; i < frames; i++) {
        if (game.state !== 'playing') game.start()
        game.step([BTN.right, BTN.right | BTN.a, BTN.up, 0][(i >> 5) & 3] as number)
        renderer.draw(game, i)
      }
      const perFrame = (performance.now() - began) / frames
      expect(perFrame, `${manifest.title} took ${perFrame.toFixed(3)} ms a frame`).toBeLessThan(2)
    }
  })

  it('names a fallback that is one of them', () => {
    expect(TEMPLATES).toContain(FALLBACK_TEMPLATE)
  })
})

describe('the bot refuses carts that cannot be won', () => {
  it('a goal sealed behind walls', () => {
    const manifest = room([], {
      map: { w: 10, h: 8, rows: ['##########', '#........#', '#........#', '#........#', '#.....####', '#.....#..#', '#.....#..#', '##########'], tileB: 'solid' },
    })
    expect(solve(manifest)).toMatchObject({ won: false, reason: 'unreachable' })
  })

  it('a pit wider than any jump', () => {
    const manifest = strip([], {
      map: { w: 12, h: 8, rows: ['............', '............', '............', '............', '............', '............', '###......###', '###......###'], tileB: 'solid' },
    })
    const result = solve(manifest)
    expect(result.won).toBe(false)
    expect(result.reason).toBe('exhausted')
  })

  it('a ledge higher than any jump', () => {
    const manifest = strip([], {
      map: { w: 12, h: 8, rows: ['............', '.........###', '.........###', '.........###', '.........###', '.........###', '############', '############'], tileB: 'solid' },
      entities: [{ behavior: 'player', x: 1, y: 5, speed: 60, jump: 2 }, { behavior: 'goal', x: 10, y: 0 }],
    })
    expect(solve(manifest).won).toBe(false)
  })

  it('a corridor filled wall to wall with a hazard', () => {
    const manifest = room([{ behavior: 'hazard', x: 4, y: 1, w: 1, h: 6 }])
    const result = solve(manifest)
    expect(result.won).toBe(false)
    expect(result.reason).toBe('exhausted')
  })

  it('a clock too short to cross the map', () => {
    const rows = ['####################', '#..................#', '#.##################', '#..................#', '##################.#', '#..................#', '####################', '####################']
    const manifest = room([], {
      map: { w: 20, h: 8, rows, tileB: 'solid' },
      entities: [{ behavior: 'player', x: 18, y: 1, speed: 30, jump: 2 }, { behavior: 'goal', x: 1, y: 5 }],
      rules: { lives: 3, timer: 20, goal: { opens: 'always', amount: 0 } },
    })
    expect(solve(manifest).won).toBe(false)
    expect(solve({ ...manifest, rules: { ...manifest.rules, timer: 120 } }).won).toBe(true)
  })

  it('a goal that needs a pickup nobody can reach', () => {
    const manifest = room([{ behavior: 'collectible', x: 8, y: 1, points: 10 }], {
      map: { w: 10, h: 8, rows: ['##########', '#.....#..#', '#.....####', '#........#', '#........#', '#........#', '#........#', '##########'], tileB: 'solid' },
      rules: { lives: 3, timer: 60, goal: { opens: 'collect', amount: 1 } },
    })
    expect(solve(manifest)).toMatchObject({ won: false, reason: 'unreachable' })
  })

  it('and gives up inside its budget rather than searching forever', () => {
    const cars = Array.from({ length: 6 }, (_, i) => ({ behavior: 'patrol' as const, sprite: 'enemy1' as const, x: 4, y: 1 + i, speed: 60, axis: 'y' as const, dir: 1 as const, range: 0, wrap: true, touch: 'hurt' as const }))
    const manifest = room([{ behavior: 'hazard', x: 4, y: 1, w: 1, h: 6 }, ...cars])
    const result = solve(manifest, { maxExpansions: 3000 })
    expect(result.won).toBe(false)
    expect(result.expanded).toBeLessThanOrEqual(3000)
  })
})
