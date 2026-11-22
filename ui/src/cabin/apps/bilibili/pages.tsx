import { useEffect, useMemo, useState, type ReactNode, type UIEvent } from 'react'
import {
  IN_HOST,
  addCoinFor,
  openLiveRoom,
  playSeason,
  playVideoDetail,
  refreshHome,
  rememberVideoDetail,
  requestBangumi,
  requestDynamic,
  requestFavoriteItems,
  requestFavorites,
  requestHistory,
  requestHome,
  requestHomeMore,
  requestPopular,
  requestRelations,
  requestRooms,
  requestSeason,
  requestSpace,
  requestVideoDetail,
  searchFor,
  setSearchTab,
  signIn,
  signOut,
  toggleFavoriteFor,
  toggleLikeFor,
  togglePlay,
  useBilibili,
  type BilibiliBangumi,
  type BilibiliLiveRoom,
  type BilibiliUp,
  type BilibiliVideo,
  type RelationKind,
} from './bilibili'
import {
  BellGlyph,
  ChevronRightGlyph,
  CoinGlyph,
  GearGlyph,
  HistoryGlyph,
  LikeGlyph,
  LiveGlyph,
  PersonGlyph,
  PlayGlyph,
  SpaceGlyph,
  StarGlyph,
  TvGlyph,
} from './glyphs'
import { openPage, openTab } from './nav'
import {
  Avatar,
  BangumiCard,
  Cover,
  Empty,
  EpisodeGrid,
  Failed,
  LengthBadge,
  LiveCard,
  Loading,
  PageHead,
  Pill,
  SectionHead,
  VideoCard,
  VideoGrid,
} from './parts'
import { useSearchHistory } from './searchHistory'
import type { Page, Tab } from './stack'
import { useBilibiliWords } from './strings'
import { THEMES, useTheme } from './theme'
import { formatClock, progressShare } from './time'

/**
 * The Bilibili app's pages: the five tabs' own (Home's feed, 番剧's and 影视's indexes, 直播's rooms, 我的), and the
 * pages over them (a search, a season's page and its 选集, a live room, the account's history, favorites, feed, and a
 * UP主's page). Everything is drawn from the host's messages (`bilibili.ts`); in a browser the preview's made-up lists
 * fill them. No comments, no danmaku: the app shows what it plays and the lists around it, nothing to read under it.
 */

/** A tab's own page, under whatever is opened over it. */
export function TabPage({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'home':
      return <HomePage />
    case 'bangumi':
      return <SeasonListPage kind="anime" />
    case 'cinema':
      return <SeasonListPage kind="cinema" />
    case 'live':
      return <LivePage />
    case 'mine':
      return <MinePage />
  }
}

/** The page opened over a tab's own. */
export function PageBody({ page }: { page: Page }) {
  switch (page.kind) {
    case 'search':
      return <SearchPage />
    case 'videoDetail':
      return <VideoDetailPage videoId={page.videoId} />
    case 'bangumiDetail':
      return <SeasonPage page={page} />
    case 'liveRoom':
      return <LiveRoomPage roomId={page.roomId} />
    case 'space':
      return <SpacePage uid={page.uid} />
    case 'history':
      return <HistoryPage />
    case 'favorites':
      return <FavoritesPage />
    case 'dynamic':
      return <DynamicPage />
    case 'relations':
      return <RelationsPage relation={page.relation} />
    case 'settings':
      return <SettingsPage />
  }
}

/** A page's own scroll (the shell's drag-scroll follows a drag, as on a touch screen). */
function Scroll({ children, onScroll }: { children: ReactNode; onScroll?(event: UIEvent<HTMLDivElement>): void }) {
  return (
    <div className="bb-scroll" onScroll={onScroll}>
      <div className="bb-page">{children}</div>
    </div>
  )
}

/** A card pressed: the video's own page opens (its description and marks), not the player. */
function openVideo(video: BilibiliVideo): void {
  rememberVideoDetail(video)
  openPage({ kind: 'videoDetail', videoId: video.id, title: video.title })
  requestVideoDetail(video.id, true)
}

/** A season's card pressed: its page opens over the list. */
function openSeason(season: BilibiliBangumi): void {
  openPage({ kind: 'bangumiDetail', seasonId: season.seasonId, title: season.title })
  requestSeason(season.seasonId)
}

/** A UP主 pressed: their page opens over the list. */
function openUp(up: BilibiliUp | null): void {
  if (!up?.uid) return
  openPage({ kind: 'space', uid: up.uid, name: up.name })
  requestSpace(up.uid)
}

/** A live room's card pressed: its page comes up over 直播. */
function openRoom(room: BilibiliLiveRoom): void {
  openPage({ kind: 'liveRoom', roomId: room.roomId, title: room.title })
}

// --- Home -----------------------------------------------------------------------------------------------------

/** Home's category pills, in the app's own order. */
type HomeCategory = 'recommended' | 'bangumi' | 'cinema' | 'live' | 'hot' | 'following'

const HOME_CATEGORIES: readonly HomeCategory[] = ['recommended', 'bangumi', 'cinema', 'live', 'hot', 'following']

/** A banner candidate: one of Home's feed's 番剧/影视 cards, or one of its videos. */
type BannerItem = { kind: 'season'; season: BilibiliBangumi } | { kind: 'video'; video: BilibiliVideo }

/** The banner's candidates: Home's own feed's seasons and videos, mixed, with a name and a picture (3 to 6 of them). */
function bannerCandidates(seasons: BilibiliBangumi[], videos: BilibiliVideo[] | null): BannerItem[] {
  const items: BannerItem[] = []
  const seen = new Set<string>()
  const push = (item: BannerItem) => {
    if (items.length >= 6) return
    if (item.kind === 'season') {
      if (!item.season.title) return
      if (seen.has(`season:${item.season.seasonId}`)) return
      seen.add(`season:${item.season.seasonId}`)
    } else {
      if (!item.video.title) return
      if (seen.has(`video:${item.video.id}`)) return
      seen.add(`video:${item.video.id}`)
    }
    items.push(item)
  }
  const list = videos ?? []
  const most = Math.max(seasons.length, list.length)
  for (let index = 0; index < most; index += 1) {
    const season = seasons[index]
    if (season) push({ kind: 'season', season })
    const video = list[index]
    if (video) push({ kind: 'video', video })
  }
  return items
}

/** 首页: the category pills, the account's recommendations banner, and the grid the pill picked. */
function HomePage() {
  const words = useBilibiliWords()
  const [category, setCategory] = useState<HomeCategory>('recommended')
  const [bannerSeed, setBannerSeed] = useState(0)
  const home = useBilibili((state) => state.home)
  const homeSeasons = useBilibili((state) => state.homeSeasons)
  const homeAsking = useBilibili((state) => state.homeAsking)
  const hot = useBilibili((state) => state.hot)
  const hotAsking = useBilibili((state) => state.hotAsking)
  const anime = useBilibili((state) => state.anime)
  const cinema = useBilibili((state) => state.cinema)
  const bangumiAsking = useBilibili((state) => state.bangumiAsking)
  const rooms = useBilibili((state) => state.liveRooms)
  const liveAsking = useBilibili((state) => state.liveAsking)
  const moreAsking = useBilibili((state) => state.homeMoreAsking)
  const more = useBilibili((state) => state.homeMore)

  useEffect(() => requestHome(), [])
  // The 追番 banner comes from 番剧's index; the other pills read their own lists as they're picked.
  useEffect(() => {
    requestBangumi('anime')
  }, [])
  useEffect(() => {
    if (category === 'hot') requestPopular()
    else if (category === 'bangumi' || category === 'following') requestBangumi('anime')
    else if (category === 'cinema') requestBangumi('cinema')
    else if (category === 'live') requestRooms()
  }, [category])

  // The feed's infinite scroll: near its foot, the next page (the recommended list alone).
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    if (category !== 'recommended') return
    const box = event.currentTarget
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 240) requestHomeMore()
  }

  const bannerItems = useMemo(() => bannerCandidates(homeSeasons ?? [], home), [homeSeasons, home])
  return (
    <Scroll onScroll={onScroll}>
      <div className="bb-home">
        <div className="bb-home-tools">
          <div className="bb-pills" role="tablist">
            {HOME_CATEGORIES.map((each) => (
              <Pill
                key={each}
                label={words.home.categories[each]}
                on={category === each}
                onClick={() => setCategory(each)}
              />
            ))}
          </div>
          {category === 'recommended' && (
            <button
              type="button"
              className="bb-refresh"
              aria-label={words.home.refresh}
              disabled={homeAsking.waiting}
              onClick={() => {
                refreshHome()
                // A fresh feed: the banner starts from another of its candidates (or the feed's own new ones).
                setBannerSeed((seed) => seed + 1)
              }}
            >
              <RefreshGlyph />
              {words.home.refresh}
            </button>
          )}
        </div>
        {home === null ? (
          homeAsking.failed ? (
            <Failed onRetry={() => requestHome(true)} />
          ) : (
            <Loading />
          )
        ) : (
          <>
            {category === 'recommended' && bannerItems.length > 0 && (
              <HomeBanner items={bannerItems} seed={bannerSeed} />
            )}
            <HomeBody
              category={category}
              home={home}
              hot={hot}
              anime={anime}
              cinema={cinema}
              rooms={rooms}
              asking={{
                hot: hotAsking,
                bangumi: bangumiAsking.anime,
                cinema: bangumiAsking.cinema,
                live: liveAsking,
              }}
              onRetry={(each) => {
                if (each === 'hot') requestPopular(true)
                else if (each === 'live') requestRooms(true)
                else requestBangumi(each === 'cinema' ? 'cinema' : 'anime', true)
              }}
              onAll={(each) => openTab(each === 'cinema' ? 'cinema' : each === 'live' ? 'live' : 'bangumi')}
              foot={category === 'recommended' ? <HomeFoot more={more} asking={moreAsking} /> : null}
            />
          </>
        )}
      </div>
    </Scroll>
  )
}

/** The feed's foot: its next page coming, or that there's nothing more. */
function HomeFoot({ more, asking }: { more: boolean; asking: { waiting: boolean; failed: boolean } }) {
  const words = useBilibiliWords()
  return (
    <div className="bb-feed-foot">
      {asking.waiting ? (
        <>
          <span className="bb-spinner" aria-hidden />
          {words.home.loadingMore}
        </>
      ) : asking.failed ? (
        <button type="button" className="bb-refresh" onClick={() => requestHomeMore()}>
          {words.retry}
        </button>
      ) : !more ? (
        <span className="bb-feed-end">{words.home.noMore}</span>
      ) : null}
    </div>
  )
}

/** The refresh mark, drawn small in the feed's button. */
function RefreshGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.2 5.6v5h-5M3.8 18.4v-5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 10.4a7.4 7.4 0 0 0-12.6-4L3.8 8.8M5 13.6a7.4 7.4 0 0 0 12.6 4l2.6-2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HomeBody({
  category,
  home,
  hot,
  anime,
  cinema,
  rooms,
  asking,
  onRetry,
  onAll,
  foot,
}: {
  category: HomeCategory
  home: BilibiliVideo[]
  hot: BilibiliVideo[] | null
  anime: BilibiliBangumi[] | null
  cinema: BilibiliBangumi[] | null
  rooms: BilibiliLiveRoom[] | null
  asking: {
    hot: { waiting: boolean; failed: boolean }
    bangumi: { waiting: boolean; failed: boolean }
    cinema: { waiting: boolean; failed: boolean }
    live: { waiting: boolean; failed: boolean }
  }
  onRetry(kind: 'hot' | 'anime' | 'cinema' | 'live'): void
  onAll(kind: 'bangumi' | 'cinema' | 'live'): void
  foot?: ReactNode
}) {
  const words = useBilibiliWords()
  if (category === 'live') {
    return (
      <>
        <SectionHead title={words.home.sections.live} action={words.home.all} onAction={() => onAll('live')} />
        {rooms === null ? (
          asking.live.failed ? (
            <Failed onRetry={() => onRetry('live')} />
          ) : (
            <Loading />
          )
        ) : rooms.length > 0 ? (
          <div className="bb-live-grid">
            {rooms.map((room) => (
              <LiveCard key={room.roomId} room={room} onOpen={openRoom} />
            ))}
          </div>
        ) : (
          <Empty title={words.live.empty} hint={words.live.emptyHint} />
        )}
      </>
    )
  }
  if (category === 'bangumi' || category === 'cinema' || category === 'following') {
    const seasons = category === 'cinema' ? cinema : anime
    const state = category === 'cinema' ? asking.cinema : asking.bangumi
    return (
      <>
        <SectionHead
          title={category === 'cinema' ? words.home.sections.cinema : words.home.sections.bangumi}
          action={words.home.all}
          onAction={() => onAll(category === 'cinema' ? 'cinema' : 'bangumi')}
        />
        {seasons === null ? (
          state.failed ? (
            <Failed onRetry={() => onRetry(category === 'cinema' ? 'cinema' : 'anime')} />
          ) : (
            <Loading />
          )
        ) : seasons.length > 0 ? (
          <div className="bb-season-grid">
            {seasons.map((season) => (
              <BangumiCard key={season.seasonId} season={season} onOpen={openSeason} />
            ))}
          </div>
        ) : (
          <Empty title={words.bangumi.empty} hint={words.bangumi.emptyHint} />
        )}
      </>
    )
  }
  if (category === 'hot') {
    return (
      <>
        <SectionHead title={words.home.sections.hot} />
        {hot === null ? (
          asking.hot.failed ? (
            <Failed onRetry={() => onRetry('hot')} />
          ) : (
            <Loading />
          )
        ) : (
          <VideoGrid videos={hot} onOpen={openVideo} />
        )}
      </>
    )
  }
  return (
    <>
      <SectionHead title={words.home.sections.recommended} />
      <VideoGrid videos={home} onOpen={openVideo} />
      {foot}
    </>
  )
}

/** Home's big card: the newest 番剧 the account follows, or a video when there's no season to show yet. */
/** The banner's candidate by its id (the dots' keys). */
function bannerKey(item: BannerItem): string {
  return item.kind === 'season' ? `season:${item.season.seasonId}` : `video:${item.video.id}`
}

/**
 * Home's banner: the account's own recommendations (the feed's 番剧/影视 cards and videos), one at a time, changing
 * every few seconds; its dots say where it is. 刷新 starts it from another candidate (and the feed's own new ones).
 * Fewer than two candidates: one banner, no dots, no changing.
 */
function HomeBanner({ items, seed }: { items: BannerItem[]; seed: number }) {
  const words = useBilibiliWords()
  const ordered = useMemo(() => {
    if (items.length === 0) return []
    const start = seed % items.length
    return [...items.slice(start), ...items.slice(0, start)]
  }, [items, seed])
  const [index, setIndex] = useState(0)
  const count = ordered.length
  const active = count > 0 ? index % count : 0
  useEffect(() => {
    if (count < 2) return
    const timer = setInterval(() => setIndex((shown) => shown + 1), 7_000)
    return () => clearInterval(timer)
  }, [count, ordered])
  const current = ordered[active]
  if (!current) return null
  const season = current.kind === 'season' ? current.season : null
  const video = current.kind === 'video' ? current.video : null
  const open = () => (season ? openSeason(season) : video ? openVideo(video) : undefined)
  const title = season?.title ?? video?.title ?? ''
  return (
    <div className="bb-banner-wrap">
      <button type="button" className="bb-banner" aria-label={title} onClick={open}>
        <Cover cover={season?.cover ?? video?.cover ?? null} title={title} wide className="bb-banner-art" />
        <span className="bb-banner-veil" aria-hidden />
        <span className="bb-banner-text">
          <span className="bb-banner-kicker">
            {season ? words.home.banner : words.home.sections.recommended}
            {season?.progress ? <b>{season.progress}</b> : video?.up.name ? <b>{video.up.name}</b> : null}
          </span>
          <span className="bb-banner-title">{title}</span>
          {season?.rating !== undefined ? (
            <span className="bb-banner-note">{words.home.rating(season.rating)}</span>
          ) : video ? (
            <span className="bb-banner-note">{words.home.views(video.views)}</span>
          ) : null}
          <span className="bb-banner-button">
            <PlayGlyph />
            {words.home.watch}
          </span>
        </span>
      </button>
      {count > 1 && (
        <span className="bb-banner-dots" aria-hidden>
          {ordered.map((item, dot) => (
            <i key={bannerKey(item)} className={dot === active ? 'on' : ''} />
          ))}
        </span>
      )}
    </div>
  )
}

// --- 番剧 / 影视 ----------------------------------------------------------------------------------------------

/** 番剧's and 影视's own pages: their index, as the host listed it. */
function SeasonListPage({ kind }: { kind: 'anime' | 'cinema' }) {
  const words = useBilibiliWords()
  const seasons = useBilibili((state) => (kind === 'anime' ? state.anime : state.cinema))
  const asking = useBilibili((state) => state.bangumiAsking[kind])
  useEffect(() => requestBangumi(kind), [kind])
  return (
    <Scroll>
      <PageHead
        title={kind === 'anime' ? words.bangumi.anime : words.bangumi.cinema}
        hint={kind === 'anime' ? words.bangumi.animeHint : words.bangumi.cinemaHint}
      />
      {seasons === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestBangumi(kind, true)} />
        ) : (
          <Loading />
        )
      ) : seasons.length > 0 ? (
        <div className="bb-season-grid">
          {seasons.map((season) => (
            <BangumiCard key={season.seasonId} season={season} onOpen={openSeason} />
          ))}
        </div>
      ) : (
        <Empty
          title={words.bangumi.empty}
          hint={words.bangumi.emptyHint}
          action={words.retry}
          onAction={() => requestBangumi(kind, true)}
        />
      )}
    </Scroll>
  )
}

/** A season's page: its cover, its words and numbers, its play-all button and its 选集. */
function SeasonPage({ page }: { page: Extract<Page, { kind: 'bangumiDetail' }> }) {
  const words = useBilibiliWords()
  const season = useBilibili(
    (state) =>
      state.seasonDetails[page.seasonId] ??
      state.anime?.find((one) => one.seasonId === page.seasonId) ??
      state.cinema?.find((one) => one.seasonId === page.seasonId) ??
      null,
  )
  const asking = useBilibili((state) => state.seasonAsking[page.seasonId])
  const playing = useBilibili((state) => (state.now?.seasonId === page.seasonId ? state.now.epId : undefined))
  useEffect(() => requestSeason(page.seasonId), [page.seasonId])
  if (!season) {
    return (
      <Scroll>
        <div className="bb-detail-loading">
          {asking?.failed ? <Failed onRetry={() => requestSeason(page.seasonId, true)} /> : <Loading />}
        </div>
      </Scroll>
    )
  }
  return (
    <Scroll>
      <div className="bb-detail">
        <div className="bb-detail-hero">
          <Cover cover={season.cover} title={season.title} wide className="bb-detail-cover" />
          <div className="bb-detail-info">
            <span className="bb-kicker">{season.kind === 'cinema' ? words.bangumi.cinema : words.bangumi.anime}</span>
            <h2>{season.title}</h2>
            <div className="bb-detail-facts">
              {season.rating !== undefined && <b>{words.bangumi.rating(season.rating)}</b>}
              {season.badge && <span>{season.badge}</span>}
              {season.progress && <span>{season.progress}</span>}
            </div>
            <p className="bb-detail-description">{season.description || words.bangumi.description}</p>
            <div className="bb-detail-actions">
              <button
                type="button"
                className="bb-primary"
                disabled={season.episodes.length === 0 && !season.firstEpisodeId}
                onClick={() => playSeason(season)}
              >
                <PlayGlyph />
                {words.bangumi.playAll}
              </button>
            </div>
          </div>
        </div>
        <SectionHead title={words.bangumi.episodes} action={words.bangumi.episodesHint} />
        <EpisodeGrid
          episodes={season.episodes}
          currentId={playing}
          onPlay={(episode) => playSeason(season, episode.id)}
        />
      </div>
    </Scroll>
  )
}

// --- 直播 ----------------------------------------------------------------------------------------------------

/** 直播: the rooms Bilibili has on air. */
function LivePage() {
  const words = useBilibiliWords()
  const rooms = useBilibili((state) => state.liveRooms)
  const asking = useBilibili((state) => state.liveAsking)
  useEffect(() => requestRooms(), [])
  return (
    <Scroll>
      <PageHead title={words.live.title} hint={words.live.hint} />
      {rooms === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestRooms(true)} />
        ) : (
          <Loading />
        )
      ) : rooms.length > 0 ? (
        <div className="bb-live-grid wide">
          {rooms.map((room) => (
            <LiveCard key={room.roomId} room={room} onOpen={openRoom} />
          ))}
        </div>
      ) : (
        <Empty title={words.live.empty} hint={words.live.emptyHint} />
      )}
    </Scroll>
  )
}

/** A live room's page: its picture (the host's stream, once it starts), who streams and where, and the way in. */
function LiveRoomPage({ roomId }: { roomId: string }) {
  const words = useBilibiliWords()
  const room = useBilibili((state) => state.liveRooms?.find((one) => one.roomId === roomId) ?? null)
  const playing = useBilibili((state) => state.now?.roomId === roomId && state.playing)
  if (!room) {
    return (
      <Scroll>
        <Empty title={words.live.empty} hint={words.live.hint} />
      </Scroll>
    )
  }
  return (
    <Scroll>
      <div className="bb-room">
        <div className="bb-room-stage">
          <Cover cover={room.cover} title={room.title} wide className="bb-room-art" />
          <span className="bb-room-veil" aria-hidden />
          <span className={room.live ? 'bb-room-badge live' : 'bb-room-badge'}>
            <i aria-hidden />
            {room.live ? words.live.liveNow : words.live.offline}
          </span>
          <button
            type="button"
            className="bb-room-play"
            aria-label={playing ? words.player.pause : words.live.enter}
            onClick={() => (playing ? togglePlay() : openLiveRoom(room))}
          >
            {playing ? <span className="bb-room-live-dot" aria-hidden /> : <PlayGlyph />}
          </button>
          <span className="bb-room-stage-note">{words.live.playing}</span>
        </div>
        <div className="bb-room-info">
          <div className="bb-room-title-row">
            <Avatar user={{ uid: '', name: room.uname, avatar: room.avatar ?? null }} />
            <div>
              <h2>{room.title}</h2>
              <p>
                {room.uname}
                {room.area && <span> · {room.area}</span>}
              </p>
            </div>
            <span className="bb-room-online">
              <LiveGlyph />
              {words.live.online(room.online)}
            </span>
          </div>
          <div className="bb-room-facts">
            <div>
              <span>{words.live.area}</span>
              <b>{room.area || '—'}</b>
            </div>
            <div>
              <span>{words.live.online(room.online)}</span>
              <b>{room.live ? words.live.liveNow : words.live.offline}</b>
            </div>
            <div>
              <span>{words.bangumi.play}</span>
              <b>{words.player.live}</b>
            </div>
          </div>
        </div>
      </div>
    </Scroll>
  )
}

// --- 我的 ----------------------------------------------------------------------------------------------------

/** 我的: the account (or the way to sign in on the companion), and its pages' doors. */
function MinePage() {
  const words = useBilibiliWords()
  const signedIn = useBilibili((state) => state.signedIn)
  const signingIn = useBilibili((state) => state.signingIn)
  const user = useBilibili((state) => state.user)
  const history = useBilibili((state) => state.history)
  useEffect(() => {
    if (signedIn === true) requestHistory()
  }, [signedIn])

  return (
    <Scroll>
      <PageHead title={words.mine.title}>
        <span className="bb-about">{words.aboutApp}</span>
      </PageHead>
      {!IN_HOST && <p className="bb-preview">{words.preview}</p>}
      {signedIn !== true ? (
        <div className="bb-signin-card">
          <span className="bb-signin-mark" aria-hidden>
            <TvGlyph />
          </span>
          <div className="bb-signin-text">
            <h3>{words.account.signInTitle}</h3>
            <p>{words.account.signInHint}</p>
            <p className="bb-signin-foot">{words.account.signInFoot}</p>
          </div>
          <button type="button" className="bb-primary" disabled={signingIn || signedIn === null} onClick={signIn}>
            {signingIn ? words.account.signingIn : words.account.signIn}
          </button>
        </div>
      ) : (
        <div className="bb-account">
          <Avatar user={user} size="large" />
          <div className="bb-account-text">
            <h3>{user?.name || words.account.signedIn}</h3>
            <p>
              {user?.vip && <span className="bb-vip">{user.vip}</span>}
              <span>{user?.sign || words.account.signedIn}</span>
            </p>
          </div>
          <button type="button" className="bb-ghost" onClick={() => openUp(user)}>
            {words.mine.space}
            <ChevronRightGlyph />
          </button>
          <button type="button" className="bb-ghost quiet" onClick={signOut}>
            {words.account.signOut}
          </button>
        </div>
      )}

      <div className="bb-mine-tools">
        <button type="button" className="bb-ghost" onClick={() => openPage({ kind: 'settings' })}>
          <GearGlyph />
          {words.settings.title}
        </button>
      </div>

      <div className="bb-doors">
        <button type="button" className="bb-door" onClick={() => openPage({ kind: 'history' })}>
          <span className="bb-door-mark">
            <HistoryGlyph />
          </span>
          <span className="bb-door-text">
            <b>{words.mine.history}</b>
            <span>{words.mine.historyHint}</span>
          </span>
          <ChevronRightGlyph />
        </button>
        <button type="button" className="bb-door" onClick={() => openPage({ kind: 'favorites' })}>
          <span className="bb-door-mark">
            <StarGlyph />
          </span>
          <span className="bb-door-text">
            <b>{words.mine.favorites}</b>
            <span>{words.mine.favoritesHint}</span>
          </span>
          <ChevronRightGlyph />
        </button>
        <button type="button" className="bb-door" onClick={() => openPage({ kind: 'dynamic' })}>
          <span className="bb-door-mark">
            <BellGlyph />
          </span>
          <span className="bb-door-text">
            <b>{words.mine.dynamic}</b>
            <span>{words.mine.dynamicHint}</span>
          </span>
          <ChevronRightGlyph />
        </button>
        <button
          type="button"
          className="bb-door"
          onClick={() => {
            openPage({ kind: 'relations', relation: 'followers' })
            requestRelations('followers')
          }}
        >
          <span className="bb-door-mark">
            <PersonGlyph />
          </span>
          <span className="bb-door-text">
            <b>{words.mine.followers}</b>
            <span>{user?.follower !== undefined ? words.space.fans(user.follower) : words.mine.followersHint}</span>
          </span>
          <ChevronRightGlyph />
        </button>
        <button
          type="button"
          className="bb-door"
          onClick={() => {
            openPage({ kind: 'relations', relation: 'following' })
            requestRelations('following')
          }}
        >
          <span className="bb-door-mark">
            <PersonGlyph />
          </span>
          <span className="bb-door-text">
            <b>{words.mine.following}</b>
            <span>
              {user?.following !== undefined ? words.space.following(user.following) : words.mine.followingHint}
            </span>
          </span>
          <ChevronRightGlyph />
        </button>
        <button type="button" className="bb-door" onClick={() => openUp(user)}>
          <span className="bb-door-mark">
            <SpaceGlyph />
          </span>
          <span className="bb-door-text">
            <b>{words.mine.space}</b>
            <span>{words.mine.spaceHint}</span>
          </span>
          <ChevronRightGlyph />
        </button>
      </div>

      {signedIn === true && (
        <>
          <SectionHead title={words.mine.recent} />
          {history === null ? (
            <Loading />
          ) : history.length > 0 ? (
            <div className="bb-history-row">
              {history.slice(0, 4).map((item) => (
                <VideoCard key={item.video.id} video={item.video} onOpen={openVideo} />
              ))}
            </div>
          ) : (
            <Empty title={words.history.empty} hint={words.history.emptyHint} />
          )}
        </>
      )}
    </Scroll>
  )
}

// --- A video's own page --------------------------------------------------------------------------------------

/** A video's own page before it plays: its cover, title, UP主, numbers, description, the way to play it and its
 * marks. A card pressed comes here; the player opens from its 播放. */
function VideoDetailPage({ videoId }: { videoId: string }) {
  const words = useBilibiliWords()
  const detail = useBilibili((state) => state.videoDetails[videoId] ?? null)
  const asking = useBilibili((state) => state.videoDetailAsking[videoId])
  const acting = useBilibili((state) => state.acting)
  useEffect(() => requestVideoDetail(videoId, true), [videoId])
  if (!detail) {
    return (
      <Scroll>
        {asking?.failed ? (
          <Failed onRetry={() => requestVideoDetail(videoId, true)} label={words.videoDetail.failed} />
        ) : (
          <Loading label={words.videoDetail.loading} />
        )}
      </Scroll>
    )
  }
  const stat = detail.stat ?? {}
  const likes = stat.likes ?? 0
  const coins = stat.coins ?? 0
  const favorites = stat.favorites ?? 0
  return (
    <Scroll>
      <div className="bb-vdetail">
        <div className="bb-vdetail-hero">
          <Cover cover={detail.cover} title={detail.title} wide className="bb-vdetail-cover" />
          <div className="bb-vdetail-info">
            <h2>{detail.title}</h2>
            <button
              type="button"
              className="bb-vdetail-up"
              disabled={!detail.up?.uid}
              onClick={() => openUp(detail.up)}
            >
              <Avatar user={detail.up} size="small" />
              <span className="bb-vdetail-up-text">
                <b>{detail.up?.name || words.videoDetail.by}</b>
                <span>{words.videoDetail.by}</span>
              </span>
              <ChevronRightGlyph />
            </button>
            <div className="bb-vdetail-stats">
              <span>{words.videoDetail.views(stat.views ?? 0)}</span>
              <span>{words.videoDetail.likes(likes)}</span>
              <span>{words.videoDetail.coins(coins)}</span>
              <span>{words.videoDetail.favorites(favorites)}</span>
              {detail.duration > 0 && <span>{formatClock(detail.duration)}</span>}
            </div>
            <div className="bb-vdetail-actions">
              <button type="button" className="bb-primary" onClick={() => playVideoDetail(detail)}>
                <PlayGlyph />
                {words.videoDetail.play}
              </button>
              <DetailMark
                label={detail.liked === true ? words.videoDetail.liked : words.videoDetail.like}
                count={likes}
                on={detail.liked === true}
                busy={acting === 'like'}
                icon={<LikeGlyph on={detail.liked === true} />}
                onClick={() => toggleLikeFor(detail.id, detail.liked === true)}
              />
              <DetailMark
                label={words.videoDetail.coin}
                count={coins}
                on={(detail.coins ?? 0) > 0}
                busy={acting === 'coin'}
                icon={<CoinGlyph />}
                onClick={() => addCoinFor(detail.id)}
              />
              <DetailMark
                label={detail.favorited === true ? words.videoDetail.favorited : words.videoDetail.favorite}
                count={favorites}
                on={detail.favorited === true}
                busy={acting === 'favorite'}
                icon={<StarGlyph on={detail.favorited === true} />}
                onClick={() => toggleFavoriteFor(detail.id, detail.favorited === true)}
              />
            </div>
          </div>
        </div>
        <SectionHead title={words.videoDetail.description} />
        <p className={detail.description ? 'bb-vdetail-desc' : 'bb-vdetail-desc empty'}>
          {detail.description || words.videoDetail.noDescription}
        </p>
      </div>
    </Scroll>
  )
}

/** One of a video's page's marks: its lit state and the count Bilibili gave. */
function DetailMark({
  label,
  count,
  on,
  busy,
  icon,
  onClick,
}: {
  label: string
  count: number
  on: boolean
  busy: boolean
  icon: ReactNode
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`bb-detail-mark ${on ? 'on' : ''} ${busy ? 'busy' : ''}`}
      aria-label={label}
      aria-pressed={on}
      disabled={busy}
      onClick={onClick}
    >
      <span className="bb-detail-mark-icon">{icon}</span>
      <span className="bb-detail-mark-text">
        <b>{label}</b>
        <span>{count > 0 ? count.toLocaleString() : ''}</span>
      </span>
    </button>
  )
}

// --- 我的粉丝 / 我关注的人 ------------------------------------------------------------------------------------

/** 我的粉丝 or 我关注的人: a page of people, each opening their own page; the list goes on as it's scrolled. */
function RelationsPage({ relation }: { relation: RelationKind }) {
  const words = useBilibiliWords()
  const list = useBilibili((state) => state.relations[relation])
  const asking = useBilibili((state) => state.relationsAsking[relation])
  const more = useBilibili((state) => state.relationsMore[relation])
  useEffect(() => requestRelations(relation), [relation])
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 220) requestRelations(relation, true)
  }
  return (
    <Scroll onScroll={onScroll}>
      <PageHead title={words.relations[relation]} hint={words.relations.hint} />
      {list === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestRelations(relation)} label={words.relations.failed} />
        ) : (
          <Loading />
        )
      ) : list.length > 0 ? (
        <div className="bb-relations">
          {list.map((person) => (
            <button key={person.uid} type="button" className="bb-relation" onClick={() => openUp(person)}>
              <Avatar user={person} />
              <span className="bb-relation-text">
                <b>{person.name}</b>
                {person.sign && <span>{person.sign}</span>}
              </span>
              <ChevronRightGlyph />
            </button>
          ))}
          <div className="bb-feed-foot">
            {asking.waiting ? (
              <>
                <span className="bb-spinner" aria-hidden />
                {words.loading}
              </>
            ) : !more ? (
              <span className="bb-feed-end">{words.relations.noMore}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <Empty title={words.relations.empty} hint={words.relations.emptyHint} />
      )}
    </Scroll>
  )
}

// --- Settings ------------------------------------------------------------------------------------------------

/** 设置: the app's own appearance (its theme, not the cab's), its version, and the way out of the account. */
function SettingsPage() {
  const words = useBilibiliWords()
  const theme = useTheme((state) => state.theme)
  const choose = useTheme((state) => state.set)
  const signedIn = useBilibili((state) => state.signedIn)
  return (
    <Scroll>
      <PageHead title={words.settings.title} hint={words.settings.hint} />
      <div className="bb-section-head bb-settings-appearance">
        <h3>{words.settings.appearance}</h3>
        <span className="bb-settings-current">{words.settings.current(words.settings.themes[theme])}</span>
      </div>
      <div className="bb-theme-options" role="radiogroup" aria-label={words.settings.appearance}>
        {THEMES.map((each) => (
          <button
            key={each}
            type="button"
            className={each === theme ? 'bb-theme-option on' : 'bb-theme-option'}
            role="radio"
            aria-checked={each === theme}
            onClick={() => choose(each)}
          >
            <span className="bb-theme-swatch" data-swatch={each} aria-hidden />
            <span className="bb-theme-text">
              <b>{words.settings.themes[each]}</b>
              <span>{words.settings.themeHints[each]}</span>
            </span>
            {each === theme && <span className="bb-theme-check" aria-hidden />}
          </button>
        ))}
      </div>

      <SectionHead title={words.settings.about} />
      <p className="bb-about bb-settings-version">{words.aboutApp}</p>
      {signedIn === true && (
        <>
          <SectionHead title={words.settings.account} />
          <button type="button" className="bb-ghost quiet bb-settings-signout" onClick={signOut}>
            {words.account.signOut}
          </button>
        </>
      )}
    </Scroll>
  )
}

// --- Search --------------------------------------------------------------------------------------------------

/** The search the bar typed: its history (three at most), and Bilibili's three kinds of answer. */
function SearchPage() {
  const words = useBilibiliWords()
  const asked = useBilibili((state) => state.searchAsked)
  const search = useBilibili((state) => state.search)
  const asking = useBilibili((state) => state.searchAsking)
  const tab = useBilibili((state) => state.searchTab)
  const history = useSearchHistory((state) => state.items)
  const clear = useSearchHistory((state) => state.clear)
  const add = useSearchHistory((state) => state.add)

  const ask = (word: string) => {
    add(word)
    searchFor(word)
  }

  if (!asked) {
    return (
      <Scroll>
        <PageHead title={words.search.title} hint={words.search.idleHint} />
        {history.length > 0 ? (
          <>
            <SectionHead title={words.search.history} action={words.search.clear} onAction={clear} />
            <div className="bb-pills">
              {history.map((word) => (
                <button key={word} type="button" className="bb-pill" onClick={() => ask(word)}>
                  {word}
                </button>
              ))}
            </div>
          </>
        ) : (
          <Empty title={words.search.idle} hint={words.search.historyEmpty} />
        )}
      </Scroll>
    )
  }
  const waiting = asking[tab].waiting
  const failed = asking[tab].failed
  return (
    <Scroll>
      <PageHead title={words.search.forQuery(asked)} />
      <div className="bb-pills">
        <Pill
          label={words.search.filters.video}
          count={search.video?.length}
          on={tab === 'video'}
          onClick={() => setSearchTab('video')}
        />
        <Pill
          label={words.search.filters.bangumi}
          count={search.bangumi?.length}
          on={tab === 'bangumi'}
          onClick={() => setSearchTab('bangumi')}
        />
        <Pill
          label={words.search.filters.user}
          count={search.user?.length}
          on={tab === 'user'}
          onClick={() => setSearchTab('user')}
        />
      </div>
      {waiting ? (
        <Loading label={words.search.searching} />
      ) : failed ? (
        <Failed onRetry={() => searchFor(asked, tab)} label={words.search.failed} />
      ) : tab === 'video' ? (
        search.video && search.video.length > 0 ? (
          <VideoGrid videos={search.video} onOpen={openVideo} />
        ) : (
          <Empty title={words.search.empty} hint={words.search.emptyHint} />
        )
      ) : tab === 'bangumi' ? (
        search.bangumi && search.bangumi.length > 0 ? (
          <div className="bb-season-grid">
            {search.bangumi.map((season) => (
              <BangumiCard key={season.seasonId} season={season} onOpen={openSeason} />
            ))}
          </div>
        ) : (
          <Empty title={words.search.empty} hint={words.search.emptyHint} />
        )
      ) : search.user && search.user.length > 0 ? (
        <div className="bb-users">
          {search.user.map((up) => (
            <button key={up.uid} type="button" className="bb-user-row" onClick={() => openUp(up)}>
              <Avatar user={up} />
              <span className="bb-user-text">
                <b>{up.name}</b>
                {up.fans !== undefined && <span>{words.search.fans(up.fans)}</span>}
              </span>
              <ChevronRightGlyph />
            </button>
          ))}
        </div>
      ) : (
        <Empty title={words.search.empty} hint={words.search.emptyHint} />
      )}
    </Scroll>
  )
}

// --- The account's pages -------------------------------------------------------------------------------------

/** 历史记录: what was watched, and how far in. */
function HistoryPage() {
  const words = useBilibiliWords()
  const items = useBilibili((state) => state.history)
  const asking = useBilibili((state) => state.historyAsking)
  useEffect(() => requestHistory(), [])
  return (
    <Scroll>
      <PageHead title={words.history.title} hint={words.history.hint} />
      {items === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestHistory(true)} label={words.history.failed} />
        ) : (
          <Loading />
        )
      ) : items.length > 0 ? (
        <div className="bb-rows">
          {items.map((item) => (
            <HistoryRow key={item.video.id} video={item.video} progress={item.progress} watchedAt={item.watchedAt} />
          ))}
        </div>
      ) : (
        <Empty title={words.history.empty} hint={words.history.emptyHint} />
      )}
    </Scroll>
  )
}

function HistoryRow({ video, progress, watchedAt }: { video: BilibiliVideo; progress?: number; watchedAt?: string }) {
  const words = useBilibiliWords()
  const share = progressShare(progress ?? 0, video.duration)
  return (
    <button type="button" className="bb-row" aria-label={video.title} onClick={() => openVideo(video)}>
      <span className="bb-row-art">
        <Cover cover={video.cover} title={video.title} />
        <LengthBadge seconds={video.duration} />
        {share > 0 && <span className="bb-row-progress" style={{ width: `${Math.round(share * 100)}%` }} />}
      </span>
      <span className="bb-row-text">
        <b>{video.title}</b>
        <span>{video.up.name}</span>
        <span className="bb-row-meta">
          {watchedAt && <span>{words.history.watchedAt(watchedAt)}</span>}
          {progress !== undefined && share > 0 && <span>{words.history.watchedTo(formatClock(progress))}</span>}
        </span>
      </span>
      <span className="bb-row-go" aria-hidden>
        <ChevronRightGlyph />
      </span>
    </button>
  )
}

/** 收藏夹: the account's folders, and the videos in the one picked. */
function FavoritesPage() {
  const words = useBilibiliWords()
  const favorites = useBilibili((state) => state.favorites)
  const asking = useBilibili((state) => state.favoritesAsking)
  const folderId = useBilibili((state) => state.folderId)
  const folderTitle = useBilibili((state) => state.folderTitle)
  const items = useBilibili((state) => state.folderItems)
  const folderAsking = useBilibili((state) => state.folderAsking)
  useEffect(() => requestFavorites(), [])
  return (
    <Scroll>
      <PageHead title={words.favorites.title} hint={words.favorites.hint} />
      {favorites === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestFavorites(true)} label={words.favorites.failed} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <SectionHead title={words.favorites.folders} />
          {favorites.length > 0 ? (
            <div className="bb-folders">
              {favorites.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={folder.id === folderId ? 'bb-folder on' : 'bb-folder'}
                  onClick={() => requestFavoriteItems(folder.id)}
                >
                  <span className="bb-folder-mark">
                    <StarGlyph on={folder.id === folderId} />
                  </span>
                  <span className="bb-folder-text">
                    <b>{folder.title}</b>
                    <span>{words.favorites.count(folder.count)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty title={words.favorites.empty} hint={words.favorites.emptyHint} />
          )}
          <SectionHead title={folderTitle || words.favorites.videos} />
          {folderAsking.waiting ? (
            <Loading />
          ) : folderAsking.failed ? (
            <Failed onRetry={() => requestFavoriteItems(folderId, true)} label={words.favorites.failed} />
          ) : items && items.length > 0 ? (
            <VideoGrid videos={items} onOpen={openVideo} />
          ) : (
            <Empty title={words.favorites.folderEmpty} hint={words.favorites.emptyHint} />
          )}
        </>
      )}
    </Scroll>
  )
}

/** 关注动态: the creators the account follows, newest first. */
function DynamicPage() {
  const words = useBilibiliWords()
  const items = useBilibili((state) => state.dynamic)
  const asking = useBilibili((state) => state.dynamicAsking)
  useEffect(() => requestDynamic(), [])
  return (
    <Scroll>
      <PageHead title={words.dynamic.title} hint={words.dynamic.hint} />
      {items === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestDynamic(true)} label={words.dynamic.failed} />
        ) : (
          <Loading />
        )
      ) : items.length > 0 ? (
        <div className="bb-dynamics">
          {items.map((item) => (
            <article key={item.id} className="bb-dynamic">
              <button type="button" className="bb-dynamic-user" onClick={() => openUp(item.user)}>
                <Avatar user={item.user} size="small" />
                <b>{item.user.name}</b>
              </button>
              {item.text && <p className="bb-dynamic-text">{item.text}</p>}
              {item.video ? (
                <button
                  type="button"
                  className="bb-dynamic-video"
                  onClick={() => openVideo(item.video as BilibiliVideo)}
                >
                  <Cover cover={item.video.cover} title={item.video.title} />
                  <span>
                    <b>{item.video.title}</b>
                    <span>{item.video.up.name || item.user.name}</span>
                  </span>
                  <PlayGlyph />
                </button>
              ) : (
                item.cover && <Cover cover={item.cover} title={item.text} wide className="bb-dynamic-art" />
              )}
              {item.at && <span className="bb-dynamic-at">{item.at}</span>}
            </article>
          ))}
        </div>
      ) : (
        <Empty title={words.dynamic.empty} hint={words.dynamic.emptyHint} />
      )}
    </Scroll>
  )
}

/** A UP主's page: their picture, who they are, and their videos. */
function SpacePage({ uid }: { uid: string }) {
  const words = useBilibiliWords()
  const space = useBilibili((state) => (state.space?.user.uid === uid ? state.space : null))
  const asking = useBilibili((state) => state.spaceAsking)
  useEffect(() => requestSpace(uid), [uid])
  return (
    <Scroll>
      {space === null ? (
        asking.failed ? (
          <Failed onRetry={() => requestSpace(uid, true)} label={words.space.failed} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <div className="bb-space-head">
            <div className="bb-space-about">
              <Avatar user={space.user} size="large" />
              <div className="bb-space-text">
                <h2>{space.user.name}</h2>
                {space.sign && <p>{space.sign}</p>}
                <div className="bb-space-facts">
                  {space.level !== undefined && <span>Lv.{space.level}</span>}
                  {space.fans !== undefined && <span>{words.space.fans(space.fans)}</span>}
                  {space.following !== undefined && <span>{words.space.following(space.following)}</span>}
                </div>
              </div>
            </div>
          </div>
          <SectionHead title={words.space.videos} />
          {space.videos.length > 0 ? (
            <VideoGrid videos={space.videos} onOpen={openVideo} />
          ) : (
            <Empty title={words.space.empty} hint={words.space.emptyHint} />
          )}
        </>
      )}
    </Scroll>
  )
}
