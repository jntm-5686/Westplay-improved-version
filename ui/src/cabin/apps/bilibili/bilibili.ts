import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import type { MediaSource } from '../../../shared/media'
import { rectInArea, usePageHole } from '../safari/hole'
import { isInHost, postToHost, subscribeHostMessages } from '../../../shared/host'
import { createPreview } from './preview'
import { sourceOf } from './source'
import { playhead } from './time'
import { bilibiliWords } from './words'

/**
 * 哔哩哔哩 (Bilibili) in the cab, as WestPlay draws it. The UI is the app's own, drawn from the host's messages: the
 * host runs Bilibili's page hidden on the PC (`crates/host/src/bilibili.rs`, its injected page `bilibili.js`) and this
 * file is the only place that talks to it.
 *
 * The protocol has one home, `notes/bilibili-v1-host.md` (the host team's own): `BilibiliCommand` (UI → host, posted
 * as `{ type: 'bilibili', kind: 'command', command }`) and `BilibiliMessage` (host → UI, `{ type: 'bilibili', kind }`).
 * Every reading of a message goes through the `read*` functions below, so a field renamed on the host side is one edit
 * here. `// TODO(host)` marks what the host still owns.
 *
 * In a plain browser (`npm run dev`, no host) `preview.ts` answers instead, with made-up data, so the whole app can be
 * looked at. Inside the host it is always the real Bilibili page: the preview is never read.
 *
 * TODO(host): the message fields this side still guesses at (told to bili-host, 2026-11-21):
 * - `favorites` folders: `{id,title,count}`; `favoriteItems` `{mediaId,title,items,hasMore}` (this side shows `items`).
 * - `dynamic` items are a video + `{dynamicId, said}`; `space` is `{mid,name,avatar,sign,level,fans,items}`.
 * - `search` `users` cards: this side reads `{mid,name,avatar,fans}`; the query's own `searchKind` names the filter.
 * - `show` is taken as YouTube's: page pixels × `devicePixelRatio`; `crop: true` fills the player's screen rect.
 * - captions (`captions`/`caption`, the `caption` command) are in the protocol but have no UI in V1 (no subtitles are
 *   drawn: the player page covers the picture).
 * - `history` pages: only the first is read (`max: 20, viewAt: 0`); the answer's `viewAt`/`max` cursors are kept in the
 *   items for a later page.
 */

// --- What Bilibili's page says --------------------------------------------------------------------------------

/** A UP主 (or anybody Bilibili names): their id, name and picture. The host writes the id as `mid` (a video's
 * owner) or `uid` (a live room's streamer); both are read into `uid`. */
export interface BilibiliUp {
  uid: string
  name: string
  avatar: string | null
  /** Followers, when Bilibili says it (a search's user card, a space). */
  fans?: number
}

/** The signed-in account, as 我的 shows it. */
export interface BilibiliUser extends BilibiliUp {
  /** 大会员, in Bilibili's own words, empty for none. */
  vip?: string
  sign?: string
  following?: number
  /** 粉丝数, when the account's answer says it. */
  follower?: number
}

/** One person on 我的粉丝 / 我关注的人. */
export interface BilibiliRelation extends BilibiliUp {
  sign?: string
}

/** 我的粉丝 or 我关注的人. */
export type RelationKind = 'followers' | 'following'

/** A video, as a card or a row lists it (`kind:"video"` items). */
export interface BilibiliVideo {
  /** Its BV id (`bvid`). */
  id: string
  title: string
  cover: string | null
  /** Seconds. */
  duration: number
  up: BilibiliUp
  views: number
  likes?: number
  danmaku?: number
  /** Its aid, when the host says it (`av…`). */
  aid?: number
  cid?: number
  /** 1-based: the part (`page`) of a multi-part video, and how many it has. */
  page?: number
  pages?: number
  /** The description, when the host gives it. */
  description?: string
  /** As Bilibili's page words it, when it says ("2 天前"). */
  published?: string
}

/** One episode of a season (番剧/影视), as its page's 选集 lists them. */
export interface BilibiliEpisode {
  /** Its ep id: what `play` takes for a bangumi. */
  id: string
  /** Its name, as Bilibili words it: `long_title` when the host gives it separate from the number, else `title`. */
  title: string
  /** The name Bilibili keeps apart from the number ("出发之前"), when the host gives it. */
  longTitle?: string
  duration: number
  /** 1-based, in the season's order. */
  index: number
  cover?: string | null
  /** Its VIP mark ("会员", "大会员", "付费"): empty or absent for a free episode. */
  badge?: string
}

/** 番剧 (anime) or 影视 (films, series, documentaries). */
export type BilibiliSeasonKind = 'anime' | 'cinema'

/** A season: 番剧 or 影视 (`kind:"media"` items, and a season's own page). */
export interface BilibiliBangumi {
  seasonId: string
  title: string
  cover: string | null
  kind: BilibiliSeasonKind
  /** 简介, when the host gives it (its own page does). */
  description: string
  /** "更新至第 12 话", "全 24 话", as Bilibili's page words it (`indexShow`). */
  progress?: string
  /** 评分 (its page's `score` is a string, "9.7"). */
  rating?: number
  /** 大会员 and the like. */
  badge?: string
  /** The first episode (`epId`), for a media card pressed. */
  firstEpisodeId?: string
  episodes: BilibiliEpisode[]
}

/** A live room, as 直播 lists it (`kind:"live"` items). */
export interface BilibiliLiveRoom {
  roomId: string
  title: string
  cover: string | null
  uname: string
  avatar?: string | null
  /** 人气, as Bilibili counts it. */
  online: number
  /** Its category ("虚拟主播", "英雄联盟"). */
  area: string
  live: boolean
}

/** One thing in the account's history. */
export interface BilibiliHistoryItem {
  video: BilibiliVideo
  /** Seconds watched, when Bilibili says it. */
  progress?: number
  /** "昨天 21:30", or a date made of the host's `viewedAt`. */
  watchedAt?: string
  /** The history's cursor to read from, for the next page (`viewAt` in the answer). */
  viewAt?: number
}

/** One of the account's favorite folders. */
export interface BilibiliFavoriteFolder {
  id: string
  title: string
  count: number
}

/** One post in the feed of creators the account follows (a video, with what its creator said). */
export interface BilibiliDynamicItem {
  id: string
  user: BilibiliUp
  text: string
  cover?: string | null
  video?: BilibiliVideo
  /** "3 小时前" or a date made of its `pubdate`. */
  at: string
}

/** A UP主's page. */
export interface BilibiliSpace {
  user: BilibiliUp
  sign?: string
  level?: number
  fans?: number
  following?: number
  videos: BilibiliVideo[]
}

/** A video's own page (`detail`): its parts and its numbers, at most, and whether the account liked, coined and
 * saved it (only when signed in). */
export interface BilibiliVideoDetail {
  id: string
  title: string
  cover: string | null
  duration: number
  description: string
  up: BilibiliUp | null
  /** `{views, likes, coins, favorites, danmaku}`. */
  stat?: { views?: number; likes?: number; coins?: number; favorites?: number; danmaku?: number }
  /** Its parts: a video of more than one. */
  pages?: { cid: string; page: number; title: string; duration: number }[]
  liked: boolean | null
  coins: number | null
  favorited: boolean | null
}

/** A quality the page can play at: the host's qn and its label. Kept in the protocol; the player has no quality UI. */
export interface BilibiliQuality {
  /** Bilibili's qn (80: 1080P, 64: 720P…). */
  quality: number
  label: string
}

/** What the app's player is playing: a video, a season's episode or a live room. */
export interface BilibiliNow {
  id: string
  kind: 'video' | 'bangumi' | 'live'
  title: string
  cover: string | null
  up: BilibiliUp | null
  views: number
  /** Seconds; 0 for a live stream. */
  duration: number
  /** A video's aid, when it has one. */
  aid?: number
  /** A 番剧's season and episode. */
  seasonId?: string
  epId?: string
  /** The part (`page`) playing, of a multi-part video. */
  page?: number
  pages?: number
  /** A live room's room. */
  roomId?: string
  live: boolean
}

/** One of the hidden page's messages' payloads: what plays (`null`: Bilibili isn't running). // TODO(host) */
export interface BilibiliPlayback {
  signedIn?: boolean | null
  signingIn?: boolean
  playing?: boolean
  volume?: number
  rate?: number
  /** Seconds. */
  time?: number
  duration?: number
  media?: unknown
  /** The picture's width ÷ its height (0.5625: a portrait video); `null`/missing: 16:9. */
  aspect?: unknown
  qualities?: unknown
  quality?: unknown
  qualityLabel?: unknown
  captions?: unknown
  caption?: unknown
  cabLevel?: unknown
}

/** The account, as `account` says it. // TODO(host) */
export interface BilibiliAccountMessage {
  signedIn?: boolean | null
  signingIn?: boolean
  uid?: unknown
  mid?: unknown
  name?: unknown
  avatar?: unknown
  vip?: unknown
  sign?: unknown
}

/**
 * The host's message to the app (`{ type: 'bilibili', kind }`), as `notes/bilibili-v1-host.md` writes it. The payload
 * of each kind is read by the `receive*` functions below; the item lists are the host's `kind` union, read by
 * `readItem`.
 */
export type BilibiliMessage =
  /** The hidden page's playback and sign-in state (`state: null`: Bilibili isn't running). */
  | { type: 'bilibili'; kind: 'state'; state?: unknown }
  /** Whether the host's video is really showing on the page's screen (the only thing that opens its cut). */
  | { type: 'bilibili'; kind: 'showing'; on?: unknown }
  /** Who is signed in, and whether a sign-in window is open. */
  | { type: 'bilibili'; kind: 'account'; account?: unknown; signedIn?: unknown; signingIn?: unknown }
  | {
      type: 'bilibili'
      kind: 'home'
      items?: unknown
      /** The page it answers (1: the first; later: its next). */
      page?: unknown
      /** More pages after it. */
      more?: unknown
    }
  | { type: 'bilibili'; kind: 'popular'; items?: unknown }
  | { type: 'bilibili'; kind: 'ranking'; rid?: unknown; note?: unknown; items?: unknown }
  | {
      type: 'bilibili'
      kind: 'search'
      query?: unknown
      searchKind?: unknown
      page?: unknown
      total?: unknown
      items?: unknown
      users?: unknown
    }
  | { type: 'bilibili'; kind: 'bangumi'; seasonType?: unknown; page?: unknown; total?: unknown; items?: unknown }
  | {
      type: 'bilibili'
      kind: 'season'
      seasonId?: unknown
      title?: unknown
      cover?: unknown
      evaluate?: unknown
      score?: unknown
      badge?: unknown
      episodes?: unknown
      sections?: unknown
    }
  | { type: 'bilibili'; kind: 'live'; items?: unknown }
  | { type: 'bilibili'; kind: 'history'; items?: unknown; max?: unknown; viewAt?: unknown }
  | { type: 'bilibili'; kind: 'favorites'; folders?: unknown }
  | { type: 'bilibili'; kind: 'favoriteItems'; mediaId?: unknown; title?: unknown; items?: unknown; hasMore?: unknown }
  | { type: 'bilibili'; kind: 'dynamic'; items?: unknown; offset?: unknown }
  | {
      type: 'bilibili'
      kind: 'space'
      mid?: unknown
      name?: unknown
      avatar?: unknown
      sign?: unknown
      level?: unknown
      fans?: unknown
      videos?: unknown
      items?: unknown
    }
  | {
      type: 'bilibili'
      kind: 'detail'
      bvid?: unknown
      aid?: unknown
      cid?: unknown
      title?: unknown
      cover?: unknown
      desc?: unknown
      duration?: unknown
      pubdate?: unknown
      owner?: unknown
      pages?: unknown
      stat?: unknown
      like?: unknown
      coin?: unknown
      favorite?: unknown
    }
  /** A like's answer: `on` is what it is now; `ok: false` when Bilibili refused (`reason` is Bilibili's word). */
  | { type: 'bilibili'; kind: 'like'; bvid?: unknown; on?: unknown; ok?: unknown; reason?: unknown }
  | { type: 'bilibili'; kind: 'coin'; bvid?: unknown; count?: unknown; ok?: unknown; reason?: unknown }
  | { type: 'bilibili'; kind: 'favorite'; bvid?: unknown; on?: unknown; ok?: unknown; reason?: unknown }
  /** 我的粉丝 / 我关注的人, a page at a time. */
  | {
      type: 'bilibili'
      kind: 'relations'
      relationKind?: unknown
      page?: unknown
      items?: unknown
      more?: unknown
    }
  /** A list or a page Bilibili refused, or didn't answer: `-101` signed out, `-352`/`412` risk control. */
  | { type: 'bilibili'; kind: 'failed'; action?: unknown; code?: unknown; message?: unknown }
  /** The sign-in window's open or shut. */
  | { type: 'bilibili'; kind: 'signIn'; open?: unknown }

/**
 * A command for the host's hidden Bilibili page, as `notes/bilibili-v1-host.md` lists them. The host filters bad ids
 * and out-of-range values itself. // TODO(host): rename here when the protocol's field names change.
 */
export type BilibiliCommand =
  /** Runs the hidden page and reads the sign-in state. */
  | { action: 'start' }
  /** Opens Bilibili's own sign-in window on the desktop, or clears its cookies. */
  | { action: 'signIn' }
  | { action: 'signOut' }
  /** Reads Home again: its first page (`page: 1`, `fresh`), or the next one (`page: 2` …). */
  | { action: 'home'; page?: number; fresh?: boolean }
  | { action: 'popular' }
  /** A ranking's list (`rid`: 0 for the whole site, or a category's tid). */
  | { action: 'ranking'; rid?: number }
  | { action: 'search'; value: string; kind: 'video' | 'user' | 'bangumi' | 'movie' | 'live'; page?: number }
  /** 番剧/影视's index (`seasonType`: 1 番剧 2 电影 3 纪录片 4 国创 5 电视剧 7 综艺). */
  | { action: 'bangumi'; seasonType: number; page?: number }
  /** A season's page and episodes. */
  | { action: 'season'; value: string }
  | { action: 'live' }
  /** The account's history (`max`: how many; `viewAt`: its cursor, 0 for the first page). */
  | { action: 'history'; max?: number; viewAt?: number }
  | { action: 'favorites' }
  /** One folder's videos. */
  | { action: 'favoriteItems'; value: string; page?: number }
  | { action: 'dynamic'; offset?: string }
  | { action: 'space'; value: string; page?: number }
  /** A video's own page, parts and marks. */
  | { action: 'detail'; value: string }
  /** 我的粉丝 / 我关注的人, a page at a time. */
  | { action: 'relations'; kind: RelationKind; page?: number }
  /** Plays: a video by BV/av id, a bangumi by ep/ss id, a live room by its room id. */
  | { action: 'play'; value: string; kind: 'video' | 'bangumi' | 'live'; page?: number }
  | { action: 'pause' }
  | { action: 'resume' }
  /** The next video (a video's related next), or the next episode of a season. */
  | { action: 'next' }
  /** Seconds into the video. */
  | { action: 'seek'; value: number }
  /** 0 to 1. */
  | { action: 'volume'; value: number }
  /** 0.25 to 3. */
  | { action: 'rate'; value: number }
  /** A quality's qn (80: 1080P, 64: 720P…). */
  | { action: 'quality'; value: number }
  /** A caption's id, or `null` for none. */
  | { action: 'caption'; track: string | null }
  | { action: 'like'; value: string; on: boolean }
  | { action: 'coin'; value: string; count: number; like?: boolean }
  | { action: 'favorite'; value: string; add: boolean; mediaId?: string }
  /**
   * The picture's rectangle on the cab's screen (page pixels, as YouTube's `show`): the host shows the hidden page's
   * video under the page there, `crop` filling it (otherwise whole, with bars).
   */
  | { action: 'show'; x: number; y: number; width: number; height: number; crop?: boolean }
  | { action: 'crop'; on: boolean }
  /** Hides the picture (sound playing on). */
  | { action: 'hide' }
  /** Closes the hidden page (started again on the next command). */
  | { action: 'close' }
  | { action: 'refresh' }

// --- The app's state ------------------------------------------------------------------------------------------

/** A list being read: still coming, or not answered. */
export interface Asking {
  waiting: boolean
  failed: boolean
}

const IDLE: Asking = { waiting: false, failed: false }

/** The player's way in and out (`Player.tsx`): closed, coming up, up, going down. */
export type PlayerStage = 'closed' | 'enter' | 'open' | 'leave'

/** The player's pop-over menu (one at a time). */
export type PlayerMenu = 'episodes' | 'rate' | null

/** A search's filter. */
export type SearchTab = 'video' | 'bangumi' | 'user'

/** Why a list is empty: Bilibili's own refusal (`code`, `message`), shown by its page's empty state. */
export interface BilibiliFailure {
  action: string
  code: number
  message: string
}

/** The tv's `show`/`hide`: whether the host's picture is shown over the cab's page, and where (`Player.tsx`). */
export interface BilibiliSurface {
  x: number
  y: number
  width: number
  height: number
}

export interface BilibiliAppState {
  /** The hidden page answered something (it's running). */
  ready: boolean
  signedIn: boolean | null
  signingIn: boolean
  user: BilibiliUser | null

  /** Home's recommended feed, its first page and the pages after it. */
  home: BilibiliVideo[] | null
  /** The 番剧/影视 cards Home's feed carries among its videos (the banner's candidates). */
  homeSeasons: BilibiliBangumi[]
  homeAsking: Asking
  /** The page of Home read last (1: the first). */
  homePage: number
  /** Whether Home has more after the page read. */
  homeMore: boolean
  homeMoreAsking: Asking
  /** 热门. */
  hot: BilibiliVideo[] | null
  hotAsking: Asking
  /** 番剧's and 影视's lists, by kind (their own index). */
  anime: BilibiliBangumi[] | null
  cinema: BilibiliBangumi[] | null
  bangumiAsking: Record<BilibiliSeasonKind, Asking>
  liveRooms: BilibiliLiveRoom[] | null
  liveAsking: Asking

  /** Season pages opened, by season id. */
  seasonDetails: Record<string, BilibiliBangumi>
  seasonAsking: Record<string, Asking>
  /** Video pages read (their numbers and the account's marks), by BV id. */
  videoDetails: Record<string, BilibiliVideoDetail>
  videoDetailAsking: Record<string, Asking>

  /** A search's answers, by its filter (only the one asked is read). */
  search: { video: BilibiliVideo[] | null; bangumi: BilibiliBangumi[] | null; user: BilibiliUp[] | null }
  searchAsking: Record<SearchTab, Asking>
  /** The words last asked of the host. */
  searchAsked: string
  query: string
  searchTab: SearchTab

  history: BilibiliHistoryItem[] | null
  historyAsking: Asking
  /** The account's folders. */
  favorites: BilibiliFavoriteFolder[] | null
  favoritesAsking: Asking
  /** The folder picked on 收藏夹, by id (empty: the folders alone). */
  folderId: string
  folderTitle: string
  folderItems: BilibiliVideo[] | null
  folderAsking: Asking
  dynamic: BilibiliDynamicItem[] | null
  dynamicAsking: Asking
  space: BilibiliSpace | null
  spaceAsking: Asking
  /** The space read last (to know whose page a `space` answer is). */
  spaceAsked: string
  /** 我的粉丝 and 我关注的人, their pages read. */
  relations: Record<RelationKind, BilibiliRelation[] | null>
  relationsPage: Record<RelationKind, number>
  relationsMore: Record<RelationKind, boolean>
  relationsAsking: Record<RelationKind, Asking>

  /** The player's immersive page. */
  stage: PlayerStage
  /** The host's own picture shown over the screen (its WebView under the page): only while the player is open. */
  picture: boolean
  /** The host says its video is really showing (`showing`): the cut opens only on it, and closes when it's gone. */
  pictureShown: boolean
  now: BilibiliNow | null
  playing: boolean
  /** Seconds, as the host last said it. */
  progress: number
  /** When `progress` was read (`performance.now()`). */
  progressAt: number
  duration: number
  volume: number
  /** The picture's width ÷ its height (`state.aspect`; 16:9 where the host says nothing usable). */
  aspect: number
  rate: number
  liked: boolean
  coins: number
  favorited: boolean
  /** A season's episodes, while one plays. */
  episodes: BilibiliEpisode[]
  playerMenu: PlayerMenu
  /** A like/coin/favorite sent, waiting for its receipt. */
  acting: 'like' | 'coin' | 'favorite' | null
  /** One line over the app, gone in a moment. */
  toast: { text: string; id: number } | null
  /** The last list Bilibili refused (its reason, for the empty states). */
  failure: BilibiliFailure | null
}

// --- Reading what comes ----------------------------------------------------------------------------------------

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function number(value: unknown, fallback: number): number {
  const read = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(read) ? read : fallback
}

function image(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function bool(value: unknown): boolean | undefined {
  return value === true ? true : value === false ? false : undefined
}

/** A UP主, from `owner` or a live room's flat fields (`mid`/`uid`, `name`/`uname`, `avatar`/`face`). */
function readUp(raw: unknown): BilibiliUp | null {
  if (!raw || typeof raw !== 'object') return null
  const up = raw as Record<string, unknown>
  const name = text(up.name ?? up.uname).trim()
  const uid = text(up.mid ?? up.uid)
  if (!name && !uid) return null
  const read: BilibiliUp = { uid, name, avatar: image(up.avatar ?? up.face) }
  const fans = number(up.fans, Number.NaN)
  if (Number.isFinite(fans)) read.fans = Math.max(0, fans)
  return read
}

function readUser(raw: unknown): BilibiliUser | null {
  const up = readUp(raw)
  if (!up) return null
  const source = raw as Record<string, unknown>
  const read: BilibiliUser = { ...up }
  const vip = text(source.vip).trim()
  if (vip) read.vip = vip
  const sign = text(source.sign).trim()
  if (sign) read.sign = sign
  const following = number(source.following, Number.NaN)
  if (Number.isFinite(following)) read.following = Math.max(0, following)
  const follower = number(source.follower ?? source.followers, Number.NaN)
  if (Number.isFinite(follower)) read.follower = Math.max(0, follower)
  return read
}

const NO_UP: BilibiliUp = { uid: '', name: '', avatar: null }

/** A video's id as the host writes it (`bvid`, or `av…` from its aid): the card's and the player's id. */
function videoId(raw: Record<string, unknown>): string {
  const bvid = text(raw.bvid).trim()
  if (bvid) return bvid
  const aid = number(raw.aid, Number.NaN)
  return Number.isFinite(aid) && aid > 0 ? `av${aid}` : ''
}

function readVideo(raw: unknown): BilibiliVideo | null {
  if (!raw || typeof raw !== 'object') return null
  const video = raw as Record<string, unknown>
  const id = videoId(video)
  const title = text(video.title).trim()
  if (!id || !title) return null
  const read: BilibiliVideo = {
    id,
    title,
    cover: image(video.cover),
    duration: Math.max(0, number(video.duration, 0)),
    up: readUp(video.owner) ?? readUp(video) ?? NO_UP,
    views: Math.max(0, number(video.views ?? (video.stat as Record<string, unknown> | undefined)?.views, 0)),
  }
  const likes = number(video.likes, Number.NaN)
  if (Number.isFinite(likes)) read.likes = Math.max(0, likes)
  const danmaku = number(video.danmaku, Number.NaN)
  if (Number.isFinite(danmaku)) read.danmaku = Math.max(0, danmaku)
  const aid = number(video.aid, Number.NaN)
  if (Number.isFinite(aid) && aid > 0) read.aid = aid
  const cid = number(video.cid, Number.NaN)
  if (Number.isFinite(cid) && cid > 0) read.cid = cid
  const page = number(video.page, Number.NaN)
  if (Number.isFinite(page) && page > 0) read.page = page
  const pages = number(video.pages ?? video.pageCount, Number.NaN)
  if (Number.isFinite(pages) && pages > 0) read.pages = pages
  const description = text(video.desc ?? video.description).trim()
  if (description) read.description = description
  const published = text(video.published).trim()
  if (published) read.published = published
  return read
}

/** A video from a `detail` message (its own page). */
function readDetail(raw: unknown): BilibiliVideoDetail | null {
  if (!raw || typeof raw !== 'object') return null
  const detail = raw as Record<string, unknown>
  const id = videoId(detail)
  const title = text(detail.title).trim()
  if (!id || !title) return null
  const stat = (detail.stat && typeof detail.stat === 'object' ? detail.stat : {}) as Record<string, unknown>
  const read: BilibiliVideoDetail = {
    id,
    title,
    cover: image(detail.cover),
    duration: Math.max(0, number(detail.duration, 0)),
    description: text(detail.desc).trim(),
    up: readUp(detail.owner),
    liked: detail.like === true ? true : detail.like === false ? false : null,
    coins: Number.isFinite(number(detail.coin, Number.NaN)) ? Math.max(0, number(detail.coin, 0)) : null,
    favorited: detail.favorite === true ? true : detail.favorite === false ? false : null,
  }
  const views = number(stat.views ?? detail.views, Number.NaN)
  const likes = number(stat.likes ?? detail.likes, Number.NaN)
  const coins = number(stat.coins ?? detail.coinsCount, Number.NaN)
  const favorites = number(stat.favorites ?? detail.favorites, Number.NaN)
  const danmaku = number(stat.danmaku, Number.NaN)
  read.stat = {}
  if (Number.isFinite(views)) read.stat.views = Math.max(0, views)
  if (Number.isFinite(likes)) read.stat.likes = Math.max(0, likes)
  if (Number.isFinite(coins)) read.stat.coins = Math.max(0, coins)
  if (Number.isFinite(favorites)) read.stat.favorites = Math.max(0, favorites)
  if (Number.isFinite(danmaku)) read.stat.danmaku = Math.max(0, danmaku)
  if (Array.isArray(detail.pages)) {
    read.pages = detail.pages
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const page = entry as Record<string, unknown>
        const cid = text(page.cid).trim()
        if (!cid) return null
        return {
          cid,
          page: Math.max(1, number(page.page, 1)),
          title: text(page.title).trim(),
          duration: Math.max(0, number(page.duration, 0)),
        }
      })
      .filter((one): one is NonNullable<typeof one> => one !== null)
  }
  return read
}

function readEpisodes(raw: unknown): BilibiliEpisode[] {
  if (!Array.isArray(raw)) return []
  const episodes: BilibiliEpisode[] = []
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const episode = entry as Record<string, unknown>
    const id = text(episode.epId ?? episode.id ?? episode.cid).trim()
    if (!id) return
    const longTitle = text(episode.longTitle ?? episode.long_title).trim()
    const plainTitle = text(episode.title ?? episode.name ?? episode.indexTitle ?? episode.index_title).trim()
    const read: BilibiliEpisode = {
      id,
      title: longTitle || plainTitle || `第 ${index + 1} 话`,
      duration: Math.max(0, number(episode.duration, 0)),
      index: Math.max(1, number(episode.index ?? episode.page, index + 1)),
    }
    if (longTitle) read.longTitle = longTitle
    const cover = image(episode.cover)
    if (cover) read.cover = cover
    const badge = text(episode.badge).trim()
    if (badge) read.badge = badge
    if (!episodes.some((kept) => kept.id === read.id)) episodes.push(read)
  })
  return episodes.slice(0, 500)
}

/** A season's episodes, its own list and its sections' (a series' 正片, 预告, …). */
function readSeasonEpisodes(raw: unknown, sections: unknown): BilibiliEpisode[] {
  const episodes = readEpisodes(raw)
  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (!section || typeof section !== 'object') continue
      const list = readEpisodes((section as Record<string, unknown>).episodes)
      for (const episode of list) if (!episodes.some((kept) => kept.id === episode.id)) episodes.push(episode)
    }
  }
  return episodes
}

/** A season as its own page reads it (its index says the kind; the list it came from says it too). */
function readSeason(raw: unknown, kind: BilibiliSeasonKind): BilibiliBangumi | null {
  if (!raw || typeof raw !== 'object') return null
  const season = raw as Record<string, unknown>
  const seasonId = text(season.seasonId ?? season.id).trim()
  const title = text(season.title).trim()
  if (!seasonId || !title) return null
  const read: BilibiliBangumi = {
    seasonId,
    title,
    cover: image(season.cover),
    kind,
    description: text(season.evaluate ?? season.description ?? season.desc).trim(),
    episodes: readSeasonEpisodes(season.episodes, season.sections),
  }
  const progress = text(season.indexShow ?? season.progress).trim()
  if (progress) read.progress = progress
  const rating = Number.parseFloat(text(season.score ?? season.rating))
  if (Number.isFinite(rating)) read.rating = rating
  const badge = text(season.badge).trim()
  if (badge) read.badge = badge
  const first = text(season.epId ?? season.firstEpisodeId).trim()
  if (first) read.firstEpisodeId = first
  return read
}

/** A `kind:"media"` item (a season's card). */
function readMediaItem(raw: Record<string, unknown>): BilibiliBangumi | null {
  const seasonId = text(raw.seasonId).trim()
  const title = text(raw.title).trim()
  if (!seasonId || !title) return null
  const seasonType = number(raw.seasonType, 1)
  const kind: BilibiliSeasonKind = seasonType === 1 || seasonType === 4 ? 'anime' : 'cinema'
  const read: BilibiliBangumi = {
    seasonId,
    title,
    cover: image(raw.cover),
    kind,
    description: '',
    episodes: [],
  }
  const progress = text(raw.indexShow).trim()
  if (progress) read.progress = progress
  const rating = Number.parseFloat(text(raw.score))
  if (Number.isFinite(rating)) read.rating = rating
  const badge = text(raw.badge).trim()
  if (badge) read.badge = badge
  const epId = text(raw.epId).trim()
  if (epId) read.firstEpisodeId = epId
  return read
}

function readRoom(raw: unknown): BilibiliLiveRoom | null {
  if (!raw || typeof raw !== 'object') return null
  const room = raw as Record<string, unknown>
  const roomId = text(room.roomId ?? room.id).trim()
  const title = text(room.title).trim()
  if (!roomId || !title) return null
  const read: BilibiliLiveRoom = {
    roomId,
    title,
    cover: image(room.cover),
    uname: text(room.uname).trim(),
    online: Math.max(0, number(room.online, 0)),
    area: text(room.area).trim(),
    live: room.live !== false,
  }
  const avatar = image(room.face ?? room.avatar)
  if (avatar) read.avatar = avatar
  return read
}

function videosOf(raw: unknown, most = 80): BilibiliVideo[] {
  if (!Array.isArray(raw)) return []
  const videos: BilibiliVideo[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const kind = text(item.kind).toLocaleLowerCase()
    if (kind === 'media' || kind === 'live') continue
    const video = readVideo(item)
    if (video && !videos.some((kept) => kept.id === video.id)) videos.push(video)
    if (videos.length >= most) break
  }
  return videos
}

function seasonsOf(raw: unknown, most = 80): BilibiliBangumi[] {
  if (!Array.isArray(raw)) return []
  const seasons: BilibiliBangumi[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = readMediaItem(entry as Record<string, unknown>)
    if (item && !seasons.some((kept) => kept.seasonId === item.seasonId)) seasons.push(item)
    if (seasons.length >= most) break
  }
  return seasons
}

function roomsOf(raw: unknown, most = 60): BilibiliLiveRoom[] {
  if (!Array.isArray(raw)) return []
  const rooms: BilibiliLiveRoom[] = []
  for (const entry of raw) {
    const room = readRoom(entry)
    if (room && !rooms.some((kept) => kept.roomId === room.roomId)) rooms.push(room)
    if (rooms.length >= most) break
  }
  return rooms
}

/** A date from one of Bilibili's seconds-since-1970 (`viewedAt`, `pubdate`), in the cabin's language. */
function dateOf(value: unknown): string {
  const at = number(value, Number.NaN)
  if (!Number.isFinite(at) || at <= 0) return ''
  try {
    return new Intl.DateTimeFormat(languageNow() || 'zh-CN', { month: 'numeric', day: 'numeric' }).format(
      new Date(at * 1000),
    )
  } catch {
    return ''
  }
}

function readHistory(raw: unknown, viewAt: number): BilibiliHistoryItem[] {
  if (!Array.isArray(raw)) return []
  const items: BilibiliHistoryItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const video = readVideo(item)
    if (!video || items.some((kept) => kept.video.id === video.id)) continue
    const read: BilibiliHistoryItem = { video }
    const progress = number(item.progress, Number.NaN)
    if (Number.isFinite(progress)) read.progress = Math.max(0, progress)
    const watchedAt = text(item.viewedAt).trim() || dateOf(item.viewedAt)
    if (watchedAt) read.watchedAt = watchedAt
    if (Number.isFinite(viewAt) && viewAt > 0) read.viewAt = viewAt
    items.push(read)
    if (items.length >= 100) break
  }
  return items
}

function readFavorites(raw: unknown): BilibiliFavoriteFolder[] {
  if (!Array.isArray(raw)) return []
  const folders: BilibiliFavoriteFolder[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const folder = entry as Record<string, unknown>
    const id = text(folder.id ?? folder.mediaId).trim()
    const title = text(folder.title).trim()
    if (!id || !title) continue
    folders.push({ id, title, count: Math.max(0, number(folder.count, 0)) })
  }
  return folders.slice(0, 40)
}

function readDynamic(raw: unknown): BilibiliDynamicItem[] {
  if (!Array.isArray(raw)) return []
  const items: BilibiliDynamicItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const video = readVideo(item)
    const user = readUp(item.owner)
    if (!video || !user) continue
    const id = text(item.dynamicId).trim() || video.id
    const said = text(item.said).trim()
    const at = text(item.at).trim() || dateOf(item.pubdate)
    items.push({ id, user, text: said, video, at })
    if (items.length >= 50) break
  }
  return items
}

function readSpace(raw: unknown): BilibiliSpace | null {
  if (!raw || typeof raw !== 'object') return null
  const space = raw as Record<string, unknown>
  const user = readUp(space) ?? readUp(space.user)
  if (!user) return null
  const read: BilibiliSpace = { user, videos: videosOf(space.items ?? space.videos) }
  const sign = text(space.sign).trim()
  if (sign) read.sign = sign
  const fans = number(space.fans, Number.NaN)
  if (Number.isFinite(fans)) read.fans = Math.max(0, fans)
  const level = number(space.level, Number.NaN)
  if (Number.isFinite(level)) read.level = level
  const following = number(space.following, Number.NaN)
  if (Number.isFinite(following)) read.following = Math.max(0, following)
  return read
}

/** One page of 我的粉丝 / 我关注的人: people with their signature. */
function readRelations(raw: unknown): BilibiliRelation[] {
  if (!Array.isArray(raw)) return []
  const people: BilibiliRelation[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const person = entry as Record<string, unknown>
    const up = readUp(person)
    if (!up || people.some((kept) => kept.uid === up.uid)) continue
    const read: BilibiliRelation = { ...up }
    const sign = text(person.sign ?? person.signature).trim()
    if (sign) read.sign = sign
    people.push(read)
    if (people.length >= 100) break
  }
  return people
}

/** The picture's width ÷ height as `state.aspect` says it; 16:9 for nothing usable (an older host, a bad value). */
export function aspectOf(value: unknown): number {
  const read = number(value, Number.NaN)
  return Number.isFinite(read) && read > 0.05 && read < 20 ? read : 16 / 9
}

/** What the hidden page plays, as `state.media` writes it. */
function readNow(raw: unknown): BilibiliNow | null {
  if (!raw || typeof raw !== 'object') return null
  if (!raw || typeof raw !== 'object') return null
  const media = raw as Record<string, unknown>
  const kindText = text(media.kind).toLocaleLowerCase()
  const kind = kindText === 'bangumi' ? 'bangumi' : kindText === 'live' ? 'live' : 'video'
  const id =
    kind === 'live'
      ? text(media.roomId).trim()
      : kind === 'bangumi'
        ? text(media.epId).trim() || text(media.seasonId).trim()
        : videoId(media)
  const title = text(media.title).trim()
  if (!id || !title) return null
  const read: BilibiliNow = {
    id,
    kind,
    title,
    cover: image(media.cover),
    up: readUp(media.owner),
    views: 0,
    duration: Math.max(0, number(media.duration, 0)),
    live: kind === 'live' || media.live === true,
  }
  const aid = number(media.aid, Number.NaN)
  if (Number.isFinite(aid) && aid > 0) read.aid = aid
  const seasonId = text(media.seasonId).trim()
  if (seasonId && seasonId !== '0') read.seasonId = seasonId
  const epId = text(media.epId).trim()
  if (epId && epId !== '0') read.epId = epId
  const roomId = text(media.roomId).trim()
  if (roomId && roomId !== '0') read.roomId = roomId
  const page = number(media.page, Number.NaN)
  if (Number.isFinite(page) && page > 0) read.page = page
  const pages = number(media.pages, Number.NaN)
  if (Number.isFinite(pages) && pages > 0) read.pages = pages
  return read
}

// --- The store ------------------------------------------------------------------------------------------------

/** Outside WestPlay (a plain browser) the preview answers: there's no host to wait for. */
const HAS_WINDOW = typeof window !== 'undefined'
/** Whether the app talks to the host (or to the preview). */
export const IN_HOST = HAS_WINDOW && isInHost()
const PREVIEW = HAS_WINDOW && !IN_HOST ? createPreview() : null
const PREVIEW_START: Partial<BilibiliAppState> = PREVIEW ? PREVIEW.initial() : {}

const IDLE_BANGUMI: Record<BilibiliSeasonKind, Asking> = { anime: IDLE, cinema: IDLE }
const IDLE_SEARCH: Record<SearchTab, Asking> = { video: IDLE, bangumi: IDLE, user: IDLE }
const IDLE_RELATIONS: Record<RelationKind, Asking> = { followers: IDLE, following: IDLE }

export const useBilibili = create<BilibiliAppState>()(() => ({
  ready: false,
  signedIn: null,
  signingIn: false,
  user: null,
  home: null,
  homeSeasons: [],
  homeAsking: IDLE,
  homePage: 1,
  homeMore: false,
  homeMoreAsking: IDLE,
  hot: null,
  hotAsking: IDLE,
  anime: null,
  cinema: null,
  bangumiAsking: IDLE_BANGUMI,
  liveRooms: null,
  liveAsking: IDLE,
  seasonDetails: {},
  seasonAsking: {},
  videoDetails: {},
  videoDetailAsking: {},
  search: { video: null, bangumi: null, user: null },
  searchAsking: IDLE_SEARCH,
  searchAsked: '',
  query: '',
  searchTab: 'video',
  history: null,
  historyAsking: IDLE,
  favorites: null,
  favoritesAsking: IDLE,
  folderId: '',
  folderTitle: '',
  folderItems: null,
  folderAsking: IDLE,
  dynamic: null,
  dynamicAsking: IDLE,
  space: null,
  spaceAsking: IDLE,
  spaceAsked: '',
  relations: { followers: null, following: null },
  relationsPage: { followers: 1, following: 1 },
  relationsMore: { followers: false, following: false },
  relationsAsking: IDLE_RELATIONS,
  stage: 'closed',
  picture: false,
  pictureShown: false,
  now: null,
  playing: false,
  progress: 0,
  progressAt: 0,
  duration: 0,
  volume: 0.7,
  aspect: 16 / 9,
  rate: 1,
  liked: false,
  coins: 0,
  favorited: false,
  episodes: [],
  playerMenu: null,
  acting: null,
  toast: null,
  failure: null,
  ...PREVIEW_START,
}))

// --- Talking to the host --------------------------------------------------------------------------------------

type PageEnvelope = Parameters<typeof postToHost>[0]

/** Sends a command to Bilibili's hidden page: in a plain browser the preview answers instead. */
export function bilibili(command: BilibiliCommand): void {
  if (PREVIEW) {
    for (const message of PREVIEW.apply(command)) receiveMessage(message)
    return
  }
  postToHost({ type: 'bilibili', kind: 'command', command } as unknown as PageEnvelope)
}

/** The cabin's language, for the app's own words and dates (CabinApp sets the page's `lang` to it). */
function languageNow(): string {
  try {
    return typeof document === 'undefined' ? '' : document.documentElement.lang
  } catch {
    return ''
  }
}

let toastId = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** A toast: one line over the app, gone in a moment. */
export function showToast(message: string): void {
  if (!message) return
  clearTimeout(toastTimer)
  useBilibili.setState({ toast: { text: message, id: ++toastId } })
  toastTimer = setTimeout(() => useBilibili.setState({ toast: null }), 2800)
}

/** The player's way out: how long its animation takes (matches bilibili.css's `--bb-player-out`). */
/** How long the player's way down takes (bilibili.css's `--bb-player-out`, which the sheet is drawn with). */
export const PLAYER_LEAVE_MS = 470
let playerTimer: ReturnType<typeof setTimeout> | undefined

/** The player's way out begun: the cut closed and the cover in place. A late `showing: true` must not reopen it while
 * the page goes down. */
let playerExiting = false

/** A hole the page has open, as last set (for the timeline's set/clear, and to clear it only once). */
let playerHole = false

export type BilibiliHole = NonNullable<ReturnType<typeof rectInArea>>
export type BilibiliCovers = Record<string, BilibiliHole>

export interface BilibiliTimelineEntry {
  /** The page's own clock (ms since it loaded). */
  at: number
  /** The wall's clock (Unix ms), to line it up with the host's log. */
  wall: number
  event: string
  detail?: Record<string, unknown>
}

type TimelineWindow = Window & { __bbTimeline?: BilibiliTimelineEntry[] }

/**
 * The player's own log of what happened when (owner 2026-11-21: `window.__bbTimeline` for the next flash of black):
 * open/enter, showing true/false, picture true/false, hole set/clear, leave/closed. Kept to the last 200 events; the
 * player prints them once when it unmounts (`Player.tsx`'s cleanup).
 */
export function recordTimeline(event: string, detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const win = window as TimelineWindow
  const list = win.__bbTimeline ?? []
  const entry: BilibiliTimelineEntry = {
    at: Math.round(performance.now()),
    wall: Date.now(),
    event,
    ...(detail ? { detail } : {}),
  }
  win.__bbTimeline = [...list, entry].slice(-200)
}

/** The page's cut open at the player's screen. */
export function putPlayerHole(hole: BilibiliHole): void {
  usePageHole.setState({ hole })
  if (playerHole) return
  playerHole = true
  recordTimeline('hole set', { x: hole.x, y: hole.y, width: hole.width, height: hole.height })
}

/** The controls' and menus' covers over the cut (their own rectangles kept closed in the page's mask). */
export function setPlayerCovers(covers: BilibiliCovers): void {
  usePageHole.setState({ covers })
}

/** The page's cut and every cover closed (the cover under them is what shows). */
export function clearPlayerHole(reason: string): void {
  usePageHole.setState({ hole: null, covers: {} })
  if (!playerHole) return
  playerHole = false
  recordTimeline('hole clear', { reason })
}

/** The list or page asked last: which of the store's asks a `failed` message is about (`failed` has no id). */
let asked: { action: string; id?: string } | null = null

// --- The host's channel ----------------------------------------------------------------------------------------

/**
 * Applies each `bilibili` message the host sends (`state`, `account`, the lists and pages, the like/coin/favorite
 * receipts, `failed` and `signIn`), and only those. Exported for the app's tests, which feed it the host's messages as
 * they come.
 */
export function receiveMessage(message: unknown): void {
  if (!message || typeof message !== 'object') return
  const each = message as BilibiliMessage
  if (each.type !== 'bilibili') return
  if (!useBilibili.getState().ready) useBilibili.setState({ ready: true })
  switch (each.kind) {
    case 'state':
      receiveState(each.state)
      return
    case 'showing':
      receiveShowing(each)
      return
    case 'account':
      receiveAccount(each)
      return
    case 'home':
      receiveHome(each)
      return
    case 'popular':
      useBilibili.setState({ hot: videosOf(each.items), hotAsking: IDLE, failure: null })
      return
    case 'ranking':
      useBilibili.setState({ hot: videosOf(each.items), hotAsking: IDLE, failure: null })
      return
    case 'search':
      receiveSearch(each)
      return
    case 'bangumi':
      receiveBangumi(each)
      return
    case 'season':
      receiveSeason(each)
      return
    case 'live':
      useBilibili.setState({ liveRooms: roomsOf(each.items), liveAsking: IDLE, failure: null })
      return
    case 'history':
      receiveHistory(each)
      return
    case 'favorites':
      useBilibili.setState({ favorites: readFavorites(each.folders), favoritesAsking: IDLE, failure: null })
      return
    case 'favoriteItems':
      receiveFavoriteItems(each)
      return
    case 'dynamic':
      useBilibili.setState({ dynamic: readDynamic(each.items), dynamicAsking: IDLE, failure: null })
      return
    case 'relations':
      receiveRelations(each)
      return
    case 'space':
      receiveSpace(each)
      return
    case 'detail':
      receiveDetail(each)
      return
    case 'like':
      receiveLike(each)
      return
    case 'coin':
      receiveCoin(each)
      return
    case 'favorite':
      receiveFavorite(each)
      return
    case 'failed':
      receiveFailed(each)
      return
    case 'signIn': {
      const open = bool(each.open)
      if (open !== undefined) useBilibili.setState({ signingIn: open })
      return
    }
    default:
      return
  }
}

function receiveState(raw: unknown): void {
  if (raw === null || raw === undefined) {
    useBilibili.setState({ playing: false })
    return
  }
  if (typeof raw !== 'object') return
  const state = raw as BilibiliPlayback
  const now = state.media === undefined ? undefined : readNow(state.media)
  const beforeId = useBilibili.getState().now?.id ?? null
  useBilibili.setState((store) => {
    const patch: Partial<BilibiliAppState> = { progressAt: performance.now() }
    const signedIn = bool(state.signedIn)
    if (signedIn !== undefined) patch.signedIn = signedIn
    const signingIn = bool(state.signingIn)
    if (signingIn !== undefined) patch.signingIn = signingIn
    const playing = bool(state.playing)
    if (playing !== undefined) patch.playing = playing
    if (now) {
      // A host state that names the video it already names keeps the card's cover/title/UP主 when its own fields are
      // empty (the sheet's way in/out is drawn from the cover: never an empty, dark sheet).
      const before = store.now
      const same = before?.id === now.id
      patch.now = {
        ...now,
        ...(now.cover ? {} : same && before?.cover ? { cover: before.cover } : {}),
        ...(now.up ? {} : same && before?.up ? { up: before.up } : {}),
        ...(now.title || !same ? {} : { title: before?.title ?? '' }),
      }
    }
    // Another video/episode: the cover stands in until the host says its picture is showing (its `showing` message).
    if (now && now.id !== beforeId) patch.pictureShown = false
    const time = number(state.time, Number.NaN)
    if (Number.isFinite(time)) patch.progress = Math.max(0, time)
    const duration = number(state.duration, Number.NaN)
    if (Number.isFinite(duration) && duration > 0) patch.duration = duration
    const volume = number(state.volume, Number.NaN)
    if (Number.isFinite(volume)) patch.volume = clamp(volume, 0, 1)
    const rate = number(state.rate, Number.NaN)
    if (Number.isFinite(rate) && rate > 0) patch.rate = rate
    // The picture's own shape: a portrait video stands up in the middle of the player, whole (never stretched).
    if (state.aspect !== undefined) patch.aspect = aspectOf(state.aspect)
    // A state that names no video keeps the app's own length, from the card it was opened with.
    if (!now && store.duration > 0 && patch.duration === undefined) patch.duration = store.duration
    return patch
  })
  if (now && now.id !== beforeId) {
    clearPlayerHole('media change')
    setPicture(false)
    useBilibili.setState({ pictureShown: false })
  }
  if (bool(state.signedIn) === false) useBilibili.setState({ user: null })
}

/** The host's picture showing, or gone (its own `showing`): the page opens its cut on the first, and closes it — the
 * cover standing in — on the second. */
function receiveShowing(each: Extract<BilibiliMessage, { kind: 'showing' }>): void {
  if (bool(each.on) === true) {
    // Only while the page is open and not on its way out: the cut never reopens over a page going down.
    const state = useBilibili.getState()
    if (playerExiting || state.stage !== 'open' || !state.now) return
    recordTimeline('showing true')
    useBilibili.setState({ pictureShown: true })
    return
  }
  // Gone (a cut/next episode/buffering/hide): the cut and the covers go at once, the cover under them.
  recordTimeline('showing false')
  clearPlayerHole('showing false')
  setPicture(false)
  useBilibili.setState({ pictureShown: false })
}

/** Home's answer: its first page replaces the feed, a later page is added to it (the infinite scroll). */
function receiveHome(each: Extract<BilibiliMessage, { kind: 'home' }>): void {
  const page = Math.max(1, Math.trunc(number(each.page, 1)))
  const items = videosOf(each.items)
  const seasons = seasonsOf(each.items)
  const more = each.more === true
  useBilibili.setState((store) => {
    if (page <= 1) {
      return {
        home: items,
        homeSeasons: seasons,
        homePage: 1,
        homeMore: more,
        homeAsking: IDLE,
        homeMoreAsking: IDLE,
        failure: null,
      }
    }
    const before = store.home ?? []
    const merged = [...before, ...items.filter((one) => !before.some((kept) => kept.id === one.id))]
    const seasonsBefore = store.homeSeasons ?? []
    const mergedSeasons = [
      ...seasonsBefore,
      ...seasons.filter((one) => !seasonsBefore.some((kept) => kept.seasonId === one.seasonId)),
    ]
    return {
      home: merged,
      homeSeasons: mergedSeasons,
      homePage: page,
      homeMore: more,
      homeMoreAsking: IDLE,
      homeAsking: IDLE,
      failure: null,
    }
  })
}

/** 我的粉丝 / 我关注的人: a page of people, added to the ones read. */
function receiveRelations(each: Extract<BilibiliMessage, { kind: 'relations' }>): void {
  const kind: RelationKind = text(each.relationKind).toLocaleLowerCase() === 'following' ? 'following' : 'followers'
  const page = Math.max(1, Math.trunc(number(each.page, 1)))
  const more = each.more === true
  const items = readRelations(each.items)
  useBilibili.setState((store) => {
    const before = store.relations[kind] ?? []
    const merged =
      page <= 1 ? items : [...before, ...items.filter((one) => !before.some((kept) => kept.uid === one.uid))]
    return {
      relations: { ...store.relations, [kind]: merged },
      relationsPage: { ...store.relationsPage, [kind]: page },
      relationsMore: { ...store.relationsMore, [kind]: more },
      relationsAsking: { ...store.relationsAsking, [kind]: IDLE },
      failure: null,
    }
  })
}

function receiveAccount(each: Extract<BilibiliMessage, { kind: 'account' }>): void {
  const raw = each.account
  const account = (raw && typeof raw === 'object' ? raw : each) as BilibiliAccountMessage
  const signedIn = bool(account.signedIn) ?? bool(each.signedIn)
  const signingIn = bool(account.signingIn) ?? bool(each.signingIn)
  const user = readUser(account)
  useBilibili.setState((state) => ({
    signedIn: signedIn ?? state.signedIn,
    signingIn: signingIn ?? state.signingIn,
    user: signedIn === false ? null : (user ?? state.user),
  }))
}

function receiveSearch(each: Extract<BilibiliMessage, { kind: 'search' }>): void {
  const query = text(each.query).trim()
  const store = useBilibili.getState()
  // Only the last asked shows: an answer to words no longer in the bar is dropped.
  if (query && query.toLocaleLowerCase() !== store.searchAsked.toLocaleLowerCase()) return
  const kind = text(each.searchKind).toLocaleLowerCase()
  const tab: SearchTab =
    kind === 'user'
      ? 'user'
      : kind === 'bangumi' || kind === 'movie'
        ? 'bangumi'
        : kind === 'video'
          ? 'video'
          : store.searchTab
  const search = { ...store.search }
  if (tab === 'bangumi') search.bangumi = seasonsOf(each.items)
  else if (tab === 'user')
    search.user = Array.isArray(each.users)
      ? each.users.map(readUp).filter((one): one is BilibiliUp => one !== null)
      : []
  else search.video = videosOf(each.items)
  // The users a video search found come beside its videos (its UP主's cards).
  if (tab !== 'user' && Array.isArray(each.users)) {
    const users = each.users.map(readUp).filter((one): one is BilibiliUp => one !== null)
    if (users.length > 0) search.user = users
  }
  useBilibili.setState({
    search,
    searchAsking: { ...store.searchAsking, [tab]: IDLE },
    failure: null,
  })
}

function receiveBangumi(each: Extract<BilibiliMessage, { kind: 'bangumi' }>): void {
  const seasonType = number(each.seasonType, 1)
  const kind: BilibiliSeasonKind = seasonType === 1 || seasonType === 4 ? 'anime' : 'cinema'
  const items = seasonsOf(each.items)
  useBilibili.setState((store) => ({
    ...(kind === 'anime' ? { anime: items } : { cinema: items }),
    bangumiAsking: { ...store.bangumiAsking, [kind]: IDLE },
    failure: null,
  }))
}

function receiveSeason(each: Extract<BilibiliMessage, { kind: 'season' }>): void {
  const id = text(each.seasonId).trim()
  if (!id) return
  const store = useBilibili.getState()
  const known =
    store.anime?.find((season) => season.seasonId === id) ??
    store.cinema?.find((season) => season.seasonId === id) ??
    store.search.bangumi?.find((season) => season.seasonId === id)
  const season = readSeason(each, known?.kind ?? 'anime')
  if (!season) return
  useBilibili.setState((now) => {
    const patch: Partial<BilibiliAppState> = {
      seasonDetails: {
        ...now.seasonDetails,
        [id]: { ...season, episodes: season.episodes.length > 0 ? season.episodes : (known?.episodes ?? []) },
      },
      seasonAsking: { ...now.seasonAsking, [id]: IDLE },
      failure: null,
    }
    // A season's page while one of its episodes plays: the player's 选集 gets its episodes.
    if (now.now?.seasonId === id && season.episodes.length > 0) patch.episodes = season.episodes
    return patch
  })
}

function receiveHistory(each: Extract<BilibiliMessage, { kind: 'history' }>): void {
  const viewAt = number(each.viewAt, 0)
  const items = readHistory(each.items, viewAt)
  useBilibili.setState((store) => {
    const before = store.history ?? []
    // A later page (a cursor) is added to the first; the first page replaces.
    const merged =
      viewAt > 0 ? [...before, ...items.filter((one) => !before.some((kept) => kept.video.id === one.video.id))] : items
    return { history: merged, historyAsking: IDLE, failure: null }
  })
}

function receiveFavoriteItems(each: Extract<BilibiliMessage, { kind: 'favoriteItems' }>): void {
  useBilibili.setState({
    folderItems: videosOf(each.items),
    folderTitle: text(each.title).trim(),
    folderAsking: IDLE,
    failure: null,
  })
}

function receiveSpace(each: Extract<BilibiliMessage, { kind: 'space' }>): void {
  const space = readSpace(each)
  if (!space) return
  useBilibili.setState({ space, spaceAsking: IDLE, failure: null })
}

function receiveDetail(each: Extract<BilibiliMessage, { kind: 'detail' }>): void {
  const detail = readDetail(each)
  if (!detail) return
  useBilibili.setState((store) => {
    const patch: Partial<BilibiliAppState> = {
      videoDetails: { ...store.videoDetails, [detail.id]: detail },
      videoDetailAsking: { ...store.videoDetailAsking, [detail.id]: IDLE },
    }
    // The video playing: its numbers and the account's marks, as Bilibili has them.
    if (store.now?.id === detail.id || (detail.id.startsWith('av') && store.now?.aid === Number(detail.id.slice(2)))) {
      patch.now = {
        ...(store.now as BilibiliNow),
        title: detail.title,
        cover: detail.cover,
        duration: detail.duration || store.now?.duration || 0,
        up: detail.up ?? store.now?.up ?? null,
        views: detail.stat?.views ?? store.now?.views ?? 0,
      }
      patch.liked = detail.liked === true
      patch.coins = detail.coins ?? 0
      patch.favorited = detail.favorited === true
    }
    return patch
  })
}

function receiveLike(each: Extract<BilibiliMessage, { kind: 'like' }>): void {
  const id = text(each.bvid).trim()
  const ok = each.ok === true
  const liked = each.on === true
  const words = bilibiliWords(languageNow()).player
  useBilibili.setState((store) => {
    const detail = store.videoDetails[id]
    return {
      acting: store.acting === 'like' ? null : store.acting,
      liked: ok && store.now?.id === id ? liked : store.liked,
      ...(ok && detail ? { videoDetails: { ...store.videoDetails, [id]: { ...detail, liked } } } : {}),
    }
  })
  showToast(ok ? (liked ? words.likedToast : words.unlikedToast) : words.likeFailed)
}

function receiveCoin(each: Extract<BilibiliMessage, { kind: 'coin' }>): void {
  const id = text(each.bvid).trim()
  const count = Math.max(0, number(each.count, 0))
  const ok = each.ok === true
  const words = bilibiliWords(languageNow()).player
  useBilibili.setState((store) => {
    const detail = store.videoDetails[id]
    return {
      acting: store.acting === 'coin' ? null : store.acting,
      coins: ok && store.now?.id === id ? count : store.coins,
      ...(ok && detail ? { videoDetails: { ...store.videoDetails, [id]: { ...detail, coins: count } } } : {}),
    }
  })
  showToast(ok ? words.coinToast(Math.max(1, count)) : words.coinFailed)
}

function receiveFavorite(each: Extract<BilibiliMessage, { kind: 'favorite' }>): void {
  const id = text(each.bvid).trim()
  const ok = each.ok === true
  const favorited = each.on === true
  const words = bilibiliWords(languageNow()).player
  useBilibili.setState((store) => {
    const detail = store.videoDetails[id]
    return {
      acting: store.acting === 'favorite' ? null : store.acting,
      favorited: ok && store.now?.id === id ? favorited : store.favorited,
      ...(ok && detail ? { videoDetails: { ...store.videoDetails, [id]: { ...detail, favorited } } } : {}),
    }
  })
  showToast(ok ? (favorited ? words.favoriteToast : words.unfavoriteToast) : words.favoriteFailed)
}

/** The list or page a `failed` message is about: its own ask, marked failed, and why Bilibili refused it. */
function receiveFailed(each: Extract<BilibiliMessage, { kind: 'failed' }>): void {
  const action = text(each.action).trim()
  const code = Math.trunc(number(each.code, 0))
  const message = text(each.message).trim()
  const failure: BilibiliFailure = { action, code, message }
  const store = useBilibili.getState()
  const patch: Partial<BilibiliAppState> = { failure }
  const failed: Asking = { waiting: false, failed: true }
  switch (action) {
    case 'home':
      patch.homeAsking = failed
      break
    case 'popular':
      patch.hotAsking = failed
      break
    case 'bangumi':
      patch.bangumiAsking = { anime: failed, cinema: failed }
      break
    case 'search':
      patch.searchAsking = { ...store.searchAsking, [store.searchTab]: failed }
      break
    case 'season':
      if (asked?.id) patch.seasonAsking = { ...store.seasonAsking, [asked.id]: failed }
      break
    case 'live':
      patch.liveAsking = failed
      break
    case 'history':
      patch.historyAsking = failed
      break
    case 'favorites':
      patch.favoritesAsking = failed
      break
    case 'favoriteItems':
      patch.folderAsking = failed
      break
    case 'dynamic':
      patch.dynamicAsking = failed
      break
    case 'space':
      patch.spaceAsking = failed
      break
    case 'detail':
      if (asked?.id) patch.videoDetailAsking = { ...store.videoDetailAsking, [asked.id]: failed }
      break
    case 'relations':
      if (asked?.id === 'followers' || asked?.id === 'following') {
        patch.relationsAsking = { ...store.relationsAsking, [asked.id]: failed }
      }
      break
    default:
      break
  }
  useBilibili.setState(patch)
  // A play Bilibili refused (signed out, rights): said over the player.
  if (action === 'play' || action === 'detail') {
    showToast(message || bilibiliWords(languageNow()).failed)
  }
}

/**
 * While the app is open: Bilibili's hidden page runs (the host starts it on the first command, and this is one),
 * and says what it plays. The listener is this app's own (state/store.ts's dispatch knows nothing of `bilibili`
 * messages); a plain browser keeps the preview's data instead.
 */
/** The host's messages as the app's state, one subscription for the whole cab: the app's own screens and the
 * Dashboard (which shows what plays while the app isn't open) both listen, without hearing each message twice. */
let bridgeUsers = 0
let bridgeStop: (() => void) | null = null

export function useBilibiliBridge(start = true): void {
  useEffect(() => {
    if (!IN_HOST) return
    bridgeUsers += 1
    if (!bridgeStop) bridgeStop = subscribeHostMessages(receiveMessage)
    if (start) bilibili({ action: 'start' })
    return () => {
      bridgeUsers -= 1
      if (bridgeUsers > 0 || !bridgeStop) return
      bridgeStop()
      bridgeStop = null
    }
    // The bridge is shared for as long as the cab shows: `start` is its first ask, not something that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** The app closed (its window unmounted): the host's picture goes, and the player page with it (sound plays on). */
export function leaveApp(): void {
  closePicture()
  bilibili({ action: 'hide' })
  clearTimeout(playerTimer)
  useBilibili.setState({ stage: 'closed', playerMenu: null })
  recordTimeline('stage closed', { reason: 'app' })
}

// --- Reading the lists ----------------------------------------------------------------------------------------

/** Home read again (`force`: even with a home already showing): its first page, fresh. */
export function requestHome(force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.home !== null || state.homeAsking.waiting)) return
  asked = { action: 'home' }
  useBilibili.setState({ homeAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'home', page: 1, fresh: Boolean(force) })
}

/** The refresh button: the feed's first page read again over the old one. */
export function refreshHome(): void {
  requestHome(true)
}

/** The infinite scroll: Home's next page, added to the ones already read. */
export function requestHomeMore(): void {
  const state = useBilibili.getState()
  if (state.home === null || !state.homeMore || state.homeAsking.waiting || state.homeMoreAsking.waiting) return
  asked = { action: 'home', id: 'more' }
  useBilibili.setState({ homeMoreAsking: { waiting: true, failed: false } })
  bilibili({ action: 'home', page: state.homePage + 1 })
}

/** 热门 read again. */
export function requestPopular(force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.hot !== null || state.hotAsking.waiting)) return
  asked = { action: 'popular' }
  useBilibili.setState({ hotAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'popular' })
}

/** 番剧's or 影视's index read again. */
export function requestBangumi(kind: BilibiliSeasonKind, force = false): void {
  const state = useBilibili.getState()
  const list = kind === 'anime' ? state.anime : state.cinema
  if (!force && (list !== null || state.bangumiAsking[kind].waiting)) return
  asked = { action: 'bangumi', id: kind }
  useBilibili.setState((now) => ({
    bangumiAsking: { ...now.bangumiAsking, [kind]: { waiting: true, failed: false } },
    failure: null,
  }))
  bilibili({ action: 'bangumi', seasonType: kind === 'anime' ? 1 : 2, page: 1 })
}

/** The live rooms read again. */
export function requestRooms(force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.liveRooms !== null || state.liveAsking.waiting)) return
  asked = { action: 'live' }
  useBilibili.setState({ liveAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'live' })
}

/** A season's own page and episodes, unless it's here already (`force`: read again). */
export function requestSeason(seasonId: string, force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.seasonDetails[seasonId] || state.seasonAsking[seasonId]?.waiting)) return
  asked = { action: 'season', id: seasonId }
  useBilibili.setState((now) => ({
    seasonAsking: { ...now.seasonAsking, [seasonId]: { waiting: true, failed: false } },
    failure: null,
  }))
  bilibili({ action: 'season', value: seasonId })
}

/** A video's own page: its numbers, parts and the account's marks (`detail`). A page already reading it isn't asked
 * again (only a fresh press, after its answer, asks once more). */
export function requestVideoDetail(id: string, force = false): void {
  if (!id) return
  const state = useBilibili.getState()
  if (state.videoDetailAsking[id]?.waiting) return
  if (!force && state.videoDetails[id] !== undefined) return
  asked = { action: 'detail', id }
  useBilibili.setState((now) => ({
    videoDetailAsking: { ...now.videoDetailAsking, [id]: { waiting: true, failed: false } },
    failure: null,
  }))
  bilibili({ action: 'detail', value: id })
}

/** A card's own words for a video's page, so it draws before Bilibili's answer (its marks and numbers unknown). */
export function rememberVideoDetail(video: BilibiliVideo): void {
  if (!video.id) return
  useBilibili.setState((state) => {
    if (state.videoDetails[video.id]) return state
    return {
      videoDetails: {
        ...state.videoDetails,
        [video.id]: {
          id: video.id,
          title: video.title,
          cover: video.cover,
          duration: video.duration,
          description: video.description ?? '',
          up: video.up,
          stat: { views: video.views, likes: video.likes ?? 0 },
          liked: null,
          coins: null,
          favorited: null,
        },
      },
    }
  })
}

/** 我的粉丝 or 我关注的人: its first page (`more`: the next one, added to the list). */
export function requestRelations(kind: RelationKind, more = false): void {
  const state = useBilibili.getState()
  const asking = state.relationsAsking[kind]
  if (asking.waiting) return
  if (!more && state.relations[kind] !== null) return
  if (more && !state.relationsMore[kind]) return
  asked = { action: 'relations', id: kind }
  useBilibili.setState((now) => ({
    relationsAsking: { ...now.relationsAsking, [kind]: { waiting: true, failed: false } },
    failure: null,
  }))
  bilibili({ action: 'relations', kind, page: more ? state.relationsPage[kind] + 1 : 1 })
}

export function requestHistory(force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.history !== null || state.historyAsking.waiting)) return
  asked = { action: 'history' }
  useBilibili.setState({ historyAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'history', max: 20, viewAt: 0 })
}

/** The account's favorite folders. */
export function requestFavorites(force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.favorites !== null || state.favoritesAsking.waiting)) return
  asked = { action: 'favorites' }
  useBilibili.setState({ favoritesAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'favorites' })
}

/** One folder's videos (`folderId`: the folder picked). */
export function requestFavoriteItems(folderId: string, force = false): void {
  if (!folderId) return
  const state = useBilibili.getState()
  if (!force && state.folderId === folderId && state.folderItems !== null && !state.folderAsking.waiting) return
  asked = { action: 'favoriteItems', id: folderId }
  useBilibili.setState((now) => ({
    folderId,
    // The folder's old videos stay while its new page comes (no flash); another folder's are put away.
    folderItems: now.folderId === folderId ? now.folderItems : null,
    folderAsking: { waiting: true, failed: false },
    failure: null,
  }))
  bilibili({ action: 'favoriteItems', value: folderId, page: 1 })
}

export function requestDynamic(force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.dynamic !== null || state.dynamicAsking.waiting)) return
  asked = { action: 'dynamic' }
  useBilibili.setState({ dynamicAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'dynamic', offset: '' })
}

export function requestSpace(uid: string, force = false): void {
  const state = useBilibili.getState()
  if (!force && (state.space?.user.uid === uid || state.spaceAsking.waiting)) return
  asked = { action: 'space', id: uid }
  useBilibili.setState({ spaceAsked: uid, spaceAsking: { waiting: true, failed: false }, failure: null })
  bilibili({ action: 'space', value: uid, page: 1 })
}

// --- Search ---------------------------------------------------------------------------------------------------

/** The search's filter, and the kind Bilibili's page is asked by (its own words: `video`, `user`, `bangumi`). */
const SEARCH_KIND: Record<SearchTab, 'video' | 'user' | 'bangumi'> = {
  video: 'video',
  bangumi: 'bangumi',
  user: 'user',
}

/** The search's filter picked: its own answer is asked for the words, unless it's here already. */
export function setSearchTab(searchTab: SearchTab): void {
  const state = useBilibili.getState()
  useBilibili.setState({ searchTab })
  if (!state.searchAsked) return
  const answered = state.search[searchTab] !== null && !state.searchAsking[searchTab].failed
  if (answered) return
  searchFor(state.searchAsked, searchTab)
}

export function setQuery(query: string): void {
  useBilibili.setState({ query: query.slice(0, 60) })
}

/** The words asked of Bilibili's page: the asked filter's answer is the only one taken. */
export function searchFor(query: string, tab?: SearchTab): void {
  const said = query.trim()
  if (!said) return
  const state = useBilibili.getState()
  const kind = tab ?? state.searchTab
  asked = { action: 'search', id: kind }
  useBilibili.setState((now) => ({
    query: said,
    searchAsked: said,
    searchTab: kind,
    searchAsking: { ...now.searchAsking, [kind]: { waiting: true, failed: false } },
    failure: null,
  }))
  bilibili({ action: 'search', value: said, kind: SEARCH_KIND[kind], page: 1 })
}

// --- Opening things -------------------------------------------------------------------------------------------

/** The player's page, opened (a card pressed): it comes up from the foot, its head drawn from the card at once. */
export function openPlayerPage(): void {
  const state = useBilibili.getState()
  if (state.stage !== 'closed') return
  playerExiting = false
  clearTimeout(playerTimer)
  recordTimeline('open', { video: state.now?.title })
  clearPlayerHole('open')
  useBilibili.setState({ stage: 'enter', picture: false, pictureShown: false })
  recordTimeline('enter')
}

/** The host's picture at the screen, or gone from it (its WebView under the page, its cut in the CarPlay area). */
export function setPicture(picture: boolean): void {
  const shown = useBilibili.getState().picture
  if (shown !== picture) recordTimeline(picture ? 'picture true' : 'picture false')
  useBilibili.setState({ picture })
}

/** The page's way out begun: its cut and covers gone and the cover under them (one frame), before `hidePicture` and
 * the sheet's way down. */
export function startPlayerExit(): void {
  playerExiting = true
  closePicture()
}

/** The player's page coming up whole (its own animation's end, or a moment after it started). */
export function settlePlayerPage(): void {
  if (useBilibili.getState().stage !== 'enter') return
  useBilibili.setState({ stage: 'open' })
  recordTimeline('stage open')
}

/** The page's cut and covers gone, the cover under them: no hole is left over a picture the page isn't showing.
 * The host's video itself is told to hide separately (`hidePicture`), after a frame of the cover. */
export function closePicture(): void {
  clearPlayerHole('close picture')
  setPicture(false)
  useBilibili.setState({ pictureShown: false })
}

/** The host's video told to hide (its `showing: false` comes back): the page's cover is what stays. */
export function hidePicture(): void {
  recordTimeline('hide')
  bilibili({ action: 'hide' })
}

/** The host's picture and the page's cut gone at once: no video left over the app, and no game's black through the
 * cut either (the page's own opaque ground is what shows there instead). */
export function dropPicture(): void {
  closePicture()
  hidePicture()
}

/** The player's page going down, and closed once its animation is over (the app's own bars come back under it). Its
 * way out (the cover a frame first, then `hidePicture`, then this) is the player's own. */
export function closePlayerPage(): void {
  const state = useBilibili.getState()
  if (state.stage === 'closed' || state.stage === 'leave') return
  if (state.stage === 'enter') {
    // Still coming up: shown whole first, then down (a page that was never drawn has nothing to animate).
    useBilibili.setState({ stage: 'open' })
    playerTimer = setTimeout(closePlayerPage, 30)
    return
  }
  // Never a hole over a picture the page isn't showing: the cut and the cover's covers go, the cover stands.
  closePicture()
  useBilibili.setState({ stage: 'leave', playerMenu: null })
  recordTimeline('stage leave')
  clearTimeout(playerTimer)
  playerTimer = setTimeout(() => {
    useBilibili.setState({ stage: 'closed', playerMenu: null })
    recordTimeline('stage closed', { reason: 'leave' })
  }, PLAYER_LEAVE_MS)
}

export function setPlayerMenu(playerMenu: PlayerMenu): void {
  useBilibili.setState({ playerMenu })
}

/** A video's card pressed: the player comes up showing it, and Bilibili's page is asked to play it. */
export function playVideo(video: BilibiliVideo): void {
  closePicture()
  const now: BilibiliNow = {
    id: video.id,
    kind: 'video',
    title: video.title,
    cover: video.cover,
    up: video.up,
    views: video.views,
    duration: video.duration,
    live: false,
    ...(video.aid !== undefined ? { aid: video.aid } : {}),
    ...(video.page !== undefined ? { page: video.page } : {}),
    ...(video.pages !== undefined ? { pages: video.pages } : {}),
  }
  useBilibili.setState({
    now,
    playing: true,
    progress: 0,
    progressAt: performance.now(),
    duration: video.duration,
    liked: false,
    coins: 0,
    favorited: false,
    episodes: [],
  })
  bilibili({ action: 'play', value: video.id, kind: 'video', ...(video.page ? { page: video.page } : {}) })
  requestVideoDetail(video.id)
  openPlayerPage()
}

/** A video's own page's 播放: the player opens on it, with the marks its page already knows. */
export function playVideoDetail(detail: BilibiliVideoDetail): void {
  playVideo({
    id: detail.id,
    title: detail.title,
    cover: detail.cover,
    duration: detail.duration,
    up: detail.up ?? NO_UP,
    views: detail.stat?.views ?? 0,
    likes: detail.stat?.likes,
    description: detail.description,
  })
  useBilibili.setState({
    liked: detail.liked === true,
    coins: detail.coins ?? 0,
    favorited: detail.favorited === true,
  })
}

/** A season's button pressed: its page opens and Bilibili's page plays its first episode (or the one given). */
export function playSeason(season: BilibiliBangumi, epId?: string): void {
  closePicture()
  const episode =
    (epId ? season.episodes.find((each) => each.id === epId) : undefined) ??
    (season.firstEpisodeId ? season.episodes.find((each) => each.id === season.firstEpisodeId) : undefined) ??
    season.episodes[0]
  const id = epId ?? season.firstEpisodeId ?? episode?.id ?? season.seasonId
  const now: BilibiliNow = {
    id,
    kind: 'bangumi',
    title: episode?.title
      ? episode.title.startsWith('第')
        ? `${season.title} ${episode.title}`
        : episode.title
      : season.title,
    cover: episode?.cover ?? season.cover,
    up: null,
    views: 0,
    duration: episode?.duration ?? 0,
    seasonId: season.seasonId,
    ...(episode ? { epId: episode.id } : {}),
    live: false,
  }
  useBilibili.setState({
    now,
    playing: true,
    progress: 0,
    progressAt: performance.now(),
    duration: now.duration,
    liked: false,
    coins: 0,
    favorited: false,
    episodes: season.episodes,
  })
  bilibili({ action: 'play', value: episode ? `ep${episode.id}` : `ss${season.seasonId}`, kind: 'bangumi' })
  requestSeason(season.seasonId)
  openPlayerPage()
}

/** A season's 选集 pressed while it plays: the same player, the next episode. */
export function playEpisode(season: BilibiliBangumi, episode: BilibiliEpisode): void {
  closePicture()
  useBilibili.setState((state) => ({
    now: state.now
      ? {
          ...state.now,
          id: episode.id,
          kind: 'bangumi',
          title: episode.title.startsWith('第') ? `${season.title} ${episode.title}` : episode.title,
          cover: episode.cover ?? state.now.cover,
          duration: episode.duration || state.now.duration,
          seasonId: season.seasonId,
          epId: episode.id,
          live: false,
        }
      : null,
    playing: true,
    progress: 0,
    progressAt: performance.now(),
    duration: episode.duration,
    playerMenu: null,
    episodes: season.episodes,
  }))
  bilibili({ action: 'play', value: `ep${episode.id}`, kind: 'bangumi' })
}

/**
 * An episode picked in the player's 选集 when the season's page isn't loaded here: Bilibili's page is asked for that
 * episode, and the player's head changes at once (the page's answer brings the rest).
 */
export function playEpisodeFrom(seasonId: string, episode: BilibiliEpisode): void {
  const season = useBilibili.getState().seasonDetails[seasonId]
  if (season) {
    playEpisode(season, episode)
    return
  }
  closePicture()
  useBilibili.setState((state) => ({
    now: state.now
      ? {
          ...state.now,
          id: episode.id,
          kind: 'bangumi',
          title: episode.title,
          cover: episode.cover ?? state.now.cover,
          duration: episode.duration,
          seasonId,
          epId: episode.id,
          live: false,
        }
      : null,
    playing: true,
    progress: 0,
    progressAt: performance.now(),
    duration: episode.duration,
    playerMenu: null,
  }))
  bilibili({ action: 'play', value: `ep${episode.id}`, kind: 'bangumi' })
  requestSeason(seasonId)
}

/** A live room's 进入直播间 pressed: its page comes up and Bilibili's page starts the stream. */
export function openLiveRoom(room: BilibiliLiveRoom): void {
  closePicture()
  useBilibili.setState({
    now: {
      id: room.roomId,
      kind: 'live',
      title: room.title,
      cover: room.cover,
      up: { uid: '', name: room.uname, avatar: room.avatar ?? null },
      views: room.online,
      duration: 0,
      roomId: room.roomId,
      live: true,
    },
    playing: true,
    progress: 0,
    progressAt: performance.now(),
    duration: 0,
    liked: false,
    coins: 0,
    favorited: false,
    episodes: [],
  })
  bilibili({ action: 'play', value: room.roomId, kind: 'live' })
  openPlayerPage()
}

/** A live card pressed: its page opens over 直播 (the stream starts from its own button). */
export function roomPageOpened(): void {
  // Nothing to ask: the room is in the live list already. Kept for the page's own mount.
}

/** The player bar's play/pause (the player's too): Bilibili's page plays or pauses. */
export function togglePlay(): void {
  const state = useBilibili.getState()
  if (!state.now) return
  const playing = !state.playing
  useBilibili.setState({ playing, progressAt: performance.now() })
  bilibili({ action: playing ? 'resume' : 'pause' })
}

/** The progress bar let go: seconds into the video (a live stream doesn't seek). */
export function seekTo(seconds: number): void {
  const state = useBilibili.getState()
  if (!state.now || state.now.live) return
  const at = Math.max(0, Math.min(state.duration || seconds, seconds))
  useBilibili.setState({ progress: at, progressAt: performance.now() })
  bilibili({ action: 'seek', value: at })
}

/** The player's volume, 0 to 1. */
export function setVolume(volume: number): void {
  const level = clamp(volume, 0, 1)
  useBilibili.setState({ volume: level })
  bilibili({ action: 'volume', value: level })
}

export function setRate(rate: number): void {
  useBilibili.setState({ rate, playerMenu: null })
  bilibili({ action: 'rate', value: rate })
}

// --- The account and the receipts -----------------------------------------------------------------------------

/** Signing in: Bilibili's own sign-in window opens on the desktop (the QR code); the cab says when it's done. */
export function signIn(): void {
  useBilibili.setState({ signingIn: true })
  bilibili({ action: 'signIn' })
}

export function signOut(): void {
  bilibili({ action: 'signOut' })
}

let actTimer: ReturnType<typeof setTimeout> | undefined

/** A like/coin/favorite sent: its receipt answers, with what happened, in a toast (the app's mark changes then). */
function beganActing(acting: 'like' | 'coin' | 'favorite'): void {
  clearTimeout(actTimer)
  useBilibili.setState({ acting })
  // A page that doesn't answer leaves the button waiting: it lets go after a moment, without a change.
  actTimer = setTimeout(() => {
    if (useBilibili.getState().acting !== acting) return
    useBilibili.setState({ acting: null })
    showToast(bilibiliWords(languageNow()).player.favoriteFailed)
  }, 6000)
}

/** Whether an act may be sent at all: one at a time, and never for a signed-out account (the toast says why). */
function readyToAct(acting: 'like' | 'coin' | 'favorite'): boolean {
  const state = useBilibili.getState()
  if (state.acting) return false
  if (state.signedIn === false) {
    showToast(bilibiliWords(languageNow()).player.signInNeeded)
    return false
  }
  beganActing(acting)
  return true
}

/** The like button: Bilibili's page likes or unlikes `id` (a video's own page, or the one playing). */
export function toggleLikeFor(id: string, liked: boolean): void {
  if (!id || !readyToAct('like')) return
  bilibili({ action: 'like', value: id, on: !liked })
}

/** 投币: Bilibili's page puts a coin in. */
export function addCoinFor(id: string, count = 1): void {
  if (!id || !readyToAct('coin')) return
  bilibili({ action: 'coin', value: id, count: Math.max(1, Math.min(2, Math.round(count))) })
}

/** 收藏: Bilibili's page saves the video, or takes it out of the favorites. */
export function toggleFavoriteFor(id: string, favorited: boolean): void {
  if (!id || !readyToAct('favorite')) return
  bilibili({ action: 'favorite', value: id, add: !favorited })
}

/** The playing video's like button. */
export function toggleLike(): void {
  const state = useBilibili.getState()
  if (state.now) toggleLikeFor(state.now.id, state.liked)
}

/** The playing video's 投币. */
export function addCoin(count = 1): void {
  const state = useBilibili.getState()
  if (state.now) addCoinFor(state.now.id, count)
}

/** The playing video's 收藏. */
export function toggleFavorite(): void {
  const state = useBilibili.getState()
  if (state.now) toggleFavoriteFor(state.now.id, state.favorited)
}

// --- What the lists hold --------------------------------------------------------------------------------------

/** A video the app knows of, by id (from a list already read), for a card's own video. */
export function findVideo(id: string): BilibiliVideo | null {
  const state = useBilibili.getState()
  if (!id) return null
  const lists = [
    state.home ?? [],
    state.hot ?? [],
    state.search.video ?? [],
    (state.history ?? []).map((item) => item.video),
    state.folderItems ?? [],
    state.space?.videos ?? [],
  ]
  for (const list of lists) {
    const found = list.find((video) => video.id === id)
    if (found) return found
  }
  return null
}

/** A season the app knows of, by id (a list's or a page's own). */
export function findSeason(seasonId: string): BilibiliBangumi | null {
  const state = useBilibili.getState()
  return (
    state.seasonDetails[seasonId] ??
    state.anime?.find((season) => season.seasonId === seasonId) ??
    state.cinema?.find((season) => season.seasonId === seasonId) ??
    state.search.bangumi?.find((season) => season.seasonId === seasonId) ??
    null
  )
}

/** A live room the app knows of, by id. */
export function findRoom(roomId: string): BilibiliLiveRoom | null {
  const state = useBilibili.getState()
  return state.liveRooms?.find((room) => room.roomId === roomId) ?? null
}

/** The video that plays, when it's this one (a card's own mark, and the player's). */
export function useIsPlaying(id: string): boolean {
  return useBilibili((state) => state.now?.id === id && state.playing)
}

// --- The Dashboard and the cab's players ---------------------------------------------------------------------

/** What the Dashboard's Now Playing (and the Equalizer) show of it (`shared/media.ts`): the video, its UP主, its
 * cover, whether it plays, and where it was when the host's state was read. */
export function useBilibiliSource(): { source: MediaSource; artwork: string | null } | null {
  const now = useBilibili((state) => state.now)
  const playing = useBilibili((state) => state.playing)
  const progress = useBilibili((state) => state.progress)
  const progressAt = useBilibili((state) => state.progressAt)
  const duration = useBilibili((state) => state.duration)
  return useMemo(
    () => sourceOf(now, playing, progress, progressAt, duration),
    [now, playing, progress, progressAt, duration],
  )
}

/** Now Playing's play/pause: the app's own command, whether it shows or not. */
export function playPauseBilibili(): void {
  const state = useBilibili.getState()
  if (!state.now) return
  if (state.playing) bilibili({ action: 'pause' })
  else bilibili({ action: 'resume' })
}

/** Now Playing's next: Bilibili's next related video, or the next episode of what plays. */
export function nextBilibili(): void {
  bilibili({ action: 'next' })
}

// --- The player's clock ---------------------------------------------------------------------------------------

/** Where the player is, ticking while it plays: the host's last progress moved on by the time since it was read. */
export function usePlayhead(): number {
  const playing = useBilibili((state) => state.playing)
  const progress = useBilibili((state) => state.progress)
  const progressAt = useBilibili((state) => state.progressAt)
  const rate = useBilibili((state) => state.rate)
  const duration = useBilibili((state) => state.duration)
  const [now, setNow] = useState(() => (typeof performance === 'undefined' ? 0 : performance.now()))
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setNow(performance.now()), 500)
    return () => clearInterval(timer)
  }, [playing, progress, progressAt, rate])
  return playhead(playing, progress, progressAt, now, rate, duration)
}
