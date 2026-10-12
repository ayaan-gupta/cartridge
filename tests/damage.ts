import type { Rng } from '@/engine/rng'
import type { Manifest } from '@/engine/types'

// Deliberately loose: these helpers exist to build invalid data.
export type Loose = Record<string, any>
export const clone = (m: Manifest): Loose => JSON.parse(JSON.stringify(m))

/** Ways a generator has been seen, or can be imagined, to get a manifest wrong. */
export const MUTATIONS: ((m: Loose, rng: Rng) => void)[] = [
  (m) => delete m.title,
  (m) => delete m.palette,
  (m) => delete m.art,
  (m) => delete m.rules,
  (m) => (m.rules.timer = '60'),
  (m) => (m.rules.lives = 99),
  (m) => (m.entities[0].speed = 9999),
  (m) => (m.entities[1].x = -3),
  (m) => (m.entities[1].x = 500),
  (m) => m.entities.push({ ...m.entities[0] }),
  (m) => m.entities.push({ behavior: 'goal', x: 2, y: 2 }),
  (m) => (m.entities = m.entities.filter((e: Loose) => e.behavior !== 'player')),
  (m) => (m.entities = m.entities.filter((e: Loose) => e.behavior !== 'goal')),
  (m) => (m.map.rows[2] = m.map.rows[2].slice(0, 4)),
  (m) => (m.map.rows[1] = `${m.map.rows[1]}......`),
  (m) => (m.map.rows[3] = m.map.rows[3].replace(/\./g, '?')),
  (m) => m.map.rows.pop(),
  (m) => (m.map.h = m.map.h + 3),
  (m) => m.entities.push({ behavior: 'teleporter', x: 1, y: 1 }),
  (m) => (m.debug = true),
  (m) => (m.entities[0].inventory = ['sword']),
  (m) => (m.palette = m.palette.slice(0, 3)),
  (m) => (m.palette = m.palette.map((c: string) => c.slice(1).toUpperCase())),
  (m) => (m.rules.goal = { opens: 'collect', amount: 99 }),
  (m) => m.entities.push({ behavior: 'chase', sprite: 'enemy1', x: 3, y: 3, speed: 150, range: 0 }),
  (m) => (m.title = 'A TITLE THAT GOES ON FOR MUCH TOO LONG TO FIT'),
  (m) => (m.music = 'dubstep'),
  (m) => (m.view = 'isometric'),
  (m) => (m.art.enemies = ['only one']),
  (m) => (m.entities[2] = { behavior: m.entities[2]?.behavior ?? 'hazard' }),
  (m, rng) => {
    for (let i = 0; i < 60; i++) m.entities.push({ behavior: 'collectible', x: rng.int(m.map.w), y: rng.int(m.map.h), points: 10 })
  },
  (m) => {
    const x = m.map.rows[0].indexOf('#')
    if (x >= 0) m.entities[0].x = x
    m.entities[0].y = 0
    m.map.rows[0] = '#'.repeat(m.map.w)
  },
]


/** Applies one to three random mutations in place. */
export function damage(manifest: Loose, rng: Rng): void {
  for (let i = rng.range(1, 3); i > 0; i--) {
    try {
      rng.pick(MUTATIONS)(manifest, rng)
    } catch {
      // An earlier mutation removed what this one wanted to damage.
    }
  }
}
