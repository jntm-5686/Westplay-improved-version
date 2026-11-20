import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { isInHost, postToHost, subscribeHostMessages } from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { sourceOf } from './source'
import { createPreview, type Preview } from './preview'
import { neteaseWords } from './words'

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
 * v3 is the account's whole web player, read live from its own same-origin interface (nothing is navigated: the
 * player stays where it is and its queue is never lost): Home (私人雷达, 每日歌曲推荐, 个性化歌单), My Music
 * (创建的歌单, 收藏的歌单, 听歌排行), 榜单 (every one of NetEase's rankings and a ranking's songs), the account's
 * own profile, Search (单曲, 歌手, 歌单), an artist's page and the heart (我喜欢的音乐). The playback itself is
 * watched and rescued within a second (netease.js's own ladder), so a song always sounds.
 *
 * The protocol is written down in notes/netease-v3-protocol.md: it is the host's (`netease.rs`) and this file's
 * contract, and the UI reads it from here.
 */

/** One of Home's recommended playlists, as the host's hidden page says (`netease` `state`). */
export interface NeteaseList {
  id: string
  name: string
  cover: string | null
  playCount: number
}

/** What plays, as the host's hidden page says. `playable`: NetEase's rights allow it (VIP, region, copyright). */
export interface NeteaseArtistRef {
  id: string
  name: string
}

export interface NeteaseTrack {
  /** NetEase's id, when the page gave one (v1's state message may leave it out). */
  id?: string
  title: string
  artist: string
  /** The first artist's NetEase id, when the page gave a real one: the full-screen player opens their page from
   *  it. Missing for a song whose answer didn't say (the artist's name stays plain words there). */
  artistId?: string
  /** Each of the song's artists, with their own id: the full-screen player opens their pages. */
  artists?: NeteaseArtistRef[]
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
  /** The first artist's NetEase id, when the answer said one. */
  artistId?: string
  /** Each of its artists, with their own id: the full-screen player opens their pages. */
  artists?: NeteaseArtistRef[]
  duration: number
  playable: boolean
  /** The song's album, when its answer said one (`playlist`, `recent`, a search's songs). */
  album?: string
  /** How many times the account played it, when the list says (`recent`: 本周播放). */
  playCount?: number
}

/** Whose account it is, as NetEase's own top bar says it. */
export interface NeteaseAccount {
  name: string
  avatar: string | null
}

/** The account's own profile (`netease` `profile`): the page's user detail and its music level. */
export interface NeteaseProfile {
  /** NetEase's own user id (digits), as the page's top bar's address says it. */
  uid: string
  name: string
  avatar: string | null
  /** The account's signature line (empty for one the page gives none). */
  signature: string
  /** The account's music level (网易云等级), 0 when the page doesn't say. */
  level: number
  /** How many songs it has ever listened to. */
  listenSongs: number
  /** How many accounts it follows. */
  follows: number
  /** How many accounts follow it. */
  fans: number
  /** How many playlists it has (created, collected and the heart's own). */
  playlistCount: number
  /** How many days since the account was made. */
  createDays: number
  /** NetEase's own vip flag (0: none; 11: 黑胶 VIP, as the page says it). */
  vipType: number
  /** The account page's own background picture, on NetEase's image hosts. */
  background: string | null
}

/** One of NetEase's rankings (`netease` `rankings`): a playlist in NetEase's own right (its id opens it). */
export interface NeteaseRanking {
  id: string
  name: string
  cover: string | null
  /** How often it updates, in NetEase's own words ("每天更新", "刚刚更新", "每周五更新"). */
  updateFrequency: string
  /** How many songs it has (200 for 热歌榜, 100 for most). */
  trackCount: number
  playCount: number
  /** One of NetEase's own charts (飙升榜, 新歌榜, 原创榜, 热歌榜 and its partners): not a community list. */
  official: boolean
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

/** An artist of a search, as the host's hidden page says (`netease` `search`'s artists). */
export interface NeteaseArtist {
  id: string
  name: string
  /** Their picture, on NetEase's own image hosts. */
  cover: string | null
}

/** A search's answer, as the host's page searched it (`netease` `search`): its own categories' results — songs,
 * artists and playlists — and how many of each its page says it found. */
export interface NeteaseSearch {
  query: string
  songs: NeteaseSong[]
  artists: NeteaseArtist[]
  playlists: NeteaseList[]
  /** The page's own count of each kind (its note: "找到 296 首单曲"): the lists are the first of them. */
  songsTotal: number
  artistsTotal: number
  playlistsTotal: number
  /** Its search interface refused (asked too often): not "nothing matched" — a failure, with a Retry. */
  failed: boolean
}

/** A search's own categories, in its page's order (单曲, 歌手, 歌单): the app's tabs over one answer. */
export type SearchTab = 'songs' | 'artists' | 'playlists'

/** An artist's page, as the host's hidden page read it (`netease` `artist`), and whether it's still coming. */
export interface NeteaseArtistPage {
  name: string
  /** Their other names ("Jay Chou"), empty for one the page gives none of. */
  alias: string
  cover: string | null
  /** Their brief introduction, empty for one the page gives none. */
  description: string
  songs: NeteaseSong[] | null
  waiting: boolean
  failed: boolean
}

/** Whether something asked of the host's page is still coming, and whether it didn't come. */
export interface Asking {
  waiting: boolean
  failed: boolean
}

/** No answer looked for, or the last one came. */
export const IDLE_ASKING: Asking = { waiting: false, failed: false }

/** Its play mode, as its own play bar names it: the list round and round, at random, one song over and over. */
export type PlayMode = 'list' | 'shuffle' | 'one'

/** The mode its own play bar's button goes to next (its own order: 列表循环 -> 随机 -> 单曲循环 -> 列表循环). */
export function nextPlayMode(mode: PlayMode): PlayMode {
  return mode === 'list' ? 'shuffle' : mode === 'shuffle' ? 'one' : 'list'
}

/** A mode as the page's state says it, or `undefined` for one it doesn't know (a page of an older build: the app
 * then keeps the mode it shows rather than putting it back to 列表循环 on every state). */
function readMode(value: unknown): PlayMode | undefined {
  return value === 'list' || value === 'shuffle' || value === 'one' ? value : undefined
}

/** The whole state the host's page sends (`netease` `state`). */
export interface NeteasePlayerState {
  signedIn: boolean | null
  /** Its play mode (`mode` in the page's state). */
  mode?: string
  signingIn: boolean
  playing: boolean
  /** 0 to 1. */
  volume: number
  track: NeteaseTrack | null
  /** Whether the playing song is in the account's 我喜欢的音乐 (`null`: not known, or signed out). */
  liked?: boolean | null
  lists: NeteaseList[]
  /** The account's name and picture, once its page knows it. */
  account?: NeteaseAccount | null
}

/** A command for the host's hidden page (`crates/host netease.rs`). */
export type NeteaseCommand =
  | { action: 'volumeFade'; value?: number }
  /** Runs the hidden page, saying whether it's signed in. */
  | { action: 'start' }
  /** Opens NetEase's sign-in: the companion's account page's, not the cab's (the page is hidden). */
  | { action: 'signIn' | 'signOut' }
  /** Continues playing; with a song's id, plays that song (through the page's own player, watched and rescued).
   * `list`: the list it's from (a playlist's or a ranking's id, `daily`, `recent`, `search`, `artist:<id>`), when the
   * app knows it: the page then plays it in its own queue, so the switch is the page's own and near instant. */
  | { action: 'play'; value?: string; list?: string }
  /** Opens an artist's page in the hidden page; their name, picture and songs come back as an `artist` message. */
  | { action: 'openArtist'; value: string }
  /** Adds the song (`value`: its id) to the account's 我喜欢的音乐, or takes it out (`liked`): the page's own
   * interface, answered with a `like` message once it says so. */
  | { action: 'setLike'; value: string; liked: boolean }
  | { action: 'pause' | 'next' | 'prev' | 'refresh' }
  | { action: 'seek'; value: number }
  | { action: 'volume'; value: number }
  /** Its play mode's next one (列表循环 -> 随机 -> 单曲循环 -> 列表循环), as its own button presses it. */
  | { action: 'cycleMode' }
  /** Opens a playlist in the hidden page; its songs come back as a `playlist` message. */
  | { action: 'openPlaylist'; value: string }
  /** Opens one of NetEase's rankings (`value`: its id, the playlist's own); its songs come back as a `playlist`
   * message (`id`: the ranking's id). */
  | { action: 'openRanking'; value: string }
  /** Reads Home again: the day's songs and the page's shelves, answered with a `home` message. */
  | { action: 'home' }
  /** Reads the account's own playlists again, answered with a `library` message. */
  | { action: 'library' }
  /** Search the page for these words, answered with a `search` message. */
  | { action: 'search'; value: string }
  /** Reads the account's recent songs, answered with a `recent` message. */
  | { action: 'recent' }
  /** Reads NetEase's own rankings list, answered with a `rankings` message. */
  | { action: 'rankings' }
  /** Reads the account's own profile, answered with a `profile` message. */
  | { action: 'profile' }

/** The app's own tabs, as its rail shows them. */
export type Tab = 'home' | 'mine' | 'search' | 'now'

/** A page over a tab's own. */
export type View =
  | { id: number; kind: 'playlist'; playlistId: string }
  | { id: number; kind: 'artist'; artistId: string }
  | { id: number; kind: 'recent' }
  /** One of NetEase's rankings: its card is from the `rankings` list, its songs from `playlists[rankingId]`. */
  | { id: number; kind: 'ranking'; rankingId: string }

/** How the app is drawn: WestPlay's own neutral look, or NetEase's red. Both follow the cab's light or dark. */
export type Style = 'follow' | 'red'

/** The search bar's field (NeteaseApp.tsx's top bar): the keyboard types there, and lets go as a result is picked
 * (each page's own, and the rail's, detach it). */
export const SEARCH_FIELD = 'netease-search'

/** Where what plays was played from (the app's own reading of its queue): a playlist's or a chart's list, the day's
 * songs, the recent chart, a search, an artist's page. The page's own lists are named as its queue names them. */
export type NeteaseFromKind = 'playlist' | 'ranking' | 'daily' | 'recent' | 'search' | 'artist'

export interface NeteaseFrom {
  kind: NeteaseFromKind
  /** Its name as the app knows it (the list's own, or the app's word for a list without one). */
  name: string
}

/** What's known of a playlist page: its songs, asked of the hidden page. */
export interface PlaylistPage {
  songs: NeteaseSong[] | null
  waiting: boolean
  failed: boolean
  /** Its own head, when its `playlist` answer carried it (`openRanking`'s answer always does). */
  meta?: PlaylistMeta | null
}

/** A playlist's or ranking's own head, as its `playlist` answer says it (all optional but its name). */
export interface PlaylistMeta {
  id: string
  name: string
  cover: string | null
  playCount: number
  trackCount: number
  /** How often a ranking updates, in NetEase's own words; empty for a plain playlist. */
  updateFrequency: string
  /** Who made it (empty for one the page gives no creator of). */
  creator: string
  description: string
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
  /** Its play mode: 列表循环, 随机, 单曲循环. */
  mode: PlayMode
  /** Where the playing song was played from, when the app knows (`null`: no list of its own, or nothing played). */
  from: NeteaseFrom | null
  track: NeteaseTrack | null
  /** Whether the playing song is liked (in 我喜欢的音乐): `null` until the page has read it. */
  liked: boolean | null
  /** A like asked of the page, not answered yet. */
  liking: boolean
  /** A like that didn't land, for the app's own one-line word over the player (`reason`: the page's own). */
  likeFailure: { reason: string; id: number } | null
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
  /** NetEase's own rankings, as the page listed them. */
  rankings: NeteaseRanking[] | null
  rankingsAsking: Asking
  /** The account's own profile. */
  profile: NeteaseProfile | null
  profileAsking: Asking
  /** The words in the search bar at the page's top (the app's own, asked of the page by `searchFor`). */
  query: string
  /** A search's own category showing (its page's tabs). */
  searchTab: SearchTab
  /** Artist pages by id, as asked. */
  artists: Record<string, NeteaseArtistPage>

  tab: Tab
  /** Each tab's pages over its own, the one showing last (each tab stays where it was left). */
  views: Record<Tab, View[]>
  /** Playlist pages by id, as asked (a ranking's songs live here too, under the ranking's own id). */
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
  'signedIn' | 'signingIn' | 'playing' | 'volume' | 'track' | 'liked' | 'trackAt' | 'lists' | 'heard' | 'account'
> {
  return {
    signedIn: state.signedIn,
    signingIn: state.signingIn,
    playing: state.track ? state.playing : false,
    volume: state.volume,
    track: state.track,
    liked: state.liked ?? null,
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
    ? { ...fromPlayer(PREVIEW.read()), mode: 'list' as PlayMode }
    : {
        signedIn: null,
        signingIn: false,
        playing: false,
        mode: 'list',
        volume: 0.8,
        track: null,
        liked: null,
        account: null,
        trackAt: performance.now(),
        lists: [],
        heard: false,
      }),
  from: null,
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
  rankings: null,
  rankingsAsking: IDLE_ASKING,
  profile: null,
  profileAsking: IDLE_ASKING,
  query: '',
  searchTab: 'songs',
  artists: {},
  liking: false,
  likeFailure: null,
}))

// --- Talking to the host's hidden page ---------------------------------------------------------------------

type PageEnvelope = Parameters<typeof postToHost>[0]

/** Sends a command to NetEase's hidden page: nothing happens in a plain browser (the preview plays instead). */
export function netease(command: NeteaseCommand): void {
  postToHost({ type: 'netease', kind: 'command', command } as unknown as PageEnvelope)
}

/** The host's page's message: what it says plays, a playlist's songs, or another of its readings (Home, My Music's
 * playlists, a search, the recent songs, the rankings, the profile). */
interface NeteaseMessage {
  type: 'netease'
  kind?: 'state' | 'playlist' | 'home' | 'library' | 'search' | 'artist' | 'recent' | 'like' | 'rankings' | 'profile'
  state?: unknown
  id?: unknown
  songs?: unknown
  groups?: unknown
  query?: unknown
  daily?: unknown
  radar?: unknown
  personal?: unknown
  recommended?: unknown
  artists?: unknown
  playlists?: unknown
  songsTotal?: unknown
  artistsTotal?: unknown
  playlistsTotal?: unknown
  failed?: unknown
  name?: unknown
  alias?: unknown
  cover?: unknown
  liked?: unknown
  ok?: unknown
  reason?: unknown
  rankings?: unknown
  profile?: unknown
  description?: unknown
  playCount?: unknown
  trackCount?: unknown
  updateFrequency?: unknown
  creator?: unknown
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

function image(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** A song's artists, each with the id its own page opens by (`[]` for one that gave none, or none at all). */
function readArtistRefs(raw: unknown): NeteaseArtistRef[] {
  if (!Array.isArray(raw)) return []
  const artists: NeteaseArtistRef[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const artist = entry as Record<string, unknown>
    const id = text(artist.id)
    const name = text(artist.name)
    if (!/^\d{1,20}$/.test(id) || !name) continue
    if (artists.some((kept) => kept.id === id)) continue
    artists.push({ id, name })
  }
  return artists.slice(0, 8)
}

function readTrack(raw: unknown): NeteaseTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const track = raw as Record<string, unknown>
  const title = text(track.title)
  if (!title) return null
  const duration = Math.max(0, count(track.duration, 0))
  const read: NeteaseTrack = {
    id: track.id === null || track.id === undefined || track.id === '' ? undefined : text(track.id),
    title,
    artist: text(track.artist),
    album: text(track.album),
    cover: image(track.cover),
    duration,
    position: clamp(count(track.position, 0), 0, duration || Number.MAX_SAFE_INTEGER),
    playable: track.playable !== false,
  }
  const artistId = text(track.artistId)
  if (artistId) read.artistId = artistId
  const artists = readArtistRefs(track.artists)
  if (artists.length > 0) read.artists = artists
  return read
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
      cover: image(list.cover),
      playCount: Math.max(0, count(list.playCount, 0)),
    })
  }
  return lists
}

/** A search's artists, as its `search` message says them. */
function readArtists(raw: unknown): NeteaseArtist[] {
  if (!Array.isArray(raw)) return []
  const artists: NeteaseArtist[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const artist = entry as Record<string, unknown>
    const id = text(artist.id)
    const name = text(artist.name)
    if (!id || !name) continue
    artists.push({ id, name, cover: image(artist.cover) })
  }
  return artists
}

/** A count a search's message says for a category, never under the list it came with. */
function total(raw: unknown, list: unknown[]): number {
  return Math.max(Math.max(0, count(raw, 0)), list.length)
}

/** The `search` message: the words, and the page's own categories' results for them. */
function readSearch(message: NeteaseMessage): NeteaseSearch {
  const songs = readSongs(message.songs)
  const artists = readArtists(message.artists)
  const playlists = readLists(message.playlists)
  return {
    query: text(message.query),
    songs,
    artists,
    playlists,
    songsTotal: total(message.songsTotal, songs),
    artistsTotal: total(message.artistsTotal, artists),
    playlistsTotal: total(message.playlistsTotal, playlists),
    failed: message.failed === true,
  }
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
    const read: NeteaseSong = {
      id,
      title,
      artist: text(song.artist),
      duration: Math.max(0, count(song.duration, 0)),
      playable: song.playable !== false,
    }
    const artistId = text(song.artistId)
    if (artistId) read.artistId = artistId
    const artists = readArtistRefs(song.artists)
    if (artists.length > 0) read.artists = artists
    const album = text(song.album)
    if (album) read.album = album
    const playCount = Math.max(0, count(song.playCount, 0))
    if (playCount > 0) read.playCount = playCount
    songs.push(read)
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
    cover: image(list.cover),
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
  const avatar = image(account.avatar)
  if (!name && !avatar) return null
  return { name, avatar }
}

/** The account's own profile, as its `profile` message says it: an account the app can show, or `null` for one
 * the page didn't say. */
function readProfile(raw: unknown): NeteaseProfile | null {
  const profile = raw && typeof raw === 'object' ? ((raw as Record<string, unknown>).profile ?? raw) : null
  if (!profile || typeof profile !== 'object') return null
  const said = profile as Record<string, unknown>
  const uid = text(said.uid)
  const name = text(said.name)
  if (!uid || !name) return null
  return {
    uid,
    name,
    avatar: image(said.avatar),
    signature: text(said.signature),
    level: Math.max(0, count(said.level, 0)),
    listenSongs: Math.max(0, count(said.listenSongs, 0)),
    follows: Math.max(0, count(said.follows, 0)),
    fans: Math.max(0, count(said.fans, 0)),
    playlistCount: Math.max(0, count(said.playlistCount, 0)),
    createDays: Math.max(0, count(said.createDays, 0)),
    vipType: Math.max(0, count(said.vipType, 0)),
    background: image(said.background),
  }
}

/** One of NetEase's rankings, as its `rankings` message says it, or `null` for one the app can't show. */
function readRanking(raw: unknown): NeteaseRanking | null {
  if (!raw || typeof raw !== 'object') return null
  const one = raw as Record<string, unknown>
  const id = text(one.id)
  const name = text(one.name)
  if (!id || !name) return null
  return {
    id,
    name,
    cover: image(one.cover),
    updateFrequency: text(one.updateFrequency),
    trackCount: Math.max(0, count(one.trackCount, 0)),
    playCount: Math.max(0, count(one.playCount, 0)),
    official: one.official === true,
  }
}

/** The `rankings` message: NetEase's own charts, in its own order, no duplicate. */
function readRankings(raw: unknown): NeteaseRanking[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).rankings
      : raw
  if (!Array.isArray(list)) return []
  const read: NeteaseRanking[] = []
  for (const entry of list) {
    const ranking = readRanking(entry)
    if (ranking && !read.some((each) => each.id === ranking.id)) read.push(ranking)
  }
  return read
}

/** The host's `state`: what it says, or `null` for a state this app can't read (nothing shown for it). */
function readPlayer(raw: unknown): NeteasePlayerState | null {
  if (!raw || typeof raw !== 'object') return null
  const state = raw as Record<string, unknown>
  return {
    signedIn: typeof state.signedIn === 'boolean' ? state.signedIn : null,
    signingIn: state.signingIn === true,
    playing: state.playing === true,
    mode: typeof state.mode === 'string' ? state.mode : undefined,
    volume: clamp(count(state.volume, 0.8), 0, 1),
    track: readTrack(state.track),
    liked: typeof state.liked === 'boolean' ? state.liked : null,
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
  const said = readMode(state.mode)
  useNetease.setState({ ...fromPlayer(state), ...(said === undefined ? {} : { mode: modeSaid(said) }) })
  if (state.track && (!before || songKey(before) !== songKey(state.track))) rememberPlayed(state.track)
}

/** A mode the page said, taken as it is — unless it's the one the app just pressed away from and the page hasn't
 * caught up yet: the app's own press keeps the mode it shows until the page's answer is due (its handler tells it
 * 350 ms after the press), then the page is believed again. */
let modePressed = { at: 0, from: 'list' as PlayMode, to: 'list' as PlayMode }

function modeSaid(said: PlayMode): PlayMode {
  const current = useNetease.getState().mode
  const fresh = performance.now() - modePressed.at > 1500
  if (!fresh && said === modePressed.from && said !== modePressed.to) return current
  return said
}

/** A playlist's own head, as its `playlist` answer says it (a ranking's answer says its update frequency too). */
function readPlaylistMeta(message: NeteaseMessage, id: string): PlaylistMeta {
  const name = typeof message.name === 'string' ? message.name : ''
  return {
    id,
    name,
    cover: image(message.cover),
    playCount: Math.max(0, count(message.playCount, 0)),
    trackCount: Math.max(0, count(message.trackCount, 0)),
    updateFrequency: typeof message.updateFrequency === 'string' ? message.updateFrequency : '',
    creator: typeof message.creator === 'string' ? message.creator : '',
    description: typeof message.description === 'string' ? message.description : '',
  }
}

/** A playlist's songs, as the hidden page answered (`netease` `playlist`). `meta`: its own head, when the answer
 * carried it (`openRanking`'s always does). */
export function receivePlaylist(id: string, songs: NeteaseSong[], meta?: PlaylistMeta | null): void {
  clearTimeout(waitingFor.get(id))
  waitingFor.delete(id)
  useNetease.setState((state) => ({
    playlists: {
      ...state.playlists,
      [id]: { songs, waiting: false, failed: false, meta: meta ?? state.playlists[id]?.meta ?? null },
    },
  }))
  // A Play all pressed before the songs came: the first it can play starts now, its id and its list known.
  if (playAllWhenReady.delete(id) && isInHost()) {
    const first = songs.find((song) => song.playable)
    if (first) {
      rememberQueue(id)
      netease({ action: 'play', value: first.id, list: id })
    }
  }
}

/** What the app has asked the hidden page for and not heard back about, with the moment it gives up. */
const waitingFor = new Map<string, ReturnType<typeof setTimeout>>()

/** Playlist pages whose Play all was pressed before their songs had come: played as the songs arrive. */
const playAllWhenReady = new Set<string>()

/** How long a playlist page waits for the hidden page before saying it couldn't open it. */
const PLAYLIST_WAIT = 12000

/** How long an artist's page waits for the hidden page before saying it couldn't open it. */
const ARTIST_WAIT = 14000

/** How long each of the page's other readings may take (Home's day's page follows its cards' one): past that the
 * app says it couldn't read it, and its page's Retry asks again. */
const HOME_WAIT = 26000
const LIBRARY_WAIT = 20000
// A search reads the page's own three categories (its 单曲, 歌手 and 歌单 tabs): each its own page's wait.
const SEARCH_WAIT = 30000
const RECENT_WAIT = 15000
// The rankings are one same-origin answer (65 cards); the profile is two (the user detail and the level).
const RANKINGS_WAIT = 15000
const PROFILE_WAIT = 15000

/** The preview answers a moment later, as the hidden page would. */
const PREVIEW_ANSWER = 120

let homeWait: ReturnType<typeof setTimeout> | undefined
let libraryWait: ReturnType<typeof setTimeout> | undefined
let searchWait: ReturnType<typeof setTimeout> | undefined
let recentWait: ReturnType<typeof setTimeout> | undefined
let rankingsWait: ReturnType<typeof setTimeout> | undefined
let profileWait: ReturnType<typeof setTimeout> | undefined

// --- The account's page's other answers: Home, My Music's playlists, a search, the recent songs -----------------

/** Home's answer (`netease` `home`): the cards come first, the day's songs (still `null`) after them — the wait
 * goes on until they come, or its time is up. */
export function receiveHome(home: NeteaseHome): void {
  clearTimeout(homeWait)
  if (home.daily === null) {
    // The page's cards are known; its day's songs are still being read (the wait for them goes on).
    useNetease.setState({ home, homeAsking: { waiting: true, failed: false }, heard: true })
    homeWait = setTimeout(
      () =>
        useNetease.setState((state) =>
          state.homeAsking.waiting ? { homeAsking: { waiting: false, failed: true } } : state,
        ),
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

/** NetEase's own rankings, as the hidden page listed them (`netease` `rankings`). */
export function receiveRankings(rankings: NeteaseRanking[]): void {
  clearTimeout(rankingsWait)
  useNetease.setState({ rankings, rankingsAsking: IDLE_ASKING })
}

/** The account's own profile, as the hidden page read it (`netease` `profile`). */
export function receiveProfile(profile: NeteaseProfile): void {
  clearTimeout(profileWait)
  useNetease.setState({ profile, profileAsking: IDLE_ASKING })
  // The profile's own name and picture are the account the rail shows, when the state hasn't said more.
  useNetease.setState((state) =>
    state.account || !profile.name ? state : { account: { name: profile.name, avatar: profile.avatar } },
  )
}

/** The last search asked: an earlier answer arriving late (the player typed on) is dropped, not shown. */
let searchWanted = ''

/** The page's answer to a search (`netease` `search`): only the last asked shows. */
export function receiveSearch(search: NeteaseSearch): void {
  if (search.query !== searchWanted) return
  clearTimeout(searchWait)
  useNetease.setState({ search, searchAsking: IDLE_ASKING })
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
      () =>
        useNetease.setState((state) =>
          state.homeAsking.waiting ? { homeAsking: { waiting: false, failed: true } } : state,
        ),
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
      () =>
        useNetease.setState((state) =>
          state.recentAsking.waiting ? { recentAsking: { waiting: false, failed: true } } : state,
        ),
      RECENT_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW) receiveRecent(PREVIEW.recent())
  }, PREVIEW_ANSWER)
}

/** Reads NetEase's own rankings list again (`again`: the page's Refresh, or a read that didn't come). */
export function requestRankings(again = false): void {
  const { rankings, rankingsAsking } = useNetease.getState()
  if (!again && (rankings || rankingsAsking.waiting)) return
  clearTimeout(rankingsWait)
  useNetease.setState({ rankingsAsking: { waiting: true, failed: false } })
  if (isInHost()) {
    netease({ action: 'rankings' })
    rankingsWait = setTimeout(
      () =>
        useNetease.setState((state) =>
          state.rankingsAsking.waiting ? { rankingsAsking: { waiting: false, failed: true } } : state,
        ),
      RANKINGS_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW) receiveRankings(PREVIEW.rankings())
  }, PREVIEW_ANSWER)
}

/** Reads the account's own profile again (its page's Refresh). */
export function requestProfile(again = false): void {
  const { profile, profileAsking } = useNetease.getState()
  if (!again && (profile || profileAsking.waiting)) return
  clearTimeout(profileWait)
  useNetease.setState({ profileAsking: { waiting: true, failed: false } })
  if (isInHost()) {
    netease({ action: 'profile' })
    profileWait = setTimeout(
      () =>
        useNetease.setState((state) =>
          state.profileAsking.waiting ? { profileAsking: { waiting: false, failed: true } } : state,
        ),
      PROFILE_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (PREVIEW) receiveProfile(PREVIEW.profile())
  }, PREVIEW_ANSWER)
}

/** What the search bar at the page's top says: a search of the words starts a moment after the last key (in
 * `SearchBar`, NeteaseApp.tsx), and typing switches to the search's page. */
export function setQuery(value: string): void {
  const said = value.slice(0, 60)
  if (useNetease.getState().query === said) return
  useNetease.setState({ query: said })
  const { tab } = useNetease.getState()
  if (said.trim() && tab !== 'search') openTab('search')
}

/** A search's own category picked (its page's tab): what the last answer's lists show. */
export function setSearchTab(tab: SearchTab): void {
  useNetease.setState({ searchTab: tab })
}

/** The search bar pressed (the page's own tab): its page, with its own last search's answer still there. */
export function openSearch(): void {
  if (useNetease.getState().tab !== 'search') openTab('search')
}

/** Searches the page for `query` (`''`: its results put away). Only the last asked shows, as the player types. */
export function searchFor(query: string): void {
  const said = query.trim().slice(0, 60)
  const changed = said !== searchWanted
  searchWanted = said
  clearTimeout(searchWait)
  if (!said) {
    useNetease.setState({ search: null, searchAsking: IDLE_ASKING })
    return
  }
  useNetease.setState({
    searchAsking: { waiting: true, failed: false },
    ...(changed ? { searchTab: 'songs' as const } : {}),
  })
  if (isInHost()) {
    netease({ action: 'search', value: said })
    searchWait = setTimeout(
      () =>
        useNetease.setState((state) =>
          state.searchAsking.waiting ? { searchAsking: { waiting: false, failed: true } } : state,
        ),
      SEARCH_WAIT,
    )
    return
  }
  setTimeout(() => {
    if (!PREVIEW || searchWanted !== said) return
    const found = PREVIEW.search(said)
    receiveSearch({
      query: said,
      songs: found.songs,
      artists: found.artists,
      playlists: found.playlists,
      songsTotal: found.songs.length,
      artistsTotal: found.artists.length,
      playlistsTotal: found.playlists.length,
      failed: false,
    })
  }, PREVIEW_ANSWER)
}

/** Waits on a page the hidden page hasn't answered: `settle` says so if it's still waiting. */
function waitForPage(id: string, wait: number, settle: () => void): void {
  waitingFor.set(
    id,
    setTimeout(() => {
      waitingFor.delete(id)
      settle()
    }, wait),
  )
}

/** Asks the hidden page to open a playlist, once per page: its songs come as a `playlist` message. */
function requestPlaylist(id: string, again = false): void {
  const page = useNetease.getState().playlists[id]
  if (!again && (page?.songs || page?.waiting)) return
  clearTimeout(waitingFor.get(id))
  useNetease.setState((state) => ({
    playlists: {
      ...state.playlists,
      [id]: { songs: again ? (page?.songs ?? null) : null, waiting: true, failed: false, meta: page?.meta ?? null },
    },
  }))
  if (isInHost()) {
    netease({ action: 'openPlaylist', value: id })
    waitForPage(id, PLAYLIST_WAIT, () =>
      useNetease.setState((state) => {
        const current = state.playlists[id]
        if (!current?.waiting) return state
        return { playlists: { ...state.playlists, [id]: { ...current, waiting: false, failed: true } } }
      }),
    )
    return
  }
  setTimeout(() => {
    if (!PREVIEW) return
    receivePlaylist(id, PREVIEW.songs(id))
  }, PREVIEW_ANSWER)
}

/** Asks the hidden page to open one of NetEase's rankings (`id`: the ranking's own id, NetEase's playlist id):
 * its songs come as a `playlist` message with that same id, kept in `playlists[id]` as a playlist's. */
function requestRanking(id: string, again = false): void {
  const page = useNetease.getState().playlists[id]
  if (!again && (page?.songs || page?.waiting)) return
  clearTimeout(waitingFor.get(id))
  useNetease.setState((state) => ({
    playlists: {
      ...state.playlists,
      [id]: { songs: again ? (page?.songs ?? null) : null, waiting: true, failed: false, meta: page?.meta ?? null },
    },
  }))
  if (isInHost()) {
    netease({ action: 'openRanking', value: id })
    waitForPage(id, PLAYLIST_WAIT, () =>
      useNetease.setState((state) => {
        const current = state.playlists[id]
        if (!current?.waiting) return state
        return { playlists: { ...state.playlists, [id]: { ...current, waiting: false, failed: true } } }
      }),
    )
    return
  }
  setTimeout(() => {
    if (!PREVIEW) return
    const ranking = PREVIEW.ranking(id)
    receivePlaylist(id, ranking?.songs ?? [], ranking?.meta ?? null)
  }, PREVIEW_ANSWER)
}

/** The artist pages asked of the hidden page and not heard back about, with the moment each gives up. */
const waitingForArtist = new Map<string, ReturnType<typeof setTimeout>>()

/** Applies an artist's page as the hidden page answered (`netease` `artist`): their name, alias, picture and
 * songs. */
export function receiveArtist(
  id: string,
  artist: Pick<NeteaseArtistPage, 'name' | 'alias' | 'cover' | 'description'> & { songs: NeteaseSong[] },
): void {
  clearTimeout(waitingForArtist.get(id))
  waitingForArtist.delete(id)
  useNetease.setState((state) => ({
    artists: { ...state.artists, [id]: { ...artist, waiting: false, failed: false } },
  }))
}

/** Asks the hidden page for an artist's page, once per page: their name, picture and songs come as an `artist`
 * message. `meta`: their card a search already showed, so the page's head draws while the page loads. */
function requestArtist(id: string, again = false, meta: NeteaseArtist | null = null): void {
  const page = useNetease.getState().artists[id]
  if (!again && (page?.songs || page?.waiting)) return
  clearTimeout(waitingForArtist.get(id))
  useNetease.setState((state) => ({
    artists: {
      ...state.artists,
      [id]: {
        name: meta?.name ?? page?.name ?? '',
        alias: page?.alias ?? '',
        cover: meta?.cover ?? page?.cover ?? null,
        description: page?.description ?? '',
        songs: again ? (page?.songs ?? null) : null,
        waiting: true,
        failed: false,
      },
    },
  }))
  if (isInHost()) {
    netease({ action: 'openArtist', value: id })
    waitingForArtist.set(
      id,
      setTimeout(() => {
        waitingForArtist.delete(id)
        useNetease.setState((state) => {
          const current = state.artists[id]
          if (!current?.waiting) return state
          return { artists: { ...state.artists, [id]: { ...current, waiting: false, failed: true } } }
        })
      }, ARTIST_WAIT),
    )
    return
  }
  setTimeout(() => {
    if (!PREVIEW) return
    receiveArtist(id, PREVIEW.artist(id))
  }, PREVIEW_ANSWER)
}

/** Asks the hidden page for the artist's page again (its page's Retry). */
export function retryArtist(artistId: string): void {
  requestArtist(artistId, true)
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

/** The page an artist card opens: asked of the hidden page (their card from the search draws its head first). */
export function openArtist(artistId: string): void {
  const { tab, views, search } = useNetease.getState()
  useNetease.setState({ views: { ...views, [tab]: [...views[tab], { id: nextId++, kind: 'artist', artistId }] } })
  requestArtist(artistId, false, search?.artists.find((artist) => artist.id === artistId) ?? null)
}

/** The page the recent-play entry opens: the account's recent songs, asked of the hidden page if not known yet. */
export function openRecent(): void {
  const { tab, views } = useNetease.getState()
  useNetease.setState({ views: { ...views, [tab]: [...views[tab], { id: nextId++, kind: 'recent' }] } })
  requestRecent()
}

/** The page one of NetEase's rankings opens: its card is from `rankings`, its songs from `playlists[rankingId]`. */
export function openRanking(rankingId: string): void {
  const { tab, views } = useNetease.getState()
  useNetease.setState({ views: { ...views, [tab]: [...views[tab], { id: nextId++, kind: 'ranking', rankingId }] } })
  requestRanking(rankingId)
}

/** Asks the hidden page for one of NetEase's rankings again (its page's Retry). */
export function retryRanking(rankingId: string): void {
  requestRanking(rankingId, true)
}

/** Where a playlist's own card may be known from: Home's shelves, My Music's groups, the state's own lists, a
 * search's playlists (a result pressed), and the rankings (a chart pressed). */
export interface PlaylistSources {
  lists: NeteaseList[]
  home: NeteaseHome | null
  library: NeteaseLibraryGroup[] | null
  search?: NeteaseSearch | null
  rankings?: NeteaseRanking[] | null
}

/** A playlist card as the app knows it, or `null` for one not known yet: its page shows the name and cover as soon
 * as any of the app's readings has them. */
export function findPlaylistMeta(sources: PlaylistSources, id: string): NeteaseList | null {
  const known = sources.lists.find((list) => list.id === id)
  if (known) return known
  const ranking = sources.rankings?.find((one) => one.id === id)
  if (ranking) return { id: ranking.id, name: ranking.name, cover: ranking.cover, playCount: ranking.playCount }
  const searched = sources.search?.playlists.find((list) => list.id === id)
  if (searched) return searched
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

/** A playlist's card for its page: from Home, My Music, the state's lists, a search or the rankings (the first
 * that knows it). */
export function usePlaylistMeta(id: string): NeteaseList | null {
  const lists = useNetease((state) => state.lists)
  const home = useNetease((state) => state.home)
  const library = useNetease((state) => state.library)
  const search = useNetease((state) => state.search)
  const rankings = useNetease((state) => state.rankings)
  return useMemo(
    () => findPlaylistMeta({ lists, home, library, search, rankings }, id),
    [lists, home, library, search, rankings, id],
  )
}

/** One of NetEase's rankings as the app knows it (its card for its page's head), or `null` for one not known
 * yet. */
export function findRankingMeta(rankings: NeteaseRanking[] | null, id: string): NeteaseRanking | null {
  return rankings?.find((one) => one.id === id) ?? null
}

/** One of NetEase's rankings as the app knows it (its card, for its page's head). */
export function useRankingMeta(id: string): NeteaseRanking | null {
  const rankings = useNetease((state) => state.rankings)
  return useMemo(() => findRankingMeta(rankings, id), [rankings, id])
}

/** An artist's card for its page: from the search that opened it (the page's own answer draws the rest). */
export function useArtistMeta(id: string): NeteaseArtist | null {
  const search = useNetease((state) => state.search)
  return useMemo(() => search?.artists.find((artist) => artist.id === id) ?? null, [search, id])
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

// --- The heart (喜欢: the account's own 我喜欢的音乐) ---------------------------------------------------------

/** How long a heart waits for the page's own answer before it says the like didn't land. */
const LIKE_WAIT = 12000

let likeWait: ReturnType<typeof setTimeout> | undefined
let likeFailureId = 0

/** A heart pressed: the playing song added to (or taken from) the account's own 我喜欢的音乐 by the hidden page,
 * through its own interface. The heart changes only when the page's own answer says it landed (`receiveLike`); a
 * `false` says so over the player (`likeFailure`). */
export function setLiked(liked: boolean): void {
  const { track, liked: current, liking } = useNetease.getState()
  if (!track?.id || liking || current === null || current === liked) return
  clearTimeout(likeWait)
  useNetease.setState({ liking: true })
  if (isInHost()) {
    netease({ action: 'setLike', value: track.id, liked })
    likeWait = setTimeout(() => {
      useNetease.setState({ liking: false, likeFailure: { reason: 'timeout', id: ++likeFailureId } })
    }, LIKE_WAIT)
    return
  }
  setTimeout(() => {
    if (!PREVIEW) return
    const now = PREVIEW.setLiked(track.id!, liked)
    useNetease.setState({ liked: now, liking: false })
  }, PREVIEW_ANSWER)
}

/** The page's answer to a heart pressed (`netease` `like`): the heart changes only if its own answer says the song
 * really is (or no longer is) in the account's 我喜欢的音乐. */
export function receiveLike(id: string, liked: boolean, ok: boolean, reason: string): void {
  clearTimeout(likeWait)
  const { track } = useNetease.getState()
  useNetease.setState((state) => ({
    liking: false,
    liked: ok && track?.id === id ? liked : state.liked,
    likeFailure: ok ? state.likeFailure : { reason, id: ++likeFailureId },
  }))
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
    rememberQueue(playlistId)
    netease({ action: 'play', value: first.id, list: playlistId })
    return
  }
  playAllWhenReady.add(playlistId)
  requestPlaylist(playlistId)
}

/** A song of a playlist pressed: the hidden page is asked to play that song (through the page's own player,
 * watched and rescued). */
export function playSong(playlistId: string, song: NeteaseSong): void {
  if (!isInHost()) {
    previewRun((preview) => preview.playSong(playlistId, song))
    return
  }
  if (!song.playable) return
  rememberQueue(playlistId)
  netease({ action: 'play', value: song.id, list: playlistId })
}

/** The list a song is known from, as the host's page names its lists (a playlist's or a ranking's id, `daily`,
 * `recent`, `search`, `artist:<id>`): the page then plays it in its own queue (its own next/previous and preload),
 * which is what makes a switch near instant. `null` for one no reading has. */
export function contextOfSong(songId: string): string | null {
  const state = useNetease.getState()
  for (const [id, page] of Object.entries(state.playlists)) {
    if (page.songs?.some((song) => song.id === songId)) return id
  }
  if (state.home?.daily?.some((song) => song.id === songId)) return 'daily'
  if (state.recent?.some((song) => song.id === songId)) return 'recent'
  if (state.search?.songs.some((song) => song.id === songId)) return 'search'
  for (const [id, page] of Object.entries(state.artists)) {
    if (page.songs?.some((song) => song.id === songId)) return `artist:${id}`
  }
  return null
}

/** A song the app knows only by itself pressed (a search's, Home's day's, the recent list's): the hidden page is
 * asked to play that id, the list the app knows it from told with it (the page's own queue), or its own player's way
 * when the app has read no list of it. */
export function playFound(song: NeteaseSong): void {
  if (!isInHost()) {
    previewRun((preview) => preview.playHistory(song))
    return
  }
  if (!song.playable) return
  const list = contextOfSong(song.id)
  if (list) rememberQueue(list)
  else forgetQueue()
  netease(list ? { action: 'play', value: song.id, list } : { action: 'play', value: song.id })
}

/** The day's songs from their start (Home's Play all): its first playable song, by id, in the day's own list. */
export function playDaily(): void {
  const songs = useNetease.getState().home?.daily ?? []
  const first = songs.find((song) => song.playable)
  if (!first) return
  if (!isInHost()) {
    previewRun((preview) => preview.playHistory(first))
    return
  }
  rememberQueue('daily')
  netease({ action: 'play', value: first.id, list: 'daily' })
}

/** The songs of a list the app has read, as the page names its lists (`daily`, `recent`, `search`, `artist:<id>`, a
 * playlist's or a ranking's id). */
function songsOfList(list: string): NeteaseSong[] {
  const state = useNetease.getState()
  if (list === 'daily') return state.home?.daily ?? []
  if (list === 'recent') return state.recent ?? []
  if (list === 'search') return state.search?.songs ?? []
  const artist = 'artist:'
  if (list.startsWith(artist)) return state.artists[list.slice(artist.length)]?.songs ?? []
  return state.playlists[list]?.songs ?? []
}

/** The cabin's language, for the app's own words: NeteaseApp sets the page's `lang` to it. The lists without a name
 * of their own (the day's, the recent chart's, a search's) are named with them. */
function languageNow(): string {
  try {
    return typeof document === 'undefined' ? '' : document.documentElement.lang
  } catch {
    return ''
  }
}

/** What a list is, for the app's own state (`from`): its kind, and its name (its own for a playlist or a chart, the
 * app's word for one without). */
function fromOfList(list: string): NeteaseFrom {
  const state = useNetease.getState()
  const words = neteaseWords(languageNow())
  if (list === 'daily') return { kind: 'daily', name: words.daily }
  if (list === 'recent') return { kind: 'recent', name: words.recent }
  if (list === 'search') return { kind: 'search', name: state.search?.query || words.search }
  const artist = 'artist:'
  if (list.startsWith(artist)) {
    return { kind: 'artist', name: state.artists[list.slice(artist.length)]?.name || words.artist }
  }
  const ranking = state.rankings?.some((one) => one.id === list) ?? false
  const name = state.playlists[list]?.meta?.name || findPlaylistMeta(state, list)?.name || ''
  return { kind: ranking ? 'ranking' : 'playlist', name }
}

/** The list what plays came from, as the app last set it: the page's own order, and the order's ids. `null` while the
 * app knows no list of what plays. */
let queue: { list: string; ids: string[] } | null = null

/** A list as the page's own queue: the songs it can play, in its own order (a song the account's rights don't allow
 * is never a next: the page has no sound for it). */
function queueOf(list: string): { list: string; ids: string[] } | null {
  const ids = songsOfList(list)
    .filter((song) => song.playable)
    .map((song) => song.id)
  return ids.length > 0 ? { list, ids } : null
}

/** The app's queue set to the list a song was played from (its own order, and where it came from). */
function rememberQueue(list: string): void {
  queue = queueOf(list)
  useNetease.setState({ from: fromOfList(list) })
}

/** Forgets the queue: a song of no list the app has read (the page's own next/previous is all there is for it). */
function forgetQueue(): void {
  queue = null
  useNetease.setState({ from: null })
}

/** The list what plays belongs to, for a skip: the app's own queue while the song is in it, else the list the app
 * knows the song from (the page's own player moved on, or a state came from somewhere else). */
function currentQueue(): { list: string; ids: string[] } | null {
  const { track } = useNetease.getState()
  if (!track?.id) return null
  if (queue && queue.ids.includes(track.id)) return queue
  const list = contextOfSong(track.id)
  const known = list ? queueOf(list) : null
  if (!known) return null
  queue = known
  useNetease.setState({ from: fromOfList(known.list) })
  return known
}

/** The song a skip goes to, computed from the list's own order and the play mode: `null` when the app knows no list
 * of what plays (the page's own next/previous is asked then).
 *
 * - 列表循环: the list's next (or previous), its start after its end (and its end before its start).
 * - 单曲循环: the same walk for a manual skip (only the song's own end repeats; its next is still the list's).
 * - 随机: a random song of this list, never the one playing (a list of one has nowhere else to go). */
function targetOf(direction: 1 | -1): { list: string; id: string; song: NeteaseSong | null } | null {
  const state = useNetease.getState()
  const playing = state.track?.id
  const known = currentQueue()
  if (!known || !playing) return null
  const at = known.ids.indexOf(playing)
  if (at < 0) return null
  const songs = songsOfList(known.list)
  const pick = (id: string) => ({ list: known.list, id, song: songs.find((song) => song.id === id) ?? null })
  if (state.mode === 'shuffle' && known.ids.length > 1) {
    const others = known.ids.filter((id) => id !== playing)
    return pick(others[Math.floor(Math.random() * others.length)])
  }
  return pick(known.ids[(at + direction + known.ids.length) % known.ids.length])
}

/** The next song, or the one before. With a list what plays is from (and the song in it) the song is computed here and
 * asked by id with its list: the page's own queue is set to that list from that song, so the switch is the page's own
 * and its order is the list's. With no list known, the page's own next/previous is asked, as before.
 *
 * Returns the song it asked for when it knows it (the player bar shows it at once), `null` when the page's own
 * button answered for the app. */
export function skip(direction: 1 | -1): NeteaseSong | null {
  if (!isInHost()) {
    previewRun((preview) => preview.skip(direction))
    return null
  }
  const target = targetOf(direction)
  if (target) {
    netease({ action: 'play', value: target.id, list: target.list })
    return target.song
  }
  netease({ action: direction === 1 ? 'next' : 'prev' })
  return null
}

/** Its play mode's next one (列表循环 -> 随机 -> 单曲循环 -> 列表循环), as its own play bar's button presses it. The
 * app shows the new mode at once and says it over the player; the page's own state confirms it a moment later (its
 * button's own order is the same). Returns the mode the press went to. */
export function cycleMode(): PlayMode {
  const from = useNetease.getState().mode
  const to = nextPlayMode(from)
  modePressed = { at: performance.now(), from, to }
  useNetease.setState({ mode: to })
  if (isInHost()) netease({ action: 'cycleMode' })
  return to
}

/** A song of the session's recent list pressed (preview only: the hidden page plays by id, as `playFound`). */
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
/** Its sound's level for a fade (musicWithGame.ts): the volume the app chose stays as it is (a fade never leaves the
 * player silent). */
export function fadeVolume(share: number): void {
  if (!isInHost()) {
    previewRun((preview) => preview.setVolume(share))
    return
  }
  netease({ action: 'volumeFade', value: clamp(share, 0, 1) })
}

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

/** Applies each `netease` message the host sends (state, playlist, home, library, search, recent, artist, like,
 * rankings, profile), and only those. Exported for the app's tests, which feed it the host's messages as they
 * come. */
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
      if (id) receivePlaylist(id, readSongs(each.songs), readPlaylistMeta(each, id))
      return
    }
    case 'home':
      receiveHome(readHome(each))
      return
    case 'library':
      receiveLibrary(readLibrary(each.groups))
      return
    case 'search':
      receiveSearch(readSearch(each))
      return
    case 'rankings':
      receiveRankings(readRankings(each.rankings))
      return
    case 'profile': {
      const profile = readProfile(each)
      if (profile) receiveProfile(profile)
      return
    }
    case 'artist': {
      const id = text(each.id)
      if (id) {
        receiveArtist(id, {
          name: text(each.name),
          alias: text(each.alias),
          cover: image(each.cover),
          description: text(each.description),
          songs: readSongs(each.songs),
        })
      }
      return
    }
    case 'recent':
      receiveRecent(readSongs(each.songs))
      return
    case 'like': {
      const id = text(each.id)
      if (id) receiveLike(id, each.liked === true, each.ok === true, text(each.reason))
      return
    }
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
  // As its own buttons say it (the page ignores one that would change nothing): the menu's pause is a pause, and the
  // way back plays on, whether the state the app still shows is behind or not.
  pauseHere: () => netease({ action: 'pause' }),
  resumeHere: () => netease({ action: 'play' }),
  volume: () => useNetease.getState().volume,
  sendVolume: (share) => fadeVolume(share),
  setVolume: (share) => setVolume(share),
  skip: (direction) => {
    skip(direction)
  },
  subscribe: (changed) =>
    useNetease.subscribe((now, before) => {
      if (now.playing && !before.playing) changed(true)
    }),
}

/** NetEase with the game: the music pauses while the player is away from it, and plays on after. */
export function pauseNeteaseWithGame(): () => void {
  return pauseMusicWithGame(neteasePlayer)
}
