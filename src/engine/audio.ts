/**
 * Four chiptune loops and a handful of sound effects, played through
 * WebAudio. The tunes are text: one token per eighth note, a note name to
 * start a note, '-' to hold it, '.' to rest. Parsing is pure so it can be
 * tested without a sound card. Only Chiptune touches the browser.
 */
import type { GameEvent, MusicId } from './types'

export interface Tune {
  bpm: number
  /** triangle for a soft lead, pulse for a bright one. */
  voice: 'pulse' | 'triangle'
  lead: string
  harmony: string
  bass: string
  /** k kick, s snare, h hat. */
  drums: string
}

export const TUNES: Record<MusicId, Tune> = {
  overworld: {
    bpm: 132,
    voice: 'pulse',
    lead: 'E5 . G5 . C6 . G5 E5 | F5 . A5 . C6 . A5 F5 | G5 . B5 . D6 . B5 G5 | C6 - - . G5 . E5 . | E5 . G5 . C6 . G5 E5 | F5 . A5 . D6 . C6 A5 | G5 G5 A5 B5 C6 . D6 . | C6 - - - . . G5 .',
    harmony: 'C5 . . . E5 . . . | A4 . . . F5 . . . | B4 . . . G5 . . . | E5 - - . . . . . | C5 . . . E5 . . . | A4 . . . F5 . . . | D5 . . . E5 . F5 . | E5 - - - . . . .',
    bass: 'C3 . C3 G3 C3 . G3 . | F3 . F3 C4 F3 . C4 . | G3 . G3 D4 G3 . D4 . | C3 . G3 . C4 . G3 . | C3 . C3 G3 C3 . G3 . | F3 . F3 C4 F3 . C4 . | G3 . G3 . G3 A3 B3 . | C3 . G3 . C3 . . .',
    drums: 'k . h . s . h . | k . h . s . h . | k . h . s . h . | k . h . s . h h | k . h . s . h . | k . h . s . h . | k . h . s . h . | k . s . s s s .',
  },
  cavern: {
    bpm: 100,
    voice: 'pulse',
    lead: 'A4 . C5 . E5 . C5 . | B4 . D5 . F5 . D5 . | C5 . E5 . A5 . E5 . | E5 - D5 - C5 - B4 - | A4 . C5 . E5 . A5 . | G5 . E5 . D5 . C5 . | B4 . C5 . D5 . E5 . | A4 - - - . . . .',
    harmony: 'E4 - - - - - - - | D4 - - - - - - - | C4 - - - - - - - | B3 - - - - - - - | E4 - - - - - - - | E4 - - - - - - - | G#4 - - - - - - - | E4 - - - . . . .',
    bass: 'A2 - - - E3 - - - | G2 - - - D3 - - - | F2 - - - C3 - - - | E2 - - - E3 - - - | A2 - - - E3 - - - | C3 - - - G3 - - - | E3 - - - E2 - - - | A2 - - - . . . .',
    drums: 'k . . . h . . . | k . . . h . s . | k . . . h . . . | k . . . h . s . | k . . . h . . . | k . . . h . s . | k . . . h . . . | k . s . . . . .',
  },
  sprint: {
    bpm: 168,
    voice: 'pulse',
    lead: 'E5 E5 G5 E5 B5 E5 G5 E5 | D5 D5 F#5 D5 A5 D5 F#5 D5 | C5 C5 E5 C5 G5 C5 E5 C5 | B4 D5 F#5 A5 B5 A5 F#5 D5 | E5 E5 G5 E5 B5 E5 G5 E5 | D5 D5 F#5 D5 A5 D5 F#5 D5 | C5 E5 G5 C6 B5 G5 E5 C5 | B4 . B4 . D#5 . F#5 .',
    harmony: 'B4 - - - - - - - | A4 - - - - - - - | G4 - - - - - - - | F#4 - - - - - - - | B4 - - - - - - - | A4 - - - - - - - | G4 - - - - - - - | F#4 - - - D#4 - - -',
    bass: 'E3 . E3 . E3 . E3 E3 | D3 . D3 . D3 . D3 D3 | C3 . C3 . C3 . C3 C3 | B2 . B2 . B2 . B2 B2 | E3 . E3 . E3 . E3 E3 | D3 . D3 . D3 . D3 D3 | C3 . C3 . C3 . C3 C3 | B2 . B2 . B2 . B2 .',
    drums: 'k h s h k h s h | k h s h k h s h | k h s h k h s h | k h s h k k s s | k h s h k h s h | k h s h k h s h | k h s h k h s h | k . k . s s s s',
  },
  lullaby: {
    bpm: 88,
    voice: 'triangle',
    lead: 'A5 - C6 - A5 - F5 - | G5 - A#5 - G5 - E5 - | F5 - A5 - C6 - A5 - | G5 - - - C5 - - - | A5 - C6 - A5 - F5 - | A#5 - D6 - A#5 - G5 - | A5 - G5 - F5 - E5 - | F5 - - - - - . .',
    harmony: 'F4 - - - - - - - | E4 - - - - - - - | F4 - - - - - - - | E4 - - - - - - - | F4 - - - - - - - | D4 - - - - - - - | E4 - - - - - - - | F4 - - - - - . .',
    bass: 'F3 - C4 - A3 - C4 - | C3 - G3 - E3 - G3 - | F3 - C4 - A3 - C4 - | C3 - G3 - E3 - G3 - | F3 - C4 - A3 - C4 - | A#2 - F3 - D3 - F3 - | C3 - G3 - E3 - G3 - | F3 - C4 - F3 - . .',
    drums: '. . . . h . . . | . . . . h . . . | . . . . h . . . | . . . . h . . . | . . . . h . . . | . . . . h . . . | . . . . h . . . | . . . . . . . .',
  },
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "A4" is 440 Hz. Returns 0 for anything that is not a note name. */
export function noteFrequency(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name)
  if (!match) return 0
  const semitone = (SEMITONES[match[1] as string] as number) + (match[2] ? 1 : 0) + (Number(match[3]) + 1) * 12
  return 440 * 2 ** ((semitone - 69) / 12)
}

export interface NoteEvent {
  /** Step the note starts on, counted in eighth notes. */
  step: number
  /** Length in steps. */
  length: number
  frequency: number
}

/** Turns a track string into notes. Held tokens lengthen the note before them. */
export function parseTrack(track: string): { steps: number; notes: NoteEvent[] } {
  const tokens = track.split(/\s+/).filter((t) => t && t !== '|')
  const notes: NoteEvent[] = []
  tokens.forEach((token, step) => {
    if (token === '-') {
      const last = notes[notes.length - 1]
      if (last && last.step + last.length === step) last.length++
      return
    }
    const frequency = noteFrequency(token)
    if (frequency > 0) notes.push({ step, length: 1, frequency })
  })
  return { steps: tokens.length, notes }
}

export function parseDrums(track: string): string[] {
  return track.split(/\s+/).filter((t) => t && t !== '|')
}

type Wave = 'pulse' | 'thin' | 'triangle' | 'square'

/** Plays tunes and effects. Create it any time; it makes no sound until unlock(). */
export class Chiptune {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private waves = new Map<Wave, PeriodicWave>()
  private noise: AudioBuffer | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private playing: MusicId | null = null
  private step = 0
  private nextTime = 0
  private muted = false

  /** Browsers only allow sound after a key press or a touch. Call this from one. */
  unlock(): void {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return
      const context = new Context()
      this.context = context
      this.master = context.createGain()
      this.master.gain.value = this.muted ? 0 : 0.16
      this.master.connect(context.destination)
      this.waves.set('pulse', this.pulse(context, 0.25))
      this.waves.set('thin', this.pulse(context, 0.125))
      const length = Math.floor(context.sampleRate * 0.4)
      this.noise = context.createBuffer(1, length, context.sampleRate)
      const samples = this.noise.getChannelData(0)
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1
    }
    if (this.context.state === 'suspended') void this.context.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.16, this.context.currentTime, 0.02)
  }

  /** A pulse wave of a given duty cycle, built from its Fourier series. */
  private pulse(context: AudioContext, duty: number): PeriodicWave {
    const real = new Float32Array(32)
    const imag = new Float32Array(32)
    for (let n = 1; n < 32; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
    return context.createPeriodicWave(real, imag)
  }

  private tone(wave: Wave, frequency: number, at: number, seconds: number, volume: number, slideTo = 0): void {
    const context = this.context
    if (!context || !this.master) return
    const osc = context.createOscillator()
    const custom = this.waves.get(wave)
    if (custom) osc.setPeriodicWave(custom)
    else osc.type = wave === 'triangle' ? 'triangle' : 'square'
    osc.frequency.setValueAtTime(frequency, at)
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, at + seconds)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(volume, at + 0.005)
    gain.gain.setValueAtTime(volume, at + Math.max(0.006, seconds - 0.03))
    gain.gain.linearRampToValueAtTime(0, at + seconds)
    osc.connect(gain).connect(this.master)
    osc.start(at)
    osc.stop(at + seconds + 0.02)
  }

  private hiss(at: number, seconds: number, volume: number, highpass: number): void {
    const context = this.context
    if (!context || !this.master || !this.noise) return
    const source = context.createBufferSource()
    source.buffer = this.noise
    const filter = context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpass
    const gain = context.createGain()
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds)
    source.connect(filter).connect(gain).connect(this.master)
    source.start(at)
    source.stop(at + seconds + 0.02)
  }

  play(id: MusicId): void {
    if (!this.context || this.playing === id) return
    this.stop()
    const tune = TUNES[id]
    const lead = parseTrack(tune.lead)
    const harmony = parseTrack(tune.harmony)
    const bass = parseTrack(tune.bass)
    const drums = parseDrums(tune.drums)
    const stepSeconds = 30 / tune.bpm
    this.playing = id
    this.step = 0
    this.nextTime = this.context.currentTime + 0.05
    const schedule = () => {
      const context = this.context
      if (!context) return
      // Schedule a little ahead of the clock so timer jitter is never heard.
      while (this.nextTime < context.currentTime + 0.15) {
        const at = this.nextTime
        const step = this.step
        for (const note of lead.notes) if (note.step === step) this.tone(tune.voice, note.frequency, at, note.length * stepSeconds * 0.92, 0.5)
        for (const note of harmony.notes) if (note.step === step) this.tone('thin', note.frequency, at, note.length * stepSeconds * 0.95, 0.18)
        for (const note of bass.notes) if (note.step === step) this.tone('triangle', note.frequency, at, note.length * stepSeconds * 0.9, 0.7)
        const drum = drums[step]
        if (drum === 'k') this.tone('triangle', 150, at, 0.09, 0.9, 45)
        if (drum === 's') this.hiss(at, 0.09, 0.5, 1800)
        if (drum === 'h') this.hiss(at, 0.03, 0.25, 6500)
        this.nextTime += stepSeconds
        this.step = (step + 1) % lead.steps
      }
    }
    schedule()
    this.timer = setInterval(schedule, 25)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.playing = null
  }

  /** The sound for a game event. */
  effect(event: GameEvent): void {
    const context = this.context
    if (!context) return
    const t = context.currentTime + 0.01
    const run = (notes: string[], each: number, wave: Wave = 'pulse') => notes.forEach((note, i) => this.tone(wave, noteFrequency(note), t + i * each, each * (i === notes.length - 1 ? 2.5 : 0.95), 0.6))
    switch (event) {
      case 'jump':
        return this.tone('pulse', 330, t, 0.09, 0.5, 660)
      case 'dash':
        this.hiss(t, 0.07, 0.4, 3000)
        return this.tone('thin', 520, t, 0.07, 0.4, 260)
      case 'collect':
        return run(['B5', 'E6'], 0.055)
      case 'hurt':
        this.hiss(t, 0.2, 0.5, 900)
        return this.tone('square', 220, t, 0.25, 0.5, 70)
      case 'open':
        return run(['C5', 'E5', 'G5', 'C6'], 0.06, 'thin')
      case 'win':
        return run(['C5', 'E5', 'G5', 'C6', 'E6'], 0.1)
      case 'lose':
        return run(['G4', 'E4', 'C4', 'A3'], 0.13, 'square')
      case 'start':
        return run(['E5', 'B5'], 0.06)
    }
  }

  dispose(): void {
    this.stop()
    void this.context?.close()
    this.context = null
  }
}
