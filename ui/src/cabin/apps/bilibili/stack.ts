/**
 * The Bilibili app's own way around, kept apart from React so it can be read and tested without a screen: the five
 * tabs the rail has, each tab's own page (its root) and the pages opened over it (a search, a video's own page, a
 * season's page, a live room, the account's history, favorites, dynamic, 我的粉丝 / 我关注的人 and a UP主's page).
 *
 * Two rules the whole app is built on:
 *
 * - A page exists once: `openPage` looks for the same page in every tab's stack first, and if it's there the app
 *   goes back to it (the pages over it dropped) instead of drawing another one. A card pressed twice never makes a
 *   second copy.
 * - Back goes up one step: the page over a tab's own first, then the tab the player came from. The pages of a tab
 *   left behind stay where they were, so coming back to it shows the page it was left on.
 */

/** The app's tabs, in the rail's own order. */
export type Tab = 'home' | 'bangumi' | 'cinema' | 'live' | 'mine'

/** Every tab, in the rail's order (the tests walk this). */
export const TABS: readonly Tab[] = ['home', 'bangumi', 'cinema', 'live', 'mine']

/** A page opened over a tab's own. */
export type Page =
  /** A search of the word typed (any page's search leads here). */
  | { kind: 'search' }
  /** A video's own page: its description and its marks, the way to play it. */
  | { kind: 'videoDetail'; videoId: string; title?: string }
  /** A season's page (番剧 or 影视), with one of its episodes picked or not. */
  | { kind: 'bangumiDetail'; seasonId: string; epId?: string; title?: string }
  /** A live room's page (opened from a live card). */
  | { kind: 'liveRoom'; roomId: string; title?: string }
  /** A UP主's page. */
  | { kind: 'space'; uid: string; name?: string }
  /** The account's own pages. */
  | { kind: 'history' }
  | { kind: 'favorites' }
  | { kind: 'dynamic' }
  /** 我的粉丝 or 我关注的人. */
  | { kind: 'relations'; relation: RelationKind }
  /** The app's own settings (its theme and account). */
  | { kind: 'settings' }

/** 我的粉丝 or 我关注的人 (a page's own half of the word). */
export type RelationKind = 'followers' | 'following'

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
  return 'seasonId' in page
    ? `bangumiDetail:${page.seasonId}`
    : 'videoId' in page
      ? `videoDetail:${page.videoId}`
      : 'roomId' in page
        ? `liveRoom:${page.roomId}`
        : 'uid' in page
          ? `space:${page.uid}`
          : 'relation' in page
            ? `relations:${page.relation}`
            : page.kind
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

/** Fills what a page still doesn't know from the page just pressed (a title for its head), keeping the rest. */
function fillMeta(page: Page, card: Page): Page {
  if (pageKey(page) !== pageKey(card)) return page
  if ('title' in card && 'title' in page) return page.title ? page : { ...page, title: card.title }
  if ('name' in card && 'name' in page) return page.name ? page : { ...page, name: card.name }
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

/** Search's page brought up (the bar at the top pressed, or a word typed): what the player was on stays behind it
 * for Back; on Search already, nothing is opened a second time. A Search page already in the tab's own stack comes
 * back to the top (over the page that was showing), never a second copy of it. */
export function openSearch(nav: Nav): Nav {
  const stack = nav.stacks[nav.tab]
  if (stack.at(-1)?.kind === 'search') return nav
  const at = stack.findIndex((page) => page.kind === 'search')
  if (at >= 0) {
    const search = stack[at]
    return {
      ...nav,
      stacks: { ...nav.stacks, [nav.tab]: [...stack.slice(0, at), ...stack.slice(at + 1), search] },
    }
  }
  return openPage(nav, { kind: 'search' })
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
