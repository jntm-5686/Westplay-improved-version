import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { isInHost, postToHost, subscribeHostMessages } from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { sourceOf } from './source'
import { createPreview, type Preview } from './preview'

/**
 * The NetEase Cloud Music app's state. WestPlay draws the app itself, in the manner of NetEase's own desktop
 * player (a rail, a card grid, a player at the foot), while NetEase's page runs hidden in the host
 * (crates/host netease.rs) as the player: it signs in, keeps the account's rights, and says what plays.
 *
 * The app talks to it the way the other music apps talk to their pages: `{ type: 'netease', kind }` messages
 * come back through the same WebView2 channel (shared/host.ts), and commands go the other way. In a plain
 * browser the invented preview answers instead (preview.ts), so the whole screen can be looked at without the
 * host.
 *
 * v1 was deliberately thin: the recommended playlists of Home, a playlist's songs, what plays, and the player's
 * controls and volume. v2 follows the account's own page: Home is the day's own songs (每日歌曲推荐) with 私人雷达
 * and the recommended playlists under it, My Music has every playlist of the account's (创建的和收藏的, by group)
 * and its recent songs (听歌排行 for the week: the web player keeps no 最近播放 page of its own), and Search is the
 * page's own search. There is still no comment, radio, podcast or cloud part at all, and none of the page's ads is
 * ever read.
 */

/** One of Home's recommended playlists, as the host's hidden page says (`netease` `state`). */
export interface NeteaseList {
  id: string
  name: string
  cover: string | null
  playCount: number
}

/** What plays, as the host's hidden page says. `playable`: NetEase's rights allow it (VIP, region, copyright). */
export interface NeteaseTrack {
  /** NetEase's id, when the page gave one (v1's state message may leave it out). */
  id?: string
  title: string
  artist: string
  album: string
  cover: string | null
  /** Seconds. */
  duration: number
  /** Seconds into it when the state said so. */
  position: number
  playable: boolean
}

/** A song of a playlist (`netease` `playlist` message). */
export interface NeteaseSong {
  id: string
  title: string
  artist: string
  duration: number
  playable: boolean
}

/** Whose account it is, as NetEase's own top bar says it. */
export interface NeteaseAccount {
  name: string
  avatar: string | null
}

/** A playlist of the account's own (My Music's groups: 创建的歌单, 收藏的歌单). */
export interface NeteaseLibraryPlaylist extends NeteaseList {
  /** How many songs it has, as My Music's side says. */
  songCount: number
  /** Who it's by for one collected; empty for one the account made. */
  by: string
}

/** One of My Music's groups of playlists (创建的歌单, 收藏的歌单), as its side lists them. */
export interface NeteaseLibraryGroup {
  title: string
  count: number
  playlists: NeteaseLibraryPlaylist[]
}

/** Home as the host's page shows it: the day's own songs (每日歌曲推荐), the account's 私人雷达, its other
 * personalised playlists and the recommended ones. The day's songs are `null` while their page is still coming. */
export interface NeteaseHome {
  daily: NeteaseSong[] | null
  radar: NeteaseList | null
  personal: NeteaseList[]
  recommended: NeteaseList[]
}

/** A search's songs, as the host's page searched them (`netease` `search`). */
export interface NeteaseSearch {
  query: string
  songs: NeteaseSong[]
}

/** Whether something asked of the host's page is still coming, and whether it didn't come. */
export interface Asking {
  waiting: boolean
  failed: boolean
}

/** No answer looked for, or the last one came. */
export const IDLE_ASKING: Asking = { waiting: false, failed: false }

/** The whole state the host's page sends (`netease` `state`). */
export interface NeteasePlayerState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean
  /** 0 to 1. */
  volume: number
  track: NeteaseTrack | null
  lists: NeteaseList[]
  /** The account's name and picture, once its page knows it. */
  account?: NeteaseAccount | null
}

/** A command for the host's hidden page (`crates/host netease.rs`). */
export type NeteaseCommand =
  /** Runs the hidden page, saying whether it's signed in. */
  | { action: 'start' }
  /** Opens NetEase's sign-in: the companion's account page's, not the cab's (the page is hidden). */
  | { action: 'signIn' | 'signOut' }
  /** Continues playing; with a song's id, plays that song (the host clicks its row in the hidden page). */
  | { action: 'play'; value?: string }
  | { action: 'pause' | 'next' | 'prev' | 'refresh' }
  | { action: 'seek'; value: number }
  | { action: 'volume'; value: number }
  /** Opens a playlist in the hidden page; its songs come back as a `playlist` message. */
  | { action: 'openPlaylist'; value: string }
  /** Reads Home again: the day's songs and the page's shelves, answered with a `home` message. */
  | { action: 'home' }
  /** Reads the account's own playlists again, answered with a `library` message. */
  | { action: 'library' }
  /** Search the page for these words, answered with a `search` message. */
  | { action: 'search'; value: string }
  /** Reads the account's recent songs, answered with a `recent` message. */
  | { action: 'recent' }

/** The app's own tabs, as its rail shows them. */
export type Tab = 'home' | 'mine' | 'search' | 'now'

/** A page over a tab's own. */
export type View = { id: number; kind: 'playlist'; playlistId: string } | { id: number; kind: 'recent' }

/** How the app is drawn: WestPlay's own neutral look, or NetEase's red. Both follow the cab's light or dark. */
export type Style = 'follow' | 'red'

/** What's known of a playlist page: its songs, asked of the hidden page. */
export interface PlaylistPage {
  songs: NeteaseSong[] | null
  waiting: boolean
  failed: boolean
}

interface NeteaseAppState {
  /** Signed in, signed out, or `null` until the host's page has said. */
  signedIn: boolean | null
  /** Its sign-in window is open on the PC (the companion's). */
  signingIn: boolean
  /** Whether it plays, as the page last said. */
  playing: boolean
  /** 0 to 1, the page's own player's. */
  volume: number
  track: NeteaseTrack | null
  /** `performance.now()` when `track`'s position was read: the time runs on from there. */
  trackAt: number
  /** Home's recommended playlists (v1's list: kept for the fallback while `home` isn't read yet). */
  lists: NeteaseList[]
  /** Whose account it is (the rail shows it): nothing while signed out or unknown. */
  account: NeteaseAccount | null
  /** The host has sent a state at least once (a plain browser's preview counts as having). */
  heard: boolean

  /** Home, as the hidden page showed it: the day's songs and the page's shelves. */
  home: NeteaseHome | null
  /** Whether Home's reading is still coming, and whether it didn't come. */
  homeAsking: Asking
  /** The account's own playlists, by group (创建的歌单, 收藏的歌单). */
  library: NeteaseLibraryGroup[] | null
  libraryAsking: Asking
  /** The account's recent songs (its 听歌排行 this week: the web player has no 最近播放 page). */
  recent: NeteaseSong[] | null
  recentAsking: Asking
  /** The page's answer to the last search asked. */
  search: NeteaseSearch | null
  searchAsking: Asking

  tab: Tab
  /** Each tab's pages over its own, the one showing last (each tab stays where it was left). */
  views: Record<Tab, View[]>
  /** Playlist pages by id, as asked. */
  playlists: Record<string, PlaylistPage>
  /** What played this session, newest first (the app's own memory; nothing of it is kept). */
  history: NeteaseSong[]
  /** "Added to…"-like moments: one line over the player. */
  toast: { text: string; id: number } | null
  style: Style
}

/** Where the chosen style is kept (the app's only setting). */
const STYLE_KEY = 'westplay.netease.style'

/** `follow` unless NetEase's red was chosen. */
function keptStyle(): Style {
  try {
    return localStorage.getItem(STYLE_KEY) === 'red' ? 'red' : 'follow'
  } catch {
    return 'follow'
  }
}

function fromPlayer(
  state: NeteasePlayerState,
): Pick<
  NeteaseAppState,
  'signedIn' | 'signingIn' | 'playing' | 'volume' | 'track' | 'trackAt' | 'lists' | 'heard' | 'account'
> {
  return {
    signedIn: state.signedIn,
    signingIn: state.signingIn,
    playing: state.track ? state.playing : false,
    volume: state.volume,
    track: state.track,
    trackAt: performance.now(),
    lists: state.lists,
    heard: true,
    account: state.account ?? null,
  }
}

/** Outside WestPlay (a plain browser) the preview is the player from the first frame: there's no host to wait
 * for. */
const PREVIEW = isInHost() ? null : createPreview()

export const useNetease = create<NeteaseAppState>()(() => ({
  ...(PREVIEW
    ? fromPlayer(PREVIEW.read())
    : {
        signedIn: null,
        signingIn: false,
        playing: false,
        volume: 0.8,
        track: null,
        account: null,
        trackAt: performance.now(),
        lists: [],
        heard: false,
      }),
  tab: 'home',
  views: { home: [], mine: [], search: [], now: [] },
  playlists: {},
  history: [],
  toast: null,
  style: keptStyle(),
  home: null,
  homeAsking: IDLE_ASKING,
  library: null,
  libraryAsking: IDLE_ASKING,
  recent: null,
  recentAsking: IDLE_ASKING,
  search: null,
  searchAsking: IDLE_ASKING,
}))

// --- Talking to the host's hidden page ---------------------------------------------------------------------

type PageEnvelope = Parameters<typeof postToHost>[0]

/** Sends a command to NetEase's hidden page: nothing happens in a plain browser (the preview plays instead). */
export function netease(command: NeteaseCommand): void {
  postToHost({ type: 'netease', kind: 'command', command } as unknown as PageEnvelope)
}

/** The host's page's message: what it says plays, a playlist's songs, or another of its readings (Home, My Music's
 * playlists, a search, the recent songs). */
interface NeteaseMessage {
  type: 'netease'
  kind?: 'state' | 'playlist' | 'home' | 'library' | 'search' | 'recent'
  state?: unknown
  id?: unknown
  songs?: unknown
  groups?: unknown
  query?: unknown
  daily?: unknown
  radar?: unknown
  personal?: unknown
  recommended?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function count(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readTrack(raw: unknown): NeteaseTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const track = raw as Record<string, unknown>
  const title = text(track.title)
  if (!title) return null
  const duration = Math.max(0, count(track.duration, 0))
  return {
    id: track.id === null || track.id === undefined || track.id === '' ? undefined : text(track.id),
    title,
    artist: text(track.artist),
    album: text(track.album),
    cover: typeof track.cover === 'string' && track.cover ? track.cover : null,
    duration,
    position: clamp(count(track.position, 0), 0, duration || Number.MAX_SAFE_INTEGER),
    playable: track.playable !== false,
  }
}

function readLists(raw: unknown): NeteaseList[] {
  if (!Array.isArray(raw)) return []
  const lists: NeteaseList[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const list = entry as Record<string, unknown>
    const id = text(list.id)
    const name = text(list.name)
    if (!id || !name) continue
    lists.push({
      id,
      name,
      cover: typeof list.cover === 'string' && list.cover ? list.cover : null,
      playCount: Math.max(0, count(list.playCount, 0)),
    })
  }
  return lists
}

function readSongs(raw: unknown): NeteaseSong[] {
  if (!Array.isArray(raw)) return []
  const songs: NeteaseSong[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const song = entry as Record<string, unknown>
    const title = text(song.title)
    if (!title) continue
    const id = text(song.id) || `${title}:${text(song.artist)}`
    songs.push({
      id,
      title,
      artist: text(song.artist),
      duration: Math.max(0, count(song.duration, 0)),
      playable: song.playable !== false,
    })
  }
  return songs
}

/** A playlist card, as its message says it, or `null` for one the app can't show. */
function readList(raw: unknown): NeteaseList | null {
  if (!raw || typeof raw !== 'object') return null
  const list = raw as Record<string, unknown>
  const id = text(list.id)
  const name = text(list.name)
  if (!id || !name) return null
  return {
    id,
    name,
    cover: typeof list.cover === 'string' && list.cover ? list.cover : null,
    playCount: Math.max(0, count(list.playCount, 0)),
  }
}

/** The `home` message: the day's songs (`null` while their page is still being read), the account's 私人雷达, its
 * other personalised playlists, and the recommended ones. */
function readHome(raw: unknown): NeteaseHome {
  if (!raw || typeof raw !== 'object') return { daily: null, radar: null, personal: [], recommended: [] }
  const home = raw as Record<string, unknown>
  const daily = home.daily
  return {
    daily:
      daily === null || daily === undefined
        ? null
        : readSongs(daily && typeof daily === 'object' ? (daily as Record<string, unknown>).songs : undefined),
    radar: readList(home.radar),
    personal: readLists(home.personal),
    recommended: readLists(home.recommended),
  }
}

/** A playlist of the account's own, as a `library` message says it. */
function readLibraryPlaylist(raw: unknown): NeteaseLibraryPlaylist | null {
  const list = readList(raw)
  if (!list) return null
  const entry = raw as Record<string, unknown>
  return {
    ...list,
    songCount: Math.max(0, count(entry.songCount, 0)),
    by: text(entry.by),
  }
}

/** The `library` message: My Music's groups of playlists, in its own order. */
function readLibrary(raw: unknown): NeteaseLibraryGroup[] {
  const groups = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).groups
      : raw
  if (!Array.isArray(groups)) return []
  const read: NeteaseLibraryGroup[] = []
  for (const entry of groups) {
    if (!entry || typeof entry !== 'object') continue
    const group = entry as Record<string, unknown>
    const title = text(group.title)
    if (!title) continue
    const playlists: NeteaseLibraryPlaylist[] = []
    const values = Array.isArray(group.playlists) ? group.playlists : []
    for (const value of values) {
      const list = readLibraryPlaylist(value)
      if (list) playlists.push(list)
    }
    read.push({ title, count: Math.max(0, count(group.count, playlists.length)), playlists })
  }
  return read
}

/** Whose account the page's top bar says it is, or `null` while it says none. */
function readAccount(raw: unknown): NeteaseAccount | null {
  if (!raw || typeof raw !== 'object') return null
  const account = raw as Record<string, unknown>
  const name = text(account.name)
  const avatar = typeof account.avatar === 'string' && account.avatar ? account.avatar : null
  if (!name && !avatar) return null
  return { name, avatar }
}

/** The host's `state`: what it says, or `null` for a state this app can't read (nothing shown for it). */
function readPlayer(raw: unknown): NeteasePlayerState | null {
  if (!raw || typeof raw !== 'object') return null
  const state = raw as Record<string, unknown>
  return {
    signedIn: typeof state.signedIn === 'boolean' ? state.signedIn : null,
    signingIn: state.signingIn === true,
    playing: state.playing === true,
    volume: clamp(count(state.volume, 0.8), 0, 1),
    track: readTrack(state.track),
    lists: readLists(state.lists),
    account: readAccount(state.account),
  }
}

/** A song's identity across the host's two messages (the state's track; a playlist's songs). */
export function songKey(song: Pick<NeteaseTrack, 'id' | 'title' | 'artist'>): string {
  return song.id ?? `${song.title}:${song.artist}`
}

function rememberPlayed(track: NeteaseTrack): void {
  const song: NeteaseSong = {
    id: songKey(track),
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    playable: track.playable,
  }
  const { history } = useNetease.getState()
  if (history[0] && songKey(history[0]) === songKey(song)) return
  useNetease.setState({ history: [song, ...history.filter((each) => songKey(each) !== songKey(song))].slice(0, 12) })
}

/** Applies a state the player sent: what plays, the lists, and the account. The preview's states come through
 * here too, so the app is drawn the same whichever answered. */
export function receiveState(state: NeteasePlayerState): void {
  const before = useNetease.getState().track
  useNetease.setState(fromPlayer(state))
  if (state.track && (!before || songKey(before) !== songKey(state.track))) rememberPlayed(state.track)
}

/** A playlist's songs, as the hidden page answered (`netease` `playlist`). */
export function receivePlaylist(id: string, songs: NeteaseSong[]): void {
  clearTimeout(waitingFor.get(id))
  waitingFor.delete(id)
  useNetease.setState((state) => ({
    playlists: { ...state.playlists, [id]: { songs, waiting: false, failed: false } },
  }))
  // A Play all pressed before the songs came: the first it can play starts now, its id known.
  if (playAllWhenReady.delete(id) && isInHost()) {
    const first = songs.find((song) => song.playable)
    if (first) netease({ action: 'play', value: first.id })
  }
}

/** What the app has asked the hidden page for and not heard back about, with the moment it gives up. */
const waitingFor = new Map<string, ReturnType<typeof setTimeout>>()

/** Playlist pages whose Play all was pressed before their songs had come: played as the songs arrive. */
const playAllWhenReady = new Set<string>()

/** How long a playlist page waits for the hidden page before saying it couldn't open it. */
const PLAYLIST_WAIT = 10000

/** How long each of the page's other readings may take (Home's day's page follows its cards' one): past that the
 * app says it couldn't read it, and its page's Retry asks again. */
const HOME_WAIT = 26000
const LIBRARY_WAIT = 20000
const SEARCH_WAIT = 16000
const RECENT_WAIT = 15000

/** The preview answers a moment later, as the hidden page would. */
const PREVIEW_ANSWER = 120

let homeWait: ReturnType<typeof setTimeout> | undefined
let libraryWait: ReturnType<typeof setTimeout> | undefined
let searchWait: ReturnType<typeof setTimeout> | undefined
let recentWait: ReturnType<typeof setTimeout> | undefined

// --- The account's page's other answers: Home, My Music's playlists, a search, the recent songs -----------------

/** Home's answer (`netease` `home`): the cards come first, the day's songs (still `null`) after them — the wait
 * goes on until they come, or its time is up. */
export function receiveHome(home: NeteaseHome): void {
  clearTimeout(homeWait)
  if (home.daily === null) {
    // The page's cards are known; its day's songs are still being read (the wait for them goes on).
    useNetease.setState({ home, homeAsking: { waiting: true, failed: false }, heard: true })
    homeWait = setTimeout(
      () => useNetease.setState((state) => (state.homeAsking.waiting ? { homeAsking: { waiting: false, failed: true } } : state)),
      HOME_WAIT,
    )
    return
  }
  useNetease.setState({ home, homeAsking: IDLE_ASKING, heard: true })
}

/** My Music's playlists, by group, as the hidden page answered (`netease` `library`). */
export function receiveLibrary(groups: NeteaseLibraryGroup[]): void {
  clearTimeout(libraryWait)
  useNetease.setState({ library: groups, libraryAsking: IDLE_ASKING })
}

/** The account's recent songs, as the hidden page answered (`netease` `recent`). */
export function receiveRecent(songs: NeteaseSong[]): void {
  clearTimeout(recentWait)
  useNetease.setState({ recent: songs, recentAsking: IDLE_ASKING })
}

/** The last search asked: an earlier answer arriving late (the player typed on) is dropped, not shown. */
let searchWanted = ''

/** The page's answer to a search (`netease` `search`): only the last asked shows. */
export function receiveSearch(query: string, songs: NeteaseSong[]): void {
  if (query !== searchWanted) return
  clearTimeout(searchWait)
  useNetease.setState({ search: { query, songs }, searchAsking: IDLE_ASKING })
}

/** Reads Home again (`again`: the page's Refresh, or a read that didn't come): the day's songs and its cards. */
export function requestHome(again = false): void {
  const { home, homeAsking } = useNetease.getState()
  if (!again && (home || homeAsking.waiting)) return
  clearTimeout(homeWait)
  useNetease.setState({ homeAsking: { waiting: true, failed: false } })
  if (isInHost()) {
    netease({ action: 'home' })
    homeWait = setTimeout(
      () => useNetease.setState((state) => (state.homeAsking.waiting ? { homeAsking: { waiting: false, failed: true } } : state)),
      HOME_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW) receiveHome(PREVIEW.home())
  }, PREVIEW_ANSWER)
}

/** Reads My Music's playlists again (its page's Refresh): its groups' own cards. */
export function requestLibrary(again = false): void {
  const { library, libraryAsking } = useNetease.getState()
  if (!again && (library || libraryAsking.waiting)) return
  clearTimeout(libraryWait)
  useNetease.setState({ libraryAsking: { waiting: true, failed: false } })
  if (isInHost()) {
    netease({ action: 'library' })
    libraryWait = setTimeout(
      () =>
        useNetease.setState((state) =>
          state.libraryAsking.waiting ? { libraryAsking: { waiting: false, failed: true } } : state,
        ),
      LIBRARY_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW) receiveLibrary(PREVIEW.library())
  }, PREVIEW_ANSWER)
}

/** Reads the account's recent songs again (its page's Refresh). */
export function requestRecent(again = false): void {
  const { recent, recentAsking } = useNetease.getState()
  if (!again && (recent || recentAsking.waiting)) return
  clearTimeout(recentWait)
  useNetease.setState({ recentAsking: { waiting: true, failed: false } })
  if (isInHost()) {
    netease({ action: 'recent' })
    recentWait = setTimeout(
      () => useNetease.setState((state) => (state.recentAsking.waiting ? { recentAsking: { waiting: false, failed: true } } : state)),
      RECENT_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW) receiveRecent(PREVIEW.recent())
  }, PREVIEW_ANSWER)
}

/** Searches the page for `query` (`''`: its results put away). Only the last asked shows, as the player types. */
export function searchFor(query: string): void {
  const said = query.trim().slice(0, 60)
  searchWanted = said
  clearTimeout(searchWait)
  if (!said) {
    useNetease.setState({ search: null, searchAsking: IDLE_ASKING })
    return
  }
  useNetease.setState({ searchAsking: { waiting: true, failed: false } })
  if (isInHost()) {
    netease({ action: 'search', value: said })
    searchWait = setTimeout(
      () => useNetease.setState((state) => (state.searchAsking.waiting ? { searchAsking: { waiting: false, failed: true } } : state)),
      SEARCH_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW && searchWanted === said) receiveSearch(said, PREVIEW.search(said))
  }, PREVIEW_ANSWER)
}

/** Asks the hidden page to open a playlist, once per page: its songs come as a `playlist` message. */
function requestPlaylist(id: string, again = false): void {
  const page = useNetease.getState().playlists[id]
  if (!again && (page?.songs || page?.waiting)) return
  clearTimeout(waitingFor.get(id))
  useNetease.setState((state) => ({
    playlists: {
      ...state.playlists,
      [id]: { songs: again ? (page?.songs ?? null) : null, waiting: true, failed: false },
    },
  }))
  if (isInHost()) {
    netease({ action: 'openPlaylist', value: id })
    waitingFor.set(
      id,
      setTimeout(() => {
        waitingFor.delete(id)
        useNetease.setState((state) => {
          const current = state.playlists[id]
          if (!current?.waiting) return state
          return { playlists: { ...state.playlists, [id]: { ...current, waiting: false, failed: true } } }
        })
      }, PLAYLIST_WAIT),
    )
    return
  }
  setTimeout(() => {
    if (!PREVIEW) return
    receivePlaylist(id, PREVIEW.songs(id))
  }, PREVIEW_ANSWER)
}

/** A toast: one line over the player, gone in a moment. */
let toastId = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string): void {
  clearTimeout(toastTimer)
  useNetease.setState({ toast: { text: message, id: ++toastId } })
  toastTimer = setTimeout(() => useNetease.setState({ toast: null }), 2800)
}

// --- The preview's player, driven as the host's would be -----------------------------------------------

/** Runs `change` on the preview and shows what it became. Nothing in WestPlay itself. */
function previewRun(change: (preview: Preview) => void): void {
  if (!PREVIEW) return
  change(PREVIEW)
  receiveState(PREVIEW.read())
}

// --- The account ------------------------------------------------------------------------------------------

/** The account as the app shows it: signed in, signed out, signing in, or not known yet. */
export type Account = 'in' | 'out' | 'signingIn' | 'unknown'

export function accountOf(state: Pick<NeteaseAppState, 'signedIn' | 'signingIn'>): Account {
  if (state.signingIn) return 'signingIn'
  return state.signedIn === null ? 'unknown' : state.signedIn ? 'in' : 'out'
}

// --- Going around ------------------------------------------------------------------------------------------

let nextId = 1

/** A tab pressed: its own page again if it was already showing, else it. */
export function openTab(tab: Tab): void {
  const { tab: was, views } = useNetease.getState()
  if (was === tab) useNetease.setState({ views: { ...views, [tab]: [] } })
  else useNetease.setState({ tab })
}

/** The page a playlist card opens: asked of the hidden page if it isn't known yet. */
export function openPlaylist(playlistId: string): void {
  const { tab, views } = useNetease.getState()
  useNetease.setState({ views: { ...views, [tab]: [...views[tab], { id: nextId++, kind: 'playlist', playlistId }] } })
  requestPlaylist(playlistId)
}

/** The page the recent-play entry opens: the account's recent songs, asked of the hidden page if not known yet. */
export function openRecent(): void {
  const { tab, views } = useNetease.getState()
  useNetease.setState({ views: { ...views, [tab]: [...views[tab], { id: nextId++, kind: 'recent' }] } })
  requestRecent()
}

/** Where a playlist's own card may be known from: Home's shelves, My Music's groups, and the state's own lists. */
export interface PlaylistSources {
  lists: NeteaseList[]
  home: NeteaseHome | null
  library: NeteaseLibraryGroup[] | null
}

/** A playlist card as the app knows it, or `null` for one not known yet: its page shows the name and cover as soon
 * as any of the app's readings has them. */
export function findPlaylistMeta(sources: PlaylistSources, id: string): NeteaseList | null {
  const known = sources.lists.find((list) => list.id === id)
  if (known) return known
  const home = sources.home
  if (home) {
    if (home.radar?.id === id) return home.radar
    const shelf = home.personal.find((list) => list.id === id) ?? home.recommended.find((list) => list.id === id)
    if (shelf) return shelf
  }
  for (const group of sources.library ?? []) {
    const list = group.playlists.find((each) => each.id === id)
    if (list) return list
  }
  return null
}

/** A playlist's card for its page: from Home, My Music or the state's lists (the first that knows it). */
export function usePlaylistMeta(id: string): NeteaseList | null {
  const lists = useNetease((state) => state.lists)
  const home = useNetease((state) => state.home)
  const library = useNetease((state) => state.library)
  return useMemo(() => findPlaylistMeta({ lists, home, library }, id), [lists, home, library, id])
}

/** Asks the hidden page for the playlist's songs again (its page's Retry, Refresh). */
export function retryPlaylist(playlistId: string): void {
  requestPlaylist(playlistId, true)
}

export function goBack(): void {
  const { tab, views } = useNetease.getState()
  useNetease.setState({ views: { ...views, [tab]: views[tab].slice(0, -1) } })
}

/** Shows the playlist's page (a song of it pressed somewhere else, a search's playlist). */
export function showPlaylist(playlistId: string): void {
  openPlaylist(playlistId)
}

// --- Playing -----------------------------------------------------------------------------------------------

/** Seconds into the song now (`now` defaults to now). */
export function positionOf(track: NeteaseTrack | null, playing: boolean, at: number, now = performance.now()): number {
  if (!track) return 0
  // A clock's tick from before the state was read never takes it back (the shared media clocks do the same).
  const position = playing ? track.position + Math.max(0, now - at) / 1000 : track.position
  return Math.min(Math.max(0, position), track.duration || Number.MAX_SAFE_INTEGER)
}

/** Plays what's paused, or pauses what plays. A page is asked first thing, so a pressed play can play. */
export function playPause(): void {
  const { playing, track } = useNetease.getState()
  if (!track) return
  const next = !playing
  if (!isInHost()) {
    previewRun((preview) => preview.play(next))
    return
  }
  if (next) netease({ action: 'play' })
  else netease({ action: 'pause' })
  useNetease.setState({ playing: next, trackAt: performance.now() })
}

/** Plays the playlist from its start (its page's Play): its first playable song, by id, once the songs are
 * known (or as they arrive). */
export function playPlaylist(playlistId: string): void {
  if (!isInHost()) {
    previewRun((preview) => preview.playPlaylist(playlistId))
    return
  }
  const songs = useNetease.getState().playlists[playlistId]?.songs
  const first = songs?.find((song) => song.playable)
  if (first) {
    netease({ action: 'play', value: first.id })
    return
  }
  playAllWhenReady.add(playlistId)
  requestPlaylist(playlistId)
}

/** A song of a playlist pressed: the hidden page is asked to play that song (v1.1's play with its id). */
export function playSong(playlistId: string, song: NeteaseSong): void {
  if (!isInHost()) {
    previewRun((preview) => preview.playSong(playlistId, song))
    return
  }
  if (!song.playable) return
  netease({ action: 'play', value: song.id })
}

/** A song the app knows only by itself pressed (a search's, Home's day's, the recent list's): the hidden page is
 * asked to play that id, its own player's way where the song's list isn't the page's (`nm.x.ceo2i`). */
export function playFound(song: NeteaseSong): void {
  if (!isInHost()) {
    previewRun((preview) => preview.playHistory(song))
    return
  }
  if (!song.playable) return
  netease({ action: 'play', value: song.id })
}

/** The day's songs from their start (Home's Play all): its first playable song, by id. */
export function playDaily(): void {
  const songs = useNetease.getState().home?.daily ?? []
  const first = songs.find((song) => song.playable)
  if (first) playFound(first)
}

/** The next song, or the one before (within the song's first seconds: otherwise its start). */
export function skip(direction: 1 | -1): void {
  if (!isInHost()) {
    previewRun((preview) => preview.skip(direction))
    return
  }
  netease({ action: direction === 1 ? 'next' : 'prev' })
}

/** A song of the session's recent list pressed (preview only: v1's protocol has no way to play one song). */
export function playHistorySong(song: NeteaseSong): void {
  if (isInHost()) return
  previewRun((preview) => preview.playHistory(song))
}

export function seek(seconds: number): void {
  const { track } = useNetease.getState()
  if (!track) return
  const position = clamp(seconds, 0, track.duration)
  if (!isInHost()) {
    previewRun((preview) => preview.seek(position))
    return
  }
  netease({ action: 'seek', value: position })
  useNetease.setState({ track: { ...track, position }, trackAt: performance.now() })
}

let volumeSent = 0

/** The page's player volume (0 to 1): shown at once, sent a few times a second, the last one always. */
export function setVolume(share: number, done = false): void {
  const volume = clamp(share, 0, 1)
  if (!isInHost()) {
    previewRun((preview) => preview.setVolume(volume))
    return
  }
  useNetease.setState({ volume })
  const now = performance.now()
  if (!done && now - volumeSent < 150) return
  volumeSent = now
  netease({ action: 'volume', value: volume })
}

/** Home's playlists asked again (the page reads its content area anew). */
export function refresh(): void {
  if (!isInHost()) {
    previewRun((preview) => preview.refresh())
    return
  }
  netease({ action: 'refresh' })
}

/** The time (`performance.now()`), again every quarter second while `running`: for a song's clock. */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [running])
  return now
}

// --- The style ---------------------------------------------------------------------------------------------

export function setStyle(style: Style): void {
  useNetease.setState({ style })
  try {
    localStorage.setItem(STYLE_KEY, style)
  } catch {
    // Storage blocked: kept for this session only.
  }
}

// --- Reading songs' titles for a search --------------------------------------------------------------------

/** Whether a song of a list is what plays (the hidden page gives a track's id when it has one). */
export function useIsPlaying(song: Pick<NeteaseSong, 'id' | 'title' | 'artist'>): boolean {
  return useNetease((state) => {
    if (!state.track) return false
    if (state.track.id !== undefined) return state.track.id === song.id
    return state.track.title === song.title && state.track.artist === song.artist
  })
}

// --- The host's channel ------------------------------------------------------------------------------------

/** Applies each `netease` message the host sends (state, playlist, home, library, search, recent), and only those.
 * Exported for the app's tests, which feed it the host's messages as they come. */
export function receiveMessage(message: unknown): void {
  if (!message || typeof message !== 'object') return
  const each = message as NeteaseMessage
  if (each.type !== 'netease') return
  switch (each.kind) {
    case 'state': {
      const state = readPlayer(each.state)
      if (state) receiveState(state)
      return
    }
    case 'playlist': {
      const id = text(each.id)
      if (id) receivePlaylist(id, readSongs(each.songs))
      return
    }
    case 'home':
      receiveHome(readHome(each))
      return
    case 'library':
      receiveLibrary(readLibrary(each.groups))
      return
    case 'search':
      receiveSearch(text(each.query), readSongs(each.songs))
      return
    case 'recent':
      receiveRecent(readSongs(each.songs))
      return
    default:
      return
  }
}

/**
 * While the app is open: NetEase's hidden page runs (the host starts it, `start`), and says what it plays.
 * The listener is this app's own (state/store.ts's dispatch knows nothing of `netease` messages); WestPlay
 * itself is untouched in a plain browser, where the preview plays instead.
 */
export function useNeteaseBridge(): void {
  useEffect(() => {
    if (!isInHost()) return
    const stop = subscribeHostMessages(receiveMessage)
    netease({ action: 'start' })
    return stop
  }, [])
  // The preview's songs end by themselves, the next one starting (in WestPlay, NetEase's page plays on).
  useEffect(() => {
    if (isInHost() || !PREVIEW) return
    const timer = setInterval(() => {
      const state = useNetease.getState()
      if (!state.playing || !state.track) return
      if (positionOf(state.track, state.playing, state.trackAt) >= state.track.duration) {
        previewRun((preview) => preview.skip(1))
      }
    }, 400)
    return () => clearInterval(timer)
  }, [])
}

/** What the Dashboard's Now Playing (and the Equalizer) show of it, as the other players say theirs
 * (`shared/media.ts`): the song, its cover, whether it plays, and how far in it is when this state was read. */
/** Its state as the Dashboard's Now Playing takes it (`sourceOf`), kept while it plays. */
export function useNeteaseSource(): { source: MediaSource; artwork: string | null } | null {
  const track = useNetease((state) => state.track)
  const playing = useNetease((state) => state.playing)
  const at = useNetease((state) => state.trackAt)
  return useMemo(() => sourceOf(track, playing, at), [track, playing, at])
}

/** It as one of the cab's players (apps/musicWithGame.ts): so the media keybinds drive it, the newest to start
 * pauses the others (apps/oneAtATime.ts), and it pauses with the game's menu and plays on after, as they do. */
export const neteasePlayer: MusicPlayer = {
  name: 'netease',
  playingHere: () => useNetease.getState().playing,
  pauseHere: () => {
    if (useNetease.getState().playing) playPause()
  },
  resumeHere: () => {
    if (!useNetease.getState().playing) playPause()
  },
  volume: () => useNetease.getState().volume,
  sendVolume: (share) => setVolume(share),
  setVolume: (share) => setVolume(share),
  skip: (direction) => netease({ action: direction > 0 ? 'next' : 'prev' }),
  subscribe: (changed) =>
    useNetease.subscribe((now, before) => {
      if (now.playing && !before.playing) changed(true)
    }),
}

/** NetEase with the game: the music pauses while the player is away from it, and plays on after. */
export function pauseNeteaseWithGame(): () => void {
  return pauseMusicWithGame(neteasePlayer)
}
