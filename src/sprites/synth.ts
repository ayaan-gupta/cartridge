/**
 * The procedural sprite synthesiser. It is the default artist: no network,
 * no key, and the same manifest always gets the same sheet. It picks a
 * hand-authored shape by keyword, then varies colouring, markings and small
 * features from a seed, so two carts about cats do not get the same cat.
 */
import { Rng } from '@/engine/rng'
import { TRANSPARENT } from '@/engine/sheet'
import type { CellName, HazardIcon, ItemIcon, Manifest } from '@/engine/types'
import { CELLS, SHEET_COLS, SHEET_H, SHEET_W, TILE } from '@/engine/types'
import type { CharacterName, GoalName, Shape } from './templates'
import { CHARACTERS, GOALS, HAZARDS, ITEMS } from './templates'

/** 256 palette indices, 4 meaning transparent. */
export type Cell = Uint8Array
export type Cells = Record<CellName, Cell>

interface Scheme {
  a: number
  b: number
  c: number
  e: number
  p: number
  m: number
}
const HERO: Scheme = { a: 1, b: 2, c: 0, e: 0, p: 3, m: 3 }
const DARK: Scheme = { a: 2, b: 3, c: 1, e: 0, p: 3, m: 0 }
const PALE: Scheme = { a: 0, b: 2, c: 1, e: 1, p: 3, m: 3 }
const OUTLINE = 3

/** Turns a role drawing into palette indices and wraps it in an outline. */
export function paint(shape: Shape, scheme: Scheme, outline = true): Cell {
  const cell = new Uint8Array(TILE * TILE).fill(TRANSPARENT)
  for (let y = 0; y < TILE; y++) {
    const row = shape[y] as string
    for (let x = 0; x < TILE; x++) {
      const ch = row[x] as string
      if (ch === '.') continue
      cell[y * TILE + x] = ch === 'X' ? OUTLINE : (scheme[ch as keyof Scheme] ?? OUTLINE)
    }
  }
  if (!outline) return cell
  const out = cell.slice()
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      if (cell[y * TILE + x] !== TRANSPARENT) continue
      const near =
        (x > 0 && cell[y * TILE + x - 1] !== TRANSPARENT) ||
        (x < TILE - 1 && cell[y * TILE + x + 1] !== TRANSPARENT) ||
        (y > 0 && cell[(y - 1) * TILE + x] !== TRANSPARENT) ||
        (y < TILE - 1 && cell[(y + 1) * TILE + x] !== TRANSPARENT)
      if (near) out[y * TILE + x] = OUTLINE
    }
  return out
}

// ---- choosing a shape from a description ----

const CHARACTER_WORDS: [RegExp, CharacterName][] = [
  [/robot|android|mech|droid|cyborg|machine/, 'robot'],
  [/frog|toad|rabbit|bunny|hare|kangaroo|cricket|grasshopper|flea/, 'hopper'],
  [/cat|kitten|dog|puppy|fox|wolf|pig|cow|sheep|goat|mouse|rat|bear|lion|tiger|horse|pony|deer|turtle|tortoise|hamster|squirrel|raccoon|panda|llama|dino|lizard|gecko|hedgehog|badger|otter|beaver|elephant|rhino/, 'quad'],
  [/bird|duck|chick|hen|owl|penguin|eagle|crow|raven|pigeon|parrot|gull|goose|swan|hawk|sparrow|robin/, 'bird'],
  [/bat|bee|wasp|fly|moth|butterfly|dragon|fairy|mosquito|hornet|firefly|pixie|angel|harpy/, 'flyer'],
  [/fish|shark|whale|dolphin|piranha|eel|submarine|salmon|tuna|trout|seal|squid/, 'fish'],
  [/slime|ghost|jelly|blob|germ|virus|spirit|phantom|ooze|cloud|amoeba|bubble|wisp|spectre|specter/, 'blob'],
  [/snake|worm|serpent|caterpillar|centipede|viper|cobra/, 'snake'],
  [/truck|bus|lorry|van|tractor|train|tank|bulldozer|tram|wagon/, 'truck'],
  [/car|taxi|cab|kart|buggy|jeep|vehicle|traffic|racer|scooter|bike|skateboard/, 'car'],
  [/rocket|plane|jet|missile|ship|boat|spaceship|shuttle|torpedo|arrow|bullet|comet|drone|kite/, 'rocket'],
  [/ufo|saucer|alien|invader|satellite|probe|helicopter/, 'saucer'],
  [/spike|urchin|mine|bomb|cactus|thorn|burr|sawblade|saw|star|sun|spark/, 'spiky'],
  [/rock|boulder|asteroid|meteor|stone|snowball|coal|log|barrel|crate|box|block|ball|egg|nut/, 'rock'],
  [/spider|crab|beetle|ant|bug|scorpion|octopus|tick|roach|lobster|mite/, 'bug'],
  [/skull|skeleton|zombie|mummy|monster|demon|ogre|troll|goblin|vampire|ghoul|witch|orc|golem|yeti/, 'skull'],
  [/drop|rain|tear|flame|fire|lava|ember|leaf|snow|acid|icicle|hail|water|petal|feather|seed/, 'drop'],
  [/knight|wizard|ninja|pirate|kid|boy|girl|hero|astronaut|chef|farmer|miner|thief|guard|princess|prince|king|queen|explorer|runner|baker|courier|postman|firefighter|cowboy|samurai|monk|elf|dwarf|gnome|player|person|man|woman|human|scientist|diver|climber|skier|surfer|janitor|librarian|waiter|student|nurse|doctor|detective|plumber|gardener|ranger|hunter|sailor|pilot|driver/, 'biped'],
]
const HERO_FALLBACKS: CharacterName[] = ['biped', 'quad', 'bird', 'robot', 'hopper', 'blob']
const ENEMY_FALLBACKS: CharacterName[] = ['blob', 'bug', 'spiky', 'skull', 'flyer', 'snake', 'rock', 'drop']

const GOAL_WORDS: [RegExp, GoalName][] = [
  [/flag|finish|banner|checkpoint|summit|peak|top/, 'flag'],
  [/door|exit|gate|portal|hatch|doorway|elevator|ladder|stairs|escape/, 'door'],
  [/star|sun|crystal|orb|light|beacon|lantern/, 'star'],
  [/house|home|castle|nest|barn|burrow|hut|cabin|den|hive|tower|station|base|shop|school|temple|shelter|garage|igloo|tent|cave/, 'house'],
  [/chest|treasure|vault|safe|loot|crate|gold/, 'chest'],
  [/pad|lily|planet|moon|pond|island|pool|puddle|plate|bowl|ring|hole|target|rug|bed|pillow/, 'pad'],
  [/trophy|cup|grail|crown|medal|prize/, 'trophy'],
  [/cheese|cake|pizza|carrot|apple|food|pie|burger|fruit|berry|acorn|bone|honey|cookie|donut|taco|sandwich|fish|worm|seed|nut|picnic/, 'food'],
]
const GOAL_FALLBACKS: GoalName[] = ['flag', 'door', 'star', 'house', 'chest', 'trophy']

/** Whole words only, so "cat" does not fire on "caterpillar". Plurals count. */
const bounded = new WeakMap<RegExp, RegExp>()
function whole(pattern: RegExp): RegExp {
  let made = bounded.get(pattern)
  if (!made) {
    made = new RegExp(`\\b(?:${pattern.source})(?:s|es)?\\b`)
    bounded.set(pattern, made)
  }
  return made
}

function matchWord<T>(text: string, table: [RegExp, T][]): T | undefined {
  const lower = text.toLowerCase()
  // The last noun usually carries the meaning: "angry red car" is a car.
  let best: T | undefined
  let bestAt = -1
  for (const [pattern, name] of table) {
    const found = lower.search(whole(pattern))
    if (found > bestAt) {
      bestAt = found
      best = name
    }
  }
  return best
}

export function characterFor(text: string, fallbacks: CharacterName[], rng: Rng): CharacterName {
  return matchWord(text, CHARACTER_WORDS) ?? rng.pick(fallbacks)
}

// ---- variation ----

type Grid = string[][]

function toGrid(shape: Shape): Grid {
  return shape.map((row) => [...row])
}

/** Stripes, spots or a plain coat. Only ever touches the main fill. */
function addMarkings(grid: Grid, rng: Rng): void {
  const style = rng.int(4)
  if (style === 0) return
  if (style === 1) {
    const phase = rng.int(3)
    const vertical = rng.chance(0.5)
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const row = grid[y] as string[]
        if (row[x] === 'a' && ((vertical ? x : y) + phase) % 4 === 0) row[x] = 'b'
      }
    return
  }
  const spots = style === 2 ? 3 : 5
  for (let i = 0; i < spots; i++) {
    const sx = rng.range(2, 12)
    const sy = rng.range(2, 12)
    for (let y = sy; y < sy + 2; y++)
      for (let x = sx; x < sx + 2; x++) {
        const row = grid[y] as string[]
        if (row[x] === 'a') row[x] = style === 2 ? 'b' : 'c'
      }
  }
}

/** Ears, horns or a crest on top of whatever is highest. */
function addHorns(grid: Grid, rng: Rng): void {
  const top = grid.findIndex((row) => row.some((ch) => ch !== '.'))
  if (top < 2) return
  const row = grid[top] as string[]
  const left = row.findIndex((ch) => ch !== '.')
  const right = row.length - 1 - [...row].reverse().findIndex((ch) => ch !== '.')
  const tall = rng.chance(0.5) && top >= 3
  const single = rng.chance(0.3)
  const columns = single ? [Math.floor((left + right) / 2)] : [left, right]
  for (const x of columns) {
    ;(grid[top - 1] as string[])[x] = 'a'
    if (tall) (grid[top - 2] as string[])[x] = 'a'
  }
}

/** A brow over each pupil turns a face from friendly to cross. */
function addBrows(grid: Grid): void {
  for (let y = 1; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const above = grid[y - 1] as string[]
      if ((grid[y] as string[])[x] === 'p' && (above[x] === 'a' || above[x] === 'e')) above[x] = 'X'
    }
}

const HORNED: CharacterName[] = ['biped', 'blob', 'skull', 'quad', 'bird', 'fish', 'snake']

function character(name: CharacterName, scheme: Scheme, rng: Rng, angry: boolean): Cell {
  const grid = toGrid(CHARACTERS[name])
  addMarkings(grid, rng)
  if (HORNED.includes(name) && rng.chance(0.5)) addHorns(grid, rng)
  if (angry && rng.chance(0.6)) addBrows(grid)
  return paint(grid.map((row) => row.join('')), scheme)
}

// ---- tiles and backdrops ----

interface Ramp {
  hi: number
  base: number
  lo: number
}

function px(cell: Cell, x: number, y: number, v: number): void {
  if (x >= 0 && y >= 0 && x < TILE && y < TILE) cell[y * TILE + x] = v
}

type TileKind = 'brick' | 'stone' | 'grass' | 'wood' | 'metal' | 'ice' | 'sand' | 'leaf' | 'cloud' | 'crate'
const TILE_WORDS: [RegExp, TileKind][] = [
  [/brick|wall|castle|dungeon|tower|building|city|house|kerb|curb|pavement|sidewalk/, 'brick'],
  [/stone|rock|cave|cliff|mountain|asteroid|rubble|cobble|boulder|moon|crater/, 'stone'],
  [/grass|meadow|ground|dirt|soil|field|garden|hill|earth|turf|mud|bank|lawn/, 'grass'],
  [/wood|plank|log|deck|bridge|raft|dock|fence|shelf|table|floorboard|barn|tree|trunk|branch/, 'wood'],
  [/metal|steel|iron|pipe|girder|hull|station|factory|lab|panel|machine|circuit|vent|rail/, 'metal'],
  [/ice|snow|glacier|frost|frozen|crystal|glass|igloo/, 'ice'],
  [/sand|beach|desert|dune|dust|gravel|salt/, 'sand'],
  [/leaf|bush|hedge|jungle|vine|moss|forest|reed|lily|kelp|seaweed|coral|flower|plant|cactus/, 'leaf'],
  [/cloud|sky|fog|mist|smoke|steam|cotton|marshmallow|pillow/, 'cloud'],
  [/crate|box|block|barrel|container|cargo|chest|book|shelf/, 'crate'],
]
const TILE_FALLBACKS: TileKind[] = ['brick', 'stone', 'grass', 'wood', 'metal', 'crate']

export function tile(kind: TileKind, ramp: Ramp, rng: Rng): Cell {
  const { hi, base, lo } = ramp
  const cell = new Uint8Array(TILE * TILE).fill(base)
  switch (kind) {
    case 'brick':
      for (let x = 0; x < TILE; x++) {
        px(cell, x, 0, hi)
        px(cell, x, 8, hi)
        px(cell, x, 7, lo)
        px(cell, x, 15, lo)
      }
      for (let y = 0; y < 7; y++) {
        px(cell, 7, y, lo)
        px(cell, 15, y, lo)
        px(cell, 3, y + 8, lo)
        px(cell, 11, y + 8, lo)
      }
      break
    case 'stone': {
      for (let i = 0; i < TILE; i++) {
        px(cell, i, 0, hi)
        px(cell, 0, i, hi)
        px(cell, i, 15, lo)
        px(cell, 15, i, lo)
      }
      let x = rng.range(3, 6)
      let y = rng.range(3, 5)
      for (let i = 0; i < 9; i++) {
        px(cell, x, y, lo)
        if (rng.chance(0.5)) x += 1
        else y += 1
        if (rng.chance(0.3)) x += 1
      }
      for (let i = 0; i < 4; i++) px(cell, rng.range(2, 13), rng.range(2, 13), hi)
      break
    }
    case 'grass':
      for (let x = 0; x < TILE; x++) {
        const blade = rng.int(3)
        for (let y = 0; y < 3 + blade; y++) px(cell, x, y, y === 0 && blade === 0 ? base : hi)
        px(cell, x, 3 + blade, lo)
      }
      for (let i = 0; i < 7; i++) px(cell, rng.range(1, 14), rng.range(8, 14), lo)
      for (let i = 0; i < 3; i++) px(cell, rng.range(1, 14), rng.range(8, 14), hi)
      break
    case 'wood':
      for (let x = 0; x < TILE; x++) for (const y of [4, 9, 15]) px(cell, x, y, lo)
      for (const y of [0, 5, 10]) for (let x = 0; x < TILE; x++) px(cell, x, y, hi)
      for (let i = 0; i < 3; i++) {
        const y = [2, 7, 12][i] as number
        const x = rng.range(1, 9)
        for (let k = 0; k < 4; k++) px(cell, x + k, y, lo)
      }
      px(cell, rng.range(10, 14), 2, lo)
      px(cell, rng.range(1, 5), 12, lo)
      break
    case 'metal':
      for (let i = 0; i < TILE; i++) {
        px(cell, i, 0, lo)
        px(cell, 0, i, lo)
        px(cell, i, 15, lo)
        px(cell, 15, i, lo)
      }
      for (let i = 1; i < 15; i++) {
        px(cell, i, 1, hi)
        px(cell, 1, i, hi)
      }
      for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]] as const) px(cell, x, y, lo)
      for (let i = 0; i < 6; i++) px(cell, 5 + i, 10 - i, hi)
      break
    case 'ice':
      cell.fill(hi)
      for (let i = 0; i < TILE; i++) {
        px(cell, i, 15, lo)
        px(cell, 15, i, lo)
        px(cell, i, 0, base)
        px(cell, 0, i, base)
      }
      for (let i = 0; i < 5; i++) {
        px(cell, 3 + i, 8 - i, base)
        px(cell, 8 + i, 12 - i, base)
      }
      px(cell, 12, 4, base)
      break
    case 'sand':
      for (let i = 0; i < 14; i++) px(cell, rng.int(16), rng.int(16), i % 3 === 0 ? hi : lo)
      for (let x = 0; x < TILE; x++) if ((x + 2) % 5 < 3) px(cell, x, 0, hi)
      break
    case 'leaf':
      for (let i = 0; i < 9; i++) {
        const x = rng.range(1, 12)
        const y = rng.range(1, 12)
        px(cell, x, y + 1, lo)
        px(cell, x + 1, y + 2, lo)
        px(cell, x + 2, y + 1, lo)
        px(cell, x + 1, y, hi)
      }
      break
    case 'cloud':
      cell.fill(hi)
      for (let x = 0; x < TILE; x++) {
        const dip = (x % 8 < 2 || x % 8 > 5) ? 1 : 0
        px(cell, x, 15, lo)
        px(cell, x, 14 - dip, base)
        px(cell, x, 13 - dip, base)
        if (dip) px(cell, x, 14, lo)
      }
      for (let x = 2; x < 6; x++) px(cell, x, 4, base)
      for (let x = 9; x < 13; x++) px(cell, x, 8, base)
      break
    case 'crate':
      for (let i = 0; i < TILE; i++) {
        px(cell, i, 0, lo)
        px(cell, 0, i, lo)
        px(cell, i, 15, lo)
        px(cell, 15, i, lo)
        px(cell, i, i, lo)
        px(cell, 15 - i, i, lo)
      }
      for (let i = 1; i < 15; i++) {
        px(cell, i, 1, hi)
        px(cell, 1, i, hi)
      }
      break
  }
  return cell
}

type BackdropKind = 'plain' | 'dots' | 'stars' | 'waves' | 'road' | 'checker' | 'clouds' | 'tufts' | 'hatch' | 'grid'
const BACKDROP_WORDS: [RegExp, BackdropKind][] = [
  [/star|space|night|galaxy|cosmos|void|orbit|moon/, 'stars'],
  [/water|sea|ocean|river|pond|lake|wave|swamp|pool|harbour|harbor|flood/, 'waves'],
  [/road|street|highway|asphalt|lane|track|runway|motorway|crossing/, 'road'],
  [/floor|tile|kitchen|room|hall|lab|shop|palace|museum|library|office|school|hospital|mall/, 'checker'],
  [/sky|cloud|air|heaven|breeze|wind|storm/, 'clouds'],
  [/grass|meadow|field|garden|lawn|forest|jungle|park|farm|savanna|prairie/, 'tufts'],
  [/cave|mine|dungeon|tunnel|crypt|sewer|cellar|volcano|lava|rock|pit|catacomb/, 'hatch'],
  [/grid|circuit|factory|station|ship|computer|cyber|neon|city|rooftop/, 'grid'],
  [/sand|desert|beach|snow|ice|dust|tundra|dune/, 'dots'],
]
const BACKDROP_FALLBACKS: BackdropKind[] = ['plain', 'dots', 'tufts', 'checker', 'clouds']
const DARK_WORLD = /space|night|galaxy|cosmos|void|cave|mine|dungeon|crypt|haunted|midnight|deep|abyss|sewer|catacomb|shadow|dark|tunnel|cellar|orbit/

export function backdrop(kind: BackdropKind, base: number, detail: number, rng: Rng): Cell {
  const cell = new Uint8Array(TILE * TILE).fill(base)
  switch (kind) {
    case 'plain':
      for (let i = 0; i < 3; i++) px(cell, rng.int(16), rng.int(16), detail)
      break
    case 'dots':
      for (let y = 1; y < TILE; y += 4) for (let x = (y % 8 === 1 ? 1 : 3); x < TILE; x += 4) px(cell, x, y, detail)
      break
    case 'stars': {
      for (let i = 0; i < 5; i++) px(cell, rng.int(16), rng.int(16), detail)
      const x = rng.range(3, 12)
      const y = rng.range(3, 12)
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) px(cell, x + dx, y + dy, detail)
      break
    }
    case 'waves':
      for (const y of [3, 11])
        for (let x = 0; x < TILE; x++) {
          const phase = (x + (y === 11 ? 4 : 0)) % 8
          px(cell, x, y + (phase < 2 ? 1 : phase < 4 ? 0 : phase < 6 ? 1 : 2), phase === 7 ? base : detail)
        }
      break
    case 'road':
      for (let x = 2; x < 10; x++) {
        px(cell, x, 7, detail)
        px(cell, x, 8, detail)
      }
      for (let i = 0; i < 4; i++) px(cell, rng.int(16), rng.int(16), detail)
      break
    case 'checker':
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if ((x < 8) !== (y < 8)) px(cell, x, y, detail)
      break
    case 'clouds':
      for (let x = 3; x < 12; x++) px(cell, x, 9, detail)
      for (let x = 4; x < 8; x++) px(cell, x, 6, detail)
      for (let x = 8; x < 11; x++) px(cell, x, 7, detail)
      for (const [x, y] of [[3, 7], [2, 8], [3, 8], [11, 8], [12, 8], [8, 6]] as const) px(cell, x, y, detail)
      break
    case 'tufts':
      for (let i = 0; i < 4; i++) {
        const x = [2, 10, 5, 13][i] as number
        const y = ([3, 6, 11, 14][i] as number) - rng.int(2)
        px(cell, x, y, detail)
        px(cell, x - 1, y - 1, detail)
        px(cell, x + 1, y - 1, detail)
      }
      break
    case 'hatch':
      for (let i = 0; i < 4; i++) {
        const x = [1, 9, 5, 12][i] as number
        const y = [2, 5, 10, 13][i] as number
        for (let k = 0; k < 3; k++) px(cell, x + k, y - k + 1, detail)
      }
      break
    case 'grid':
      for (let i = 0; i < TILE; i++) {
        px(cell, i, 0, detail)
        px(cell, 0, i, detail)
      }
      px(cell, 8, 8, detail)
      break
  }
  return cell
}

// ---- putting a sheet together ----

export function isDarkWorld(manifest: Manifest): boolean {
  return DARK_WORLD.test(`${manifest.art.background} ${manifest.blurb}`.toLowerCase())
}

export function iconCell(kind: ItemIcon | HazardIcon, dark: boolean): Cell {
  // Pickups are always the lightest thing on screen so they read as treasure.
  if (kind in ITEMS) return paint(ITEMS[kind as ItemIcon], PALE)
  const shape = HAZARDS[kind as HazardIcon]
  return paint(shape, kind === 'water' ? { ...HERO, a: dark ? 2 : 1, b: dark ? 1 : 2 } : dark ? HERO : DARK, kind !== 'water')
}

/** The eight cells the PRD asks an image model for, drawn here instead. */
export function synthCells(manifest: Manifest): Cells {
  const art = manifest.art
  const dark = isDarkWorld(manifest)
  const seed = `${manifest.title}|${art.player}|${art.goal}`
  const rng = new Rng(seed)

  const heroShape = characterFor(art.player, HERO_FALLBACKS, rng)
  const heroScheme = dark ? PALE : HERO
  const enemySchemes = dark ? [HERO, PALE, HERO] : [DARK, HERO, DARK]
  const used = new Set<CharacterName>([heroShape])
  const enemies = art.enemies.map((text, i) => {
    const local = new Rng(`${seed}|${text}|${i}`)
    let name = characterFor(text, ENEMY_FALLBACKS, local)
    // Two enemies described differently should not collapse into one shape.
    if (!matchWord(text, CHARACTER_WORDS)) while (used.has(name)) name = local.pick(ENEMY_FALLBACKS)
    used.add(name)
    return character(name, enemySchemes[i] as Scheme, local, true)
  })

  const goalName = matchWord(art.goal, GOAL_WORDS) ?? new Rng(`${seed}|goal`).pick(GOAL_FALLBACKS)
  const tileKinds = art.tiles.map((text, i) => matchWord(text, TILE_WORDS) ?? new Rng(`${seed}|tile${i}`).pick(TILE_FALLBACKS))
  if (tileKinds[0] === tileKinds[1]) tileKinds[1] = TILE_FALLBACKS.find((k) => k !== tileKinds[0]) as TileKind
  const backdropKind = matchWord(art.background, BACKDROP_WORDS) ?? new Rng(`${seed}|bg`).pick(BACKDROP_FALLBACKS)
  const rampA: Ramp = dark ? { hi: 0, base: 1, lo: 2 } : { hi: 1, base: 2, lo: 3 }
  const rampB: Ramp = dark ? { hi: 1, base: 2, lo: 3 } : { hi: 0, base: 1, lo: 2 }

  return {
    player: character(heroShape, heroScheme, new Rng(`${seed}|hero`), false),
    enemy1: enemies[0] as Cell,
    enemy2: enemies[1] as Cell,
    enemy3: enemies[2] as Cell,
    goal: paint(GOALS[goalName], dark ? PALE : HERO),
    tileA: tile(tileKinds[0] as TileKind, rampA, new Rng(`${seed}|a`)),
    tileB: tile(tileKinds[1] as TileKind, rampB, new Rng(`${seed}|b`)),
    background: backdrop(backdropKind, dark ? 3 : 0, dark ? 2 : 1, new Rng(`${seed}|backdrop`)),
    item: iconCell(art.item, dark),
    hazard: iconCell(art.hazard, dark),
  }
}

/** The fixed set every cart can fall back on, cell by cell. */
export function defaultCells(): Cells {
  const rng = new Rng('default')
  return {
    player: paint(CHARACTERS.biped, HERO),
    enemy1: paint(CHARACTERS.blob, DARK),
    enemy2: paint(CHARACTERS.flyer, HERO),
    enemy3: paint(CHARACTERS.spiky, DARK),
    goal: paint(GOALS.flag, HERO),
    tileA: tile('brick', { hi: 1, base: 2, lo: 3 }, rng),
    tileB: tile('grass', { hi: 0, base: 1, lo: 2 }, rng),
    background: backdrop('clouds', 0, 1, rng),
    item: iconCell('coin', false),
    hazard: iconCell('spike', false),
  }
}

/** Lays named cells out on the 4 by 3 sheet grid. */
export function composeSheet(cells: Cells): Uint8Array {
  const out = new Uint8Array(SHEET_W * SHEET_H).fill(TRANSPARENT)
  CELLS.forEach((name, i) => {
    const cell = cells[name]
    const ox = (i % SHEET_COLS) * TILE
    const oy = Math.floor(i / SHEET_COLS) * TILE
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) out[(oy + y) * SHEET_W + ox + x] = cell[y * TILE + x] as number
  })
  return out
}
