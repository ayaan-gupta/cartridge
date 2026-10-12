import type { Page } from 'playwright'
import type { Manifest } from '../../src/engine/types'

/** Slows the page's main thread by a factor, the way DevTools' CPU throttling does. */
export async function throttleCpu(page: Page, rate: number): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate })
}

/**
 * About as heavy as a legal cart gets: the largest map, forty entities, six
 * spawners firing twice a second until the engine's cap of 64 live entities
 * is reached, and traffic crossing every visible row. The player stands in a
 * sheltered spot so the game never ends while it is being timed.
 */
export function stressManifest(): Manifest {
  const rows = Array.from({ length: 18 }, (_, y) => (y === 10 ? '..........#.........' : y === 7 ? '.........###........' : '....................'))
  const entities: Manifest['entities'] = [
    { behavior: 'player', x: 10, y: 9, speed: 75, jump: 2.5 },
    { behavior: 'goal', x: 19, y: 0 },
  ]
  for (let i = 0; i < 6; i++) entities.push({ behavior: 'spawner', x: 2 + i * 3, y: 0, every: 0.5, spread: 3, emits: { behavior: 'falling', sprite: i % 2 === 0 ? 'enemy3' : 'item', speed: 60 + i * 10, axis: 'y', dir: 1, touch: i % 2 === 0 ? 'hurt' : 'collect' } })
  const lanes = [5, 6, 11, 12, 13, 14]
  for (let i = 0; i < 28; i++) entities.push({ behavior: 'patrol', sprite: i % 2 === 0 ? 'enemy1' : 'enemy2', x: (i * 7) % 20, y: lanes[i % lanes.length] as number, speed: 30 + (i % 5) * 20, axis: 'x', dir: i % 2 === 0 ? 1 : -1, range: 0, wrap: true, touch: 'hurt' })
  for (let i = 0; i < 4; i++) entities.push({ behavior: 'collectible', x: 2 + i * 5, y: 16, points: 10 })
  return {
    v: 1,
    title: 'STRESS TEST',
    blurb: 'As much as one cart is allowed to hold.',
    view: 'side',
    palette: ['#e0f8d0', '#88c070', '#346856', '#081820'],
    music: 'sprint',
    art: { player: 'hero', enemies: ['car', 'bat', 'rock'], goal: 'flag', tiles: ['brick', 'grass'], background: 'sky', item: 'coin', hazard: 'spike' },
    map: { w: 20, h: 18, rows, tileB: 'solid' },
    entities,
    rules: { lives: 9, timer: 300, goal: { opens: 'always', amount: 0 } },
  }
}
