import { create } from 'zustand'

/**
 * The app's own theme: 跟随系统 (`auto`: the cab's light or dark appearance, `.shell.appearance-light`), or forced
 * 深色/浅色 for this app alone (the cabin's other apps keep the cab's appearance). Kept in the browser's storage, so
 * the choice is there the next time the app opens; the app's player stays its cinematic dark whatever is chosen.
 */
export type BilibiliTheme = 'auto' | 'dark' | 'light'

/** Where the choice is kept (the app's own key: the cabin's settings are not touched). */
export const THEME_KEY = 'westplay.bilibili.theme'

/** The themes, in the settings page's order. */
export const THEMES: readonly BilibiliTheme[] = ['auto', 'dark', 'light']

/** Whether `value` is one of the themes. */
export function isTheme(value: unknown): value is BilibiliTheme {
  return value === 'auto' || value === 'dark' || value === 'light'
}

/** The theme kept in the browser's storage: `auto` for none, for storage blocked, or for what isn't a theme. */
export function keptTheme(): BilibiliTheme {
  try {
    if (typeof localStorage === 'undefined') return 'auto'
    const kept = localStorage.getItem(THEME_KEY)
    return isTheme(kept) ? kept : 'auto'
  } catch {
    return 'auto'
  }
}

/** The value the app's root wears as `data-theme`: the choice itself (the stylesheet resolves `auto` against the
 * cab's own appearance). */
export function themeAttribute(theme: BilibiliTheme): BilibiliTheme {
  return theme
}

/** Whether the app is drawn light: its own `light`, or `auto` on a light cab. */
export function lightTheme(theme: BilibiliTheme, systemLight: boolean): boolean {
  return theme === 'light' || (theme === 'auto' && systemLight)
}

/** The appearance the app actually wears (`light`/`dark`), for its own words about the choice. */
export function resolvedTheme(theme: BilibiliTheme, systemLight: boolean): 'light' | 'dark' {
  return lightTheme(theme, systemLight) ? 'light' : 'dark'
}

/** The app's choice, kept for the next session (nothing kept where storage is blocked: the session holds it). */
function saveTheme(theme: BilibiliTheme): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked: kept for this session only.
  }
}

interface ThemeStore {
  theme: BilibiliTheme
  /** A theme picked: the app redraws in it, and it's kept for the next opening. */
  set(theme: BilibiliTheme): void
}

export const useTheme = create<ThemeStore>()((set) => ({
  theme: keptTheme(),
  set: (theme) => {
    if (!isTheme(theme)) return
    saveTheme(theme)
    set({ theme })
  },
}))

/** A theme picked from code that isn't the settings page. */
export function setTheme(theme: BilibiliTheme): void {
  useTheme.getState().set(theme)
}
