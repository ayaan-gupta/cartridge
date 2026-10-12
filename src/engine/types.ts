/**
 * The cart format. A cart is a manifest (what the game is) plus a sheet (what
 * it looks like). Everything the engine can do is spelled out here, which is
 * the point: a generator can only ever describe a game the engine can run.
 */

export const SCREEN_W = 160
export const SCREEN_H = 144
export const TILE = 16
/** The top strip holds lives, score and the clock. The world gets the rest. */
export const HUD_H = 16
export const VIEW_H = SCREEN_H - HUD_H
export const FPS = 60
export const MAX_ENTITIES = 64

export const BEHAVIORS = ['player', 'patrol', 'chase', 'falling', 'spawner', 'collectible', 'goal', 'hazard'] as const
export type Behavior = (typeof BEHAVIORS)[number]

export const ENEMY_SPRITES = ['enemy1', 'enemy2', 'enemy3'] as const
export const MOVER_SPRITES = ['enemy1', 'enemy2', 'enemy3', 'item'] as const
export type MoverSprite = (typeof MOVER_SPRITES)[number]

export const MUSIC = ['overworld', 'cavern', 'sprint', 'lullaby'] as const
export type MusicId = (typeof MUSIC)[number]

export const ITEM_ICONS = ['coin', 'gem', 'star', 'heart', 'key', 'fruit'] as const
export type ItemIcon = (typeof ITEM_ICONS)[number]
export const HAZARD_ICONS = ['spike', 'flame', 'water', 'bolt'] as const
export type HazardIcon = (typeof HAZARD_ICONS)[number]

export type Touch = 'hurt' | 'collect'
export type Axis = 'x' | 'y'

/** Positions are in tiles. Speeds are in pixels per second. */
export interface PlayerDef {
  behavior: 'player'
  x: number
  y: number
  speed: number
  /** Jump height in tiles. Only used in the side view. */
  jump: number
}
export interface PatrolDef {
  behavior: 'patrol'
  sprite: MoverSprite
  x: number
  y: number
  speed: number
  axis: Axis
  dir: 1 | -1
  /** Tiles travelled before turning round. 0 means "until something is in the way". */
  range: number
  /** Leave one edge of the map and come back on the other, like traffic. */
  wrap: boolean
  touch: Touch
}
export interface ChaseDef {
  behavior: 'chase'
  sprite: MoverSprite
  x: number
  y: number
  speed: number
  /** Tiles at which it notices the player. 0 means always. */
  range: number
}
export interface FallingDef {
  behavior: 'falling'
  sprite: MoverSprite
  x: number
  y: number
  speed: number
  /** Seconds it hangs at the top before each drop. */
  every: number
  touch: Touch
}
export interface EmitDef {
  behavior: 'patrol' | 'falling'
  sprite: MoverSprite
  speed: number
  axis: Axis
  dir: 1 | -1
  touch: Touch
}
export interface SpawnerDef {
  behavior: 'spawner'
  x: number
  y: number
  /** Seconds between spawns. */
  every: number
  /** Random offset in tiles, across the direction of travel. */
  spread: number
  emits: EmitDef
}
export interface CollectibleDef {
  behavior: 'collectible'
  x: number
  y: number
  points: number
}
export interface GoalDef {
  behavior: 'goal'
  x: number
  y: number
}
export interface HazardDef {
  behavior: 'hazard'
  x: number
  y: number
  w: number
  h: number
}
export type EntityDef =
  | PlayerDef
  | PatrolDef
  | ChaseDef
  | FallingDef
  | SpawnerDef
  | CollectibleDef
  | GoalDef
  | HazardDef

export type GoalOpens = 'always' | 'collect' | 'score' | 'survive'

export interface Manifest {
  v: 1
  title: string
  blurb: string
  /** side: gravity and jumping. top: free movement in four directions. */
  view: 'side' | 'top'
  /** Four colours, lightest first. */
  palette: [string, string, string, string]
  music: MusicId
  /** What each sprite cell should depict. Feeds the sprite prompt. */
  art: {
    player: string
    enemies: [string, string, string]
    goal: string
    tiles: [string, string]
    background: string
    item: ItemIcon
    hazard: HazardIcon
  }
  map: {
    w: number
    h: number
    /** One string per row. '.' empty, '#' tile A (solid), '=' tile B. */
    rows: string[]
    tileB: 'solid' | 'deco'
  }
  entities: EntityDef[]
  rules: {
    lives: number
    /** Seconds on the clock. Running out loses the game. */
    timer: number
    /**
     * The game is won by touching the goal while it is open.
     * always: open from the start. collect: after `amount` pickups.
     * score: at `amount` points. survive: after `amount` seconds.
     */
    goal: { opens: GoalOpens; amount: number }
  }
}

/** Cell order in a sheet. The first eight are the PRD's generated cells. */
export const CELLS = [
  'player',
  'enemy1',
  'enemy2',
  'enemy3',
  'goal',
  'tileA',
  'tileB',
  'background',
  'item',
  'hazard',
] as const
export type CellName = (typeof CELLS)[number]
export const SHEET_COLS = 4
export const SHEET_ROWS = 3
export const SHEET_W = SHEET_COLS * TILE
export const SHEET_H = SHEET_ROWS * TILE

/** A packed sprite sheet: 2 bits of colour and 1 bit of mask per pixel, base64. */
export interface Sheet {
  w: number
  h: number
  px: string
  mask: string
}

export interface Cart {
  manifest: Manifest
  sheet: Sheet
}

/** Input is a bitmask so a recorded game is just a list of small numbers. */
export const BTN = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32 } as const
export type Buttons = number

export type GameState = 'title' | 'playing' | 'won' | 'lost'
export type GameEvent = 'jump' | 'dash' | 'collect' | 'hurt' | 'open' | 'win' | 'lose' | 'start'

/** A run-length encoded recording: [buttons, frames, buttons, frames, ...]. */
export type Tape = number[]
