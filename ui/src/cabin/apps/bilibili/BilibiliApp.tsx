import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import {
  leaveApp,
  openPlayerPage,
  requestBangumi,
  requestHome,
  requestRooms,
  searchFor,
  setQuery,
  togglePlay,
  useBilibili,
  useBilibiliBridge,
  usePlayhead,
} from './bilibili'
import {
  BackGlyph,
  BangumiGlyph,
  CinemaGlyph,
  ChevronRightGlyph,
  HomeGlyph,
  LiveGlyph,
  PauseGlyph,
  PersonGlyph,
  PlayGlyph,
  SearchGlyph,
  TvGlyph,
} from './glyphs'
import { goBack, openSearchPage, openTab, useCanGoBack, useNav } from './nav'
import { Avatar, Cover } from './parts'
import { PageBody, TabPage } from './pages'
import { PlayerPage } from './Player'
import { useSearchHistory } from './searchHistory'
import { TABS, type Page, type Tab } from './stack'
import { useBilibiliWords } from './strings'
import { useTheme } from './theme'
import { formatClock, progressShare } from './time'
import type { BilibiliWords } from './words'
import './bilibili.css'

/** The search bar's field: the keyboard types there, and lets go as a result is picked (or the page left). */
const SEARCH_FIELD = 'bilibili-search'

/**
 * 哔哩哔哩 in the cab: the app's rail at the left (首页, 番剧, 影视, 直播, and 我的 at its foot), the bar at every
 * page's top (Back and the search the whole app shares, and the account's picture), the pages under it (Home's banner
 * and feed, the season lists and pages, the live rooms, the account's pages and a UP主's), the player bar along the
 * foot, and the player itself over all of it (影剧院沉浸式, Player.tsx) when a video plays.
 *
 * Everything shown is the host's page's (bilibili.ts): signed in or not, in the cab's language and appearance. The
 * app's own accent is Bilibili's pink; light and dark follow the cab. Titles 32-36 px, body 20-24 px, four cards a
 * screen (two on the 7" screen: bilibili.css's container queries).
 */
export function BilibiliApp() {
  const words = useBilibiliWords()
  const stage = useBilibili((state) => state.stage)
  const ready = useBilibili((state) => state.ready)
  // The app's own theme (设置): `auto` follows the cab's appearance, `dark`/`light` force it for this app alone.
  const theme = useTheme((state) => state.theme)
  useBilibiliBridge()
  // The host's hidden page is up: the lists it may have missed while it loaded are asked once more.
  useEffect(() => {
    if (!ready) return
    requestHome(true)
    requestBangumi('anime', true)
    requestRooms(true)
  }, [ready])
  // The app's window closing: the host's picture goes, and the player page with it (the sound plays on).
  useEffect(() => () => leaveApp(), [])
  return (
    <section
      className="app-panel bilibili-app"
      data-theme={theme}
      data-immersive={stage !== 'closed' ? '' : undefined}
      data-leaving={stage === 'leave' ? '' : undefined}
      aria-label={words.brand}
    >
      <div className="bb-layout">
        <Rail />
        <main className="bb-main">
          <TopBar />
          <div className="bb-viewport">
            <Layers />
          </div>
        </main>
      </div>
      <PlayerBar />
      <Toast />
      {stage !== 'closed' && <PlayerPage />}
    </section>
  )
}

// --- The rail -------------------------------------------------------------------------------------------------

const TAB_LABELS: Record<Tab, keyof BilibiliWords['tabs']> = {
  home: 'home',
  bangumi: 'bangumi',
  cinema: 'cinema',
  live: 'live',
  mine: 'mine',
}

function TabGlyph({ tab, on }: { tab: Tab; on: boolean }) {
  switch (tab) {
    case 'home':
      return <HomeGlyph on={on} />
    case 'bangumi':
      return <BangumiGlyph on={on} />
    case 'cinema':
      return <CinemaGlyph on={on} />
    case 'live':
      return <LiveGlyph on={on} />
    case 'mine':
      return <PersonGlyph on={on} />
  }
}

/** The rail: the brand, the five tabs, and 我的 (the account's own picture and name) at its foot. */
function Rail() {
  const words = useBilibiliWords()
  const tab = useNav((state) => state.tab)
  const open = useNav((state) => state.openTab)
  const signedIn = useBilibili((state) => state.signedIn)
  const signingIn = useBilibili((state) => state.signingIn)
  const user = useBilibili((state) => state.user)
  const status =
    signedIn === true
      ? words.account.signedIn
      : signedIn === false
        ? words.account.signedOut
        : signingIn
          ? words.account.signingIn
          : words.account.unknown
  return (
    <aside className="bb-rail">
      <div className="bb-brand">
        <span className="bb-brand-mark">
          <TvGlyph />
        </span>
        <span className="bb-brand-name">{words.brand}</span>
      </div>
      <nav className="bb-nav" aria-label={words.brand}>
        {TABS.map((each) => (
          <button
            key={each}
            type="button"
            className={each === tab ? 'bb-tab on' : 'bb-tab'}
            aria-current={each === tab ? 'page' : undefined}
            onClick={() => open(each)}
          >
            <span className="bb-tab-glyph">
              <TabGlyph tab={each} on={each === tab} />
            </span>
            <span className="bb-tab-label">{words.tabs[TAB_LABELS[each]]}</span>
          </button>
        ))}
      </nav>
      <div className="bb-rail-foot">
        <button type="button" className={`bb-me ${tab === 'mine' ? 'on' : ''}`} onClick={() => open('mine')}>
          <span className="bb-me-avatar">
            <Avatar user={user} size="small" />
          </span>
          <span className="bb-me-text">
            <b>{user?.name || words.tabs.mine}</b>
            <span>{status}</span>
          </span>
          <span className="bb-me-go" aria-hidden>
            <ChevronRightGlyph />
          </span>
        </button>
      </div>
    </aside>
  )
}

// --- The bar at the top ---------------------------------------------------------------------------------------

/** Every page's bar: Back, the app's search (the whole app's), and the account's picture. */
function TopBar() {
  const words = useBilibiliWords()
  const canBack = useCanGoBack()
  const query = useBilibili((state) => state.query)
  const back = () => {
    useKeyboard.getState().detach(SEARCH_FIELD)
    goBack()
  }
  return (
    <div className="bb-topbar">
      <button
        type="button"
        className="bb-back"
        aria-label={words.back}
        title={words.back}
        disabled={!canBack}
        onClick={back}
      >
        <BackGlyph />
      </button>
      <SearchBar query={query} />
      <button type="button" className="bb-top-avatar" aria-label={words.tabs.mine} onClick={() => openTab('mine')}>
        <AccountAvatar />
      </button>
    </div>
  )
}

/** The account's picture in the bar (the app's mark where nobody is signed in). */
function AccountAvatar() {
  const user = useBilibili((state) => state.user)
  return <Avatar user={user} size="small" />
}

/**
 * The search the whole app shares: pressing it brings Search's page up, typing asks Bilibili after the last key.
 */
function SearchBar({ query }: { query: string }) {
  const words = useBilibiliWords()
  const addHistory = useSearchHistory((state) => state.add)
  // As the player types: Search's page comes up with the first word, and Bilibili is asked a moment after the last.
  useEffect(() => {
    if (!query.trim()) return
    openSearchPage()
    const timer = setTimeout(() => searchFor(query), 500)
    return () => clearTimeout(timer)
  }, [query])
  const select = () => openSearchPage()
  const submit = () => {
    const said = query.trim()
    useKeyboard.getState().detach(SEARCH_FIELD)
    if (!said) return
    addHistory(said)
    searchFor(said)
  }
  return (
    <div className="bb-search-field">
      <TextField
        id={SEARCH_FIELD}
        value={query}
        onChange={setQuery}
        onSelect={select}
        onSubmit={submit}
        returnKind="search"
        hint={words.searchHint}
        label={words.searchHint}
        icon={<SearchGlyph />}
      />
    </div>
  )
}

// --- The pages ------------------------------------------------------------------------------------------------

/** The pages: each tab's own (kept as it was left, so its scroll is), and the pages opened over the showing tab. */
function Layers() {
  const tab = useNav((state) => state.tab)
  const stacks = useNav((state) => state.stacks)
  const stack = stacks[tab]
  return (
    <>
      {TABS.map((each) => (
        <Layer key={each} scrollKey={`tab:${each}`} shown={each === tab && stack.length === 0}>
          <TabPage tab={each} />
        </Layer>
      ))}
      {stack.map((page, index) => (
        <Layer key={pageKey(page)} scrollKey={`${tab}:${pageKey(page)}`} shown={index === stack.length - 1} opened>
          <PageBody page={page} />
        </Layer>
      ))}
    </>
  )
}

/** A page's identity for the layer keys (the stack's own). */
function pageKey(page: Page): string {
  if ('seasonId' in page) return `bangumiDetail:${page.seasonId}`
  if ('roomId' in page) return `liveRoom:${page.roomId}`
  if ('uid' in page) return `space:${page.uid}`
  return page.kind
}

/** Where each page was read (its own scroll), kept while the app runs: coming back to it finds it where it was. */
const readAt = new Map<string, number>()

/**
 * A page layer: one just opened comes in from the side; one shown again (Back, a tab chosen again) only fades up, where
 * it was. Away, it's kept as it is (its scroll and all) but not laid out, drawn or reached.
 */
function Layer({
  shown,
  opened = false,
  scrollKey,
  children,
}: {
  shown: boolean
  opened?: boolean
  scrollKey: string
  children: ReactNode
}) {
  const [fresh, setFresh] = useState(opened)
  const host = useRef<HTMLDivElement>(null)
  const className = !shown ? 'bb-layer away' : fresh ? 'bb-layer fresh' : 'bb-layer'
  useLayoutEffect(() => {
    const box = host.current?.querySelector('.bb-scroll')
    const saved = readAt.get(scrollKey)
    if (box && saved) box.scrollTop = saved
  }, [scrollKey])
  useEffect(() => {
    const layer = host.current
    const boxes = layer ? Array.from(layer.querySelectorAll<HTMLElement>('.bb-scroll')) : []
    if (boxes.length === 0) return
    const save = () => {
      const box = boxes.find((each) => each.scrollTop > 0) ?? boxes[0]
      readAt.set(scrollKey, box.scrollTop)
    }
    for (const box of boxes) box.addEventListener('scroll', save, { passive: true })
    return () => {
      save()
      for (const box of boxes) box.removeEventListener('scroll', save)
    }
  }, [scrollKey])
  return (
    <div
      ref={host}
      className={className}
      inert={shown ? undefined : true}
      onAnimationEnd={(event) => event.target === event.currentTarget && setFresh(false)}
    >
      {children}
    </div>
  )
}

// --- The player bar -------------------------------------------------------------------------------------------

/**
 * The bar along the app's foot, always there while the app shows (the player page steps over it): what plays, how far
 * in, play/pause, and the way into the player's own page.
 */
function PlayerBar() {
  const words = useBilibiliWords()
  const now = useBilibili((state) => state.now)
  const playing = useBilibili((state) => state.playing)
  const duration = useBilibili((state) => state.duration)
  const position = usePlayhead()
  const live = now?.live === true
  return (
    <div className={now ? 'bb-playerbar' : 'bb-playerbar empty'}>
      {now ? (
        <>
          <button
            type="button"
            className="bb-playerbar-now"
            onClick={openPlayerPage}
            aria-label={words.player.nowPlaying}
          >
            <span className="bb-playerbar-art">
              <Cover cover={now.cover} title={now.title} />
              {playing && (
                <span className="bb-playerbar-eq" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </span>
            <span className="bb-playerbar-text">
              <b>{now.title}</b>
              <span>
                {now.up?.name}
                {live
                  ? ` · ${words.player.live}`
                  : duration > 0
                    ? ` · ${formatClock(position)} / ${formatClock(duration)}`
                    : ''}
              </span>
            </span>
          </button>
          <div className="bb-playerbar-line" aria-hidden>
            <span style={{ width: `${live ? 100 : Math.round(progressShare(position, duration) * 100)}%` }} />
          </div>
          <button
            type="button"
            className="bb-playerbar-play"
            aria-label={playing ? words.player.pause : words.player.play}
            onClick={togglePlay}
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button
            type="button"
            className="bb-playerbar-open"
            aria-label={words.player.collapse}
            onClick={openPlayerPage}
          >
            <ChevronUpGlyph />
          </button>
        </>
      ) : (
        <div className="bb-playerbar-idle">
          <span className="bb-playerbar-idle-mark" aria-hidden>
            <TvGlyph />
          </span>
          <span>
            <b>{words.home.nothingPlaying}</b>
            <span>{words.home.nothingPlayingHint}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function ChevronUpGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m4.8 14.6 7.2-7.2 7.2 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// --- Odds and ends --------------------------------------------------------------------------------------------

/** One line over the app (a like's, a coin's, a favorite's): gone in a moment. */
function Toast() {
  const toast = useBilibili((state) => state.toast)
  return toast ? (
    <p key={toast.id} className="bb-toast" role="status">
      {toast.text}
    </p>
  ) : null
}
