/**
 * A 3 by 5 pixel font. Each glyph is five octal digits, one per row, where
 * the three bits of a digit are the three pixels of that row.
 */
const GLYPHS: Record<string, string> = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553',
  H: '55755', I: '72227', J: '11152', K: '55655', L: '44447', M: '57755', N: '65555',
  O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557',
  V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
  '0': '75557', '1': '26227', '2': '61247', '3': '61216', '4': '55711',
  '5': '74616', '6': '34757', '7': '71222', '8': '75757', '9': '75716',
  '.': '00002', ',': '00024', '!': '22202', '?': '61202', '-': '00700', ':': '02020',
  "'": '22000', '/': '11244', '+': '02720', '>': '42124', '<': '12421',
}

const ROWS = new Map<string, number[]>()
for (const [char, digits] of Object.entries(GLYPHS)) ROWS.set(char, [...digits].map(Number))

export const GLYPH_W = 3
export const GLYPH_H = 5
export const ADVANCE = 4

export function textWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale
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
  const upper = text.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    const rows = ROWS.get(upper[i] as string)
    if (!rows) continue
    const gx = x + i * ADVANCE * scale
    for (let r = 0; r < GLYPH_H; r++) {
      const bits = rows[r] as number
      for (let c = 0; c < GLYPH_W; c++) {
        if (!(bits & (4 >> c))) continue
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
}

/** Breaks text into lines of at most `max` characters, at spaces where it can. */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line)
      line = ''
    }
    line = line ? `${line} ${word}` : word
    while (line.length > max) {
      lines.push(line.slice(0, max))
      line = line.slice(max)
    }
  }
  if (line) lines.push(line)
  return lines
}
