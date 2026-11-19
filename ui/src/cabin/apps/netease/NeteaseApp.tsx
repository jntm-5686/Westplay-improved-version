import { type ReactNode, useEffect, useState } from 'react'
import { useKeyboard } from '../../keyboard/store'
import { HomeGlyph, LibraryGlyph, LogoGlyph, NowGlyph, PersonGlyph, SearchGlyph } from './glyphs'
import { NowPlayingPage, PlayerBar } from './NowPlaying'
import { Home, Mine, Page, Search, SEARCH_FIELD } from './pages'
import { accountOf, openTab, setStyle, useNetease, useNeteaseBridge, type Style, type Tab } from './netease'
import { useNeteaseWords } from './strings'
import type { NeteaseWords } from './strings'
import './netease.css'

/**
 * NetEase Cloud Music, in WestPlay's own drawing of its desktop player: a rail at the left (Home, My Music,
 * Search, Now Playing, the account and the style switch), the pages at its right (Home's recommended
 * playlists as cards, a playlist's songs, the search, Now Playing), and NetEase's player bar along the foot
 * with the cover, the controls, the time and the volume.
 *
 * Everything is one size larger than a desktop's: titles 32-36 px, body text 20-24 px, three or four cards a
 * screen. Light and dark follow the cab's appearance; the style switch picks WestPlay's own neutral look or
 * NetEase's red, and keeps the choice. The app holds no ads, no comments, no radio: the hidden page is only
 * the player, and only what plays and the playlists are read from it.
 */
export function NeteaseApp() {
  const words = useNeteaseWords()
  const style = useNetease((state) => state.style)
  const tab = useNetease((state) => state.tab)
  useNeteaseBridge()
  // Leaving Search puts the keyboard away (its field is kept mounted with the tab).
  useEffect(() => {
    useKeyboard.getState().detach(SEARCH_FIELD)
  }, [tab])
  return (
    <section className="app-panel netease-app" data-style={style} aria-label={words.brand}>
      <div className="ne-layout">
        <Rail />
        <main className="ne-main">
          <TabLayers />
        </main>
      </div>
      <PlayerBar />
      <Toast />
    </section>
  )
}

/** The rail's tabs, in its own order. */
const TABS: readonly Tab[] = ['home', 'mine', 'search', 'now']

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
            <PersonGlyph />
          </span>
          <span className="ne-status-text">
            <b>{words.brand}</b>
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
