import { describe, expect, it } from 'vitest'
import { activePage, back, canGoBack, depth, goToTab, initialNav, openPage, openSearch, pageKey, TABS } from './stack'

/**
 * The app's own way around, without a screen: the page stack never holds a page twice, Back goes up exactly one step,
 * and Search is brought up without a second copy over the page it was already over.
 */

describe('the app’s pages', () => {
  it('opens on Home, with every tab’s own page', () => {
    const nav = initialNav()
    expect(nav.tab).toBe('home')
    expect(nav.stacks).toEqual({ home: [], bangumi: [], cinema: [], live: [], mine: [] })
    expect(TABS).toEqual(['home', 'bangumi', 'cinema', 'live', 'mine'])
  })

  it('opens a page over the tab, and Back goes up exactly one step', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'bangumiDetail', seasonId: 's1', title: '星海邮差' })
    expect(depth(nav)).toBe(1)
    expect(activePage(nav)).toEqual({ kind: 'bangumiDetail', seasonId: 's1', title: '星海邮差' })
    expect(canGoBack(nav)).toBe(true)
    const up = back(nav)
    expect(up).not.toBeNull()
    expect(depth(up!)).toBe(0)
  })

  it('never opens the same page twice: the one already open comes back to', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'space', uid: '42' })
    nav = openPage(nav, { kind: 'search' })
    nav = openPage(nav, { kind: 'space', uid: '42' })
    expect(nav.stacks.home.map(pageKey)).toEqual(['space:42'])
    expect(activePage(nav)).toEqual({ kind: 'space', uid: '42' })
    // And from another tab, it switches to the tab that has it.
    nav = goToTab(nav, 'mine')
    nav = openPage(nav, { kind: 'space', uid: '42' })
    expect(nav.tab).toBe('home')
    expect(nav.stacks.mine).toEqual([])
  })

  it('leaves a tab pressed again on its own page, and Back then goes to the tab before', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'history' })
    nav = goToTab(nav, 'live')
    nav = goToTab(nav, 'home')
    // The pages over a tab stay where they were: Home comes back to the page it was left on.
    expect(activePage(nav)).toEqual({ kind: 'history' })
    let fromOwn = goToTab(nav, 'home')
    expect(fromOwn.stacks.home).toEqual([])
    fromOwn = goToTab(fromOwn, 'cinema')
    const up = back(fromOwn)
    expect(up?.tab).toBe('home')
  })

  it('brings Search up over what was showing, once', () => {
    let nav = initialNav()
    nav = openSearch(nav)
    expect(activePage(nav)).toEqual({ kind: 'search' })
    expect(openSearch(nav)).toBe(nav)
    // From the page over a tab, Search goes over it: Back comes back to it.
    nav = openPage(nav, { kind: 'bangumiDetail', seasonId: 's9' })
    nav = openSearch(nav)
    expect(nav.stacks.home.map(pageKey)).toEqual(['bangumiDetail:s9', 'search'])
    expect(back(nav)?.stacks.home.map(pageKey)).toEqual(['bangumiDetail:s9'])
  })

  it('has nowhere to go from Home first (Back is the app’s own way out)', () => {
    expect(back(initialNav())).toBeNull()
    expect(canGoBack(initialNav())).toBe(false)
  })
})
