# Image requests

7 images requested, 0 delivered. All seven have a code-drawn interim version in `assets/interim`, which is what the app uses today.

These are design-time assets. Save each file at the path given and it is picked up on the next request: anything in `assets/generated` wins over the file of the same name in `assets/interim`, one file at a time. The interim files are written by `npm run art` from `src/art/draw.ts` and `src/sprites/templates.ts`.

Delivered art does not need to be pixel perfect. The two sprite sheets (CT-006 and CT-007) go through the same pipeline as a runtime-generated sheet: the magenta is keyed out, colours are reduced to four and matched to the palette, and each cell is shrunk to 16 by 16 by majority vote. The five interface images (CT-001 to CT-005) are shown as delivered, scaled down by a whole number with nearest-neighbour sampling, so for those the block size matters.

**Style bible:** Game Boy era, chunky, strong silhouettes, no anti-aliasing.

**Interface palette** (CT-001 to CT-005): paper `#f3f0e8`, shell `#d9d5cc`, shell edge `#b9b4a8`, shadow `#8b8794`, slate `#50505a`, ink `#2b2a33`, accent `#a3214f`, accent light `#c8497a`, accent dark `#6e1535`.

**Sprite palette** (CT-006 and CT-007), lightest first: `#e0f8d0` `#88c070` `#346856` `#081820`. Only the order of the four tones matters. The engine recolours them per cart.

## CT-001 logo

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** Pixel art wordmark for a retro game maker called CARTRIDGE, Game Boy era, chunky, strong silhouettes, hard pixel edges with no anti-aliasing and no gradients. On the left, a small front-facing game cartridge icon, 12 art pixels wide: body in berry red #a3214f with a dark outline in #2b2a33, grip ridges along the top edge, and an off-white #f3f0e8 label that has a tiny two-eyed face on it. To its right, the word CARTRIDGE in capital letters in a blocky 5 by 7 pixel typeface, in #2b2a33, with a one pixel drop shadow down and to the right in #b9b4a8. Nothing else: no tagline, no border, no background.
- **Spec:** 592x104 px, 74:13, transparent background, PNG. Every art pixel is an 8x8 block, so the image reads as a 74x13 grid.
- **Save to:** `assets/generated/logo.png`
- **Used for:** The header of every page, shown at 148x26. Without it the header uses the interim wordmark.

## CT-002 d-pad

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** Pixel art of a handheld console's direction pad seen from directly above, Game Boy era, chunky, hard pixel edges with no anti-aliasing and no gradients. A plus shape that fills the image, arms 14 art pixels wide, in charcoal #2b2a33 with a one pixel lit edge along the top and left of every arm in #5d5b68, a one pixel shaded edge along the bottom and right in #1e1d25, and a one pixel outline in #17161c. A small round dimple in the centre. A small embossed arrow near the end of each arm, pointing outward, in #4a4854. No text, no background, no drop shadow.
- **Spec:** 320x320 px, 1:1, transparent background, PNG. Every art pixel is an 8x8 block, so the image reads as a 40x40 grid.
- **Save to:** `assets/generated/shell/dpad.png`
- **Used for:** The d-pad on the handheld on every play page, shown at 120x120. Touches are mapped to directions by position, so the plus must be centred and fill the image.

## CT-003 action button

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** Pixel art of one round plastic action button from a handheld console, seen from directly above, Game Boy era, chunky, hard pixel edges with no anti-aliasing and no gradients. A circle that fills the image, in berry red #a3214f, with a lighter crescent along the upper left in #c8497a, a darker crescent along the lower right in #6e1535, a dark rim in #6e1535, and a small pale glint near the top left in #e59ab8. No letter on it, no text, no background, no drop shadow.
- **Spec:** 144x144 px, 1:1, transparent background, PNG. Every art pixel is an 8x8 block, so the image reads as an 18x18 grid.
- **Save to:** `assets/generated/shell/button.png`
- **Used for:** Both the A and the B button on the handheld, shown at 54x54. The letters are set in type beside them.

## CT-004 lost cartridge

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** Pixel art illustration of a single game cartridge standing upright with a large question mark on its label, Game Boy era, chunky, strong silhouette, hard pixel edges with no anti-aliasing and no gradients. Cartridge body in warm light grey #d9d5cc with a dark outline in #2b2a33, grip ridges along the top, an off-white #f3f0e8 label framed in #2b2a33, the question mark in #2b2a33. A thin ground shadow under it in #8b8794. No text other than the question mark, no background.
- **Spec:** 320x240 px, 4:3, transparent background, PNG. Every art pixel is an 8x8 block, so the image reads as a 40x30 grid.
- **Save to:** `assets/generated/ui/lost-cart.png`
- **Used for:** The page shown for a share link that leads to no cart. Shown at 160x120.

## CT-005 empty shelf

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** Pixel art illustration of three game cartridges standing side by side on a shelf, Game Boy era, chunky, strong silhouettes, hard pixel edges with no anti-aliasing and no gradients. The middle cartridge has a simple smiling face on its label. The two outer cartridges are asleep, each with a pair of small letter Z marks on its label, one of them in berry red #a3214f. Cartridge bodies in warm light grey #d9d5cc and #b9b4a8 with dark outlines in #2b2a33, labels in off-white #f3f0e8. The shelf is a thick dark line in #2b2a33 with a thin shadow under it in #8b8794. No other text, no background.
- **Spec:** 704x240 px, 44:15, transparent background, PNG. Every art pixel is an 8x8 block, so the image reads as an 88x30 grid.
- **Save to:** `assets/generated/ui/empty-shelf.png`
- **Used for:** The gallery when nobody has made a cart yet. Shown at 352x120.

## CT-006 default sprite sheet

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** A sprite sheet for a Game Boy era handheld game, laid out as a grid of 4 columns and 2 rows of equal square cells on a flat, pure magenta (#FF00FF) background. Chunky pixel art, strong readable silhouettes, hard pixel edges, no anti-aliasing, no gradients, no text, no labels, no lines between cells. Use only these four colours, plus the magenta background: #e0f8d0, #88c070, #346856, #081820. Every character is drawn once, facing right or facing the viewer, centred, filling most of its cell, with a one pixel outline in #081820 and magenta all around it. Row 1, left to right: a small round-headed hero in a tunic and boots; a friendly blob of slime with two eyes; a bat with its wings spread; a round spiky creature with two eyes. Row 2, left to right: a flag on a pole; a square tile of brick wall that fills its whole cell edge to edge, in the two darker colours; a square tile of grass over soil that fills its whole cell edge to edge, in the two lighter colours; a quiet square pattern of pale sky with one small cloud that fills its whole cell, almost entirely #e0f8d0.
- **Spec:** 1024x512 px, 2:1, no transparency (flat magenta background), PNG. Each cell is 256x256 and every art pixel is a 16x16 block, so each cell reads as a 16x16 grid.
- **Save to:** `assets/generated/sprites/default-sheet.png`
- **Used for:** The built-in default sprite set: the cells a cart borrows when a generated sheet comes back with an empty cell. Without it the default set comes from the interim sheet.

## CT-007 pickup and hazard icons

- **Status:** requested (code-drawn interim image in use)
- **Prompt:** A sheet of game icons for a Game Boy era handheld game, laid out as a grid of 5 columns and 2 rows of equal square cells on a flat, pure magenta (#FF00FF) background. Chunky pixel art, strong readable silhouettes, hard pixel edges, no anti-aliasing, no gradients, no text, no labels, no lines between cells. Use only these four colours, plus the magenta background: #e0f8d0, #88c070, #346856, #081820. Row 1, left to right, five pickups drawn mostly in the lightest colour #e0f8d0 with a one pixel outline in #081820, each centred with magenta around it: a coin; a cut gem; a five-pointed star; a heart; a key lying on its side. Row 2, left to right: a sixth pickup drawn the same way, an apple with a leaf; a row of two floor spikes that touches the bottom edge of its cell and both side edges, in #88c070 with a #081820 outline; a flame, in #88c070 with a pale core; a square tile of rippling water that fills its whole cell edge to edge with no magenta; a lightning bolt, in #88c070 with a #081820 outline.
- **Spec:** 1280x512 px, 5:2, no transparency (flat magenta background), PNG. Each cell is 256x256 and every art pixel is a 16x16 block, so each cell reads as a 16x16 grid.
- **Save to:** `assets/generated/sprites/icons.png`
- **Used for:** The pickup and hazard cells of every cart: coin, gem, star, heart, key, fruit, spike, flame, water, bolt. A manifest picks one pickup and one hazard by name. Without it the icons come from the interim sheet.

## Runtime sheets (not requested here)

The PRD also has the app generate one sprite sheet per cart at runtime. That is not a design-time request and nothing in this file covers it. When `SPRITE_API_KEY` is set, `src/sprites/sheet.ts` builds one prompt per cart in the same shape as CT-006 (4 by 2 grid on magenta, the cart's own four colours, the eight things the manifest's `art` block names) and sends it to the configured image API. With no key, the built-in artist in `src/sprites/synth.ts` draws the sheet instead.
