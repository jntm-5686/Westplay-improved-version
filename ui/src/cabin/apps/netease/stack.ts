/**
 * The NetEase app's own way around, kept apart from React so it can be read and tested without a screen:
 * the six tabs the app has, each tab's own page (its root) and the pages opened over it.
 *
 * Two rules the whole app is built on:
 *
 * - A page exists once. `openPage` looks for the same page in every tab's stack first: if it's there, the app
 *   goes back to it (the tabs over it are dropped) instead of drawing another one on top of the stack. A page
 *   pressed twice, or a card pressed on a page already open, never makes a second copy.
 * - Back goes up one step: the page over a tab's own first, then the tab the player came from. The pages of a
 *   tab left behind stay where they were, so coming back to it shows the page it was left on.
 */

/** The app's tabs, in the rail's own order: the three inside the rail, then the ones reached from elsewhere. */
export type Tab = 'home' | 'playlists' | 'rankings' | 'mine' | 'now' | 'search'

/** Every tab, in the rail's order (the tests walk this). */
export const TABS: readonly Tab[] = ['home', 'playlists', 'rankings', 'mine', 'now', 'search']

/** A card's own words, carried into the page it opens so its head draws before anything is read. */
export interface PageMeta {
  /** The card's name, as the list it was opened from said it. */
  name?: string
  cover?: string | null
  /** How often it's been played (a playlist's or a chart's card). */
  plays?: number
  /** How often a chart updates, in NetEase's own words (榜单). */
  update?: string
  /** One of NetEase's own charts (a chart's card carries it). */
  official?: boolean
}

/** A page opened over a tab's own. */
export type Page =
  | ({ kind: 'playlist'; id: string } & PageMeta)
  | ({ kind: 'artist'; id: string } & PageMeta)
  | ({ kind: 'ranking'; id: string } & PageMeta)
  | { kind: 'recent' }
  | { kind: 'settings' }

/** The app's place: the tab showing, its pages by tab, and the tabs left behind (newest last). */
export interface Nav {
  tab: Tab
  stacks: Record<Tab, Page[]>
  /** The tabs the player came from, newest last: Back at a tab's own page returns to one of them. */
  history: Tab[]
}

/** Every tab with no page over its own. */
export function emptyStacks(): Record<Tab, Page[]> {
  const stacks = {} as Record<Tab, Page[]>
  for (const tab of TABS) stacks[tab] = []
  return stacks
}

/** The app as it opens: `tab`'s own page (Home, unless said otherwise). */
export function initialNav(tab: Tab = 'home'): Nav {
  return { tab, stacks: emptyStacks(), history: [] }
}

/** A page's identity: one page of a kind and an id, whatever card opened it. */
export function pageKey(page: Page): string {
  return 'id' in page ? `${page.kind}:${page.id}` : page.kind
}

/** The page at the top of the stack (the one drawn), or `null` for a tab's own. */
export function activePage(nav: Nav): Page | null {
  return nav.stacks[nav.tab].at(-1) ?? null
}

/** How many pages are over the current tab's own. */
export function depth(nav: Nav): number {
  return nav.stacks[nav.tab].length
}

/** Whether Back goes anywhere: up a page, or to the tab the player came from. */
export function canGoBack(nav: Nav): boolean {
  if (nav.stacks[nav.tab].length > 0) return true
  return nav.history.some((tab) => tab !== nav.tab)
}

/**
 * The app's one full-screen page: 正在播放, the now tab's own page with nothing over it. Shown, it fills the whole
 * app — NetEase's rail, its top bar and its player bar step aside (NeteaseApp.tsx) — and it leaves by Back
 * (leftFullScreen).
 */
export function fullScreen(nav: Nav): boolean {
  return nav.tab === 'now' && nav.stacks.now.length === 0
}

/**
 * The app after leaving that page: Back (to the tab it was opened from), or Home for one with nowhere behind it
 * (the app opened on 正在播放): the full screen is never one with no way out.
 */
export function leftFullScreen(nav: Nav): Nav {
  return back(nav) ?? goToTab(nav, 'home')
}

/**
 * The artist page a playing song's artist opens (the full-screen player's artist name), from the first artist's
 * NetEase id: `null` for a name whose answer gave none — it stays plain words there, never a broken page.
 */
export function artistPageOf(artistId: string | null | undefined): ({ kind: 'artist'; id: string } & PageMeta) | null {
  const id = (artistId ?? '').trim()
  return /^\d{1,20}$/.test(id) ? { kind: 'artist', id } : null
}

/**
 * Search's own page brought up (the search bar at the top pressed, on any page): what the player was on stays behind
 * it for Back — the tab, or the page over it. On Search already with a page over it, that page is put away.
 */
export function openSearchPage(nav: Nav): Nav {
  if (nav.tab === 'search' && nav.stacks.search.length === 0) return nav
  return goToTab(nav, 'search')
}

/** The tab the player came from last (skipping the current one), or `null`. */
function previousTab(nav: Nav): Tab | null {
  for (let at = nav.history.length - 1; at >= 0; at--) {
    const tab = nav.history[at]
    if (tab !== nav.tab) return tab
  }
  return null
}

/** The tabs left behind after moving from `from` to `to`: `from` last, `to` no longer waiting behind it. */
function remember(history: Tab[], from: Tab, to: Tab): Tab[] {
  return [...history.filter((tab) => tab !== to && tab !== from), from]
}

/** A tab pressed: its own page, its pages over it put away (a tab pressed again only goes back to its own page,
 * never makes another). */
export function goToTab(nav: Nav, tab: Tab): Nav {
  if (nav.tab === tab) {
    if (nav.stacks[tab].length === 0) return nav
    return { ...nav, stacks: { ...nav.stacks, [tab]: [] } }
  }
  return { tab, stacks: nav.stacks, history: remember(nav.history, nav.tab, tab) }
}

/** Fills what a page still doesn't know from the card just pressed (a name, a picture), keeping the rest. */
function fillOne<T extends PageMeta & { kind: string; id: string }>(page: T, card: T): T {
  return {
    ...page,
    name: page.name ?? card.name,
    cover: page.cover !== undefined ? page.cover : card.cover,
    plays: page.plays ?? card.plays,
    update: page.update ?? card.update,
    official: page.official ?? card.official,
  }
}

function fillMeta(page: Page, card: Page): Page {
  if (page.kind !== card.kind) return page
  if (page.kind === 'playlist' && card.kind === 'playlist') return fillOne(page, card)
  if (page.kind === 'artist' && card.kind === 'artist') return fillOne(page, card)
  if (page.kind === 'ranking' && card.kind === 'ranking') return fillOne(page, card)
  return page
}

/**
 * A page opened (a card pressed): the same page comes back to if it's open anywhere (that tab shown, the pages
 * over it dropped), the page at the top is left as it is, and anything else is opened over the current tab.
 */
export function openPage(nav: Nav, page: Page): Nav {
  const key = pageKey(page)
  // The current tab first: a card pressed on the page it already opened shouldn't move the player elsewhere.
  const order = [nav.tab, ...TABS.filter((tab) => tab !== nav.tab)]
  for (const tab of order) {
    const stack = nav.stacks[tab]
    const at = stack.findIndex((each) => pageKey(each) === key)
    if (at < 0) continue
    // Already the page showing: nothing opens again (no copy, no animation, no scroll reset).
    if (tab === nav.tab && at === stack.length - 1) return nav
    const merged = fillMeta(stack[at], page)
    const switched = tab === nav.tab ? nav : { ...nav, tab, history: remember(nav.history, nav.tab, tab) }
    return {
      ...switched,
      stacks: { ...nav.stacks, [tab]: [...stack.slice(0, at), merged] },
    }
  }
  return { ...nav, stacks: { ...nav.stacks, [nav.tab]: [...nav.stacks[nav.tab], page] } }
}

/** Back: up a page; at a tab's own, to the tab the player came from; nowhere left, `null`. */
export function back(nav: Nav): Nav | null {
  const stack = nav.stacks[nav.tab]
  if (stack.length > 0) {
    return { ...nav, stacks: { ...nav.stacks, [nav.tab]: stack.slice(0, -1) } }
  }
  const tab = previousTab(nav)
  if (!tab) return null
  return { ...nav, tab, history: nav.history.filter((each) => each !== tab) }
}
