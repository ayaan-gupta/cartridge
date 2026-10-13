# Cartridge: working notes for Claude Code

Project 3 of 11 from "Project PRDs: 11 Builds for Claude Code". Slug `cartridge`.

## Commands

- `npm run dev` serves on port 4103 (3000, 8000 and 5432 are taken on this machine). `PORT=4200 npm run dev` to move it.
- `npm test` runs all tests, `npm run typecheck` runs tsc
- `npm run eval` runs the 50-prompt acceptance set offline and rewrites `docs/eval-offline.json`. `npm run eval -- --live` runs it against Claude and needs `ANTHROPIC_API_KEY`. `npm run eval -- --random 400` tries prompts nobody tuned for.
- `npm run bench` times one frame of simulation and drawing in Node
- `npm run art` redraws `assets/interim`, `npm run docs` redraws `docs/carts.png`, `docs/sprites.png` and `docs/sprite-pipeline.png`
- `npm run shot -- prompt "a frog dodging cars"` renders a generated cart to `.cache/shots` without a browser
- With a server running (`npm run build && npm run start`): `npm run smoke` plays the app on a desktop and a phone viewport, `npm run perf` rewrites `docs/perf.json`, `npm run screens` retakes the screenshots, `npm run demo` re-records `docs/demo.gif`

## Shared conventions

- **Repo:** one repo per project, named by its slug, MIT license, README.md with a demo GIF and a one-command quickstart.
- **Default stack:** TypeScript with Vite or Next.js for web, Python (FastAPI) for ML and audio services, SQLite for local data and Postgres for hosted, deployed on Vercel or Fly.io. A PRD overrides this where it says so.
- **Creative direction:** these are portfolio pieces, so every project should feel designed. Generated imagery is a core part of the product, and each project gets a distinct visual identity from its style bible.
- **Image requests:** Claude Code does not generate images. Every image is requested from Ayaan with a numbered asset ID and short name, the exact generation prompt, size, aspect ratio, transparency and format, the exact save path under `/assets/generated`, and what the asset is for. Requests are batched per milestone and logged in `/assets/prompts.md` with a status.
- **Runtime image generation:** where an app generates images for its users, build it as an API integration behind an adapter with a built-in fallback image.
- **Quality bar:** typed code, at least 3 automated tests per milestone, no secrets in git (`.env.example` only), and an ARCHITECTURE.md of at most one page.
- **Definition of done:** runs from a clean clone with one command, passes all acceptance tests, deployed or recorded demo, README lists limitations and the next three ideas.

## How the image rule was applied here

The seven design-time images (logo, d-pad, button, two illustrations, the default sprite sheet, the icon sheet) are requested in `assets/prompts.md` without waiting for delivery. Code-drawn versions in `assets/interim` stand in until then. Delivered files go in `assets/generated` at the paths listed and take over automatically: `/art/<path>` and `loadArt()` both look there first.

The per-cart sprite sheet is runtime generation, so it is an adapter (`src/sprites/provider.ts`), not a request. With no `SPRITE_API_KEY` the built-in artist in `src/sprites/synth.ts` draws every sheet.

## Writing

No em dashes anywhere, in docs or UI copy. README prose should sound like a person: varied sentences, no rule-of-three lists, no "it's not X, it's Y" constructions.

## Things that will bite

- `src/engine` must not import from outside its own folder, and `engine.ts`, `render.ts` and friends must not touch the DOM, the clock, `Math.random` or trig. Two tests enforce this. The bot and every replay depend on it.
- In hot loops, copy imported constants into module-level locals first. Under tsx and vitest an imported `TILE` is a getter call on a module object, and reading it per pixel made drawing 20 times slower.
- Changing anything in `Engine.step` changes what every stored recording does. Old carts keep their manifests but their recordings may stop winning. Re-run `npm run eval`.
- The interim sprite PNGs are checked against the code that draws them. After touching `src/sprites/templates.ts` or `synth.ts`, run `npm run art` or a test fails.
- Module-level state is per route in Next dev. The service lives on `globalThis`.
- The handheld sizes itself from the window, never from its own container: the container is sized by the handheld.
- Pixel art is scaled by whole numbers and never rotated in CSS.
