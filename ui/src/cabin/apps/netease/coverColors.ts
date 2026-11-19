import { useEffect, useMemo, useState } from 'react'

/**
 * Now Playing's colours, taken from the song's cover: the few colours the picture is mostly made of, made into
 * the page's gradient and its accent, so the page takes the album's own look as NetEase's app does.
 *
 * Reading a cover's pixels is what a canvas is for, and a cover on NetEase's image hosts (`p*.music.126.net`) is
 * another origin's picture: read without its leave and the canvas is tainted (`getImageData` throws). So the
 * reading is attempted once with `crossOrigin="anonymous"`, and a picture that won't give its pixels leaves the
 * page its own dark gradient — nothing throws, nothing waits for it (the page draws at once and the colours fade
 * in when they come). Covers the app drew itself (no picture: the preview) take their colour from the drawn
 * cover's own name-colour, the same every time.
 *
 * The functions here that don't touch a page are what the tests read (paletteOfPixels, paletteFromColors,
 * namePalette, contrastOf): the drawn cover's colour, the gradient's and the accent's.
 */

/** The page's colours: the gradient's (top to bottom) and the accent the play button and the progress take. */
export interface CoverPalette {
  /** The gradient's three colours, the top of the page first and the dark it falls into last. */
  colors: [string, string, string]
  /** The accent: the cover's colour lifted enough to read a glyph on, for the play button and the progress. */
  accent: string
  /** What reads on `accent`: near-black or white, whichever is clearer. */
  onAccent: string
}

interface RGB {
  r: number
  g: number
  b: number
}

interface HSL {
  /** 0 to 360. */
  h: number
  /** 0 to 1. */
  s: number
  /** 0 to 1. */
  l: number
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/** The colour `#rrggbb` (or `#rgb`) as its three channels; `null` for anything else. */
export function rgbOf(colour: string): RGB | null {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1]
  if (!hex) return null
  const full = hex.length === 3 ? [...hex].map((letter) => letter + letter).join('') : hex
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

function hexOf({ r, g, b }: RGB): string {
  const channel = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function hslOf({ r, g, b }: RGB): HSL {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const high = Math.max(red, green, blue)
  const low = Math.min(red, green, blue)
  const l = (high + low) / 2
  if (high === low) return { h: 0, s: 0, l }
  const delta = high - low
  const s = l > 0.5 ? delta / (2 - high - low) : delta / (high + low)
  let h: number
  if (high === red) h = (green - blue) / delta + (green < blue ? 6 : 0)
  else if (high === green) h = (blue - red) / delta + 2
  else h = (red - green) / delta + 4
  return { h: h * 60, s, l }
}

function rgbOfHsl({ h, s, l }: HSL): RGB {
  const hue = ((h % 360) + 360) % 360
  if (s <= 0) {
    const grey = Math.round(l * 255)
    return { r: grey, g: grey, b: grey }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (turn: number): number => {
    const at = ((turn % 1) + 1) % 1
    if (at < 1 / 6) return p + (q - p) * 6 * at
    if (at < 1 / 2) return q
    if (at < 2 / 3) return p + (q - p) * (2 / 3 - at) * 6
    return p
  }
  return {
    r: Math.round(channel(hue / 360 + 1 / 3) * 255),
    g: Math.round(channel(hue / 360) * 255),
    b: Math.round(channel(hue / 360 - 1 / 3) * 255),
  }
}

/** How far apart two hues are, the short way round the wheel (0 to 180). */
function hueDistance(a: number, b: number): number {
  const across = Math.abs(((a - b) % 360) + 360) % 360
  return across > 180 ? 360 - across : across
}

/** A colour's brightness as WCAG counts it (0 black, 1 white). */
export function luminanceOf(rgb: RGB): number {
  const channel = (value: number): number => {
    const share = value / 255
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** The contrast of two colours as WCAG counts it (1:1 same, 21:1 black on white). */
export function contrastOf(a: RGB, b: RGB): number {
  const first = luminanceOf(a)
  const second = luminanceOf(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** What a glyph on `ground` should be: near-black or white, whichever reads better. */
function inkOn(ground: RGB): string {
  const dark: RGB = { r: 18, g: 16, b: 22 }
  const white: RGB = { r: 255, g: 255, b: 255 }
  return contrastOf(ground, dark) >= contrastOf(ground, white) ? '#121016' : '#ffffff'
}

/**
 * The page's palette from the cover's colours, the most common first: the cover's own colour at the top (lifted
 * into the range white words read on), a second beside it, and the dark the gradient falls into. The accent is
 * the cover's colour brightened, and what reads on it is chosen by contrast rather than guessed.
 */
export function paletteFromColors(colors: readonly RGB[]): CoverPalette {
  const base = colors[0] ?? { r: 44, g: 48, b: 64 }
  const baseHsl = hslOf(base)
  const second = colors[1] ? hslOf(colors[1]) : null
  const hue = baseHsl.h

  // The top: the cover's colour, its lightness held where words read on it (and the veil helps where it doesn't).
  const top: HSL = {
    h: hue,
    s: clamp(Math.max(baseHsl.s, 0.34), 0, 0.95),
    l: clamp(baseHsl.l, 0.3, 0.44),
  }
  // The second: the cover's next colour when it's clearly another hue, else a neighbour of its own.
  const besideHue = second && hueDistance(hue, second.h) >= 26 ? second.h : (hue + 34) % 360
  const beside: HSL = {
    h: besideHue,
    s: clamp(Math.max(second?.s ?? 0, baseHsl.s * 0.85, 0.3), 0, 0.9),
    l: clamp(second?.l ?? baseHsl.l * 0.75, 0.2, 0.42),
  }
  // The ground: the cover's hue, dark enough that the page reads as a lit picture rather than a colour block.
  const deep: HSL = { h: hue, s: clamp(baseHsl.s * 0.75, 0.12, 0.5), l: 0.1 }
  // The accent: the cover's colour, brighter, for the play button and the progress's filled part.
  let accentHsl: HSL = {
    h: hue,
    s: clamp(Math.max(baseHsl.s, 0.55), 0, 1),
    l: clamp(Math.max(baseHsl.l, 0.5), 0.5, 0.66),
  }
  let accent = rgbOfHsl(accentHsl)
  let ink = inkOn(accent)
  // A colour whose brightest form no glyph reads on clearly (a saturated red at mid lightness) is taken darker
  // until one does: the button keeps the cover's hue, never a pair that can't be read.
  for (let step = 0; step < 5 && contrastOf(accent, rgbOf(ink)!) < 4.5; step += 1) {
    accentHsl = { ...accentHsl, l: Math.max(0.3, accentHsl.l - 0.06) }
    accent = rgbOfHsl(accentHsl)
    ink = inkOn(accent)
  }
  return {
    colors: [hexOf(rgbOfHsl(top)), hexOf(rgbOfHsl(beside)), hexOf(rgbOfHsl(deep))],
    accent: hexOf(accent),
    onAccent: ink,
  }
}

/**
 * The palette of a picture's pixels, as a canvas gives them (`rgba` in a row): the colours it's mostly made of,
 * the saturated ones counting for more than the greys round them (a photograph's white sky isn't its colour).
 * `null` for no pixels at all; a picture of one flat colour still gives a palette (that colour).
 */
export function paletteOfPixels(pixels: ArrayLike<number>, step = 1): CoverPalette | null {
  interface Bucket {
    r: number
    g: number
    b: number
    count: number
  }
  const buckets = new Map<number, Bucket>()
  let seen = 0
  for (let at = 0; at + 3 < pixels.length; at += 4 * Math.max(1, step)) {
    const alpha = pixels[at + 3]
    if (alpha < 128) continue
    const r = pixels[at]
    const g = pixels[at + 1]
    const b = pixels[at + 2]
    seen += 1
    // Four bits a channel: a picture's own colours, not its dithering.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.count += 1
    } else {
      buckets.set(key, { r, g, b, count: 1 })
    }
  }
  if (seen === 0) return null
  const colours: { rgb: RGB; weight: number; count: number }[] = []
  for (const bucket of buckets.values()) {
    const rgb = { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }
    const hsl = hslOf(rgb)
    // Colour counts for more than grey, and almost-black and almost-white count for less than either.
    const weight = bucket.count * (0.28 + hsl.s ** 1.5) * (1 - Math.abs(hsl.l - 0.5) * 0.6)
    colours.push({ rgb, weight, count: bucket.count })
  }
  colours.sort((a, b) => b.weight - a.weight || b.count - a.count)
  // The first, then the first that's a different hue: two colours from the same corner of the wheel make a flat
  // gradient, and a cover usually has a second colour to give.
  const picked: RGB[] = []
  for (const colour of colours) {
    const hue = hslOf(colour.rgb).h
    if (picked.every((kept) => hueDistance(hue, hslOf(kept).h) >= 22 || hslOf(colour.rgb).s < 0.1)) {
      picked.push(colour.rgb)
      if (picked.length === 3) break
    }
  }
  if (picked.length === 0) picked.push(colours[0].rgb)
  return paletteFromColors(picked)
}

/** The colour the app draws a cover with (parts.tsx's `coverColour`), as a hex colour: the same every time for
 * the same name. */
export function coverColourOf(name: string): string {
  const seed = [...name].reduce((sum, letter) => (sum * 17 + letter.charCodeAt(0)) % 997, 3)
  return hexOf(rgbOfHsl({ h: (seed * 47) % 360, s: 0.38, l: 0.4 }))
}

/** A cover the app drew itself (there's no picture) has the drawn cover's colour as its palette. */
export function namePalette(name: string): CoverPalette {
  const rgb = rgbOf(coverColourOf(name)) ?? { r: 44, g: 48, b: 64 }
  return paletteFromColors([rgb])
}

/** One palette the page can show, by what it belongs to (`cover:<url>`, or `name:<the drawn cover's name>`). */
export interface CoverColors {
  key: string
  palette: CoverPalette | null
}

/** Palettes already read, so a song back again takes its colours back at once (and a failed read stays failed). */
const READ = new Map<string, CoverPalette | null>()

/** How many pixels of a cover are sampled: a small canvas is all a gradient needs, and reading it is cheap. */
const SAMPLE = 28

/**
 * Reads `url`'s palette without blocking anything: a picture on the page's own origin is drawn and sampled; one
 * from elsewhere is asked once for its pixels (`crossOrigin="anonymous"`), and if it won't give them — its server
 * sends no leave, or the canvas comes back tainted — `done(null)` says so, and the page keeps its own dark
 * gradient. Never throws; `done` is called once. Returns the cancel function.
 */
export function readCoverPalette(url: string, done: (palette: CoverPalette | null) => void): () => void {
  const known = READ.get(url)
  if (known !== undefined) {
    done(known)
    return () => {}
  }
  let live = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = (palette: CoverPalette | null): void => {
    if (!live) return
    live = false
    if (timer) clearTimeout(timer)
    READ.set(url, palette)
    done(palette)
  }
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    finish(null)
    return () => {}
  }
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE
      canvas.height = SAMPLE
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        finish(null)
        return
      }
      context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
      // A tainted canvas throws here (a cross-origin picture that gave no leave): the page falls back, quietly.
      finish(paletteOfPixels(context.getImageData(0, 0, SAMPLE, SAMPLE).data))
    } catch {
      finish(null)
    }
  }
  image.onerror = () => finish(null)
  // A picture that never comes must not keep the palette's place: the page keeps what it has.
  timer = setTimeout(() => finish(null), 8000)
  image.src = url
  return () => {
    live = false
    if (timer) clearTimeout(timer)
  }
}

/** What the page has to show: the palette it's showing, and the one it's fading out from (if any). */
export interface PaletteLayers {
  current: CoverColors
  previous: CoverColors | null
}

/**
 * The Now Playing page's palette, as the song's cover gives it: the drawn cover's colour at once when there's no
 * picture, the picture's own when it comes (or `null` — the page's fixed dark gradient — if it won't give them).
 * A new song's palette is a new layer over the one showing (NowPlaying.tsx), so the background crosses over
 * rather than jumps.
 */
export function useCoverPalette(cover: string | null, name: string): PaletteLayers {
  const drawn = useMemo((): CoverColors => ({ key: `name:${name}`, palette: namePalette(name) }), [name])
  const [layers, setLayers] = useState<PaletteLayers>(() => ({
    current: cover ? { key: `cover:${cover}`, palette: READ.get(cover) ?? null } : drawn,
    previous: null,
  }))
  useEffect(() => {
    if (!cover) {
      // The drawn cover's colour is the page's at once (there's no picture to wait for), and the page it replaces
      // fades out under it: a layer of its own, not a value derived as the same render.
      // oxlint-disable-next-line react/set-state-in-effect -- a layer changed, as an outside answer changes it
      setLayers((now) =>
        now.current.key === drawn.key
          ? now
          : { current: drawn, previous: now.current.palette ? now.current : now.previous },
      )
      return
    }
    let live = true
    const apply = (palette: CoverPalette | null): void => {
      if (!live) return
      setLayers((now) => {
        const key = `cover:${cover}`
        if (now.current.key === key && now.current.palette === palette) return now
        return {
          current: { key, palette },
          previous: now.current.palette ? now.current : now.previous,
        }
      })
    }
    return readCoverPalette(cover, (palette) => {
      apply(palette)
      live = false
    })
  }, [cover, drawn])
  return layers
}
