import { describe, expect, it } from 'vitest'
import { contrastOf, coverColourOf, namePalette, paletteFromColors, paletteOfPixels, rgbOf } from './coverColors'

/**
 * Now Playing's colours, without a page: a cover's pixels made into the page's gradient, a drawn cover's colour
 * made the same way, and the accent's ink always readable.
 */

/** `rgba` pixels as a canvas gives them: a row for each colour, alpha full. */
function pixelsOf(colours: readonly (readonly [number, number, number])[]): Uint8ClampedArray {
  return new Uint8ClampedArray(colours.flatMap(([r, g, b]) => [r, g, b, 255]))
}

/** The channels of a `#rrggbb` colour (the palettes' own shape). */
function channels(colour: string): { r: number; g: number; b: number } {
  const rgb = rgbOf(colour)
  if (!rgb) throw new Error(`not a colour: ${colour}`)
  return rgb
}

function repeat(colour: readonly [number, number, number], times: number): (readonly [number, number, number])[] {
  return Array.from({ length: times }, () => colour)
}

describe('a cover’s palette', () => {
  it('takes the colour a picture is mostly made of, not the grey round it', () => {
    // A picture mostly white, with a blue corner and a red one: its palettes lead with the blue, saturated
    // pixels counting for more than the white ground.
    const pixels = pixelsOf([
      ...repeat([250, 250, 250], 60),
      ...repeat([30, 80, 170], 26),
      ...repeat([170, 40, 40], 10),
    ])
    const palette = paletteOfPixels(pixels)
    expect(palette).not.toBeNull()
    const top = channels(palette!.colors[0])
    expect(top.b).toBeGreaterThan(top.r)
    expect(top.b).toBeGreaterThan(top.g)
  })

  it('gives a gradient of three colours, the last the dark the page falls into', () => {
    const palette = paletteFromColors([{ r: 30, g: 80, b: 170 }])
    expect(palette.colors).toHaveLength(3)
    for (const colour of palette.colors) expect(rgbOf(colour)).not.toBeNull()
    // Three distinct colours: a gradient, not one colour three times.
    expect(new Set(palette.colors).size).toBeGreaterThan(1)
    // The last is darker than the top (the page's own dark under the cover's colour).
    const top = channels(palette.colors[0])
    const deep = channels(palette.colors[2])
    expect(contrastOf(top, { r: 0, g: 0, b: 0 })).toBeGreaterThan(contrastOf(deep, { r: 0, g: 0, b: 0 }))
  })

  it('keeps the top’s colour dark enough for white words on it', () => {
    // A near-white cover: its colour can't make the page white, or the white words would vanish.
    const palette = paletteOfPixels(pixelsOf(repeat([252, 250, 246], 40)))
    const top = channels(palette!.colors[0])
    expect(contrastOf(top, { r: 255, g: 255, b: 255 })).toBeGreaterThanOrEqual(3)
  })

  it('chooses the accent’s ink by contrast, whichever the cover’s colour', () => {
    for (const colour of [
      { r: 220, g: 30, b: 40 },
      { r: 30, g: 80, b: 170 },
      { r: 240, g: 210, b: 40 },
      { r: 30, g: 150, b: 90 },
    ]) {
      const palette = paletteFromColors([colour])
      const accent = channels(palette.accent)
      const ink = channels(palette.onAccent)
      expect(contrastOf(accent, ink)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('says nothing for a picture with no pixels, and still gives a colour for a flat one', () => {
    expect(paletteOfPixels(new Uint8ClampedArray())).toBeNull()
    expect(paletteOfPixels(pixelsOf(repeat([20, 120, 60], 12)))?.colors[0]).toBeTruthy()
  })

  it('gives a colour even for no colours at all (the page is never left without one)', () => {
    const palette = paletteFromColors([])
    expect(rgbOf(palette.colors[0])).not.toBeNull()
    expect(rgbOf(palette.accent)).not.toBeNull()
  })
})

describe('a drawn cover’s colour', () => {
  it('is the same every time for the same name, and differs between names', () => {
    expect(coverColourOf('夜航电台')).toBe(coverColourOf('夜航电台'))
    expect(coverColourOf('夜航电台')).not.toBe(coverColourOf('沿海公路'))
    expect(rgbOf(coverColourOf('夜航电台'))).not.toBeNull()
  })

  it('is the page’s palette when there’s no picture to read', () => {
    const first = namePalette('雨天车窗')
    const again = namePalette('雨天车窗')
    expect(first).toEqual(again)
    expect(first.colors).toHaveLength(3)
    // The drawn cover's own colour is the gradient's top, not a colour picked elsewhere.
    expect(first.colors[0]).not.toBe(namePalette('候鸟与货场').colors[0])
  })
})
