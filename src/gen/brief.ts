/**
 * Reading a one-sentence prompt without a language model. This is keyword
 * and pattern work, nothing clever: find who the sentence is about, what is
 * in their way, where they are going, and which kind of game that implies.
 */
import { hashString } from '@/engine/rng'
import type { HazardIcon, ItemIcon, Manifest, MusicId } from '@/engine/types'

export const ARCHETYPES = ['crosser', 'platformer', 'climber', 'maze', 'catcher', 'escape', 'survive'] as const
export type Archetype = (typeof ARCHETYPES)[number]

export interface Theme {
  name: string
  words: RegExp
  palette: Manifest['palette']
  music: MusicId
  tiles: [string, string]
  sideBackground: string
  topBackground: string
  foes: [string, string, string]
  goal: string
  hero: string
  item: ItemIcon
  hazard: HazardIcon
}

export const THEMES: Theme[] = [
  {
    name: 'pond',
    words: /\b(frogs?|toads?|ponds?|swamp|lily|marsh|ducks?|ducklings?|turtles?|creek|bog|tadpoles?|newts?|herons?)\b/g,
    palette: ['#d8f0c0', '#7cc070', '#2f6a4f', '#0f2a2a'],
    music: 'overworld',
    tiles: ['reed hedge bush', 'grass bank'],
    sideBackground: 'sky with clouds',
    topBackground: 'pond water',
    foes: ['heron bird', 'snake', 'pike fish'],
    goal: 'lily pad',
    hero: 'frog',
    item: 'star',
    hazard: 'water',
  },
  {
    name: 'forest',
    words: /\b(forest|woods?|trees?|jungle|squirrels?|fox(es)?|bears?|deer|owls?|mushrooms?|acorns?|lea(f|ves)|wol(f|ves)|rabbits?|bunn(y|ies)|hedgehogs?|monkeys?|vines?|berr(y|ies)|badgers?)\b/g,
    palette: ['#e0f0b0', '#90b850', '#386030', '#102010'],
    music: 'overworld',
    tiles: ['tree trunk wood', 'leafy bush'],
    sideBackground: 'forest sky with clouds',
    topBackground: 'grass meadow',
    foes: ['wolf', 'owl', 'snake'],
    goal: 'burrow home',
    hero: 'fox',
    item: 'fruit',
    hazard: 'spike',
  },
  {
    name: 'ocean',
    words: /\b(ocean|sea|fish(es)?|sharks?|whales?|dolphins?|submarines?|coral|pirates?|ships?|boats?|islands?|beach|crabs?|octopus|mermaids?|divers?|surf\w*|jellyfish|seals?|sailors?|harbou?r|reef|squid|pearls?)\b/g,
    palette: ['#d0f0f8', '#60b8e0', '#2060a0', '#0a1838'],
    music: 'lullaby',
    tiles: ['coral rock', 'sand'],
    sideBackground: 'ocean water waves',
    topBackground: 'sea water waves',
    foes: ['shark', 'crab', 'jellyfish blob'],
    goal: 'treasure chest',
    hero: 'diver',
    item: 'gem',
    hazard: 'spike',
  },
  {
    name: 'ice',
    words: /\b(ice|icy|snow\w*|penguins?|polar|arctic|frozen|winter|yetis?|igloos?|ski\w*|sled\w*|glaciers?|blizzards?|avalanche|icicles?|frost\w*)\b/g,
    palette: ['#f0f8ff', '#a8d8f0', '#5080b8', '#182048'],
    music: 'lullaby',
    tiles: ['ice block', 'snow drift cloud'],
    sideBackground: 'snowy sky',
    topBackground: 'snow field',
    foes: ['seal', 'rolling snowball', 'yeti monster'],
    goal: 'igloo home',
    hero: 'penguin',
    item: 'fruit',
    hazard: 'spike',
  },
  {
    name: 'lava',
    words: /\b(lava|volcano\w*|fire\w*|dragons?|flames?|magma|embers?|hell|demons?|burning|inferno|phoenix|furnace|forge)\b/g,
    palette: ['#ffe8a0', '#f08030', '#a02820', '#280808'],
    music: 'sprint',
    tiles: ['volcanic rock', 'charred stone'],
    sideBackground: 'dark volcano cave',
    topBackground: 'dark scorched rock',
    foes: ['fireball flame', 'lava slime', 'fire bat'],
    goal: 'castle gate door',
    hero: 'knight',
    item: 'gem',
    hazard: 'flame',
  },
  {
    name: 'desert',
    words: /\b(desert|sand\w*|camels?|cactus|cacti|pyramids?|mumm(y|ies)|scorpions?|oasis|dunes?|cowboys?|tumbleweeds?|canyon|pharaoh|sphinx|outlaws?|bandits?)\b/g,
    palette: ['#f8e8b8', '#e0a858', '#a05830', '#301810'],
    music: 'cavern',
    tiles: ['sandstone block', 'sand dune'],
    sideBackground: 'desert sky',
    topBackground: 'sand dust floor',
    foes: ['scorpion', 'snake', 'tumbleweed rock'],
    goal: 'oasis pond',
    hero: 'explorer',
    item: 'coin',
    hazard: 'spike',
  },
  {
    name: 'candy',
    words: /\b(cand(y|ies)|cakes?|cookies?|sugar|donuts?|doughnuts?|chocolate|sweets?|cupcakes?|ice cream|lollipops?|gum\w*|bakery|pies?|pastr(y|ies)|marshmallows?|baker|sprinkles)\b/g,
    palette: ['#ffe8f0', '#f8a0c0', '#b04888', '#381040'],
    music: 'overworld',
    tiles: ['cookie block crate', 'marshmallow cloud'],
    sideBackground: 'sky with clouds',
    topBackground: 'kitchen floor tile',
    foes: ['jelly blob', 'gummy bear', 'sprinkle bug'],
    goal: 'giant cake',
    hero: 'baker',
    item: 'heart',
    hazard: 'spike',
  },
  {
    name: 'space',
    words: /\b(space\w*|stars?|planets?|moon|rockets?|aliens?|astronauts?|asteroids?|galaxy|comets?|ufos?|orbit\w*|mars|satellites?|cosmic|meteors?|martians?|lunar|nebula)\b/g,
    palette: ['#e0d8f8', '#9080d8', '#403080', '#100828'],
    music: 'cavern',
    tiles: ['moon rock', 'metal panel'],
    sideBackground: 'starry space night',
    topBackground: 'starry space night',
    foes: ['alien saucer', 'asteroid rock', 'space bug'],
    goal: 'space station base',
    hero: 'astronaut',
    item: 'star',
    hazard: 'bolt',
  },
  {
    name: 'city',
    words: /\b(city|streets?|roads?|cars?|traffic|taxis?|bus(es)?|trucks?|highway|pizzas?|deliver\w*|skate\w*|subway|trains?|office|rooftops?|mail\w*|couriers?|pigeons?|rats?|commuters?|scooters?|bikes?|cyclists?|pedestrians?|sidewalk)\b/g,
    palette: ['#e8e8e8', '#a0a0a0', '#585858', '#101010'],
    music: 'sprint',
    tiles: ['brick wall', 'pavement kerb stone'],
    sideBackground: 'city sky with clouds',
    topBackground: 'asphalt road',
    foes: ['car', 'truck', 'bus'],
    goal: 'front door',
    hero: 'courier',
    item: 'coin',
    hazard: 'water',
  },
  {
    name: 'cave',
    words: /\b(caves?|caverns?|mines?|miners?|bats?|crystals?|underground|tunnels?|moles?|dwar(f|ves)|spelunk\w*|stalactites?|minecarts?|ore)\b/g,
    palette: ['#d8e0e8', '#8898b0', '#404860', '#101420'],
    music: 'cavern',
    tiles: ['cave rock', 'wood plank'],
    sideBackground: 'dark cave',
    topBackground: 'dark cave floor',
    foes: ['bat', 'cave slime', 'falling rock'],
    goal: 'exit ladder door',
    hero: 'miner',
    item: 'gem',
    hazard: 'spike',
  },
  {
    name: 'haunted',
    words: /\b(ghosts?|haunted|zombies?|vampires?|witch(es)?|graveyards?|skeletons?|spooky|halloween|pumpkins?|mansion|monsters?|crypts?|ghouls?|cemetery|poltergeists?|werewol(f|ves))\b/g,
    palette: ['#d8f0e0', '#70b0a0', '#385068', '#180c28'],
    music: 'cavern',
    tiles: ['crypt brick', 'iron fence metal'],
    sideBackground: 'midnight sky with stars',
    topBackground: 'dark crypt floor',
    foes: ['ghost', 'skeleton', 'bat'],
    goal: 'mansion door',
    hero: 'kid',
    item: 'key',
    hazard: 'flame',
  },
  {
    name: 'castle',
    words: /\b(castles?|knights?|kings?|queens?|princess(es)?|prince|dungeons?|swords?|wizards?|goblins?|medieval|throne|treasure|ogres?|trolls?|squires?|jesters?|moat)\b/g,
    palette: ['#fff0b0', '#e8b030', '#906010', '#281800'],
    music: 'overworld',
    tiles: ['castle brick', 'stone block'],
    sideBackground: 'castle hall brick',
    topBackground: 'palace floor tile',
    foes: ['goblin', 'skeleton guard', 'spike trap'],
    goal: 'treasure chest',
    hero: 'knight',
    item: 'coin',
    hazard: 'spike',
  },
  {
    name: 'sky',
    words: /\b(sky|clouds?|birds?|fl(y|ies|ying)|balloons?|kites?|planes?|wind\w*|eagles?|angels?|storms?|lightning|rain\w*|umbrellas?|thunder|hail|sparrows?|gulls?|feathers?)\b/g,
    palette: ['#f8f8e8', '#a8d8e8', '#4878a8', '#182848'],
    music: 'lullaby',
    tiles: ['cloud', 'wood plank'],
    sideBackground: 'sky with clouds',
    topBackground: 'sky with clouds',
    foes: ['crow bird', 'storm cloud', 'bee'],
    goal: 'nest home',
    hero: 'bird',
    item: 'star',
    hazard: 'bolt',
  },
  {
    name: 'farm',
    words: /\b(farms?|chickens?|cows?|pigs?|sheep|barns?|tractors?|gardens?|carrots?|corn|farmers?|hens?|eggs?|vegetables?|scarecrows?|goats?|horses?|bees?|flowers?|gardeners?|crops?|hay|orchard|apples?)\b/g,
    palette: ['#f8e0c0', '#e08850', '#904030', '#301818'],
    music: 'overworld',
    tiles: ['wooden fence plank', 'hay grass'],
    sideBackground: 'sky with clouds',
    topBackground: 'grass field',
    foes: ['fox', 'crow bird', 'tractor'],
    goal: 'red barn',
    hero: 'chicken',
    item: 'fruit',
    hazard: 'spike',
  },
  {
    name: 'lab',
    words: /\b(robots?|factory|lab\w*|machines?|computers?|lasers?|conveyor\w*|androids?|cyber\w*|circuits?|science|scientists?|experiments?|virus(es)?|data|servers?|hackers?|drones?|reactor|bugs?|code)\b/g,
    palette: ['#f0ffc0', '#a0e040', '#308048', '#082010'],
    music: 'sprint',
    tiles: ['metal panel', 'steel crate'],
    sideBackground: 'factory grid',
    topBackground: 'lab grid floor',
    foes: ['security drone', 'patrol robot', 'laser spark'],
    goal: 'exit door',
    hero: 'robot',
    item: 'key',
    hazard: 'bolt',
  },
]

/** Used when a prompt gives no hint of a setting. */
const PLAIN_THEMES: Theme[] = [
  {
    name: 'classic',
    words: /$^/g,
    palette: ['#e0f8d0', '#88c070', '#346856', '#081820'],
    music: 'overworld',
    tiles: ['brick', 'grass ground'],
    sideBackground: 'sky with clouds',
    topBackground: 'grass field',
    foes: ['slime', 'bat', 'spiky ball'],
    goal: 'flag',
    hero: 'hero',
    item: 'coin',
    hazard: 'spike',
  },
  {
    name: 'berry',
    words: /$^/g,
    palette: ['#f8e0e8', '#d07090', '#703060', '#200820'],
    music: 'sprint',
    tiles: ['stone block', 'wood plank'],
    sideBackground: 'sky with clouds',
    topBackground: 'room floor tile',
    foes: ['blob', 'beetle bug', 'spiky mine'],
    goal: 'trophy cup',
    hero: 'hero',
    item: 'heart',
    hazard: 'spike',
  },
]

const ARCHETYPE_WORDS: Record<Archetype, [RegExp, number][]> = {
  crosser: [
    [/\b(cross\w*|road|street|highway|traffic|lanes?|rush hour|motorway|railway|tracks|stampede|freeway|intersection)\b/, 3],
    [/\b(cars?|trucks?|bus(es)?|taxis?|trains?|lorr(y|ies)|vans?|tractors?|scooters?)\b/, 2],
    [/\bdodg\w+/, 1],
  ],
  platformer: [
    [/\b(jump\w*|leap\w*|platform\w*|hop\w*|parkour|rooftops?|bounc\w+|ledges?|gaps?|pits?|side-?scroll\w*)\b/, 3],
    [/\b(run\w*|rac(e|es|ing)|dash\w*|across|through)\b/, 1],
  ],
  climber: [
    [/\b(climb\w*|ascend\w*|scal(e|es|ing)|tower|beanstalk|cliff|ladder|summit|peak|skyscraper|upwards?|mountain\w*|treetop|chimney|to the top)\b/, 3],
    [/\b((float\w*|ris\w+|fl(y|ies|ying)|soar\w*|drift\w*) up|up (through|the side|a|an|the))\b/, 2],
  ],
  maze: [
    [/\b(maze|labyrinth|vault|heist|museum|library|corridors?|warehouse|sewers?|hedge|bank|tomb|supermarket|store|catacombs?)\b/, 3],
    [/\b(steal\w*|sneak\w*|every|all (the|of)|gather\w*|loot\w*|collect\w*)\b/, 2],
  ],
  catcher: [[/\b(catch\w*|falling|rain(ing|s)?|raindrops?|dropp\w+|basket|bucket|harvest\w*|juggl\w+|from the sky|tumbling)\b/, 3]],
  escape: [
    [/\b(escap\w+|chased|flee\w*|hunted|pursu\w+|outrun\w*|run(ning|s)? (away )?from|hid(e|es|ing) from|stalk\w+|on the run|getaway)\b/, 3],
    [/\b(ghosts?|zombies?|monsters?|guards?|police|wolves|swarm)\b/, 1],
  ],
  survive: [
    [/\b(surviv\w+|stay(s|ing)? alive|hold(s|ing)? out|withstand\w*|endur\w+|last(s|ing)? (until|through|as long))\b/, 3],
    [/\b(until (dawn|morning|help|rescue|sunrise|the|a)|blizzard|meteor shower|hailstorm|avalanche|invasion|siege|waves of)\b/, 2],
  ],
}

const ARTICLES = new Set(['a', 'an', 'the', 'some', 'one', 'two', 'three', 'his', 'her', 'its', 'their', 'my', 'your', 'all', 'many', 'lots', 'of'])
const STOPS = new Set([
  'who', 'that', 'which', 'must', 'has', 'have', 'needs', 'need', 'tries', 'wants', 'is', 'are', 'can', 'in', 'on', 'at', 'to', 'through',
  'across', 'vs', 'versus', 'against', 'and', 'with', 'from', 'while', 'before', 'until', 'so', 'for', 'as', 'into', 'then', 'without', 'by',
  'but', 'or', 'up', 'down', 'over', 'under', 'past', 'inside', 'out', 'back', 'home', 'away', 'full', 'filled', 'chased', 'guarded',
  'hunted', 'pursued', 'called', 'named', 'between', 'during', 'after', 'when', 'where', 'near', 'around', 'along', 'using', 'game', '|',
])
const VERBS =
  /^(runs?|jumps?|climbs?|dodges?|collects?|escapes?|finds?|cross(es)?|catch(es)?|races?|fl(y|ies)|swims?|delivers?|steals?|saves?|chases?|avoids?|hops?|explores?|survives?|defends?|hunts?|search(es)?|rescues?|gathers?|eats?|helps?|guides?|goes|gets?|makes?|sneaks?|rolls?|digs?|leaps?|grabs?|flees?|hides?|bounces?|dashes|outruns?|braves?|reach(es)?|arrives?|comes?|wakes?|rises?|falls?|roams?|swoops?|appears?|opens?|closes?|sinks?|floats?|melts?|attacks?|lurks?|waits?|sleeps?)$/

export interface Brief {
  prompt: string
  hero: string
  foes: string[]
  goal: string
  item: string
  wantsCollect: boolean
  archetype: Archetype
  theme: Theme
}

/** Lowercase tokens. Punctuation becomes a '|' token so a phrase never runs across a comma. */
function words(text: string): string[] {
  return text.toLowerCase().replace(/[,.;:!?]+/g, ' | ').replace(/[^a-z0-9'| -]/g, ' ').split(/\s+/).filter(Boolean)
}

/** Nouns that only look like verbs. */
const ING_NOUNS = /^(lightning|duckling|gosling|king|ring|thing|string|wing|sibling|darling|herring|viking|building|ceiling|spring|sling|sting|swing|pudding|dumpling|seedling|fledgling|hatchling|starling|earring|evening|morning|nothing|something|anything|icing|frosting|penguin)s?$/
function isGerund(word: string): boolean {
  return word.length > 4 && word.endsWith('ing') && !ING_NOUNS.test(word)
}

/** Words ending in -ing that describe a thing rather than start a clause. */
const DESCRIBING = /^(falling|flying|burning|rolling|speeding|swooping|charging|raging|moving|spinning|bouncing|rising|roaming|sleeping|floating|angry|hungry)$/
/** Places are settings, not opponents, even when someone is escaping one. */
const PLACES =
  /\b(mansion|dungeon|lab|laboratory|castle|cave|prison|maze|house|room|building|ship|spaceship|island|factory|forest|woods|city|planet|tomb|crypt|tower|temple|jail|school|museum|library|kitchen|garden|vault|station|basement|attic|sewer|mine|volcano|jungle|desert|swamp|graveyard|cemetery|farm|village|town|land|world|night|morning|dawn|street|road|highway|river|deck|orchard|treetops?|trees|rooftops?|platforms?|ledges?|branches|buildings|walls|lanes|islands|planets)\b/

/** Reads the noun phrase that starts at token `from`: up to three words, stopping at glue. */
function phrase(tokens: string[], from: number, max = 3): string {
  const out: string[] = []
  let i = from
  while (i < tokens.length && ARTICLES.has(tokens[i] as string)) i++
  for (; i < tokens.length && out.length < max; i++) {
    const t = tokens[i] as string
    if (STOPS.has(t) || VERBS.test(t) || (isGerund(t) && out.length > 0)) break
    out.push(t)
  }
  return out.join(' ')
}

function after(tokens: string[], triggers: RegExp): string[] {
  const found: string[] = []
  const text = tokens.join(' ')
  for (const match of text.matchAll(triggers)) {
    const index = text.slice(0, (match.index ?? 0) + match[0].length).split(' ').length
    const first = phrase(tokens, index)
    const lead = first.split(' ')[0] as string
    // "while avoiding rocks" starts a new clause. "falling rocks" does not.
    if (!first || (isGerund(lead) && !DESCRIBING.test(lead))) continue
    found.push(first)
    // "cars and trucks" names two things.
    const next = index + first.split(' ').length + countArticles(tokens, index)
    if (tokens[next] === 'and') {
      const second = phrase(tokens, next + 1)
      const head = second.split(' ')[0] as string
      if (second && !VERBS.test(head) && !(isGerund(head) && !DESCRIBING.test(head))) found.push(second)
    }
  }
  return found
}

function countArticles(tokens: string[], from: number): number {
  let n = 0
  while (ARTICLES.has(tokens[from + n] as string)) n++
  return n
}

const FOE_TRIGGERS =
  /\b(dodg(e|es|ing)|avoid(s|ing)?|escap(e|es|ing)( from)?|flee(s|ing)?( from)?|outrun(s|ning)?|chased by|hunted by|pursued by|run(s|ning)? (away )?from|evad(e|es|ing)|hid(e|es|ing) from|fight(s|ing)?|battl(e|es|ing)|against|versus|vs|past|away from|guarded by|full of|filled with|swarming with|infested with|without touching|outsmart(s|ing)?|outwit(s|ting)?|sneak(s|ing)? past|surviv(e|es|ing)|(hop|jump|leap)(s|ping|ing)? over|between|among|while)\b/g
const GOAL_TRIGGERS =
  /\b(to reach|reach(es|ing)?|to get to|get(s|ting)? to|to find|find(s|ing)?|back to|return(s|ing)? to|way to|home to|to save|to rescue|rescu(e|es|ing)|to win|to get|to deliver \w+ to|deliver(s|ing)? \w+ to|to the|out of|to escape)\b/g
const ITEM_TRIGGERS =
  /\b(collect(s|ing)?|gather(s|ing)?|grab(s|bing)?|pick(s|ing)? up|catch(es|ing)?|eat(s|ing)?|steal(s|ing)?|harvest(s|ing)?|hoard(s|ing)?|munch(es|ing)?|gobbl(e|es|ing)|loot(s|ing)?|finding all|find all|deliver(s|ing)?)\b/g

const ITEM_WORDS: [RegExp, ItemIcon][] = [
  [/coin|gold|money|token|cash|penn|dollar|treasure|loot|package|parcel|mail|letter|pizza/, 'coin'],
  [/gem|diamond|crystal|jewel|ruby|emerald|pearl|ore|sapphire|painting|artifact/, 'gem'],
  [/star|spark|light|firefl|wish|snowflake|battery|energy|bolt/, 'star'],
  [/heart|love|life|lives|friend|kitten|pupp|duckling|chick|baby|babies|survivor/, 'heart'],
  [/key|card|password|code|file|data|secret|clue|book|scroll|map/, 'key'],
  [/apple|berr|fruit|cherr|carrot|food|cheese|fish|acorn|nut|seed|cake|cookie|donut|honey|egg|bone|mushroom|candy|corn|flower|leaf|worm|fly|flies|bug|grain|bread|snack|banana|pear|peach|grape|melon|pumpkin|potato|tomato|wheat|raindrop|cupcake/, 'fruit'],
]

export function itemIconFor(text: string, fallback: ItemIcon): ItemIcon {
  for (const [pattern, icon] of ITEM_WORDS) if (pattern.test(text)) return icon
  return fallback
}

export function readPrompt(prompt: string): Brief {
  const clean = prompt
    .toLowerCase()
    .replace(/^\s*(please\s+)?((make|create|build|generate|give)\s+(me\s+)?)?(a\s+game\s+(about|where|with|of|in which)\s+)?/, '')
    .replace(/^(help|guide|control|play as|you are|you're)\s+/, '')
  const tokens = words(clean)
  const seed = hashString(prompt.trim().toLowerCase())

  let hero = ''
  const first = tokens.find((t) => !ARTICLES.has(t)) ?? ''
  const imperative = VERBS.test(first) || /^(dodge|jump|climb|collect|escape|catch|cross|survive|avoid|find|run|steal|deliver|race|fly|swim|reach|get|keep|stay|sneak)$/.test(first)
  if (!imperative) hero = phrase(tokens, 0)
  // "jumping game with a ninja" and "something with a dinosaur" name the hero late.
  const named = clean.match(/\b(?:as|with|playing|control(?:ling)?|about|starring)\s+(?:a|an|the)\s+([a-z]+(?:\s[a-z]+)?)/)
  const vague = !hero || /^(something|anything|stuff|one|thing)$/.test(hero) || isGerund(hero.split(' ')[0] as string) || tokens[0] === 'game'
  if (vague) hero = named ? phrase(words(named[1] as string), 0, 2) : ''

  const foes = [...new Set(after(tokens, FOE_TRIGGERS))].filter((f) => f !== hero && !hero.endsWith(f) && !PLACES.test(f)).slice(0, 3)
  const goals = after(tokens, GOAL_TRIGGERS).filter((g) => !foes.includes(g))
  let goal = goals[goals.length - 1] ?? ''
  if (/\b(home|house|nest|burrow|den)\b/.test(clean) && !goal) goal = 'home'
  if (/\bescap\w+/.test(clean) && (!goal || PLACES.test(goal))) goal = 'exit door'
  const items = after(tokens, ITEM_TRIGGERS).filter((i) => !foes.includes(i) && !PLACES.test(i))
  const item = items[0] ?? ''
  // Traffic is the obvious thing to dodge on a road, even when nobody says so.
  if (foes.length === 0 && /\b(road|street|highway|traffic|rush hour|motorway|freeway|intersection)\b/.test(clean)) foes.push('car', 'truck', 'bus')

  let theme: Theme | undefined
  let hits = 0
  for (const candidate of THEMES) {
    const n = new Set(clean.match(candidate.words) ?? []).size
    if (n > hits) {
      hits = n
      theme = candidate
    }
  }
  theme ??= PLAIN_THEMES[seed % PLAIN_THEMES.length] as Theme

  let archetype: Archetype | undefined
  let best = 0
  for (const name of ARCHETYPES) {
    let score = 0
    for (const [pattern, weight] of ARCHETYPE_WORDS[name]) if (pattern.test(clean)) score += weight
    if (score > best) {
      best = score
      archetype = name
    }
  }
  archetype ??= ARCHETYPES[(seed >>> 3) % ARCHETYPES.length] as Archetype

  return { prompt, hero, foes, goal, item, wantsCollect: items.length > 0, archetype, theme }
}
