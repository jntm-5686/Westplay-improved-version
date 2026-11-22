import { describe, expect, it } from 'vitest'
import { coverTint } from './cover'

/** The app's own gradient for a cover Bilibili gives no picture of (the browser preview): the same title, the same
 * colours, and always two readable ones. */
describe('coverTint', () => {
  it('gives the same two colours for the same name', () => {
    expect(coverTint('星海邮差')).toEqual(coverTint('星海邮差'))
    expect(coverTint('')).not.toEqual(coverTint('夜航'))
  })

  it('is two HSL colours', () => {
    const [top, bottom] = coverTint('把车停在海边')
    expect(top).toMatch(/^hsl\(\d+ 54% 40%\)$/)
    expect(bottom).toMatch(/^hsl\(\d+ 48% 19%\)$/)
  })
})
