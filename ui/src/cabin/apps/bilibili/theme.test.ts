import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The app's own theme: what's kept, what it wears as `data-theme`, and how `auto` resolves against the cab's
 * appearance. The storage is stubbed, as the NetEase app's own storage-keeping tests stub it.
 */

function stubStorage(value: string | null) {
  const set: [string, string][] = []
  vi.stubGlobal('localStorage', {
    getItem: () => value,
    setItem: (key: string, kept: string) => set.push([key, kept]),
    removeItem: () => {},
  })
  return set
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the app’s theme', () => {
  it('takes only the three choices', async () => {
    const { isTheme, THEMES, themeAttribute } = await import('./theme')
    expect(THEMES).toEqual(['auto', 'dark', 'light'])
    for (const theme of THEMES) {
      expect(isTheme(theme)).toBe(true)
      expect(themeAttribute(theme)).toBe(theme)
    }
    expect(isTheme('system')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(1)).toBe(false)
  })

  it('keeps a choice in its own key, and starts from what’s kept', async () => {
    const set = stubStorage('dark')
    const theme = await import('./theme')
    expect(theme.keptTheme()).toBe('dark')
    expect(theme.useTheme.getState().theme).toBe('dark')
    theme.setTheme('light')
    expect(set).toEqual([['westplay.bilibili.theme', 'light']])
    expect(theme.useTheme.getState().theme).toBe('light')
  })

  it('takes nothing usable as auto (an older value, storage blocked)', async () => {
    stubStorage('nonsense')
    expect((await import('./theme')).keptTheme()).toBe('auto')
    vi.resetModules()
    vi.unstubAllGlobals()
    expect((await import('./theme')).keptTheme()).toBe('auto')
  })

  it('resolves auto against the cab’s appearance, and forces its own light or dark otherwise', async () => {
    const { lightTheme, resolvedTheme } = await import('./theme')
    expect(resolvedTheme('auto', true)).toBe('light')
    expect(resolvedTheme('auto', false)).toBe('dark')
    expect(resolvedTheme('light', false)).toBe('light')
    expect(resolvedTheme('dark', true)).toBe('dark')
    expect(lightTheme('light', false)).toBe(true)
    expect(lightTheme('dark', true)).toBe(false)
  })
})
