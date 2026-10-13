# Notes for the README

Plain facts for whoever writes the README. Every number here was measured in the build session on an M5 Pro, with the command given. The machine was busy with other builds (load average around 30 at one point), so timings moved between runs and I give ranges where they did.

## Quickstart, ports, environment

- One command from a clean clone: `npm install && npm run dev`, then open http://localhost:4103. Checked on a fresh `git clone` (see the end of this file).
- Port 4103 for both `npm run dev` and `npm run start`. `PORT=4200 npm run dev` moves it. The npm scripts read `PORT` from the shell with `${PORT:-4103}`, so this needs a POSIX shell.
- No key, no network and no database are needed. With nothing set, the offline generator writes manifests, the built-in artist draws sprites, and carts are stored as JSON files under `.data/`.
- Environment variables, all optional (see `.env.example`):
  - `PORT`: port for the npm scripts. Default 4103.
  - `CARTRIDGE_GENERATOR`: `auto` (default), `offline` or `anthropic`. `auto` uses Claude when `ANTHROPIC_API_KEY` is set.
  - `ANTHROPIC_API_KEY`: enables the Anthropic generator.
  - `CARTRIDGE_MODEL`: model id. Default `claude-sonnet-5-5`.
  - `SPRITE_API_KEY`: enables runtime sprite generation through an image API.
  - `SPRITE_API_URL`: default `https://api.openai.com/v1/images/generations`. Any API that speaks the OpenAI images protocol.
  - `SPRITE_IMAGE_MODEL`: default `gpt-image-1`. `SPRITE_IMAGE_SIZE`: default `1536x1024`.
  - `CARTRIDGE_DATA_DIR`: where the file store writes. Default `.data`.
  - `KV_REST_API_URL` and `KV_REST_API_TOKEN`: set both to use a hosted store that speaks the Upstash Redis REST protocol (Vercel KV does).
- Other commands: `npm test` (148 tests, about 40 s, most of it the browser test), `npm run typecheck`, `npm run build`, `npm run eval`, `npm run bench`, `npm run art`, `npm run docs`. With a server running: `npm run smoke`, `npm run perf`, `npm run screens`, `npm run demo`.

## What each milestone delivered

- **M1, engine and three hand-written carts.** `src/engine`: a fixed 60 Hz simulation with eight entity behaviours, a renderer that draws palette indices into a 160 by 144 buffer, a 5 pixel font, a browser runner, and four chiptune loops. 1,809 lines in the folder, 1,561 without the chiptunes, no imports from outside the folder and no npm dependencies. Three carts in `src/cart/templates.ts`: Lily Pad Dash (top view, traffic), Moon Miner (side view, platforms), Gem Vault (top view, maze with a chaser). Also the win-check bot in `src/bot/bot.ts`, because the carts needed proving.
- **M2, schema, validator, generators.** A Zod schema for the manifest plus hand-written rule checks, a one-pass deterministic repair, an offline generator with seven level archetypes and fifteen themes, the Anthropic generator with JSON-schema constrained output, and the pipeline: generate, validate, repair once, fall back, then play it and ease or replace until the bot wins.
- **M3, sprites.** The slicing pipeline (key out magenta, reduce to four colours, pair with the palette, cut into cells, shrink by majority vote, pack to 2 bits a pixel), a procedural artist with 36 hand-authored shapes, an image-provider adapter with a cache keyed by prompt hash, and a loader for design-time art that prefers `assets/generated` over `assets/interim`.
- **M4, sharing and touch.** `/c/<id>` play page drawn as a handheld, with a touch d-pad and A and B buttons, keyboard on desktop, whole-number scaling. `/gallery` with the last 50 carts. `.cart` download and import. A "watch the bot win" button that replays the proof, and you can take over from the bot mid-run. Label images for gallery cards and link previews.

## PRD acceptance tests

| Acceptance test | Status | Measured | Where |
|---|---|---|---|
| 50 varied prompts give 50 valid manifests, at least 95% on the first try and 100% after repair | **Met on the offline generator only.** The LLM path is implemented and has never been run. | 50/50 valid on the first try, 50/50 after repair, 0 template fallbacks | `tests/acceptance.test.ts`, `npm run eval` (writes `docs/eval-offline.json`) |
| Every generated cart is winnable, checked by a bot that reaches the goal within the time limit | **Met** | 50/50 won as generated, each recording replayed to a win on a fresh engine with no life lost. Six deliberately unwinnable manifests are refused. | `tests/acceptance.test.ts`, `tests/carts.test.ts`, `tests/generator.test.ts` |
| Engine holds 60 FPS on a mid-range phone | **Met in emulation, not on a phone.** Headless Chromium, main thread throttled 4x through the DevTools protocol, 390 by 844 at device pixel ratio 3. | Engine alone, across six runs of the test: 0.16 to 0.39 ms of work per frame, worst single frame 6.7 ms, 60.0 fps and 0 of 300 frames late every time, on four carts including a stress cart at the 64-entity cap. Real play page, last run: 0.13 to 0.17 ms mean, worst 1.0 ms, 60.0 fps, 0 late frames. Budget is 16.67 ms. The throttle is checked too: the same busy loop took 122 ms unthrottled and 504 ms at 4x. | `tests/perf.test.ts`, `npm run perf` (writes `docs/perf.json`) |
| A cart's JSON stays under 20 KB without images | **Met** | Mean 1,444 bytes, max 2,708 bytes over the 50. A whole `.cart` file with sprites and the bot's recording: mean 3,346 bytes, max 4,573. | `tests/acceptance.test.ts`, `tests/sprites.test.ts`, `tests/web.test.ts` |

Things that qualify those numbers:

- **The 95% figure is the offline generator's, and it is 100% by construction.** That generator builds manifests from code that was written against the same schema, so a first-try failure would be a bug, not a statistic. It says nothing about how often Claude would get it right. `npm run eval -- --live` runs the same 50 prompts against the real model when `ANTHROPIC_API_KEY` is set. It was not run: there was no key.
- **The repair step is exercised by damage, not by the generator.** 50 generated manifests were each given one to three random faults from a list of 32 (missing keys, wrong types, extra players, short rows, entities in walls, unknown behaviours and so on). 49 of the 50 came out invalid and one repair pass fixed all 49. `tests/schema.test.ts`.
- **I tuned against the 50 prompts.** Before two fixes, 46 of the 50 were winnable as generated. For prompts nobody tuned for, `npm run eval -- --random 400` stitches 400 sentences from word lists: 400/400 valid, 391 (97.8%) won as generated, 9 (2.3%) won after easing, 0 replaced, 400/400 shipped winnable. Largest manifest 3,712 bytes. Mean 82 ms per cart, slowest 3.1 s.
- **The perf numbers moved with machine load.** Earlier runs of `npm run perf` at 4x gave 0.29 to 0.47 ms mean, and one worst frame of 12.2 ms on Gem Vault that did not recur. Still inside 16.67 ms, and no frame was ever late.
- Node, no browser, `npm run bench`: about 0.45 microseconds per simulation step and 26 to 31 microseconds per draw, so 0.03 ms a frame. On the loaded machine it reached 0.08 ms.

## War stories

1. **An imported constant cost 20x in the pixel loop.** First benchmark: 0.57 microseconds to simulate a frame and 650 to draw it. That is slow for 23,040 pixels. A CPU profile listed `get`, `TILE`, `TRANSPARENT` and `SCREEN_W` as the hottest "functions". Under tsx and vitest, `import { TILE }` becomes a getter on a module object, read every time. Copying imported constants into module-level locals in `render.ts` and `engine.ts` took drawing from 650 to 30 microseconds. In a real bundle the cost was never there, but the bot runs in Node, and so do the tests.
2. **Soft edges outvoted the outline.** The first run of the slicer on a synthetic "generated" sheet (blurred edges, colours 14 units off the palette, noise) got 80.3% of pixels right. The shapes were perfect. The colours were wrong: the two darkest tones had merged. Blurring a one-block dark outline against a light fill makes more in-between pixels than outline pixels, so the smear won a palette slot and the outline lost its own. Fix: estimate the four colours only from flat pixels (a pixel that matches its neighbours two steps away), then a few rounds of k-means. Recovery went to over 99%, and the four colours came back within one unit of the truth. The same test file shows why plain median cut was not enough: with one colour making up 87% of the picture, the population median lands inside it and two of four boxes are spent on one colour.
3. **The bot called slow players stuck.** A cart with a player at 30 px/s was reported unwinnable with the goal in plain sight. The search holds each button combination for 6 frames and remembers visited positions in 4 pixel cells. At half a pixel a frame, 6 frames is 3 pixels, so a move often landed in the cell it started from and was thrown away as already seen. The hold length now scales with speed so every move covers about half a tile.
4. **Quick taps never reached the game.** `npm run smoke` drives the play page with real touch events on an emulated phone. Tapping A did nothing. The tap went down and up between two simulation steps, and the runner only sampled buttons at step time. The runner now remembers a press until one step has seen it. The same script caught the handheld measuring its own container to pick a scale: the container was sized by the handheld, so it agreed with whatever scale it already had and sat at 2x on a 1280 by 860 window that fits 3x.
5. **How hard the bot should try.** At 40,000 expansions it failed 4 of the 50. One maze was winnable but needed 75,097 expansions (about a second). Another was not solved at 600,000 (9.6 s): the generator had parked a chaser next to a pickup, which is a puzzle about luring it away, and a greedy search does not lure. I raised the budget to 80,000, stopped the generator placing guards in a cell with a pickup, and let anything still unsolved be eased. Memory was the other half: every generated node held a snapshot. Now only expanded nodes do, and a child is re-simulated from its parent when it is popped.
6. **Small things the prompt reader got wrong.** "knight" contains "night", so a castle cart was drawn as a dark world. "duckling" and "lightning" were treated as verbs ending in -ing and dropped. "a ghost escaping a haunted mansion chased by vampires" produced an enemy called "haunted mansion chased". "survive a meteor shower" was titled SHOWER SHOWER.

## Surprises and things I got wrong first

- 90 frames of safety after a hit let you die on purpose and stroll through six tiles of traffic. It is 45 now, and a test checks five tiles of spikes cannot be crossed that way.
- A test map I built to be impossible in 20 seconds was won with 10 frames to spare, because the goal's touch box is generous and my arithmetic was not.
- My first check that the throttle was real compared the engine's frame cost with and without it. It failed in the fresh clone: 0.166 ms against 0.202 ms, because a frame is cheaper than the browser's 0.1 ms timer can measure well. It now times a 40 million step loop instead, which comes out 4.1 times slower.
- The 4x throttle barely registers. The engine is small enough that a frame costs about 2% of the budget throttled, so the meaningful half of the 60 FPS test is that frames arrive on time, not how long the work takes.
- A 3 pixel wide N is either a lowercase n or an M. "KNIGHT ASCENT" read as "KMIGHT ASCEMT" until M, N and W got wider glyphs.
- Rotating the A and B buttons 24 degrees in CSS, as on the real handheld, shredded the pixel art. They are offset now, not rotated.
- `image-rendering: pixelated; image-rendering: crisp-edges;` in that order now resolves to `crisp-edges` in Chromium. The order is swapped.
- The engine is 1,809 lines against the PRD's "about 1,500". Without the chiptunes it is 1,561.

## Limitations

- **The LLM generator has never called the API.** The request shape is tested with a stub client. The structured-output schema is derived from the Zod schema with unsupported keywords stripped and moved into descriptions, which is my reading of the docs, not something I watched work. I also did not add the server-side refusal fallback: a refusal goes to the offline generator instead.
- **The image provider has never called an API.** Tested with a stub fetch. The slicer has only seen synthetic sheets that I drew in code to look generated. Real model output will have problems those do not: cells that are not on a grid, drawings that cross cell borders, magenta inside a sprite.
- **The hosted key-value client has never touched a real store.**
- **The offline generator does not understand the sentence.** It is keyword and pattern matching into seven archetypes. A prompt with no keywords gets an archetype chosen by hash. "something with a dinosaur" becomes a maze.
- **The bot proves a cart can be won, not that it is fun or fair for a person.** It wins with frame-exact input and no lives lost. It never uses B or the dash. It is also incomplete: it can fail to find a win that exists, and then a cart that was fine gets eased.
- **Sprites from the built-in artist repeat.** 18 character shapes and 8 goal shapes. Two carts about cats share a silhouette with different markings. One frame per entity: animation is a one pixel bob.
- **Nobody has listened to the chiptunes.** They parse, they schedule, and all four are eight bars on every channel. I could not hear them.
- **60 FPS was measured in an emulated phone only.** No physical device, no Safari, no Firefox.
- No rate limit or auth on `POST /api/carts`. No moderation of prompts, which appear in the gallery. The file store does not suit serverless hosting.
- On the home page the keyboard only drives the demo after you click the handheld, so the page can still scroll.
- No Rust or WASM port. There was no Rust toolchain on the machine.

## Next three ideas

1. Port the simulation to Rust and WASM, and use the stored bot recordings as the test: the two engines must agree frame for frame on every cart.
2. Run the live evaluation, then give the model the bot's verdict. When a cart cannot be won, send back where the bot got stuck and ask for a second attempt, instead of only easing it.
3. A "remix" button on a share link: open the map in a small editor, move tiles and entities by touch, and have the bot re-check winnability as you edit.

## Real and stand-in

| Part | Real | Stand-in |
|---|---|---|
| Engine, renderer, runner, bot, schema, repair, pipeline | Real, tested | |
| Manifest generation | Offline generator: real and the default | Anthropic generator: implemented, stub-tested, never run live |
| Sprite slicing and quantising | Real, tested on synthetic sheets | |
| Sprite generation | Built-in artist: real and the default | Image API provider: implemented, stub-tested, never run live |
| Storage | File store: real and the default | REST store: implemented, stub-tested, never run live |
| Design-time art | Code-drawn interim PNGs in `assets/interim` | 7 images requested in `assets/prompts.md`, 0 delivered |
| Phone performance | | CPU-throttled headless Chromium, not a phone |

## Files in docs/

- `demo.gif`: 1.2 MB, 24 seconds. Types a prompt on the home page, lands on the cart, the bot plays it. Twice, then the gallery.
- `home.png`: the home page at 1280 wide, with the demo handheld.
- `play-title.png`: a generated cart on its title card, showing its cast.
- `play.png`: the same cart mid-game with the bot playing.
- `gallery.png`: the shelf.
- `not-found.png`: a dead share link.
- `phone-play.png`, `phone-home.png`, `phone-gallery.png`: the same pages at 390 by 844.
- `carts.png`: eight generated carts from eight prompts, each a third of the way through the bot's run.
- `sprites.png`: all 36 hand-authored shapes.
- `sprite-pipeline.png`: a soft, off-palette synthetic sheet on the left, what the slicer makes of it on the right.
- `eval-offline.json`: the 50-prompt run, row by row.
- `perf.json`: the last `npm run perf`.

## Fresh clone check

Done twice, into an empty folder each time, with the server on port 4103.

- First clone: `git clone`, `npm install && npm run dev`. The home page answered 200 (4.1 s, the first compile), a cart was made through `POST /api/carts` (PENGUIN TREK, valid first try, won by the bot), the shelf listed it ahead of the three hand-written carts, and the play page, gallery, label PNG, `.cart` download and logo all answered 200. A bad id answered 404. `npm run typecheck` was clean. `npm test`: 147 of 148 passed. The one failure was the throttle sanity check described above, which was a bad test and has been replaced.
- Second clone, after that fix: `npm install`, then `npm run typecheck` (clean), `npm test` (148 of 148 passed) and `npm run build` (compiled).
