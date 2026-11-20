import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { useNav } from './nav'
import {
  accountOf,
  netease,
  playDaily,
  playFound,
  playPlaylist,
  playSong,
  requestHome,
  requestLibrary,
  requestProfile,
  requestRankings,
  requestRecent,
  requestArtistAlbums,
  requestArtistSongs,
  retryArtist,
  retryPlaylist,
  retryRanking,
  searchFor,
  setQuery,
  setStyle,
  showToast,
  useNetease,
  usePlaylistMeta,
  useRankingMeta,
  type NeteaseArtist,
  type NeteaseLibraryGroup,
  type NeteaseList,
  type NeteaseRanking,
  type NeteaseSong,
} from './netease'
import { usePrefs, type Motion } from './prefs'
import { expectSong } from './playback'
import { hasResults, resultCounts, searchSections, suggestLists } from './sections'
import { useSearchHistory } from './searchHistory'
import type { Page, Tab } from './stack'
import {
  ArtistCard,
  ArtistsSkeleton,
  CardsSkeleton,
  Cover,
  EmptyState,
  EntryRow,
  Failed,
  HeroSkeleton,
  LibraryCard,
  PageHead,
  PlaylistCard,
  ProfileSkeleton,
  RankingCard,
  RankingsSkeleton,
  RecentEntry,
  RowsSkeleton,
  SectionHead,
  SongRow,
} from './parts'
import { DiscGlyph, GearGlyph, LibraryGlyph, PersonGlyph, PlayGlyph, RadioGlyph, RefreshGlyph } from './glyphs'
import { useNeteaseWords, type NeteaseWords } from './strings'
import { NowPlayingPage } from './NowPlaying'

/**
 * The NetEase app's pages, under the search bar at the app's top: Home (the day's own card, the radar row and
 * the recommended shelf), My playlists (the account's own, by group, and the recent songs), the charts, Search
 * (its artists first, then its songs, then its playlists), the account's own page and its settings, and the
 * pages a card opens over them (a playlist, a ranking, an artist, the recent songs).
 */

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
  useKeyboard.getState().detach('netease-search')
}

/** The words a group of My Music's own says for its title, as the page names them ("创建的歌单(5)"). */
function groupTitle(title: string, words: NeteaseWords): string {
  if (title.includes('创建')) return words.createdPlaylists
  if (title.includes('收藏')) return words.collectedPlaylists
  return title
}

/** Plays a song pressed, and says over the player — if the hints are still on — that NetEase was asked. The song
 * goes on the player bar and lights its row at once (see playback.ts); the page's own state catches up a moment
 * later. */
/** How much of each long list was drawn (its 显示更多 presses), and which of an artist's own pages was read: kept by
 * id, so a page brought back from the full-screen player is exactly where it was left (owner 2026-11-20). */
const drawnAt = new Map<string, number>()
const artistPageAt = new Map<string, 'hot' | 'all' | 'albums'>()

function usePlay(): (song: NeteaseSong, options?: { inPlaylist?: string }) => void {
  const words = useNeteaseWords()
  return (song, options) => {
    if (!song.playable) {
      showToast(words.unplayableHint)
      return
    }
    expectSong(song)
    if (options?.inPlaylist) playSong(options.inPlaylist, song)
    else playFound(song)
    if (isInHost() && usePrefs.getState().playHints) showToast(words.queued)
  }
}

/** A song pressed on a page whose songs are that page's own list (a playlist's, a chart's, the day's). */
function usePlayFrom(list: string): (song: NeteaseSong) => void {
  const play = usePlay()
  return (song) => play(song, { inPlaylist: list })
}

/** A button that says so over the player when it asked for something (Play all, Refresh is silent). */
function useAskNote(): (text: string) => void {
  return (text) => {
    if (isInHost() && usePrefs.getState().playHints) showToast(text)
  }
}

// --- Home --------------------------------------------------------------------------------------------------

/** How many of the day's songs Home shows before its word for the rest (all of them play from Play all). */
const DAILY_SHOWN = 8

/** The day's card: a wide one of its own kind — its art at the left, its words and Play all at the right. */
function DailyCard({
  songs,
  onPlayAll,
  onToggle,
  all,
}: {
  songs: NeteaseSong[] | null
  onPlayAll(): void
  onToggle(): void
  all: boolean
}) {
  const words = useNeteaseWords()
  // The day the card is for: read once as it's drawn (the app is reopened every morning, not kept across days).
  const [today] = useState(() => new Date())
  const playable = songs?.some((song) => song.playable) ?? false
  return (
    <article className="ne-hero" aria-label={words.daily}>
      <div className="ne-hero-art" aria-hidden="true">
        <span className="ne-hero-disc">
          <DiscGlyph />
        </span>
        <span className="ne-hero-day">{today.getDate()}</span>
        <span className="ne-hero-kicker">{words.brand}</span>
      </div>
      <div className="ne-hero-text">
        <span className="ne-kicker">{words.dailyKicker}</span>
        <h2 className="ne-hero-name">{words.daily}</h2>
        <p className="ne-hero-tagline">{words.dailyTagline}</p>
        <p className="ne-hero-meta">
          <span>{words.dailyDate(today)}</span>
          {songs && <span>{words.songs(songs.length)}</span>}
        </p>
        <div className="ne-hero-actions">
          <button type="button" className="ne-play-all" onClick={onPlayAll} disabled={!playable}>
            <PlayGlyph />
            {words.playAll}
          </button>
          {songs && songs.length > DAILY_SHOWN && (
            <button type="button" className="ne-pill" onClick={onToggle}>
              {all ? words.showLess : words.showAll(songs.length)}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/** 私人雷达's card: its cover, its name and what it is. Pressed, its playlist's page. */
function RadarCard({ list }: { list: NeteaseList }) {
  const words = useNeteaseWords()
  const open = useNav((state) => state.open)
  return (
    <button
      type="button"
      className="ne-spot"
      onClick={() => open({ kind: 'playlist', id: list.id, name: list.name, cover: list.cover, plays: list.playCount })}
    >
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

/** Home, from its top: the day's own wide card (每日推荐, Play all) and its songs, the radar's row (私人雷达 and
 * 私人漫游's own card, which the web player has no entry for), then the recommended playlists on their shelf. */
export function HomePage({ active }: { active: boolean }) {
  const words = useNeteaseWords()
  const home = useNetease((state) => state.home)
  const asking = useNetease((state) => state.homeAsking)
  const heard = useNetease((state) => state.heard)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  // The day's own list: its songs' next and previous are the day's, even a song the account also has in a playlist
  // read earlier (owner 2026-11-20: a song played from 每日推荐 went on into 我喜欢的音乐).
  const play = usePlayFrom('daily')
  const note = useAskNote()
  const [allDaily, setAllDaily] = useState(false)
  const silent = useSilent(heard)
  // Home reads its page once the hidden page has said it runs (`heard`), and every time its tab comes back to
  // it (a read that's already known is not asked again). A reading that didn't come says so, and Refresh asks.
  useEffect(() => {
    if (active && heard) requestHome()
  }, [active, heard])
  const daily = home?.daily ?? null
  const playAll = () => {
    const first = daily?.find((song) => song.playable)
    if (!first) return
    expectSong(first)
    playDaily()
    note(words.queued)
  }
  // The recommended playlists: the account's own (个性化歌单) first, then the page's (热门推荐), each once.
  const playlists: NeteaseList[] = useMemo(() => {
    if (!home) return []
    const seen = new Set<string>()
    const lists: NeteaseList[] = []
    for (const list of [...home.personal, ...home.recommended]) {
      if (seen.has(list.id)) continue
      seen.add(list.id)
      lists.push(list)
    }
    return lists
  }, [home])
  const open = useNav((state) => state.open)
  return (
    <div className="ne-scroll ne-home">
      {(signedIn === false || signingIn) && (
        <p className="ne-banner">
          <PersonGlyph />
          <span>{signingIn ? words.signingInHint : `${words.signedOut} · ${words.signInHint}`}</span>
        </p>
      )}
      {!home ? (
        asking.failed || (silent && !asking.waiting) ? (
          <Failed text={asking.failed ? words.homeFailed : words.notConnected} retry={() => requestHome(true)} />
        ) : (
          <>
            <HeroSkeleton />
            <CardsSkeleton count={5} />
          </>
        )
      ) : (
        <>
          <section className="ne-daily">
            <DailyCard songs={daily} onPlayAll={playAll} onToggle={() => setAllDaily(!allDaily)} all={allDaily} />
            {daily === null ? (
              asking.failed ? (
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
                    <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={play} />
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
            {home.radar ? <RadarCard list={home.radar} /> : <RoamCard />}
            {home.radar && <RoamCard />}
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
              <div className="ne-shelf">
                {playlists.map((list) => (
                  <PlaylistCard
                    key={list.id}
                    list={list}
                    onOpen={() =>
                      open({
                        kind: 'playlist',
                        id: list.id,
                        name: list.name,
                        cover: list.cover,
                        plays: list.playCount,
                      })
                    }
                  />
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

// --- My playlists (歌单) -----------------------------------------------------------------------------------

/** My playlists: the account's own, by the group its own page puts them in (创建的歌单, 收藏的歌单), and the way
 * into the recent songs (听歌排行: the web player has no recent-play page of its own). */
export function LibraryPage({ active }: { active: boolean }) {
  const words = useNeteaseWords()
  const heard = useNetease((state) => state.heard)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const library = useNetease((state) => state.library)
  const asking = useNetease((state) => state.libraryAsking)
  const recent = useNetease((state) => state.recent)
  const recentAsking = useNetease((state) => state.recentAsking)
  const open = useNav((state) => state.open)
  const silent = useSilent(heard)
  // Its own page is read when the tab comes back to it (and by its Refresh): /my/ is where the groups are.
  useEffect(() => {
    if (!active || !heard) return
    requestLibrary()
    requestRecent()
  }, [active, heard])
  const groups: NeteaseLibraryGroup[] = library ?? []
  return (
    <div className="ne-scroll ne-library">
      <PageHead
        title={words.myPlaylists}
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
      {(signedIn === false || signingIn) && (
        <p className="ne-banner">
          <PersonGlyph />
          <span>{signingIn ? words.signingInHint : `${words.signedOut} · ${words.signInHint}`}</span>
        </p>
      )}
      <RecentEntry
        count={recent?.length ?? null}
        waiting={recentAsking.waiting}
        onOpen={() => open({ kind: 'recent' })}
      />
      {library === null ? (
        asking.failed || (silent && !asking.waiting) ? (
          <Failed text={asking.failed ? words.libraryFailed : words.notConnected} retry={() => requestLibrary(true)} />
        ) : (
          <CardsSkeleton count={5} />
        )
      ) : groups.length === 0 ? (
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
        groups.map((group) => (
          <section className="ne-section" key={group.title}>
            <SectionHead title={groupTitle(group.title, words)} hint={words.myPlaylistsCount(group.count)} />
            <div className="ne-grid">
              {group.playlists.map((list) => (
                <LibraryCard
                  key={list.id}
                  list={list}
                  onOpen={() =>
                    open({
                      kind: 'playlist',
                      id: list.id,
                      name: list.name,
                      cover: list.cover,
                      plays: list.playCount,
                    })
                  }
                />
              ))}
            </div>
          </section>
        ))
      )}
      {asking.failed && library !== null && <p className="ne-note">{words.libraryFailed}</p>}
    </div>
  )
}

// --- The charts (榜单) -------------------------------------------------------------------------------------

/** NetEase's own charts, each a playlist: its cover, its name, how often it updates and how long it is. */
export function RankingsPage({ active }: { active: boolean }) {
  const words = useNeteaseWords()
  const heard = useNetease((state) => state.heard)
  const rankings = useNetease((state) => state.rankings)
  const asking = useNetease((state) => state.rankingsAsking)
  const open = useNav((state) => state.open)
  const silent = useSilent(heard)
  useEffect(() => {
    if (active && heard) requestRankings()
  }, [active, heard])
  const openRanking = (ranking: NeteaseRanking) =>
    open({
      kind: 'ranking',
      id: ranking.id,
      name: ranking.name,
      cover: ranking.cover,
      plays: ranking.playCount,
      update: ranking.updateFrequency,
      official: ranking.official,
    })
  return (
    <div className="ne-scroll ne-rankings">
      <PageHead
        title={words.rankings}
        hint={words.rankingsHint}
        action={
          <button type="button" className="ne-pill" onClick={() => requestRankings(true)}>
            <RefreshGlyph />
            {words.refresh}
          </button>
        }
      />
      {rankings === null ? (
        asking.failed || (silent && !asking.waiting) ? (
          <Failed
            text={asking.failed ? words.rankingsFailed : words.notConnected}
            retry={() => requestRankings(true)}
          />
        ) : (
          <RankingsSkeleton count={6} />
        )
      ) : rankings.length === 0 ? (
        <EmptyState
          title={words.rankingsEmpty}
          text={words.rankingsEmptyHint}
          action={
            <button type="button" className="ne-pill" onClick={() => requestRankings(true)}>
              {words.retry}
            </button>
          }
        />
      ) : (
        <div className="ne-rank-grid">
          {rankings.map((ranking) => (
            <RankingCard key={ranking.id} ranking={ranking} onOpen={openRanking} />
          ))}
        </div>
      )}
      {asking.failed && rankings !== null && <p className="ne-note">{words.rankingsFailed}</p>}
    </div>
  )
}

// --- Search ------------------------------------------------------------------------------------------------

/** How many of a search's songs its page shows before its word for the rest (the whole answer is a page long). */
const SEARCH_SONGS_SHOWN = 8

/**
 * Search, under the app's own search bar: the words typed there, then NetEase's results as one page in its own
 * order — the artists it found first (a search for a singer is about the singer), then the songs, then the
 * playlists. A song plays, an artist opens their page, a playlist its own page.
 */
export function SearchPage() {
  const words = useNeteaseWords()
  const query = useNetease((state) => state.query)
  const search = useNetease((state) => state.search)
  const asking = useNetease((state) => state.searchAsking)
  const lists = useNetease((state) => state.lists)
  const home = useNetease((state) => state.home)
  const open = useNav((state) => state.open)
  // The search's own results: its songs' next and previous are the results', not a playlist's.
  const play = usePlayFrom('search')
  const [allSongs, setAllSongs] = useState(false)
  const history = useSearchHistory((state) => state.items)
  const rememberSearch = useSearchHistory((state) => state.add)
  const clearHistory = useSearchHistory((state) => state.clear)
  const wanted = query.trim()
  const shown = search && search.query === wanted ? search : null
  const sections = searchSections(shown)
  const counts = shown ? resultCounts(shown) : null
  // The still-empty page's playlists: Home's own picks (its taste), or the app's lists before Home is read.
  const suggestions = useMemo(() => suggestLists(home, lists), [home, lists])
  /** A kept search pressed: its words in the bar, and its results asked for at once (and moved to the front). */
  const recall = (entry: string) => {
    rememberSearch(entry)
    setQuery(entry)
    searchFor(entry)
  }
  const openList = (list: NeteaseList) => {
    stopTyping()
    open({ kind: 'playlist', id: list.id, name: list.name, cover: list.cover, plays: list.playCount })
  }
  const openArtist = (artist: NeteaseArtist) => {
    stopTyping()
    open({ kind: 'artist', id: artist.id, name: artist.name, cover: artist.cover })
  }
  const playOne = (song: NeteaseSong) => {
    stopTyping()
    play(song)
  }
  return (
    <div className="ne-scroll ne-search">
      {!wanted ? (
        <div className="ne-search-idle">
          <header className="ne-search-idle-head">
            <h2>{words.searchIdle}</h2>
            <p>{words.searchIdleHint}</p>
          </header>
          {/* What was searched before: three words at most, and the way to forget them. */}
          <section className="ne-section ne-search-history">
            <SectionHead
              title={words.searchHistory}
              hint={words.searchHistoryHint}
              action={
                history.length > 0 ? (
                  <button type="button" className="ne-history-clear" onClick={clearHistory}>
                    {words.searchHistoryClear}
                  </button>
                ) : undefined
              }
            />
            <div className="ne-chips ne-history-chips">
              {history.map((entry) => (
                <button key={entry} type="button" className="ne-chip" onClick={() => recall(entry)}>
                  {entry}
                </button>
              ))}
              {history.length === 0 && <p className="ne-note">{words.searchHistoryEmpty}</p>}
            </div>
          </section>
          {/* The playlists picked for the account's taste, with nothing typed. */}
          {suggestions.length > 0 && (
            <section className="ne-section">
              <SectionHead title={words.searchLike} hint={words.searchLikeHint} />
              <div className="ne-grid">
                {suggestions.map((list) => (
                  <PlaylistCard key={list.id} list={list} onOpen={openList} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : asking.waiting && !shown ? (
        <>
          <p className="ne-search-summary searching">{words.searching}</p>
          <ArtistsSkeleton count={5} />
          <RowsSkeleton count={6} />
        </>
      ) : asking.failed && !shown ? (
        <Failed text={words.searchFailed} retry={() => searchFor(query)} />
      ) : shown && shown.failed ? (
        <Failed text={words.searchFailed} retry={() => searchFor(query)} />
      ) : shown && !hasResults(shown) ? (
        <EmptyState title={words.searchEmpty} text={words.searchEmptyHint} />
      ) : shown && counts ? (
        <>
          <header className="ne-search-summary">
            <h2>{words.searchFor(wanted)}</h2>
            <p>{words.searchFound(counts.songs, counts.artists, counts.playlists)}</p>
          </header>
          {sections.map((section) => {
            if (section.kind === 'artists') {
              return (
                <section className="ne-section" key="artists">
                  <SectionHead title={words.searchArtists} hint={words.searchArtistFirst} />
                  <div className="ne-artist-row">
                    {shown.artists.map((artist) => (
                      <ArtistCard key={artist.id} artist={artist} onOpen={openArtist} />
                    ))}
                  </div>
                </section>
              )
            }
            if (section.kind === 'songs') {
              const songs = allSongs ? shown.songs : shown.songs.slice(0, SEARCH_SONGS_SHOWN)
              return (
                <section className="ne-section" key="songs">
                  <SectionHead title={words.searchSongs} hint={words.songs(section.total)} />
                  <div className="ne-songs">
                    {songs.map((song, index) => (
                      <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={playOne} />
                    ))}
                  </div>
                  {shown.songs.length > SEARCH_SONGS_SHOWN && (
                    <button type="button" className="ne-more" onClick={() => setAllSongs(!allSongs)}>
                      {allSongs ? words.showLess : words.showAll(shown.songs.length)}
                    </button>
                  )}
                </section>
              )
            }
            return (
              <section className="ne-section" key="playlists">
                <SectionHead title={words.searchPlaylists} hint={words.myPlaylistsCount(section.total)} />
                <div className="ne-grid">
                  {shown.playlists.map((list) => (
                    <PlaylistCard key={list.id} list={list} onOpen={openList} />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      ) : null}
    </div>
  )
}

// --- The account's own page (我的) -------------------------------------------------------------------------

/** One of the account's numbers, in its page's row. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="ne-stat">
      <b>{value}</b>
      <span>{label}</span>
    </span>
  )
}

/** The account's own page (the rail's 我的): its picture, name, signature, level and numbers, then the ways into
 * the recent songs, My playlists and the settings. */
export function ProfilePage({ active }: { active: boolean }) {
  const words = useNeteaseWords()
  const heard = useNetease((state) => state.heard)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const me = useNetease((state) => state.account)
  const profile = useNetease((state) => state.profile)
  const asking = useNetease((state) => state.profileAsking)
  const recent = useNetease((state) => state.recent)
  const recentAsking = useNetease((state) => state.recentAsking)
  const open = useNav((state) => state.open)
  const openTab = useNav((state) => state.openTab)
  const silent = useSilent(heard)
  const account = accountOf({ signedIn, signingIn })
  useEffect(() => {
    if (active && heard) {
      requestProfile()
      requestRecent()
    }
  }, [active, heard])
  const name = profile?.name || me?.name || words.mine
  const avatar = profile?.avatar ?? me?.avatar ?? null
  const signIn = () => {
    netease({ action: 'signIn' })
    showToast(words.signingInHint)
  }
  return (
    <div className="ne-scroll ne-profile-page">
      <PageHead
        title={words.profile}
        hint={words.profileHint}
        action={
          <button
            type="button"
            className="ne-pill"
            onClick={() => {
              requestProfile(true)
              requestRecent(true)
            }}
          >
            <RefreshGlyph />
            {words.refresh}
          </button>
        }
      />
      {account === 'out' ? (
        <EmptyState
          title={words.profileUnread}
          text={words.profileUnreadHint}
          action={
            <button type="button" className="ne-pill on-accent" onClick={signIn}>
              {words.signIn}
            </button>
          }
        />
      ) : account === 'unknown' && !profile ? (
        <ProfileSkeleton />
      ) : (
        <section className={`ne-profile ${account === 'in' ? 'signed' : ''}`}>
          {profile?.background && <img className="ne-profile-bg" src={profile.background} alt="" draggable={false} />}
          <div className="ne-profile-hero">
            <span className="ne-avatar">
              {avatar ? <img src={avatar} alt="" draggable={false} /> : <PersonGlyph />}
              {profile && profile.level > 0 && <em className="ne-avatar-level">{words.levelValue(profile.level)}</em>}
            </span>
            <div className="ne-profile-text">
              <h2 className="ne-profile-name">{name}</h2>
              <p className="ne-profile-sign">
                {profile?.signature || (account === 'in' ? words.signatureEmpty : words.unknownAccount)}
              </p>
              <p className="ne-profile-tags">
                {profile && profile.vipType > 0 && <span className="ne-tag accent">{words.vip}</span>}
                {profile && profile.uid && (
                  <span className="ne-tag">
                    {words.uid} {profile.uid}
                  </span>
                )}
                {profile && profile.createDays > 0 && (
                  <span className="ne-tag">{words.createDaysValue(profile.createDays)}</span>
                )}
                {signingIn && <span className="ne-tag accent">{words.signingIn}</span>}
              </p>
            </div>
          </div>
          {profile ? (
            <div className="ne-profile-stats">
              <Stat label={words.follows} value={String(profile.follows)} />
              <Stat label={words.fans} value={String(profile.fans)} />
              <Stat label={words.listenSongs} value={words.listenSongsCount(profile.listenSongs)} />
              <Stat label={words.playlists} value={words.playlistCount(profile.playlistCount)} />
            </div>
          ) : asking.failed || (silent && !asking.waiting) ? (
            <p className="ne-note">{asking.failed ? words.profileFailed : words.notConnected}</p>
          ) : (
            <div className="ne-profile-stats ne-skeleton" role="progressbar" aria-label="…">
              {Array.from({ length: 4 }, (_, index) => (
                <span className="ne-stat" key={index}>
                  <span className="ne-skel-line" />
                  <span className="ne-skel-line short" />
                </span>
              ))}
            </div>
          )}
        </section>
      )}
      {signingIn && (
        <p className="ne-banner">
          <PersonGlyph />
          <span>{words.signingInHint}</span>
        </p>
      )}
      <div className="ne-entries">
        {account !== 'out' && (
          <RecentEntry
            count={recent?.length ?? null}
            waiting={recentAsking.waiting}
            onOpen={() => open({ kind: 'recent' })}
          />
        )}
        <EntryRow
          glyph={<LibraryGlyph />}
          title={words.myPlaylists}
          hint={words.myPlaylistsHint}
          onClick={() => openTab('playlists')}
        />
        <EntryRow
          glyph={<GearGlyph />}
          title={words.settings}
          hint={words.settingsHint}
          onClick={() => open({ kind: 'settings' })}
        />
      </div>
    </div>
  )
}

// --- Settings ----------------------------------------------------------------------------------------------

/** A settings row: its name and one line, with its control at the end. */
function SettingRow({ title, hint, control }: { title: string; hint?: string; control: ReactNode }) {
  return (
    <div className="ne-set-row">
      <span className="ne-set-text">
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </span>
      {control}
    </div>
  )
}

/** A settings choice of two: the chosen one filled in the accent. */
function SettingChoice<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  label: string
  onChange(value: T): void
}) {
  return (
    <div className="ne-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'on' : undefined}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The settings (from 我的): the look and the motion, what the player may say, the account, and about the app. */
export function SettingsPage() {
  const words = useNeteaseWords()
  const style = useNetease((state) => state.style)
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const me = useNetease((state) => state.account)
  const profile = useNetease((state) => state.profile)
  const motion = usePrefs((state) => state.motion)
  const playHints = usePrefs((state) => state.playHints)
  const setMotion = usePrefs((state) => state.setMotion)
  const setPlayHints = usePrefs((state) => state.setPlayHints)
  const account = accountOf({ signedIn, signingIn })
  const signIn = () => netease({ action: 'signIn' })
  const signOut = () => netease({ action: 'signOut' })
  return (
    <div className="ne-scroll ne-settings">
      <PageHead title={words.settings} hint={words.settingsHint} />
      <section className="ne-set-group" aria-label={words.appearance}>
        <SectionHead title={words.appearance} hint={words.appearanceHint} />
        <SettingRow
          title={words.style}
          hint={words.styleHint}
          control={
            <SettingChoice
              value={style}
              options={[
                { value: 'follow', label: words.styleFollow },
                { value: 'red', label: words.styleRed },
              ]}
              label={words.style}
              onChange={(value) => setStyle(value)}
            />
          }
        />
        <SettingRow
          title={words.motion}
          hint={words.motionHint}
          control={
            <SettingChoice<Motion>
              value={motion}
              options={[
                { value: 'full', label: words.motionFull },
                { value: 'calm', label: words.motionCalm },
              ]}
              label={words.motion}
              onChange={(value) => setMotion(value)}
            />
          }
        />
      </section>
      <section className="ne-set-group" aria-label={words.sound}>
        <SectionHead title={words.sound} hint={words.soundHint} />
        <SettingRow title={words.quality} control={<span className="ne-set-value">{words.qualityAccount}</span>} />
        <SettingRow
          title={words.playHints}
          hint={words.playHintsHint}
          control={
            <SettingChoice
              value={playHints ? 'on' : 'off'}
              options={[
                { value: 'on', label: words.toggleOn },
                { value: 'off', label: words.toggleOff },
              ]}
              label={words.playHints}
              onChange={(value) => setPlayHints(value === 'on')}
            />
          }
        />
      </section>
      <section className="ne-set-group" aria-label={words.loginInfo}>
        <SectionHead title={words.loginInfo} hint={words.loginInfoHint} />
        <SettingRow
          title={profile?.name || me?.name || words.brand}
          hint={
            account === 'in'
              ? `${words.signedIn}${profile?.uid ? ` · ${words.uid} ${profile.uid}` : ''}`
              : account === 'signingIn'
                ? words.signingIn
                : account === 'out'
                  ? words.signedOut
                  : words.unknownAccount
          }
          control={
            account === 'in' ? (
              <button type="button" className="ne-pill danger" onClick={signOut}>
                {words.signOut}
              </button>
            ) : (
              <button type="button" className="ne-pill on-accent" onClick={signIn} disabled={signingIn}>
                {signingIn ? words.signingIn : words.signIn}
              </button>
            )
          }
        />
        {account === 'in' && <p className="ne-note">{words.signOutHint}</p>}
      </section>
      <section className="ne-set-group" aria-label={words.about}>
        <SectionHead title={words.about} />
        <SettingRow
          title={words.aboutApp}
          control={!isInHost() ? <span className="ne-tag accent">{words.preview}</span> : null}
        />
        <p className="ne-note">{words.aboutData}</p>
        <p className="ne-note">{words.aboutPlayer}</p>
        <p className="ne-note">{words.aboutNote}</p>
        {!isInHost() && <p className="ne-note">{words.aboutPreview}</p>}
      </section>
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
  // The recent songs' own list.
  const play = usePlayFrom('recent')
  const note = useAskNote()
  useEffect(() => {
    requestRecent()
  }, [])
  const playAll = () => {
    const first = songs?.find((song) => song.playable)
    if (!first) return
    expectSong(first)
    playSong('recent', first)
    note(words.queued)
  }
  return (
    <div className="ne-scroll ne-detail-page">
      <PageHead
        title={words.recent}
        hint={words.recentSource}
        action={
          <div className="ne-head-actions">
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
        }
      />
      <p className="ne-note">{words.recentHost}</p>
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
            <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={play} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- An artist's page ---------------------------------------------------------------------------------------

/** An artist's page: their picture, name, alias and introduction, Play all, then their most played songs (a page
 * the host's hidden page answers with an `artist` message). */
export function ArtistPage({ page }: { page: Page }) {
  const words = useNeteaseWords()
  const card = page.kind === 'artist' ? page : null
  const artistId = card?.id ?? ''
  const found = useNetease((state) => state.artists[artistId])
  const all = useNetease((state) => state.artistSongs[artistId])
  const albums = useNetease((state) => state.artistAlbums[artistId])
  // The artist's own list of songs (their 热门 first page, then their 全部歌曲).
  const play = usePlayFrom(`artist:${artistId}`)
  const note = useAskNote()
  const name = found?.name || card?.name || words.artist
  const cover = found?.cover ?? card?.cover ?? null
  const songs = found?.songs ?? null
  const [tab, setTab] = useState<'hot' | 'all' | 'albums'>(() => artistPageAt.get(artistId) ?? 'hot')
  useEffect(() => {
    artistPageAt.set(artistId, tab)
  }, [artistId, tab])
  useEffect(() => {
    if (artistId) retryArtist(artistId)
  }, [artistId])
  useEffect(() => {
    if (!artistId) return
    if (tab === 'all') requestArtistSongs(artistId)
    if (tab === 'albums') requestArtistAlbums(artistId)
  }, [tab, artistId])
  const playAll = (list: NeteaseSong[] | null) => {
    const first = list?.find((song) => song.playable)
    if (!first) return
    expectSong(first)
    playSong(`artist:${artistId}`, first)
    note(words.queued)
  }
  const allSongs = all?.songs ?? []
  const albumList = albums?.albums ?? []
  const moreSongs = tab === 'all' && all?.more
  const moreAlbums = tab === 'albums' && albums?.more
  return (
    <div className="ne-scroll ne-detail-page ne-artist-page">
      <header className="ne-detail-head">
        <Cover name={name} cover={cover} className="ne-detail-cover round" />
        <div className="ne-detail-text">
          <span className="ne-kicker">{words.artist}</span>
          <h2 className="ne-detail-name">{name}</h2>
          {found?.alias && <p className="ne-detail-sub">{found.alias}</p>}
          <p className="ne-detail-meta">
            {found?.musicSize ? <span>{words.songs(found.musicSize)}</span> : songs && <span>{words.songs(songs.length)}</span>}
            {found?.albumSize ? <span>{words.albumCount(found.albumSize)}</span> : null}
            {found?.fans ? <span>{words.fanCount(found.fans)}</span> : null}
            {found?.waiting && !songs && <span>{words.loading}</span>}
          </p>
          {found?.description && <p className="ne-detail-desc">{found.description}</p>}
        </div>
        <div className="ne-detail-actions">
          {songs && songs.length > 0 && tab !== 'albums' && (
            <button type="button" className="ne-play-all" onClick={() => playAll(tab === 'all' ? allSongs : songs)}>
              <PlayGlyph />
              {words.playAll}
            </button>
          )}
        </div>
      </header>
      <div className="ne-artist-tabs" role="tablist" aria-label={words.artist}>
        {(['hot', 'all', 'albums'] as const).map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            aria-selected={tab === each}
            className={tab === each ? 'ne-artist-tab on' : 'ne-artist-tab'}
            onClick={() => setTab(each)}
          >
            {each === 'hot' ? words.artistHint : each === 'all' ? words.artistAll : words.album}
          </button>
        ))}
      </div>
      {tab === 'hot' &&
        (!found || (found.waiting && !songs) ? (
          <RowsSkeleton count={8} />
        ) : found.failed && !songs ? (
          <Failed text={words.artistFailed} retry={() => retryArtist(artistId)} />
        ) : !songs || songs.length === 0 ? (
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
          <>
            {found.failed && <p className="ne-note">{words.artistFailed}</p>}
            <div className="ne-songs">
              {songs.map((song, index) => (
                <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={play} />
              ))}
            </div>
            <div className="ne-more-row">
              <button type="button" className="ne-pill" onClick={() => setTab('all')}>
                {words.showAllSongs}
              </button>
            </div>
          </>
        ))}
      {tab === 'all' &&
        (!all || (all.waiting && allSongs.length === 0) ? (
          <RowsSkeleton count={8} />
        ) : allSongs.length === 0 ? (
          <p className="ne-note">{words.artistEmpty}</p>
        ) : (
          <>
            <div className="ne-songs">
              {allSongs.map((song, index) => (
                <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={play} />
              ))}
            </div>
            <div className="ne-more-row">
              {moreSongs && (
                <button
                  type="button"
                  className="ne-pill"
                  disabled={all?.waiting}
                  onClick={() => requestArtistSongs(artistId, (all?.offset ?? 0) + 200)}
                >
                  {all?.waiting ? words.loading : words.loadMore}
                </button>
              )}
            </div>
          </>
        ))}
      {tab === 'albums' &&
        (!albums || (albums.waiting && albumList.length === 0) ? (
          <RowsSkeleton count={6} />
        ) : albumList.length === 0 ? (
          <p className="ne-note">{words.albumEmpty}</p>
        ) : (
          <>
            <div className="ne-albums">
              {albumList.map((album) => (
                <div key={album.id} className="ne-album">
                  <Cover name={album.name} cover={album.cover} className="ne-album-cover" />
                  <span className="ne-album-name">{album.name}</span>
                  <span className="ne-album-meta">
                    {album.year ? `${album.year} · ` : ''}
                    {words.albumSongs(album.size)}
                  </span>
                </div>
              ))}
            </div>
            <div className="ne-more-row">
              {moreAlbums && (
                <button
                  type="button"
                  className="ne-pill"
                  disabled={albums?.waiting}
                  onClick={() => requestArtistAlbums(artistId, (albums?.offset ?? 0) + 60)}
                >
                  {albums?.waiting ? words.loading : words.loadMore}
                </button>
              )}
            </div>
          </>
        ))}
    </div>
  )
}

// --- A playlist's page -------------------------------------------------------------------------------------

/** A playlist's page: its cover, its name and numbers, Play all, then its songs. Its head comes from whichever
 * reading already knows it (the card that opened it, Home, My playlists, a search), so it draws before the
 * hidden page's own answer. */
export function PlaylistPage({ page }: { page: Page }) {
  const words = useNeteaseWords()
  const card = page.kind === 'playlist' ? page : null
  const playlistId = card?.id ?? ''
  const found = useNetease((state) => state.playlists[playlistId])
  const known = usePlaylistMeta(playlistId)
  const play = usePlayFrom(playlistId)
  const note = useAskNote()
  const head = found?.meta ?? null
  const name = head?.name || known?.name || card?.name || words.playlist
  const cover = head?.cover ?? known?.cover ?? card?.cover ?? null
  const plays = head?.playCount || known?.playCount || card?.plays || 0
  const songs = found?.songs ?? null
  // A list of a thousand songs is drawn a part at a time (the page stays quick): the rest at a press.
  const [shown, setShownState] = useState(() => drawnAt.get(`playlist:${playlistId}`) ?? 120)
  const setShown = (next: number | ((count: number) => number)) => {
    setShownState((count) => {
      const wanted = typeof next === 'function' ? next(count) : next
      drawnAt.set(`playlist:${playlistId}`, wanted)
      return wanted
    })
  }
  useEffect(() => {
    setShown(drawnAt.get(`playlist:${playlistId}`) ?? 120)
    if (playlistId) retryPlaylist(playlistId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId])
  const playAll = () => {
    const first = songs?.find((song) => song.playable)
    if (!first) return
    expectSong(first)
    playPlaylist(playlistId)
    note(words.queued)
  }
  return (
    <div className="ne-scroll ne-detail-page">
      <header className="ne-detail-head">
        <Cover name={name} cover={cover} className="ne-detail-cover" />
        <div className="ne-detail-text">
          <span className="ne-kicker">{words.playlist}</span>
          <h2 className="ne-detail-name">{name}</h2>
          <p className="ne-detail-meta">
            {plays > 0 && <span>{words.plays(plays)}</span>}
            {songs && <span>{words.songs(songs.length)}</span>}
            {head?.creator && <span>{words.by(head.creator)}</span>}
          </p>
          {head?.description && <p className="ne-detail-desc">{head.description}</p>}
        </div>
        <div className="ne-detail-actions">
          {songs && songs.length > 0 && (
            <button type="button" className="ne-play-all" onClick={playAll}>
              <PlayGlyph />
              {words.playAll}
            </button>
          )}
          <button type="button" className="ne-pill" onClick={() => retryPlaylist(playlistId)}>
            <RefreshGlyph />
            {words.refresh}
          </button>
        </div>
      </header>
      {!found || (found.waiting && !songs) ? (
        <RowsSkeleton count={8} />
      ) : found.failed && !songs ? (
        <Failed text={words.failed} retry={() => retryPlaylist(playlistId)} />
      ) : !songs || songs.length === 0 ? (
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
        <>
          {found.failed && <p className="ne-note">{words.failed}</p>}
          <div className="ne-songs">
            {songs.slice(0, shown).map((song, index) => (
              <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={play} />
            ))}
          </div>
          {songs.length > shown && (
            <div className="ne-more-row">
              <button type="button" className="ne-pill" onClick={() => setShown((count) => count + 240)}>
                {words.showMore}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// --- A ranking's page --------------------------------------------------------------------------------------

/** One of NetEase's charts, opened: its cover, its name, how often it updates, Play all, then its songs (the
 * charts are playlists in NetEase's own right, so their songs come as a `playlist` answer under the chart's id). */
export function RankingPage({ page }: { page: Page }) {
  const words = useNeteaseWords()
  const card = page.kind === 'ranking' ? page : null
  const rankingId = card?.id ?? ''
  const found = useNetease((state) => state.playlists[rankingId])
  const known = useRankingMeta(rankingId)
  const play = usePlayFrom(rankingId)
  const note = useAskNote()
  const head = found?.meta ?? null
  const name = head?.name || known?.name || card?.name || words.ranking
  const cover = head?.cover ?? known?.cover ?? card?.cover ?? null
  const update = head?.updateFrequency || known?.updateFrequency || card?.update || ''
  const plays = head?.playCount || known?.playCount || card?.plays || 0
  const songs = found?.songs ?? null
  // Its own list of a thousand songs, drawn a part at a time.
  const [shown, setShownState] = useState(() => drawnAt.get(`ranking:${rankingId}`) ?? 120)
  const setShown = (next: number | ((count: number) => number)) => {
    setShownState((count) => {
      const wanted = typeof next === 'function' ? next(count) : next
      drawnAt.set(`ranking:${rankingId}`, wanted)
      return wanted
    })
  }
  useEffect(() => {
    setShown(drawnAt.get(`ranking:${rankingId}`) ?? 120)
    if (rankingId) retryRanking(rankingId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingId])
  const playAll = () => {
    const first = songs?.find((song) => song.playable)
    if (!first) return
    expectSong(first)
    playPlaylist(rankingId)
    note(words.queued)
  }
  return (
    <div className="ne-scroll ne-detail-page">
      <header className="ne-detail-head">
        <Cover name={name} cover={cover} className="ne-detail-cover" />
        <div className="ne-detail-text">
          <span className="ne-kicker">
            {words.ranking}
            {card?.official && ` · ${words.official}`}
          </span>
          <h2 className="ne-detail-name">{name}</h2>
          <p className="ne-detail-meta">
            {update && <span>{update}</span>}
            {songs && <span>{words.songs(songs.length)}</span>}
            {plays > 0 && <span>{words.plays(plays)}</span>}
          </p>
          {head?.description && <p className="ne-detail-desc">{head.description}</p>}
        </div>
        <div className="ne-detail-actions">
          {songs && songs.length > 0 && (
            <button type="button" className="ne-play-all" onClick={playAll}>
              <PlayGlyph />
              {words.playAll}
            </button>
          )}
          <button type="button" className="ne-pill" onClick={() => retryRanking(rankingId)}>
            <RefreshGlyph />
            {words.refresh}
          </button>
        </div>
      </header>
      {!found || (found.waiting && !songs) ? (
        <RowsSkeleton count={10} />
      ) : found.failed && !songs ? (
        <Failed text={words.rankingsFailed} retry={() => retryRanking(rankingId)} />
      ) : !songs || songs.length === 0 ? (
        <EmptyState
          title={words.emptyPlaylist}
          text={words.emptyPlaylistHint}
          action={
            <button type="button" className="ne-pill" onClick={() => retryRanking(rankingId)}>
              {words.retry}
            </button>
          }
        />
      ) : (
        <>
          {found.failed && <p className="ne-note">{words.rankingsFailed}</p>}
          <div className="ne-songs">
            {songs.slice(0, shown).map((song, index) => (
              <SongRow key={`${song.id}:${index}`} song={song} index={index} onPlay={play} />
            ))}
          </div>
          {songs.length > shown && (
            <div className="ne-more-row">
              <button type="button" className="ne-pill" onClick={() => setShown((count) => count + 240)}>
                {words.showMore}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// --- The pages ---------------------------------------------------------------------------------------------

/** A page over a tab's own (its own head and its own way back, in the bar at the top). */
export function PageBody({ page }: { page: Page }) {
  switch (page.kind) {
    case 'playlist':
      return <PlaylistPage page={page} />
    case 'artist':
      return <ArtistPage page={page} />
    case 'ranking':
      return <RankingPage page={page} />
    case 'recent':
      return <RecentPage />
    case 'settings':
      return <SettingsPage />
  }
}

/** A tab's own page (each stays where it was left, so it's drawn whether it shows or not). */
export function TabPage({ tab, active }: { tab: Tab; active: boolean }) {
  switch (tab) {
    case 'home':
      return <HomePage active={active} />
    case 'playlists':
      return <LibraryPage active={active} />
    case 'rankings':
      return <RankingsPage active={active} />
    case 'mine':
      return <ProfilePage active={active} />
    case 'now':
      return <NowPlayingPage />
    case 'search':
      return <SearchPage />
  }
}
