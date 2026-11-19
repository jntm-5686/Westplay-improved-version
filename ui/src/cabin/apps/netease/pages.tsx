import { type ReactNode, useEffect, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { TextField } from '../../keyboard/TextField'
import { BackGlyph, ClockGlyph, PersonGlyph, PlayGlyph, RefreshGlyph, SearchGlyph } from './glyphs'
import {
  CardsSkeleton,
  Cover,
  EmptyState,
  Failed,
  LibraryCard,
  PageHead,
  PlaylistCard,
  RowsSkeleton,
  SongRow,
} from './parts'
import {
  accountOf,
  goBack,
  openPlaylist,
  openRecent,
  playDaily,
  playFound,
  playPlaylist,
  playSong,
  requestHome,
  requestLibrary,
  requestRecent,
  retryPlaylist,
  searchFor,
  showToast,
  useNetease,
  usePlaylistMeta,
  type NeteaseList,
  type NeteaseSong,
  type View,
} from './netease'
import { useNeteaseWords, type NeteaseWords } from './strings'

/** The NetEase app's pages: Home (the day's own songs and the page's shelves), a playlist's songs, Search, My
 * Music (the account's own playlists and its recent songs) and the recent songs' page. */

/** Search's field: the keyboard's, detached as the tab is left (NeteaseApp.tsx). */
export const SEARCH_FIELD = 'netease-search'

/** Whether the host has stayed quiet long enough to say so (it may be starting). */
function useSilent(heard: boolean, wait = 8000): boolean {
  const [silent, setSilent] = useState(false)
  useEffect(() => {
    setSilent(false)
    if (heard) return
    const timer = setTimeout(() => setSilent(true), wait)
    return () => clearTimeout(timer)
  }, [heard, wait])
  return silent
}

/** The words a group of My Music's own says for its title, as the page names them ("创建的歌单(5)"): its own words
 * for the two it knows, and the page's own title for any other. */
function groupTitle(title: string, words: NeteaseWords): string {
  if (title.includes('创建')) return words.createdPlaylists
  if (title.includes('收藏')) return words.collectedPlaylists
  return title
}

// --- Home --------------------------------------------------------------------------------------------------

/** A shelf of Home's: its title and what it is under it, then its playlists as cards. */
function Shelf({ title, hint, lists }: { title: string; hint: string; lists: NeteaseList[] }) {
  return (
    <section className="ne-section">
      <div className="ne-section-head">
        <div className="ne-section-title">
          <h3>{title}</h3>
          <span>{hint}</span>
        </div>
      </div>
      <div className="ne-grid">
        {lists.map((list) => (
          <PlaylistCard key={list.id} list={list} onOpen={() => openPlaylist(list.id)} />
        ))}
      </div>
    </section>
  )
}

/** A page head's section title with its line under it (the pages' own, not a tab's). */
function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="ne-section-head">
      <div className="ne-section-title">
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </div>
      {action}
    </div>
  )
}

/** Home: the day's own songs (每日歌曲推荐) at its top, its Play all, then the account's 私人雷达, its other
 * personalised playlists and the recommended ones. */
export function Home() {
  const words = useNeteaseWords()
  const home = useNetease((state) => state.home)
  const asking = useNetease((state) => state.homeAsking)
  const heard = useNetease((state) => state.heard)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const tab = useNetease((state) => state.tab)
  const silent = useSilent(heard)
  // The tab pressed again, or opened: Home reads its page once the hidden page has said it runs (`heard`), so the
  // reading isn't asked of a page still loading. The cards and the day's songs come as they're read; a reading
  // that didn't come says so, and Refresh asks again.
  useEffect(() => {
    if (tab === 'home' && heard) requestHome()
  }, [tab, heard])
  const daily = home?.daily ?? null
  const playAll = () => {
    playDaily()
    if (isInHost()) showToast(words.queued)
  }
  return (
    <div className="ne-scroll ne-home">
      <PageHead
        title={words.recommended}
        hint={words.recommendedHint}
        action={
          <button type="button" className="ne-pill" onClick={() => requestHome(true)}>
            <RefreshGlyph />
            {words.refresh}
          </button>
        }
      />
      {(signedIn === false || signingIn) && (
        <p className="ne-signin-note">
          {signingIn ? words.signingInHint : `${words.signedOut} · ${words.signInHint}`}
        </p>
      )}
      {!home ? (
        asking.failed || (silent && !asking.waiting) ? (
          <Failed text={asking.failed ? words.homeFailed : words.notConnected} retry={() => requestHome(true)} />
        ) : (
          <>
            <RowsSkeleton count={6} />
            <CardsSkeleton count={5} />
          </>
        )
      ) : (
        <>
          <section className="ne-section ne-daily">
            <SectionHead
              title={words.daily}
              hint={daily ? words.songs(daily.length) : words.dailyHint}
              action={
                daily && daily.some((song) => song.playable) ? (
                  <button type="button" className="ne-play-all small" onClick={playAll}>
                    <PlayGlyph />
                    {words.playAll}
                  </button>
                ) : undefined
              }
            />
            {daily === null ? (
              asking.failed || !asking.waiting ? (
                <Failed text={words.dailyFailed} retry={() => requestHome(true)} />
              ) : (
                <RowsSkeleton count={6} />
              )
            ) : daily.length === 0 ? (
              <EmptyState title={words.dailyEmpty} text={words.dailyEmptyHint} />
            ) : (
              <div className="ne-songs">
                {daily.map((song, index) => (
                  <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playFound} />
                ))}
              </div>
            )}
          </section>
          {home.radar && (
            <Shelf title={words.radar} hint={words.radarHint} lists={[home.radar]} />
          )}
          {home.personal.length > 0 && (
            <Shelf title={words.personal} hint={words.personalHint} lists={home.personal} />
          )}
          {home.recommended.length > 0 && (
            <Shelf title={words.recommendedHot} hint={words.recommendedHotHint} lists={home.recommended} />
          )}
          {asking.failed && <p className="ne-note">{words.homeFailed}</p>}
        </>
      )}
    </div>
  )
}

// --- My Music ----------------------------------------------------------------------------------------------

/** My Music: the account as NetEase's page says it, its recent songs' way in, and every playlist it has, by the
 * group its own page puts it in (创建的歌单, 收藏的歌单). */
export function Mine() {
  const words = useNeteaseWords()
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const library = useNetease((state) => state.library)
  const libraryAsking = useNetease((state) => state.libraryAsking)
  const recent = useNetease((state) => state.recent)
  const recentAsking = useNetease((state) => state.recentAsking)
  const heard = useNetease((state) => state.heard)
  const tab = useNetease((state) => state.tab)
  const silent = useSilent(heard)
  // Its own page is read when My Music is first shown (and again by its Refresh): /my/ is where the groups are.
  // Only once the hidden page has said it runs, so nothing is asked of a page still loading.
  useEffect(() => {
    if (tab !== 'mine' || !heard) return
    requestLibrary()
    requestRecent()
  }, [tab, heard])
  const account = accountOf({ signedIn, signingIn })
  const status =
    account === 'in'
      ? words.signedIn
      : account === 'out'
        ? words.signedOut
        : account === 'signingIn'
          ? words.signingIn
          : words.unknownAccount
  const hint =
    account === 'in' ? '' : account === 'signingIn' ? words.signingInHint : words.signInHint
  return (
    <div className="ne-scroll ne-mine">
      <PageHead title={words.mine} hint={words.myPlaylistsHint} />
      <section className={account === 'in' ? 'ne-account signed' : 'ne-account'} aria-label={words.account}>
        <span className="ne-account-avatar">
          <PersonGlyph />
        </span>
        <span className="ne-account-text">
          <b>{words.brand}</b>
          <span className="ne-account-status">{status}</span>
        </span>
        {account === 'signingIn' && <span className="ne-spinner" aria-hidden />}
        {hint && <span className="ne-account-hint">{hint}</span>}
      </section>
      <button type="button" className="ne-recent-entry" onClick={openRecent}>
        <span className="ne-recent-entry-icon">
          <ClockGlyph />
        </span>
        <span className="ne-recent-entry-text">
          <b>{words.recent}</b>
          <span>{recent ? words.songs(recent.length) : words.recentSource}</span>
        </span>
        {recentAsking.waiting && !recent ? <span className="ne-spinner" aria-hidden /> : <span className="ne-recent-entry-go">›</span>}
      </button>
      {library === null ? (
        libraryAsking.failed || (silent && !libraryAsking.waiting) ? (
          <Failed text={libraryAsking.failed ? words.libraryFailed : words.notConnected} retry={() => requestLibrary(true)} />
        ) : (
          <CardsSkeleton count={5} />
        )
      ) : library.length === 0 ? (
        <EmptyState
          title={words.libraryEmpty}
          text={words.libraryEmptyHint}
          action={
            <button type="button" className="ne-pill" onClick={() => requestLibrary(true)}>
              {words.retry}
            </button>
          }
        />
      ) : (
        library.map((group) => (
          <section className="ne-section" key={group.title}>
            <SectionHead title={groupTitle(group.title, words)} hint={words.songs(group.count)} />
            <div className="ne-grid">
              {group.playlists.map((list) => (
                <LibraryCard key={list.id} list={list} onOpen={() => openPlaylist(list.id)} />
              ))}
            </div>
          </section>
        ))
      )}
      {libraryAsking.failed && library !== null && <p className="ne-note">{words.libraryFailed}</p>}
    </div>
  )
}

// --- The recent songs' page ---------------------------------------------------------------------------------

/** The account's recent songs (its 听歌排行 this week: the web player keeps no 最近播放 page of its own), as a
 * page of its own: its Play all, and each song pressed to play. */
export function RecentPage() {
  const words = useNeteaseWords()
  const songs = useNetease((state) => state.recent)
  const asking = useNetease((state) => state.recentAsking)
  useEffect(() => {
    requestRecent()
  }, [])
  const playAll = () => {
    const first = songs?.find((song) => song.playable)
    if (!first) return
    playFound(first)
    if (isInHost()) showToast(words.queued)
  }
  return (
    <div className="ne-scroll ne-playlist">
      <header className="ne-page-head ne-recent-head">
        <div className="ne-recent-title">
          <button type="button" className="ne-round" aria-label={words.back} onClick={goBack}>
            <BackGlyph />
          </button>
          <div className="ne-page-head-text">
            <h2>{words.recent}</h2>
            <p>{words.recentSource}</p>
          </div>
        </div>
        <div className="ne-recent-actions">
          {songs && songs.some((song) => song.playable) && (
            <button type="button" className="ne-play-all" onClick={playAll}>
              <PlayGlyph />
              {words.playAll}
            </button>
          )}
          <button type="button" className="ne-pill" onClick={() => requestRecent(true)}>
            <RefreshGlyph />
            {words.refresh}
          </button>
        </div>
      </header>
      {songs === null ? (
        asking.failed ? (
          <Failed text={words.recentFailed} retry={() => requestRecent(true)} />
        ) : (
          <RowsSkeleton count={10} />
        )
      ) : songs.length === 0 ? (
        <EmptyState title={words.recentEmpty} text={words.recentEmptyHint} />
      ) : (
        <div className="ne-songs">
          {songs.map((song, index) => (
            <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playFound} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Search ------------------------------------------------------------------------------------------------

/** Search: the page's own search of the words typed (its old search route), its songs answered as they come. */
export function Search() {
  const words = useNeteaseWords()
  const lists = useNetease((state) => state.lists)
  const search = useNetease((state) => state.search)
  const asking = useNetease((state) => state.searchAsking)
  const [query, setQuery] = useState('')
  const wanted = query.trim()
  // As the player types: the words asked a moment after the last key (never once per key, as the page loads).
  useEffect(() => {
    const timer = setTimeout(() => searchFor(query), 500)
    return () => clearTimeout(timer)
  }, [query])
  const shown = search && search.query === wanted ? search : null
  const playOne = (song: NeteaseSong) => {
    if (!song.playable) {
      showToast(words.unplayableHint)
      return
    }
    playFound(song)
    if (isInHost()) showToast(words.queued)
  }
  return (
    <div className="ne-scroll ne-search">
      <PageHead title={words.search} hint={words.searchNote} />
      <div className="ne-search-field">
        <TextField
          id={SEARCH_FIELD}
          value={query}
          onChange={setQuery}
          onSubmit={() => searchFor(query)}
          returnKind="search"
          hint={words.searchHint}
          label={words.searchHint}
          icon={<SearchGlyph />}
        />
      </div>
      {!wanted ? (
        lists.length > 0 && (
          <section className="ne-section">
            <SectionHead title={words.searchHot} hint={words.searchHotHint} />
            <div className="ne-chips">
              {lists.slice(0, 6).map((list) => (
                <button key={list.id} type="button" className="ne-chip" onClick={() => setQuery(list.name)}>
                  {list.name}
                </button>
              ))}
            </div>
          </section>
        )
      ) : asking.waiting && !shown ? (
        <>
          <p className="ne-note">{words.searching}</p>
          <RowsSkeleton count={8} />
        </>
      ) : asking.failed && !shown ? (
        <Failed text={words.searchFailed} retry={() => searchFor(query)} />
      ) : shown && shown.songs.length === 0 ? (
        <EmptyState title={words.searchEmpty} text={words.searchEmptyHint} />
      ) : shown ? (
        <section className="ne-section">
          <SectionHead
            title={words.searchSongs}
            hint={words.songs(shown.songs.length)}
            action={asking.waiting ? <span className="ne-spinner" aria-hidden /> : undefined}
          />
          <div className="ne-songs">
            {shown.songs.map((song, index) => (
              <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playOne} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

// --- A playlist's page -------------------------------------------------------------------------------------

/** A playlist's page: its cover, its name and numbers, Play all, then its songs (a page the host's hidden page
 * answers with a `playlist` message). Its name and cover come from whichever reading already knows it (Home's
 * shelves, My Music's groups), so its head draws before its songs come. */
export function PlaylistPage({ view }: { view: View }) {
  const words = useNeteaseWords()
  const playlistId = view.kind === 'playlist' ? view.playlistId : ''
  const page = useNetease((state) => state.playlists[playlistId])
  const list = usePlaylistMeta(playlistId)
  const name = list?.name ?? words.playlist
  const songs = page?.songs ?? null
  const playAll = () => {
    playPlaylist(playlistId)
    if (isInHost()) showToast(words.queued)
  }
  const playOne = (song: NeteaseSong) => {
    if (!song.playable) {
      showToast(words.unplayableHint)
      return
    }
    playSong(playlistId, song)
    if (isInHost()) showToast(words.queued)
  }
  return (
    <div className="ne-scroll ne-playlist">
      <header className="ne-pl-head">
        <button type="button" className="ne-round ne-pl-back" aria-label={words.back} onClick={goBack}>
          <BackGlyph />
        </button>
        <Cover name={name} cover={list?.cover ?? null} className="ne-pl-cover" />
        <div className="ne-pl-text">
          <span className="ne-pl-kind">{words.playlist}</span>
          <h2 className="ne-pl-name">{name}</h2>
          <p className="ne-pl-meta">
            {list && <span>{words.plays(list.playCount)}</span>}
            {songs && <span>{words.songs(songs.length)}</span>}
          </p>
        </div>
        {songs && songs.length > 0 && (
          <button type="button" className="ne-play-all" onClick={playAll}>
            <PlayGlyph />
            {words.playAll}
          </button>
        )}
      </header>
      {!page || (page.waiting && !songs) ? (
        <RowsSkeleton count={8} />
      ) : page.failed ? (
        <Failed text={words.failed} retry={() => retryPlaylist(playlistId)} />
      ) : songs && songs.length === 0 ? (
        <EmptyState
          title={words.emptyPlaylist}
          text={words.emptyPlaylistHint}
          action={
            <button type="button" className="ne-pill" onClick={() => retryPlaylist(playlistId)}>
              {words.retry}
            </button>
          }
        />
      ) : (
        <div className="ne-songs">
          {(songs ?? []).map((song, index) => (
            <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playOne} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A page over a tab's own. */
export function Page({ view }: { view: View }) {
  switch (view.kind) {
    case 'recent':
      return <RecentPage />
    case 'playlist':
      return <PlaylistPage view={view} />
  }
}
