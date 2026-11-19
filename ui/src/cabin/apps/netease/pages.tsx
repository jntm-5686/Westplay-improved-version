import { useEffect, useMemo, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { TextField } from '../../keyboard/TextField'
import { BackGlyph, PersonGlyph, PlayGlyph, RefreshGlyph, SearchGlyph, UnplayableGlyph } from './glyphs'
import { CardsSkeleton, Cover, EmptyState, Failed, PageHead, PlaylistCard, RowsSkeleton, SongRow, clock } from './parts'
import {
  accountOf,
  goBack,
  openPlaylist,
  playHistorySong,
  playPlaylist,
  playSong,
  refresh,
  retryPlaylist,
  showToast,
  useNetease,
  type NeteaseSong,
  type View,
} from './netease'
import { useNeteaseWords } from './strings'

/** The NetEase app's pages: Home's playlists, a playlist's songs, Search, and My Music. */

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

// --- Home --------------------------------------------------------------------------------------------------

/** Home: NetEase's recommended playlists, as cards, with Refresh at the title's end. */
export function Home() {
  const words = useNeteaseWords()
  const lists = useNetease((state) => state.lists)
  const heard = useNetease((state) => state.heard)
  const silent = useSilent(heard)
  return (
    <div className="ne-scroll ne-home">
      <PageHead
        title={words.recommended}
        hint={words.recommendedHint}
        action={
          <button type="button" className="ne-pill" onClick={refresh}>
            <RefreshGlyph />
            {words.refresh}
          </button>
        }
      />
      {!heard ? (
        silent ? (
          <Failed text={words.notConnected} retry={refresh} />
        ) : (
          <CardsSkeleton count={6} />
        )
      ) : lists.length === 0 ? (
        <EmptyState title={words.emptyLists} text={words.emptyListsHint} />
      ) : (
        <div className="ne-grid">
          {lists.map((list) => (
            <PlaylistCard key={list.id} list={list} onOpen={() => openPlaylist(list.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- My Music ----------------------------------------------------------------------------------------------

/** My Music: the account as NetEase's page says it, and what this screen has played (the app's own memory). */
export function Mine() {
  const words = useNeteaseWords()
  const signedIn = useNetease((state) => state.signedIn)
  const signingIn = useNetease((state) => state.signingIn)
  const history = useNetease((state) => state.history)
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
    account === 'in'
      ? ''
      : account === 'signingIn'
        ? words.signingInHint
        : account === 'out'
          ? words.signInHint
          : words.signInHint
  return (
    <div className="ne-scroll ne-mine">
      <PageHead title={words.mine} />
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
      <section className="ne-section">
        <div className="ne-section-head">
          <h3>{words.recent}</h3>
          <span>{isInHost() ? words.recentHost : words.recentHint}</span>
        </div>
        {history.length === 0 ? (
          <p className="ne-note">{words.recentEmpty}</p>
        ) : (
          <div className="ne-songs ne-recent">
            {history.map((song, index) => (
              <RecentRow key={song.id} song={song} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/** A song of the recent list: pressed in a browser's preview, it plays (WestPlay's protocol has no such
 * command yet, so there it's a record only). */
function RecentRow({ song, index }: { song: NeteaseSong; index: number }) {
  const words = useNeteaseWords()
  if (!isInHost()) return <SongRow song={song} index={index} onPlay={playHistorySong} />
  return (
    <div className="ne-song static">
      <span className="ne-song-index">{index + 1}</span>
      <span className="ne-song-text">
        <span className="ne-song-title">{song.title}</span>
        <span className="ne-song-artist">{song.artist}</span>
      </span>
      {!song.playable && (
        <span className="ne-badge" title={words.unplayableHint}>
          <UnplayableGlyph />
          {words.unplayable}
        </span>
      )}
      <span className="ne-song-time">{clock(song.duration)}</span>
    </div>
  )
}

// --- Search ------------------------------------------------------------------------------------------------

/** Search, v1: what the app already holds (playlists' names, and the songs of playlists it has opened). */
export function Search() {
  const words = useNeteaseWords()
  const lists = useNetease((state) => state.lists)
  const playlists = useNetease((state) => state.playlists)
  const [query, setQuery] = useState('')
  const wanted = query.trim().toLocaleLowerCase()
  const found = useMemo(() => {
    if (!wanted) return null
    const named = lists.filter((list) => list.name.toLocaleLowerCase().includes(wanted))
    const songs: { song: NeteaseSong; listId: string }[] = []
    for (const [listId, page] of Object.entries(playlists)) {
      for (const song of page.songs ?? []) {
        if (song.title.toLocaleLowerCase().includes(wanted) || song.artist.toLocaleLowerCase().includes(wanted)) {
          songs.push({ song, listId })
        }
      }
    }
    return { named, songs }
  }, [wanted, lists, playlists])
  const hot = lists.slice(0, 6)
  return (
    <div className="ne-scroll ne-search">
      <PageHead title={words.search} hint={words.searchNote} />
      <div className="ne-search-field">
        <TextField
          id={SEARCH_FIELD}
          value={query}
          onChange={setQuery}
          returnKind="search"
          hint={words.searchHint}
          label={words.searchHint}
          icon={<SearchGlyph />}
        />
      </div>
      {!found ? (
        hot.length > 0 && (
          <section className="ne-section">
            <div className="ne-section-head">
              <h3>{words.searchHot}</h3>
            </div>
            <div className="ne-chips">
              {hot.map((list) => (
                <button key={list.id} type="button" className="ne-chip" onClick={() => setQuery(list.name)}>
                  {list.name}
                </button>
              ))}
            </div>
          </section>
        )
      ) : found.named.length === 0 && found.songs.length === 0 ? (
        <EmptyState title={words.searchEmpty} text={words.searchEmptyHint} />
      ) : (
        <>
          {found.named.length > 0 && (
            <section className="ne-section">
              <div className="ne-section-head">
                <h3>{words.searchPlaylists}</h3>
              </div>
              <div className="ne-grid">
                {found.named.map((list) => (
                  <PlaylistCard key={list.id} list={list} onOpen={() => openPlaylist(list.id)} />
                ))}
              </div>
            </section>
          )}
          {found.songs.length > 0 && (
            <section className="ne-section">
              <div className="ne-section-head">
                <h3>{words.searchSongs}</h3>
              </div>
              <div className="ne-songs">
                {found.songs.map(({ song, listId }, index) => (
                  <SongRow
                    key={`${listId}:${song.id}`}
                    song={song}
                    index={index}
                    onPlay={() => {
                      if (!song.playable) {
                        showToast(words.unplayableHint)
                        return
                      }
                      playSong(listId, song)
                      if (isInHost()) showToast(words.queued)
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// --- A playlist's page -------------------------------------------------------------------------------------

/** A playlist's page: its cover, its name and numbers, Play all, then its songs (a page the host's hidden page
 * answers with a `playlist` message). */
export function PlaylistPage({ view }: { view: View }) {
  const words = useNeteaseWords()
  const page = useNetease((state) => state.playlists[view.playlistId])
  const list = useNetease((state) => state.lists.find((each) => each.id === view.playlistId))
  const name = list?.name ?? words.playlist
  const songs = page?.songs ?? null
  const playAll = () => {
    playPlaylist(view.playlistId)
    if (isInHost()) showToast(words.queued)
  }
  const playOne = (song: NeteaseSong) => {
    if (!song.playable) {
      showToast(words.unplayableHint)
      return
    }
    playSong(view.playlistId, song)
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
        <Failed text={words.failed} retry={() => retryPlaylist(view.playlistId)} />
      ) : songs && songs.length === 0 ? (
        <EmptyState
          title={words.emptyPlaylist}
          text={words.emptyPlaylistHint}
          action={
            <button type="button" className="ne-pill" onClick={() => retryPlaylist(view.playlistId)}>
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
    case 'playlist':
      return <PlaylistPage view={view} />
  }
}
