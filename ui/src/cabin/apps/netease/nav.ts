import { create } from 'zustand'
import {
  back,
  canGoBack,
  goToTab as goToTabIn,
  initialNav,
  openPage as openPageIn,
  type Nav,
  type Page,
  type Tab,
} from './stack'

/**
 * The app's place, as the screen reads it: one tab showing, a page or none over it, and the tabs behind it.
 * Every way around (`openTab`, `open`, `goBack`) runs through `stack.ts`, so a page is only ever drawn once
 * and Back always goes up exactly one step.
 */
interface NavStore extends Nav {
  /** The full-screen player is on its way out (its page shrinking back into the player bar): the app's rail, top bar
   * and player bar fade back in under it, and it only calls Back when its animation has finished. */
  leaving: boolean
  /** A rail tab pressed: its own page (and its pages over it put away if it was already showing). */
  openTab(tab: Tab): void
  /** A card pressed: its page, or the one already open (with the pages over it dropped). */
  open(page: Page): void
  /** Back: up a page, else to the tab the player came from (nowhere, nothing happens). */
  goBack(): void
  /** Home's own page, for the preview to start from (the tests and a fresh screen). */
  reset(tab?: Tab): void
}

export const useNav = create<NavStore>()((set) => ({
  ...initialNav(),
  leaving: false,
  openTab: (tab) => set((now) => goToTabIn(now, tab)),
  open: (page) => set((now) => openPageIn(now, page)),
  goBack: () =>
    set((now) => {
      const up = back(now)
      return up ?? now
    }),
  reset: (tab = 'home') => set(() => initialNav(tab)),
}))

/** Whether the top bar's back button goes anywhere (up a page, or to the tab before). */
export function useCanGoBack(): boolean {
  return useNav(canGoBack)
}

/** A tab opened from code that isn't a component (the player bar's song pressed). */
export function openTab(tab: Tab): void {
  useNav.getState().openTab(tab)
}
