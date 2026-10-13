/**
 * A tiny pixel font, five pixels tall. Most glyphs are three pixels wide and
 * written as five octal digits, one per row, where the three bits of a digit
 * are the three pixels of that row. M, N and W cannot be told apart at three
 * pixels, so they are wider and written out as rows.
 */
const NARROW: Record<string, string> = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553',
  H: '55755', I: '72227', J: '11152', K: '55655', L: '44447',
  O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557',
  V: '55552', X: '55255', Y: '55222', Z: '71247',
  '0': '75557', '1': '26227', '2': '61247', '3': '61216', '4': '55711',
  '5': '74616', '6': '34757', '7': '71222', '8': '75757', '9': '75716',
  '.': '00002', ',': '00024', '!': '22202', '?': '61202', '-': '00700', ':': '02020',
  "'": '22000', '/': '11244', '+': '02720', '>': '42124', '<': '12421',
}
const WIDE: Record<string, string[]> = {
  M: ['10001', '11011', '10101', '10001', '10001'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  W: ['10001', '10001', '10101', '11011', '10001'],
}

/** Every glyph as five strings of '0' and '1'. */
const GLYPHS = new Map<string, string[]>(Object.entries(WIDE))
for (const [char, digits] of Object.entries(NARROW)) GLYPHS.set(char, [...digits].map((d) => Number(d).toString(2).padStart(3, '0')))

export const GLYPH_H = 5
const SPACE_W = 3

function glyphWidth(char: string): number {
  return GLYPHS.get(char)?.[0]?.length ?? SPACE_W
}

/** Width in pixels, with one pixel between glyphs. */
export function textWidth(text: string, scale = 1): number {
  let width = 0
  for (const char of text.toUpperCase()) width += glyphWidth(char) + 1
  return width === 0 ? 0 : (width - 1) * scale
}

/** Draws into a buffer of palette indices. Unknown characters leave a gap. */
export function drawText(
  fb: Uint8Array,
  fbW: number,
  fbH: number,
  text: string,
  x: number,
  y: number,
  color: number,
  scale = 1,
): void {
  let gx = x
  for (const char of text.toUpperCase()) {
    const rows = GLYPHS.get(char)
    if (rows) {
      for (let r = 0; r < GLYPH_H; r++) {
        const row = rows[r] as string
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== '1') continue
          for (let sy = 0; sy < scale; sy++) {
            const py = y + r * scale + sy
            if (py < 0 || py >= fbH) continue
            for (let sx = 0; sx < scale; sx++) {
              const px = gx + c * scale + sx
              if (px >= 0 && px < fbW) fb[py * fbW + px] = color
            }
          }
        }
      }
    }
    gx += (glyphWidth(char) + 1) * scale
  }
}

/** Breaks text into lines no wider than `maxWidth` pixels, at spaces where it can. */
export function wrapText(text: string, maxWidth: number, scale = 1): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word
    if (line && textWidth(joined, scale) > maxWidth) {
      lines.push(line)
      line = word
    } else line = joined
    // A single word wider than the line is cut where it runs out of room.
    while (textWidth(line, scale) > maxWidth && line.length > 1) {
      let keep = line.length - 1
      while (keep > 1 && textWidth(line.slice(0, keep), scale) > maxWidth) keep--
      lines.push(line.slice(0, keep))
      line = line.slice(keep)
    }
  }
  if (line) lines.push(line)
  return lines
}
