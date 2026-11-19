import { type ReactNode, useEffect, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { BackGlyph, ClockGlyph, PersonGlyph, PlayGlyph, RadioGlyph, RefreshGlyph } from './glyphs'
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
  openArtist,
  openPlaylist,
  openRecent,
  playDaily,
  playFound,
  playPlaylist,
  playSong,
  requestHome,
  requestLibrary,
  requestRecent,
  retryArtist,
  retryPlaylist,
  SEARCH_FIELD,
  searchFor,
  setQuery,
  setSearchTab,
  showToast,
  useNetease,
  useArtistMeta,
  usePlaylistMeta,
  type NeteaseArtist,
  type NeteaseList,
  type NeteaseSearch,
  type NeteaseSong,
  type SearchTab,
  type View,
} from './netease'
import { useNeteaseWords, type NeteaseWords } from './strings'

/** The NetEase app's pages, under the search bar at the app's top: Home (its day's songs, the radar row, the
 * recommended playlists), a playlist's songs, an artist's page, Search (the page's own categories), My Music (the
 * account's playlists and its recent songs) and the recent songs' page. */

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

/** The keyboard's field let go (a result picked: the keyboard is for the search bar, not the results). */
function stopTyping(): void {
  useKeyboard.getState().detach(SEARCH_FIELD)
}

/** The words a group of My Music's own says for its title, as the page names them ("创建的歌单(5)"): its own words
 * for the two it knows, and the page's own title for any other. */
function groupTitle(title: string, words: NeteaseWords): string {
  if (title.includes('创建')) return words.createdPlaylists
  if (title.includes('收藏')) return words.collectedPlaylists
  return title
}

/** A section's title with its line under it, and what's at its end (Play all, Refresh). */
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

// --- Home --------------------------------------------------------------------------------------------------

/** How many of the day's songs Home shows before its word for the rest (all of them play from Play all). */
const DAILY_SHOWN = 8

/** The radar's card: its cover, its name and what it is. Pressed, its playlist's page. */
function RadarCard({ list }: { list: NeteaseList }) {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-spot" onClick={() => openPlaylist(list.id)}>
      <Cover name={list.name} cover={list.cover} className="ne-spot-cover" />
      <span className="ne-spot-text">
        <span className="ne-spot-kicker">{words.radar}</span>
        <b className="ne-spot-name">{list.name === words.radar ? words.radarHint : list.name}</b>
        <span className="ne-spot-hint">{words.radarHint}</span>
      </span>
      <span className="ne-spot-go" aria-hidden>
        <PlayGlyph />
      </span>
    </button>
  )
}

/** 私人漫游's card: NetEase's phone app has it, the web player the cab runs doesn't — a card that says so (never a
 * song or a playlist made up for it). Pressed, it says where the entry is. */
function RoamCard() {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-spot placeholder" onClick={() => showToast(words.roamNote)}>
      <span className="ne-spot-mark">
        <RadioGlyph />
      </span>
      <span className="ne-spot-text">
        <span className="ne-spot-kicker">{words.roamBadge}</span>
        <b className="ne-spot-name">{words.roam}</b>
        <span className="ne-spot-hint">{words.roamNote}</span>
      </span>
    </button>
  )
}

/** Home, from its top: the day's own songs (每日歌曲推荐, Play all), the radar's row (私人雷达, and 私人漫游's own
 * card, which the web player has no entry for), then the recommended playlists. */
export function Home() {
  const words = useNeteaseWords()
  const home = useNetease((state) => state.home)
  const asking = useNetease((state) => state.homeAsking)
  const heard = useNetease((state) => state.heard)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const tab = useNetease((state) => state.tab)
  const [allDaily, setAllDaily] = useState(false)
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
  // The recommended playlists: the account's own (个性化歌单) first, then the page's (热门推荐), each once.
  const playlists: NeteaseList[] = []
  if (home) {
    const seen = new Set<string>()
    for (const list of [...home.personal, ...home.recommended]) {
      if (seen.has(list.id)) continue
      seen.add(list.id)
      playlists.push(list)
    }
  }
  return (
    <div className="ne-scroll ne-home">
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
              hint={daily ? `${words.dailyHint} · ${words.songs(daily.length)}` : words.dailyHint}
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
              <>
                <div className="ne-song-grid">
                  {(allDaily ? daily : daily.slice(0, DAILY_SHOWN)).map((song, index) => (
                    <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playFound} />
                  ))}
                </div>
                {daily.length > DAILY_SHOWN && (
                  <button type="button" className="ne-more" onClick={() => setAllDaily(!allDaily)}>
                    {allDaily ? words.showLess : words.showAll(daily.length)}
                  </button>
                )}
              </>
            )}
          </section>
          <section className="ne-spot-row" aria-label={words.radar}>
            {home.radar && <RadarCard list={home.radar} />}
            <RoamCard />
          </section>
          <section className="ne-section">
            <SectionHead
              title={words.recommendedPlaylists}
              hint={playlists.length > 0 ? words.recommendedPlaylistsHint : undefined}
              action={
                <button type="button" className="ne-pill" onClick={() => requestHome(true)}>
                  <RefreshGlyph />
                  {words.refresh}
                </button>
              }
            />
            {playlists.length === 0 ? (
              <EmptyState
                title={words.emptyLists}
                text={words.emptyListsHint}
                action={
                  <button type="button" className="ne-pill" onClick={() => requestHome(true)}>
                    {words.retry}
                  </button>
                }
              />
            ) : (
              <div className="ne-grid">
                {playlists.map((list) => (
                  <PlaylistCard key={list.id} list={list} onOpen={() => openPlaylist(list.id)} />
                ))}
              </div>
            )}
          </section>
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
      <PageHead
        title={words.mine}
        hint={words.myPlaylistsHint}
        action={
          <button
            type="button"
            className="ne-pill"
            onClick={() => {
              requestLibrary(true)
              requestRecent(true)
            }}
          >
            <RefreshGlyph />
            {words.refresh}
          </button>
        }
      />
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

/** Search's own categories, in its page's order (its tabs: 单曲, 歌手, 歌单). */
const SEARCH_TABS: readonly SearchTab[] = ['songs', 'artists', 'playlists']

/** An artist's card (a search's artist): their picture, their name. Pressed, their page. */
function ArtistCard({ artist, onOpen }: { artist: NeteaseArtist; onOpen(artist: NeteaseArtist): void }) {
  const words = useNeteaseWords()
  return (
    <button type="button" className="ne-card artist" onClick={() => onOpen(artist)}>
      <Cover name={artist.name} cover={artist.cover} className="ne-card-cover" />
      <span className="ne-card-name">{artist.name}</span>
      <span className="ne-card-plays">{words.artist}</span>
    </button>
  )
}

/** Search, under the app's own search bar: the words typed there, the page's own categories as its tabs, and what
 * its page found of each (a song plays, an artist opens their page, a playlist its own page). */
export function Search() {
  const words = useNeteaseWords()
  const query = useNetease((state) => state.query)
  const search = useNetease((state) => state.search)
  const asking = useNetease((state) => state.searchAsking)
  const lists = useNetease((state) => state.lists)
  const tab = useNetease((state) => state.searchTab)
  const wanted = query.trim()
  const shown = search && search.query === wanted ? search : null
  const counts: Record<SearchTab, number> = shown
    ? { songs: shown.songsTotal, artists: shown.artistsTotal, playlists: shown.playlistsTotal }
    : { songs: 0, artists: 0, playlists: 0 }
  const labels: Record<SearchTab, string> = {
    songs: words.searchSongs,
    artists: words.searchArtists,
    playlists: words.searchPlaylists,
  }
  const pickTab = (kind: SearchTab) => {
    setSearchTab(kind)
    stopTyping()
  }
  const playOne = (song: NeteaseSong) => {
    stopTyping()
    if (!song.playable) {
      showToast(words.unplayableHint)
      return
    }
    playFound(song)
    if (isInHost()) showToast(words.queued)
  }
  const openList = (list: NeteaseList) => {
    stopTyping()
    openPlaylist(list.id)
  }
  const openArtistPage = (artist: NeteaseArtist) => {
    stopTyping()
    openArtist(artist.id)
  }
  const results = (found: NeteaseSearch) => {
    if (tab === 'songs') {
      return found.songs.length === 0 ? (
        <EmptyState title={words.searchEmpty} text={words.searchEmptyHint} />
      ) : (
        <div className="ne-song-grid">
          {found.songs.map((song, index) => (
            <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playOne} />
          ))}
        </div>
      )
    }
    if (tab === 'artists') {
      return found.artists.length === 0 ? (
        <EmptyState title={words.searchEmpty} text={words.searchEmptyHint} />
      ) : (
        <div className="ne-grid">
          {found.artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} onOpen={openArtistPage} />
          ))}
        </div>
      )
    }
    return found.playlists.length === 0 ? (
      <EmptyState title={words.searchEmpty} text={words.searchEmptyHint} />
    ) : (
      <div className="ne-grid">
        {found.playlists.map((list) => (
          <PlaylistCard key={list.id} list={list} onOpen={openList} />
        ))}
      </div>
    )
  }
  return (
    <div className="ne-scroll ne-search">
      {!wanted ? (
        <div className="ne-search-idle">
          <h2>{words.searchIdle}</h2>
          <p>{words.searchIdleHint}</p>
          {lists.length > 0 && (
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
          )}
        </div>
      ) : (
        <>
          <div className="ne-filters" role="tablist" aria-label={words.search}>
            {SEARCH_TABS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={kind === tab}
                className={kind === tab ? 'ne-filter on' : 'ne-filter'}
                onClick={() => pickTab(kind)}
              >
                {labels[kind]}
                {shown && <em>{counts[kind]}</em>}
              </button>
            ))}
            {asking.waiting && <span className="ne-spinner" aria-hidden />}
          </div>
          {asking.waiting && !shown ? (
            <>
              <p className="ne-note">{words.searching}</p>
              {tab === 'songs' ? <RowsSkeleton count={8} /> : <CardsSkeleton count={5} />}
            </>
          ) : asking.failed && !shown ? (
            <Failed text={words.searchFailed} retry={() => searchFor(query)} />
          ) : shown ? (
            results(shown)
          ) : null}
        </>
      )}
    </div>
  )
}

// --- An artist's page ---------------------------------------------------------------------------------------

/** An artist's page: their picture, name and alias, Play all, then their most played songs (a page the host's
 * hidden page answers with an `artist` message). Their card from the search that opened the page draws its head
 * before the page's own answer comes. */
export function ArtistPage({ view }: { view: View }) {
  const words = useNeteaseWords()
  const artistId = view.kind === 'artist' ? view.artistId : ''
  const page = useNetease((state) => state.artists[artistId])
  const card = useArtistMeta(artistId)
  const name = page?.name || card?.name || words.artist
  const cover = page?.cover ?? card?.cover ?? null
  const songs = page?.songs ?? null
  const playAll = () => {
    const first = songs?.find((song) => song.playable)
    if (!first) return
    playFound(first)
    if (isInHost()) showToast(words.queued)
  }
  return (
    <div className="ne-scroll ne-playlist ne-artist">
      <header className="ne-pl-head">
        <button type="button" className="ne-round ne-pl-back" aria-label={words.back} onClick={goBack}>
          <BackGlyph />
        </button>
        <Cover name={name} cover={cover} className="ne-pl-cover ne-ar-cover" />
        <div className="ne-pl-text">
          <span className="ne-pl-kind">{words.artist}</span>
          <h2 className="ne-pl-name">{name}</h2>
          <p className="ne-pl-meta">
            {page?.alias && <span>{page.alias}</span>}
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
      <SectionHead title={words.artistHint} hint={songs ? words.songs(songs.length) : undefined} />
      {!page || (page.waiting && !songs) ? (
        <RowsSkeleton count={8} />
      ) : page.failed ? (
        <Failed text={words.artistFailed} retry={() => retryArtist(artistId)} />
      ) : songs && songs.length === 0 ? (
        <EmptyState
          title={words.artistEmpty}
          text={words.artistEmptyHint}
          action={
            <button type="button" className="ne-pill" onClick={() => retryArtist(artistId)}>
              {words.retry}
            </button>
          }
        />
      ) : (
        <div className="ne-songs">
          {(songs ?? []).map((song, index) => (
            <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playFound} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- A playlist's page -------------------------------------------------------------------------------------

/** A playlist's page: its cover, its name and numbers, Play all, then its songs (a page the host's hidden page
 * answers with a `playlist` message). Its name and cover come from whichever reading already knows it (Home's
 * shelves, My Music's groups, a search's result), so its head draws before its songs come. */
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
    case 'artist':
      return <ArtistPage view={view} />
    case 'playlist':
      return <PlaylistPage view={view} />
  }
}
