import { type ReactNode, useEffect, useState } from 'react'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { HomeGlyph, LibraryGlyph, LogoGlyph, NowGlyph, PersonGlyph, SearchGlyph } from './glyphs'
import { NowPlayingPage, PlayerBar } from './NowPlaying'
import { Home, Mine, Page, Search } from './pages'
import {
  accountOf,
  openSearch,
  openTab,
  SEARCH_FIELD,
  searchFor,
  setQuery,
  setStyle,
  useNetease,
  useNeteaseBridge,
  type Style,
  type Tab,
} from './netease'
import { useNeteaseWords } from './strings'
import type { NeteaseWords } from './strings'
import './netease.css'

/**
 * NetEase Cloud Music, in WestPlay's own drawing of its desktop player: a rail at the left (Home, My Music, Now
 * Playing, the account and the style switch), the search bar at the page's top (always there: the app's own way to
 * search, its results the page's own categories), the pages under it (Home's day's songs, the radar's row and its
 * recommended playlists; a playlist's songs; an artist's page; Search; My Music; Now Playing), and NetEase's player
 * bar along the foot with the cover, the heart, the controls, the time and the volume.
 *
 * Everything is one size larger than a desktop's: titles 32-36 px, body text 20-24 px, three or four cards a screen.
 * Light and dark follow the cab's appearance; the style switch picks WestPlay's own neutral look or NetEase's red, and
 * keeps the choice. The app holds no ads, no comments, no radio: the hidden page is only the player and its own data.
 */
export function NeteaseApp() {
  const words = useNeteaseWords()
  const style = useNetease((state) => state.style)
  const tab = useNetease((state) => state.tab)
  useNeteaseBridge()
  // Leaving the page puts the keyboard away (the search bar stays where it is: only a result picked, or another tab,
  // lets it go).
  useEffect(() => {
    useKeyboard.getState().detach(SEARCH_FIELD)
  }, [tab])
  return (
    <section className="app-panel netease-app" data-style={style} aria-label={words.brand}>
      <div className="ne-layout">
        <Rail />
        <main className="ne-main">
          <SearchBar />
          <div className="ne-viewport">
            <TabLayers />
          </div>
        </main>
      </div>
      <PlayerBar />
      <Toast />
    </section>
  )
}

/** The search bar at the page's top: the app's own search (the rail has no search tab: this is it), its words asked
 * of the hidden page a moment after the last key, and its page opened as they're typed or it's pressed. */
export function SearchBar() {
  const words = useNeteaseWords()
  const query = useNetease((state) => state.query)
  // As the player types: the words asked a moment after the last key (never once per key).
  useEffect(() => {
    const timer = setTimeout(() => searchFor(query), 500)
    return () => clearTimeout(timer)
  }, [query])
  return (
    <div className="ne-topbar" onPointerDownCapture={openSearch}>
      <div className="ne-search-field">
        <TextField
          id={SEARCH_FIELD}
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            searchFor(query)
            useKeyboard.getState().detach(SEARCH_FIELD)
          }}
          returnKind="search"
          hint={words.searchHint}
          label={words.searchHint}
          icon={<SearchGlyph />}
        />
      </div>
    </div>
  )
}

/** The rail's tabs, in its own order (Search's is the bar at the top, not a tab). */
const TABS: readonly Tab[] = ['home', 'mine', 'now']

const LABELS: Record<Tab, (words: NeteaseWords) => string> = {
  home: (words) => words.home,
  mine: (words) => words.mine,
  search: (words) => words.search,
  now: (words) => words.now,
}

function TabGlyph({ tab, on }: { tab: Tab; on: boolean }) {
  switch (tab) {
    case 'home':
      return <HomeGlyph on={on} />
    case 'mine':
      return <LibraryGlyph on={on} />
    case 'search':
      return <SearchGlyph />
    case 'now':
      return <NowGlyph on={on} />
  }
}

/** The rail: the brand, the tabs, and the foot's style switch and account state. */
function Rail() {
  const words = useNeteaseWords()
  const tab = useNetease((state) => state.tab)
  const style = useNetease((state) => state.style)
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
        {TABS.map((each) => (
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
        <div className="ne-style">
          <span className="ne-style-title">{words.style}</span>
          <div className="ne-style-switch" role="group" aria-label={words.style}>
            {(['follow', 'red'] as const).map((each) => (
              <button
                key={each}
                type="button"
                className={style === each ? 'on' : undefined}
                aria-pressed={style === each}
                onClick={() => setStyle(each as Style)}
              >
                {each === 'follow' ? words.styleFollow : words.styleRed}
              </button>
            ))}
          </div>
        </div>
        <div className={`ne-status ${account}`} aria-label={words.account}>
          <span className="ne-status-avatar">
            {me?.avatar ? <img src={me.avatar} alt="" /> : <PersonGlyph />}
          </span>
          <span className="ne-status-text">
            <b>{me?.name || words.brand}</b>
            <span>{status}</span>
          </span>
        </div>
        {account === 'out' && <p className="ne-status-hint">{words.signInHint}</p>}
        {account === 'signingIn' && <p className="ne-status-hint">{words.signingInHint}</p>}
      </div>
    </aside>
  )
}

/** The pages: each tab's own, then the pages over it (only the current tab's are laid out and drawn). */
function TabLayers() {
  const tab = useNetease((state) => state.tab)
  const views = useNetease((state) => state.views)
  return (
    <>
      <Layer shown={tab === 'home' && views.home.length === 0}>{<Home />}</Layer>
      <Layer shown={tab === 'mine' && views.mine.length === 0}>{<Mine />}</Layer>
      <Layer shown={tab === 'search' && views.search.length === 0}>{<Search />}</Layer>
      <Layer shown={tab === 'now'}>{<NowPlayingPage />}</Layer>
      {views[tab].map((view, index) => (
        <Layer key={view.id} shown={index === views[tab].length - 1} opened={true}>
          <Page view={view} />
        </Layer>
      ))}
    </>
  )
}

/** A page layer: one just opened comes in from the side; one shown again (Back, a tab chosen again) only
 * fades up, where it was. Away, it's kept as it is (its scroll and all) but not laid out or drawn. */
function Layer({ shown, opened = false, children }: { shown: boolean; opened?: boolean; children: ReactNode }) {
  const [fresh, setFresh] = useState(opened)
  const className = !shown ? 'ne-layer away' : fresh ? 'ne-layer fresh' : 'ne-layer'
  return (
    <div className={className} onAnimationEnd={(event) => event.target === event.currentTarget && setFresh(false)}>
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
