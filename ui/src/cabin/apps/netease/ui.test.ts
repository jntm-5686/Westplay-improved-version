import { describe, expect, it } from 'vitest'
import {
  activePage,
  back,
  canGoBack,
  depth,
  fullScreen,
  goToTab,
  initialNav,
  leftFullScreen,
  openPage,
  pageKey,
  type Nav,
} from './stack'
import { hasResults, resultCounts, searchSections } from './sections'
import type { NeteaseArtist, NeteaseList, NeteaseSearch, NeteaseSong } from './netease'

/**
 * The app's own way around, without a screen: the page stack never holds a page twice, Back goes up exactly
 * one step, and a search's results lead with the artists it found.
 */

const list = (id: string): NeteaseList => ({ id, name: `歌单 ${id}`, cover: null, playCount: 10 })
const song = (id: string): NeteaseSong => ({ id, title: `歌 ${id}`, artist: '人', duration: 200, playable: true })
const artist = (id: string): NeteaseArtist => ({ id, name: `艺人 ${id}`, cover: null })

/** Every page in every tab's stack, by kind (the guarantee: never twice). */
function pages(nav: Nav): string[] {
  return Object.values(nav.stacks).flatMap((stack) => stack.map(pageKey))
}

describe('the app’s pages', () => {
  it('opens a page once: a card pressed again comes back to it, not another copy', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'playlist', id: 'p1', name: '夜航电台' })
    expect(depth(nav)).toBe(1)
    expect(activePage(nav)).toMatchObject({ kind: 'playlist', id: 'p1', name: '夜航电台' })
    // The page at the top is left exactly as it is (no animation, no reload).
    expect(openPage(nav, { kind: 'playlist', id: 'p1' })).toBe(nav)
    // A page over it, then the playlist again: back to the playlist, the artist page dropped.
    nav = openPage(nav, { kind: 'artist', id: 'a1' })
    expect(nav.stacks.home.map((page) => page.kind)).toEqual(['playlist', 'artist'])
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    expect(nav.stacks.home.map((page) => page.kind)).toEqual(['playlist'])
    expect(pages(nav).filter((key) => key === 'playlist:p1')).toHaveLength(1)
  })

  it('keeps a page to one instance across tabs, and goes back to where it already is', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    nav = openPage(nav, { kind: 'artist', id: 'a1' })
    nav = goToTab(nav, 'rankings')
    nav = openPage(nav, { kind: 'ranking', id: 'r1' })
    expect(nav.tab).toBe('rankings')
    // The home tab's playlist pressed again from the rankings tab: the tab that holds it shows again.
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    expect(nav.tab).toBe('home')
    expect(nav.stacks.home.map((page) => page.kind)).toEqual(['playlist'])
    expect(pages(nav).filter((key) => key === 'playlist:p1')).toHaveLength(1)
    expect(pages(nav).filter((key) => key === 'ranking:r1')).toHaveLength(1)
    // The tab left behind is where it was left, and it's where Back goes.
    nav = back(nav)!
    expect(nav.tab).toBe('home')
    nav = back(nav)!
    expect(nav.tab).toBe('rankings')
    expect(activePage(nav)).toMatchObject({ kind: 'ranking', id: 'r1' })
  })

  it('a tab pressed again goes back to its own page; its pages aren’t opened again', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'ranking', id: 'r1' })
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    expect(depth(nav)).toBe(2)
    nav = goToTab(nav, 'home')
    expect(depth(nav)).toBe(0)
    expect(nav.stacks.home).toEqual([])
    // The same cards pressed once more build one page each, never two.
    nav = openPage(nav, { kind: 'ranking', id: 'r1' })
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    expect(nav.stacks.home.map((page) => page.kind)).toEqual(['ranking', 'playlist'])
  })

  it('Back goes up a page first, then to the tab the player came from, then nowhere', () => {
    let nav = initialNav()
    expect(canGoBack(nav)).toBe(false)
    expect(back(nav)).toBeNull()
    nav = goToTab(nav, 'playlists')
    nav = openPage(nav, { kind: 'recent' })
    nav = goToTab(nav, 'home')
    expect(canGoBack(nav)).toBe(true)
    nav = back(nav)!
    expect(nav.tab).toBe('playlists')
    // The tab came back to where it was left: its own recent page.
    expect(activePage(nav)).toMatchObject({ kind: 'recent' })
    nav = back(nav)!
    expect(nav.tab).toBe('playlists')
    expect(depth(nav)).toBe(0)
    // The tab behind was the one just returned to, so nothing is left behind it.
    expect(canGoBack(nav)).toBe(false)
    expect(back(nav)).toBeNull()
    // A tab pressed from anywhere leaves the one it was on behind it.
    nav = goToTab(nav, 'home')
    nav = goToTab(nav, 'rankings')
    nav = back(nav)!
    expect(nav.tab).toBe('home')
    nav = back(nav)!
    expect(nav.tab).toBe('playlists')
    expect(back(nav)).toBeNull()
  })

  it('the search bar shows Search without dropping the pages behind it', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    nav = goToTab(nav, 'search')
    expect(nav.tab).toBe('search')
    expect(nav.stacks.home).toHaveLength(1)
    expect(goToTab(nav, 'search')).toBe(nav)
    nav = back(nav)!
    expect(nav.tab).toBe('home')
    expect(activePage(nav)).toMatchObject({ kind: 'playlist', id: 'p1' })
  })

  it('names a page by its kind and id (a card’s own words are not the page’s identity)', () => {
    expect(pageKey({ kind: 'playlist', id: 'p1', name: '一' })).toBe('playlist:p1')
    expect(pageKey({ kind: 'playlist', id: 'p1', name: '二' })).toBe('playlist:p1')
    expect(pageKey({ kind: 'artist', id: 'p1' })).toBe('artist:p1')
    expect(pageKey({ kind: 'recent' })).toBe('recent')
    expect(pageKey({ kind: 'settings' })).toBe('settings')
  })

  it('fills a page’s head from the card that opened it, keeping what it already knew', () => {
    let nav = initialNav()
    nav = openPage(nav, { kind: 'playlist', id: 'p1', name: '夜航电台' })
    nav = openPage(nav, { kind: 'artist', id: 'a1' })
    nav = openPage(nav, { kind: 'playlist', id: 'p1', name: '另一个名字', plays: 12 })
    expect(nav.stacks.home[0]).toMatchObject({ kind: 'playlist', id: 'p1', name: '夜航电台', plays: 12 })
  })
})

describe('a search’s page', () => {
  const found = (artists: NeteaseArtist[], songs: NeteaseSong[], playlists: NeteaseList[]): NeteaseSearch => ({
    query: '许巍',
    artists,
    songs,
    playlists,
    artistsTotal: artists.length + 10,
    songsTotal: songs.length + 20,
    playlistsTotal: playlists.length + 30,
  })

  it('leads with the artists it found, then the songs, then the playlists', () => {
    const sections = searchSections(found([artist('a1')], [song('s1')], [list('p1')]))
    expect(sections.map((section) => section.kind)).toEqual(['artists', 'songs', 'playlists'])
    // The page's own counts, not just the first few it sent.
    expect(sections.map((section) => section.total)).toEqual([11, 21, 31])
  })

  it('leaves out the kinds it found nothing of (songs before playlists without an artist)', () => {
    expect(searchSections(found([], [song('s1')], [list('p1')])).map((section) => section.kind)).toEqual([
      'songs',
      'playlists',
    ])
    expect(searchSections(found([artist('a1')], [], [list('p1')])).map((section) => section.kind)).toEqual([
      'artists',
      'playlists',
    ])
    expect(searchSections(found([], [], [list('p1')])).map((section) => section.kind)).toEqual(['playlists'])
  })

  it('says nothing for a search that found nothing, or that hasn’t been asked', () => {
    const none = found([], [], [])
    expect(searchSections(none)).toEqual([])
    expect(hasResults(none)).toBe(false)
    expect(searchSections(null)).toEqual([])
    expect(hasResults(null)).toBe(false)
    expect(hasResults(found([artist('a1')], [], []))).toBe(true)
    expect(resultCounts(found([artist('a1')], [song('s1')], [list('p1')]))).toEqual({
      songs: 21,
      artists: 11,
      playlists: 31,
    })
  })
})

describe('the app’s full-screen page (正在播放)', () => {
  it('is the now tab’s own page, with no page over it', () => {
    expect(fullScreen(initialNav('home'))).toBe(false)
    expect(fullScreen(initialNav('now'))).toBe(true)
    // Another tab is never full screen, however deep its pages go.
    expect(fullScreen(openPage(initialNav('home'), { kind: 'playlist', id: 'p1' }))).toBe(false)
  })

  it('leaves by Back, to the tab it was opened from', () => {
    // From Home (or any other tab), opening 正在播放 fills the app; Back gives that tab back.
    let nav = initialNav('home')
    nav = goToTab(nav, 'now')
    expect(fullScreen(nav)).toBe(true)
    nav = leftFullScreen(nav)
    expect(nav.tab).toBe('home')
    expect(fullScreen(nav)).toBe(false)
    // Back is still the app's own: pages opened before it are where they were left.
    nav = openPage(nav, { kind: 'playlist', id: 'p1' })
    nav = goToTab(nav, 'now')
    nav = leftFullScreen(nav)
    expect(nav.tab).toBe('home')
    expect(activePage(nav)).toMatchObject({ kind: 'playlist', id: 'p1' })
  })

  it('leaves for Home when there is nowhere behind it (and never nowhere)', () => {
    // The app opened straight on the now tab: no tab came before it.
    const alone = initialNav('now')
    expect(fullScreen(alone)).toBe(true)
    const left = leftFullScreen(alone)
    expect(left.tab).toBe('home')
    expect(fullScreen(left)).toBe(false)
  })
})
