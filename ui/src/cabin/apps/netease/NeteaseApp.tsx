import { type ReactNode, useEffect, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import {
  BackGlyph,
  ChartsGlyph,
  ChevronGlyph,
  HomeGlyph,
  LibraryGlyph,
  LogoGlyph,
  PersonGlyph,
  SearchGlyph,
} from './glyphs'
import { useCanGoBack, useNav } from './nav'
import { PlayerBar } from './NowPlaying'
import { PageBody, TabPage } from './pages'
import { usePrefs } from './prefs'
import { useSearchHistory } from './searchHistory'
import { TABS, fullScreen, openSearchPage, pageKey, type Tab } from './stack'
import { accountOf, netease, searchFor, SEARCH_FIELD, setQuery, useNetease } from './netease'
import { useNeteaseWords } from './strings'
import type { NeteaseWords } from './strings'
import './netease.css'

/**
 * NetEase Cloud Music, in WestPlay's own drawing of its desktop player, rebuilt for the truck: the rail at the
 * left (首页, 歌单, 榜单, and 我的 at its foot), the bar at every page's top (Back, and the search the whole app
 * shares), the pages under it (Home's day's card, its radar row and its shelf; the account's playlists and recent
 * songs; NetEase's charts; Search with its artists first; the account's own page and its settings; and the pages
 * a card opens), and NetEase's player bar along the foot.
 *
 * Everything is one size larger than a desktop's: titles 32-36 px, body text 20-24 px, three or four cards a
 * screen. Light and dark follow the cab's appearance; the skin (WestPlay's own neutral look or NetEase's red) is
 * chosen on the settings page, and keeps the choice. Nothing of the page's ads, comments, radio or podcasts is
 * ever read.
 *
 * 正在播放 is the app's full-screen page: while it shows, NetEase's own rail, its top bar and the player bar under
 * the pages step aside (they stay mounted, so none of their state is lost) and the page fills the app panel, with
 * its own way back in it (NowPlaying.tsx). WestPlay's own sidebar is the shell's, outside the app, and stays.
 */
export function NeteaseApp() {
  const words = useNeteaseWords()
  const style = useNetease((state) => state.style)
  const tab = useNav((state) => state.tab)
  const opened = useNav((state) => state.stacks[state.tab].length)
  const immersive = useNav(fullScreen)
  // The full-screen player on its way out: the app's own bars come back under it as it shrinks into the player bar
  // (NowPlaying.tsx), so the page it came from is there before it is shown again.
  const leaving = useNav((state) => state.leaving)
  const motion = usePrefs((state) => state.motion)
  // The page runs while the app shows (the bridge itself is the cabin shell's, hearing its state everywhere).
  useEffect(() => {
    netease({ action: 'start' })
  }, [])
  // Leaving the page puts the keyboard away (the search bar stays where it is: only a result picked, or another
  // page, lets it go). Typing is what brings the search page up, and the keyboard goes with it: were it put away on
  // that tab change too, the first letter typed would close it under the player's hands (owner 2026-11-20).
  useEffect(() => {
    if (tab !== 'search' || opened > 0) useKeyboard.getState().detach(SEARCH_FIELD)
  }, [tab, opened])
  return (
    <section
      className="app-panel netease-app"
      data-style={style}
      data-motion={motion}
      data-immersive={immersive ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
      aria-label={words.brand}
    >
      <div className="ne-layout">
        <Rail />
        <main className="ne-main">
          <TopBar />
          <div className="ne-viewport">
            <Layers />
          </div>
        </main>
      </div>
      <PlayerBar />
      <Toast />
    </section>
  )
}

/** The app's bar at every page's top: Back (up a page, or to the tab before) and the search the whole app uses. */
function TopBar() {
  const words = useNeteaseWords()
  const canBack = useCanGoBack()
  const goBack = useNav((state) => state.goBack)
  const back = () => {
    useKeyboard.getState().detach(SEARCH_FIELD)
    goBack()
  }
  return (
    <div className="ne-topbar">
      <button
        type="button"
        className="ne-back"
        aria-label={words.back}
        title={words.back}
        disabled={!canBack}
        onClick={back}
      >
        <BackGlyph />
      </button>
      <SearchBar />
    </div>
  )
}

/** The search bar at the page's top: the app's own search (the rail has no search tab: this is it), its words
 * asked of the hidden page a moment after the last key, and its page opened as they're typed. Pressing the bar
 * brings Search's own page up first, wherever the player was (history and the playlists picked for them when it's
 * empty), and only then the keyboard. */
export function SearchBar() {
  const words = useNeteaseWords()
  const query = useNetease((state) => state.query)
  // Pressed: Search's page first (what it was on stays behind it for Back), then the field takes the keyboard
  // (TextField's onSelect runs before it does, and Search's tab change doesn't put it away: NeteaseApp's own rule).
  const showSearch = () => useNav.setState((nav) => openSearchPage(nav))
  // As the player types: the words asked a moment after the last key (never once per key).
  useEffect(() => {
    const timer = setTimeout(() => searchFor(query), 500)
    return () => clearTimeout(timer)
  }, [query])
  // Typing anywhere brings the results up: Search's own page even when a playlist's is over it (and, from another
  // tab, Search without dropping the pages that tab was left on). Only typing: coming back to another page with
  // the words still there leaves them.
  useEffect(() => {
    if (!query.trim()) return
    const nav = useNav.getState()
    if (nav.tab !== 'search' || nav.stacks.search.length > 0) nav.openTab('search')
  }, [query])
  return (
    <div className="ne-search-field">
      <TextField
        id={SEARCH_FIELD}
        value={query}
        onChange={setQuery}
        onSelect={showSearch}
        onSubmit={() => {
          searchFor(query)
          // A search actually asked (the return key) is one of the three Search keeps.
          useSearchHistory.getState().add(query)
          useKeyboard.getState().detach(SEARCH_FIELD)
        }}
        returnKind="search"
        hint={words.searchHint}
        label={words.searchHint}
        icon={<SearchGlyph />}
      />
    </div>
  )
}

/** The rail's own tabs, in its own order (Search's is the bar at the top, 我的 the account card at its foot). */
const RAIL_TABS: readonly Tab[] = ['home', 'playlists', 'rankings']

const LABELS: Record<Tab, (words: NeteaseWords) => string> = {
  home: (words) => words.home,
  playlists: (words) => words.playlists,
  rankings: (words) => words.rankings,
  mine: (words) => words.mine,
  search: (words) => words.search,
  now: (words) => words.now,
}

function TabGlyph({ tab, on }: { tab: Tab; on: boolean }) {
  switch (tab) {
    case 'home':
      return <HomeGlyph on={on} />
    case 'playlists':
      return <LibraryGlyph on={on} />
    case 'rankings':
      return <ChartsGlyph on={on} />
    default:
      return <HomeGlyph on={on} />
  }
}

/** The rail: the brand, 首页/歌单/榜单, then 我的 (the account's own picture and name) at its foot — the skin is
 *  the settings page's (its 外观), not repeated here. */
function Rail() {
  const words = useNeteaseWords()
  const tab = useNav((state) => state.tab)
  const openTab = useNav((state) => state.openTab)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const me = useNetease((state) => state.account)
  const account = accountOf({ signedIn, signingIn })
  const status =
    account === 'in'
      ? words.signedIn
      : account === 'out'
        ? words.signedOut
        : account === 'signingIn'
          ? words.signingIn
          : words.unknownAccount
  return (
    <aside className="ne-rail">
      <div className="ne-brand">
        <span className="ne-brand-mark">
          <LogoGlyph />
        </span>
        <span className="ne-brand-name">{words.brand}</span>
      </div>
      <nav className="ne-nav" aria-label={words.brand}>
        {RAIL_TABS.map((each) => (
          <button
            key={each}
            type="button"
            className={each === tab ? 'ne-tab on' : 'ne-tab'}
            aria-current={each === tab ? 'page' : undefined}
            onClick={() => openTab(each)}
          >
            <span className="ne-tab-glyph">
              <TabGlyph tab={each} on={each === tab} />
            </span>
            <span className="ne-tab-label">{LABELS[each](words)}</span>
          </button>
        ))}
      </nav>
      <div className="ne-rail-foot">
        <button
          type="button"
          className={`ne-me ${tab === 'mine' ? 'on' : ''} ${account}`}
          aria-label={`${words.mine} · ${status}`}
          onClick={() => openTab('mine')}
        >
          <span className="ne-me-avatar">
            {me?.avatar ? <img src={me.avatar} alt="" draggable={false} /> : <PersonGlyph />}
          </span>
          <span className="ne-me-text">
            <b>{me?.name || words.mine}</b>
            <span>{status}</span>
          </span>
          <span className="ne-me-go" aria-hidden>
            <ChevronGlyph />
          </span>
        </button>
        {!isInHost() && <p className="ne-preview">{words.preview}</p>}
      </div>
    </aside>
  )
}

/** The pages: each tab's own (kept as it was left, so its scroll is), and the pages over the showing tab. */
function Layers() {
  const tab = useNav((state) => state.tab)
  const stacks = useNav((state) => state.stacks)
  const stack = stacks[tab]
  return (
    <>
      {TABS.map((each) => (
        <Layer key={each} shown={each === tab && stack.length === 0}>
          <TabPage tab={each} active={each === tab} />
        </Layer>
      ))}
      {stack.map((page, index) => (
        <Layer key={pageKey(page)} shown={index === stack.length - 1} opened>
          <PageBody page={page} />
        </Layer>
      ))}
    </>
  )
}

/** A page layer: one just opened comes in from the side; one shown again (Back, a tab chosen again) only
 * fades up, where it was. Away, it's kept as it is (its scroll and all) but not laid out, drawn or reached. */
function Layer({ shown, opened = false, children }: { shown: boolean; opened?: boolean; children: ReactNode }) {
  const [fresh, setFresh] = useState(opened)
  const className = !shown ? 'ne-layer away' : fresh ? 'ne-layer fresh' : 'ne-layer'
  return (
    <div
      className={className}
      inert={shown ? undefined : true}
      onAnimationEnd={(event) => event.target === event.currentTarget && setFresh(false)}
    >
      {children}
    </div>
  )
}

/** A moment over the player ("Asked NetEase to play this song."). */
function Toast() {
  const toast = useNetease((state) => state.toast)
  return toast ? (
    <p key={toast.id} className="ne-toast" role="status">
      {toast.text}
    </p>
  ) : null
}
