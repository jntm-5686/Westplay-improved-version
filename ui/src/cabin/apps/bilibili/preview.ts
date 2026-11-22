import type {
  BilibiliAppState,
  BilibiliBangumi,
  BilibiliCommand,
  BilibiliLiveRoom,
  BilibiliMessage,
  BilibiliUp,
  BilibiliVideo,
} from './bilibili'

/**
 * DEVELOPMENT PREVIEW: the invented Bilibili a plain browser gets (`npm run dev`, no host), so the app's whole screen
 * can be looked at without the host and Bilibili's page running. Nothing here is real Bilibili content, nobody here is
 * a real account, and the covers are the app's own gradients (the preview has no pictures). Inside WestPlay this file
 * is never read: there `bilibili.ts` talks to the host's page.
 *
 * Its answers are the host's own messages (`notes/bilibili-v1-host.md`), so the app takes one path whether it's the
 * host or this: a list is `{kind:'home', items:[…]}`, what plays is `{kind:'state', state:{…}}`.
 */

interface Preview {
  /** The app as it opens in a browser: nothing yet (its pages ask for their lists at once). */
  initial(): Partial<BilibiliAppState>
  /** Answers a command as the host's page would: the messages that come back, in Bilibili's own order. */
  apply(command: BilibiliCommand): BilibiliMessage[]
}

const OWNERS = {
  night: { mid: 1001, name: '夜航研究所', avatar: null, fans: 128_000 },
  slow: { mid: 1002, name: '慢半拍工作室', avatar: null, fans: 46_000 },
  rain: { mid: 1003, name: '雨棚放映室', avatar: null, fans: 89_000 },
  gear: { mid: 1004, name: '齿轮与咖啡', avatar: null, fans: 210_000 },
  star: { mid: 1005, name: '星图邮差', avatar: null, fans: 31_000 },
}

const USER = {
  mid: 9001,
  uid: 9001,
  name: '预览用户',
  avatar: null,
  vip: '年度大会员',
  sign: '浏览器里的演示账号',
  fans: 42,
  follower: 42,
  following: 128,
}

/** The invented videos, as the host's `kind:"video"` items write them. */
const VIDEOS = [
  {
    bvid: 'BV1preview001',
    aid: 900001,
    cid: 1,
    title: '把车停在海边，等一场没有预告的日落',
    cover: null,
    duration: 726,
    owner: OWNERS.night,
    views: 1_842_000,
    likes: 12_000,
    pubdate: 1_765_000_000,
  },
  {
    bvid: 'BV1preview002',
    aid: 900002,
    cid: 2,
    title: '在凌晨四点的服务区，煮一壶热茶',
    cover: null,
    duration: 412,
    owner: OWNERS.slow,
    views: 386_000,
    likes: 3_100,
    pubdate: 1_765_100_000,
  },
  {
    bvid: 'BV1preview003',
    aid: 900003,
    cid: 3,
    title: '盘山公路第一视角：雾散开的那一刻',
    cover: null,
    duration: 1_034,
    owner: OWNERS.rain,
    views: 2_410_000,
    likes: 31_800,
    pubdate: 1_765_200_000,
  },
  {
    bvid: 'BV1preview004',
    aid: 900004,
    cid: 4,
    title: '旧卡车电台修复记：让三十年前的声音重新响起来',
    cover: null,
    duration: 1_562,
    owner: OWNERS.gear,
    views: 954_000,
    likes: 8_700,
    pubdate: 1_765_300_000,
  },
  {
    bvid: 'BV1preview005',
    aid: 900005,
    cid: 5,
    title: '在城市高架下记录一整晚的灯光',
    cover: null,
    duration: 583,
    owner: OWNERS.star,
    views: 142_000,
    likes: 980,
    pubdate: 1_765_400_000,
  },
  {
    bvid: 'BV1preview006',
    aid: 900006,
    cid: 6,
    title: '雨天车窗电影感短片：把雨刷的节拍剪进去',
    cover: null,
    duration: 318,
    owner: OWNERS.slow,
    views: 721_000,
    likes: 6_400,
    pubdate: 1_765_500_000,
  },
  {
    bvid: 'BV1preview007',
    aid: 900007,
    cid: 7,
    title: '夜班司机的深夜歌单：十首适合长途的器乐',
    cover: null,
    duration: 1_208,
    owner: OWNERS.night,
    views: 512_000,
    likes: 4_100,
    pubdate: 1_765_600_000,
  },
  {
    bvid: 'BV1preview008',
    aid: 900008,
    cid: 8,
    title: '把露营灯挂在车尾，然后在旷野里睡一觉',
    cover: null,
    duration: 664,
    owner: OWNERS.rain,
    views: 268_000,
    likes: 1_880,
    pubdate: 1_765_700_000,
  },
  {
    bvid: 'BV1preview009',
    aid: 900009,
    cid: 9,
    title: '老相机拍公路：一卷胶片的三十六个瞬间',
    cover: null,
    duration: 892,
    owner: OWNERS.star,
    views: 96_000,
    likes: 620,
    pubdate: 1_765_800_000,
  },
  {
    bvid: 'BV1preview010',
    aid: 900010,
    cid: 10,
    title: '给卡车驾驶室做一次彻底的收纳改造',
    cover: null,
    duration: 1_344,
    owner: OWNERS.gear,
    views: 633_000,
    likes: 5_700,
    pubdate: 1_765_900_000,
  },
  {
    bvid: 'BV1preview011',
    aid: 900011,
    cid: 11,
    title: '穿越云层的高原公路，海拔四千米的清晨',
    cover: null,
    duration: 947,
    owner: OWNERS.rain,
    views: 3_120_000,
    likes: 42_600,
    pubdate: 1_766_000_000,
  },
  {
    bvid: 'BV1preview012',
    aid: 900012,
    cid: 12,
    title: '深夜电台：读一些关于出发的来信',
    cover: null,
    duration: 1_866,
    owner: OWNERS.night,
    views: 1_120_000,
    likes: 9_300,
    pubdate: 1_766_100_000,
  },
  {
    bvid: 'BV1preview013',
    aid: 900013,
    cid: 13,
    title: '在港口看集装箱船入港，一镜到底',
    cover: null,
    duration: 508,
    owner: OWNERS.star,
    views: 77_000,
    likes: 430,
    pubdate: 1_766_200_000,
  },
  {
    bvid: 'BV1preview014',
    aid: 900014,
    cid: 14,
    title: '把副驾改成观景台，然后一路向西',
    cover: null,
    duration: 1_422,
    owner: OWNERS.slow,
    views: 455_000,
    likes: 3_200,
    pubdate: 1_766_300_000,
  },
  {
    bvid: 'BV1preview015',
    aid: 900015,
    cid: 15,
    title: '柴油发动机冷启动的声音，收录成 ASMR',
    cover: null,
    duration: 612,
    owner: OWNERS.gear,
    views: 1_682_000,
    likes: 14_900,
    pubdate: 1_766_400_000,
  },
  {
    bvid: 'BV1preview016',
    aid: 900016,
    cid: 16,
    title: '沿着旧铁路线开一百公里，寻找废弃小站',
    cover: null,
    duration: 1_754,
    owner: OWNERS.rain,
    views: 1_004_000,
    likes: 7_700,
    pubdate: 1_766_500_000,
  },
].map((video) => ({ kind: 'video', ...video }))

const VID = new Map(VIDEOS.map((video) => [video.bvid, video]))

const EPISODE_POOL = [
  { epId: 501, title: '出发之前', duration: 1_440, badge: '' },
  { epId: 502, title: '在路上', duration: 1_440, badge: '会员' },
  { epId: 503, title: '第一次露营', duration: 1_440, badge: '' },
  { epId: 504, title: '雨夜', duration: 1_440, badge: '会员' },
  { epId: 505, title: '雾中隧道', duration: 1_440, badge: '会员' },
  { epId: 506, title: '海边的信号', duration: 1_440, badge: '' },
  { epId: 507, title: '补给站', duration: 1_440, badge: '会员' },
  { epId: 508, title: '旧地图', duration: 1_440, badge: '' },
  { epId: 509, title: '夜班电台', duration: 1_440, badge: '会员' },
  { epId: 510, title: '回程', duration: 1_440, badge: '会员' },
  { epId: 511, title: '雪线', duration: 1_440, badge: '会员' },
  { epId: 512, title: '终点之后', duration: 1_440, badge: '会员' },
]

interface PreviewSeason {
  seasonId: string
  title: string
  cover: null
  evaluate: string
  score: string
  badge: string
  seasonType: number
  indexShow: string
  episodes: { epId: number; title: string; duration: number; cover?: null; badge?: string }[]
}

const SEASONS: PreviewSeason[] = [
  {
    seasonId: '47836',
    title: '星海邮差',
    cover: null,
    evaluate: '在一座永远亮着灯的城市里，一位骑摩托的邮差替人们递送那些没能说出口的话。',
    score: '9.4',
    badge: '大会员',
    seasonType: 1,
    indexShow: '更新至第 12 话',
    episodes: EPISODE_POOL.slice(0, 12),
  },
  {
    seasonId: '47837',
    title: '午后补给站',
    cover: null,
    evaluate: '公路边的一间小咖啡馆，每天迎来不同的旅人，也留下他们的故事。',
    score: '8.9',
    badge: '',
    seasonType: 1,
    indexShow: '更新至第 7 话',
    episodes: EPISODE_POOL.slice(0, 7),
  },
  {
    seasonId: '47838',
    title: '雾中的信号塔',
    cover: null,
    evaluate: '山里的信号塔与山下的村庄，一个关于声音与等待的故事。',
    score: '9.1',
    badge: '',
    seasonType: 4,
    indexShow: '更新至第 4 话',
    episodes: EPISODE_POOL.slice(0, 4),
  },
  {
    seasonId: '47839',
    title: '环城夜骑',
    cover: null,
    evaluate: '五个年轻人用一辆旧面包车环游城市边缘，寻找传说中不存在的第 24 个出口。',
    score: '9.6',
    badge: '大会员',
    seasonType: 1,
    indexShow: '全 24 话',
    episodes: EPISODE_POOL,
  },
  {
    seasonId: '70001',
    title: '一路向北',
    cover: null,
    evaluate: '一部关于长途卡车司机的公路纪录片：从南方的港口一直开到北方的雪原。',
    score: '9.2',
    badge: '大会员',
    seasonType: 2,
    indexShow: '正片',
    episodes: [{ epId: 601, title: '正片', duration: 6_180, cover: null }],
  },
  {
    seasonId: '70002',
    title: '夜航',
    cover: null,
    evaluate: '深夜的机场、值班的塔台与一条总是延误的航线，一部安静的剧情片。',
    score: '8.7',
    badge: '',
    seasonType: 2,
    indexShow: '正片',
    episodes: [{ epId: 701, title: '正片', duration: 5_760, cover: null }],
  },
]

const SEASON_ITEMS = SEASONS.map((season) => ({
  kind: 'media',
  seasonId: season.seasonId,
  mediaId: 0,
  epId: season.episodes[0]?.epId ?? 0,
  title: season.title,
  cover: null,
  score: season.score,
  indexShow: season.indexShow,
  badge: season.badge,
  seasonType: season.seasonType,
  url: '',
}))

const ROOMS = [
  {
    roomId: '9101',
    shortId: 9101,
    uid: 1001,
    title: '深夜电台：点一首歌再上路',
    cover: null,
    uname: '夜航研究所',
    face: null,
    area: '电台',
    online: 21_400,
    live: true,
  },
  {
    roomId: '9102',
    shortId: 9102,
    uid: 1002,
    title: '在服务区煮咖啡，顺便聊聊天',
    cover: null,
    uname: '慢半拍工作室',
    face: null,
    area: '生活',
    online: 6_800,
    live: true,
  },
  {
    roomId: '9103',
    shortId: 9103,
    uid: 1004,
    title: '模拟驾驶：今晚跑一段山路',
    cover: null,
    uname: '齿轮与咖啡',
    face: null,
    area: '单机游戏',
    online: 12_600,
    live: true,
  },
  {
    roomId: '9104',
    shortId: 9104,
    uid: 1003,
    title: '雨天窗外的城市，陪你看一会儿',
    cover: null,
    uname: '雨棚放映室',
    face: null,
    area: '生活',
    online: 3_100,
    live: false,
  },
].map((room) => ({ kind: 'live', ...room }))

const HISTORY = VIDEOS.slice(0, 6).map((video, index) => ({
  bvid: video.bvid,
  aid: video.aid,
  title: video.title,
  cover: null,
  owner: video.owner,
  duration: video.duration,
  progress: Math.round(video.duration * (0.2 + index * 0.1)),
  viewedAt: 1_766_500_000 - index * 86_400,
  live: false,
}))

const FOLDERS = [
  { id: 301, title: '公路与远方', count: 5, favState: 0 },
  { id: 302, title: '适合夜班', count: 4, favState: 0 },
  { id: 303, title: '以后要看', count: 7, favState: 0 },
]

const FOLDER_ITEMS = VIDEOS.slice(2, 9)

const DYNAMIC = [
  { ...VIDEOS[11], dynamicId: 'dyn-preview-1', said: '新一期深夜电台已经上传，路上注意休息。', pubdate: 1_766_500_000 },
  {
    ...VIDEOS[2],
    dynamicId: 'dyn-preview-2',
    said: '这次在雨里等了四个小时，终于拍到了想拍的那条路。',
    pubdate: 1_766_400_000,
  },
  { ...VIDEOS[3], dynamicId: 'dyn-preview-3', said: '旧卡车电台修复完成，声音比想象中好。', pubdate: 1_766_300_000 },
  {
    ...VIDEOS[1],
    dynamicId: 'dyn-preview-4',
    said: '在服务区遇到一位开了三十年车的前辈，聊了很久。',
    pubdate: 1_766_200_000,
  },
]

const SPACE = {
  mid: 1001,
  name: '夜航研究所',
  avatar: null,
  sign: '记录夜里还在路上的声音。',
  level: 6,
  fans: 128_000,
  videos: 36,
  items: VIDEOS.filter((video) => video.owner.mid === 1001),
  hasMore: false,
}

const SEARCH_USERS = Object.values(OWNERS)

/** 我的粉丝 and 我关注的人, as the preview's account has them (signatures included). */
const FOLLOWERS = [
  { mid: 2001, name: '副驾上的猫', avatar: null, sign: '喜欢在服务区晒太阳。' },
  { mid: 2002, name: '旧地图收藏家', avatar: null, sign: '每条路都值得走一遍。' },
  { mid: 2003, name: '夜班加油站', avatar: null, sign: '' },
  { mid: 2004, name: '沿海公路电台', avatar: null, sign: '点歌请留言。' },
  { mid: 2005, name: '雨天车窗', avatar: null, sign: '' },
]

const FOLLOWING = [
  { mid: 1001, name: '夜航研究所', avatar: null, sign: '记录夜里还在路上的声音。' },
  { mid: 1002, name: '慢半拍工作室', avatar: null, sign: '慢慢来，比较快。' },
  { mid: 1003, name: '雨棚放映室', avatar: null, sign: '' },
  { mid: 1004, name: '齿轮与咖啡', avatar: null, sign: '修旧东西的人。' },
]

/** The preview's invented data, as the app keeps it (what `initial` fills the store with: a browser's first frame
 * has content, not a screen of spinners). The host's own messages fill it the same way when they come. */
function upOf(owner: { mid: number; name: string; avatar: null; fans?: number }): BilibiliUp {
  return {
    uid: String(owner.mid),
    name: owner.name,
    avatar: owner.avatar,
    ...(owner.fans !== undefined ? { fans: owner.fans } : {}),
  }
}

function videoOf(item: {
  bvid: string
  aid: number
  cid: number
  title: string
  cover: null
  duration: number
  owner: { mid: number; name: string; avatar: null; fans?: number }
  views: number
  likes?: number
}): BilibiliVideo {
  return {
    id: item.bvid,
    title: item.title,
    cover: item.cover,
    duration: item.duration,
    up: upOf(item.owner),
    views: item.views,
    likes: item.likes,
    aid: item.aid,
    cid: item.cid,
  }
}

function seasonOf(item: (typeof SEASON_ITEMS)[number]): BilibiliBangumi {
  const detail = SEASONS.find((season) => season.seasonId === String(item.seasonId))
  const rating = Number.parseFloat(item.score)
  return {
    seasonId: String(item.seasonId),
    title: item.title,
    cover: item.cover,
    kind: item.seasonType === 1 || item.seasonType === 4 ? 'anime' : 'cinema',
    description: detail?.evaluate ?? '',
    ...(item.indexShow ? { progress: item.indexShow } : {}),
    ...(Number.isFinite(rating) ? { rating } : {}),
    ...(item.badge ? { badge: item.badge } : {}),
    ...(item.epId ? { firstEpisodeId: String(item.epId) } : {}),
    episodes: (detail?.episodes ?? []).map((episode, index) => ({
      id: String(episode.epId),
      title: `第 ${index + 1} 话`,
      duration: episode.duration,
      index: index + 1,
    })),
  }
}

/** A season's own page, as `initial` fills the store with it. */
function seasonDetailOf(season: PreviewSeason): BilibiliBangumi {
  const rating = Number.parseFloat(season.score)
  return {
    seasonId: season.seasonId,
    title: season.title,
    cover: null,
    kind: season.seasonType === 1 || season.seasonType === 4 ? 'anime' : 'cinema',
    description: season.evaluate,
    progress: season.indexShow,
    ...(Number.isFinite(rating) ? { rating } : {}),
    ...(season.badge ? { badge: season.badge } : {}),
    ...(season.episodes[0] ? { firstEpisodeId: String(season.episodes[0].epId) } : {}),
    episodes: season.episodes.map((episode, index) => ({
      id: String(episode.epId),
      title: episode.title,
      duration: episode.duration,
      index: index + 1,
      ...(episode.badge ? { badge: episode.badge } : {}),
    })),
  }
}

/** A live room, as `initial` fills the store with it. */
function roomOf(room: (typeof ROOMS)[number]): BilibiliLiveRoom {
  return {
    roomId: String(room.roomId),
    title: room.title,
    cover: room.cover,
    uname: room.uname,
    avatar: room.face,
    online: room.online,
    area: room.area,
    live: room.live,
  }
}

/** A stream's own head as `state.media` writes it. */
function mediaOf(video: {
  kind: string
  bvid: string
  aid: number
  cid: number
  title: string
  owner: unknown
  cover: null
  duration: number
}) {
  return {
    kind: 'video',
    bvid: video.bvid,
    aid: video.aid,
    cid: video.cid,
    epId: 0,
    seasonId: 0,
    roomId: 0,
    title: video.title,
    owner: video.owner,
    cover: video.cover,
    live: false,
    page: 1,
    pages: 1,
  }
}

/** The preview's player, driven by the commands the app sends, and the account it starts signed out of. */
export function createPreview(): Preview {
  let signedIn = false
  let signingIn = false
  let user: typeof USER | null = null
  let playing = false
  let time = 0
  let duration = 0
  let volume = 0.7
  let rate = 1
  let aspect = 16 / 9
  let media: ReturnType<typeof mediaOf> | null = null
  let liked = false
  let coins = 0
  let favorited = false

  const stateMessage = (): BilibiliMessage => ({
    type: 'bilibili',
    kind: 'state',
    state: {
      signedIn,
      signingIn,
      playing,
      volume,
      rate,
      time,
      duration,
      media,
      aspect,
      captions: [],
      caption: null,
      cabLevel: null,
    },
  })

  const accountMessage = (): BilibiliMessage => ({
    type: 'bilibili',
    kind: 'account',
    account: { signedIn, signingIn, ...(user ?? {}) },
  })

  const play = (value: string, playKind: 'video' | 'bangumi' | 'live'): BilibiliMessage[] => {
    playing = true
    time = 0
    liked = false
    coins = 0
    favorited = false
    if (playKind === 'live') {
      const room = ROOMS.find((one) => one.roomId === value)
      if (!room) return []
      duration = 0
      media = {
        kind: 'live',
        bvid: '',
        aid: 0,
        cid: 0,
        epId: 0,
        seasonId: 0,
        roomId: Number(room.roomId),
        title: room.title,
        owner: { mid: room.uid, name: room.uname, avatar: null },
        cover: null,
        live: true,
        page: 1,
        pages: 1,
      }
      return [stateMessage()]
    }
    if (playKind === 'bangumi') {
      const season = SEASONS.find(
        (one) => one.episodes.some((episode) => String(episode.epId) === value) || one.seasonId === value,
      )
      const episode = season?.episodes.find((one) => String(one.epId) === value) ?? season?.episodes[0]
      if (!season || !episode) return []
      duration = episode.duration
      media = {
        kind: 'bangumi',
        bvid: '',
        aid: 0,
        cid: 0,
        epId: episode.epId,
        seasonId: Number(season.seasonId),
        roomId: 0,
        title: `${season.title} ${episode.title}`,
        owner: null,
        cover: null,
        live: false,
        page: 1,
        pages: season.episodes.length,
      }
      return [
        {
          type: 'bilibili',
          kind: 'season',
          seasonId: Number(season.seasonId),
          title: season.title,
          cover: null,
          evaluate: season.evaluate,
          score: season.score,
          badge: season.badge,
          episodes: season.episodes.map((episode, index) => ({
            epId: episode.epId,
            title: episode.title,
            duration: episode.duration,
            cover: null,
            badge: episode.badge ?? '',
            index: index + 1,
          })),
        },
        stateMessage(),
      ]
    }
    const video = VID.get(value)
    if (!video) return []
    duration = video.duration
    media = mediaOf(video)
    return [stateMessage()]
  }

  return {
    initial(): Partial<BilibiliAppState> {
      const homeVideos = VIDEOS.slice(0, 12).map(videoOf)
      const anime = SEASON_ITEMS.filter((item) => item.seasonType === 1 || item.seasonType === 4).map(seasonOf)
      const cinema = SEASON_ITEMS.filter(
        (item) => item.seasonType === 2 || item.seasonType === 3 || item.seasonType === 5,
      ).map(seasonOf)
      const liveRooms = ROOMS.map(roomOf)
      return {
        ready: true,
        signedIn: false,
        signingIn: false,
        user: null,
        home: homeVideos,
        // Home's feed carries the 番剧/影视 cards among its videos: the banner's candidates.
        homeSeasons: SEASON_ITEMS.slice(0, 3).map(seasonOf),
        homeAsking: { waiting: false, failed: false },
        homePage: 1,
        homeMore: true,
        homeMoreAsking: { waiting: false, failed: false },
        hot: VIDEOS.slice(4).map(videoOf),
        hotAsking: { waiting: false, failed: false },
        anime,
        cinema,
        bangumiAsking: { anime: { waiting: false, failed: false }, cinema: { waiting: false, failed: false } },
        liveRooms,
        liveAsking: { waiting: false, failed: false },
        seasonDetails: Object.fromEntries(SEASONS.map((season) => [season.seasonId, seasonDetailOf(season)])),
        seasonAsking: {},
        videoDetails: {},
        videoDetailAsking: {},
        history: HISTORY.map((item) => ({
          video: videoOf(VIDEOS.find((video) => video.bvid === item.bvid) ?? VIDEOS[0]),
          progress: item.progress,
        })),
        historyAsking: { waiting: false, failed: false },
        favorites: FOLDERS.map((folder) => ({ id: String(folder.id), title: folder.title, count: folder.count })),
        favoritesAsking: { waiting: false, failed: false },
        folderId: '301',
        folderTitle: '公路与远方',
        folderItems: FOLDER_ITEMS.map(videoOf),
        folderAsking: { waiting: false, failed: false },
        dynamic: DYNAMIC.map((item) => ({
          id: item.dynamicId,
          user: upOf(item.owner),
          text: item.said,
          video: videoOf(item),
          at: '',
        })),
        dynamicAsking: { waiting: false, failed: false },
        space: {
          user: upOf(OWNERS.night),
          sign: SPACE.sign,
          level: SPACE.level,
          fans: SPACE.fans,
          videos: SPACE.items.map(videoOf),
        },
        spaceAsking: { waiting: false, failed: false },
        spaceAsked: String(SPACE.mid),
        relations: { followers: null, following: null },
        relationsPage: { followers: 1, following: 1 },
        relationsMore: { followers: false, following: false },
        relationsAsking: {
          followers: { waiting: false, failed: false },
          following: { waiting: false, failed: false },
        },
        now: (() => {
          const first = videoOf(VIDEOS[0])
          return {
            id: first.id,
            kind: 'video' as const,
            title: first.title,
            cover: first.cover,
            up: first.up,
            views: first.views,
            duration: first.duration,
            live: false,
          }
        })(),
        playing: false,
        progress: 42,
        progressAt: performance.now(),
        duration: VIDEOS[0].duration,
        volume: 0.65,
        aspect,
      }
    },
    apply(command: BilibiliCommand): BilibiliMessage[] {
      switch (command.action) {
        case 'start':
          return [{ type: 'bilibili', kind: 'state', state: null }, accountMessage()]
        case 'signIn':
          signingIn = true
          signedIn = true
          signingIn = false
          user = USER
          return [accountMessage(), stateMessage(), { type: 'bilibili', kind: 'signIn', open: false }]
        case 'signOut':
          signedIn = false
          user = null
          return [accountMessage(), stateMessage()]
        case 'home': {
          const page = Math.max(1, command.page ?? 1)
          const seasons = SEASON_ITEMS.slice(0, 3)
          const items =
            page === 1
              ? [
                  ...VIDEOS.slice(0, 3),
                  seasons[0],
                  ...VIDEOS.slice(3, 7),
                  seasons[1],
                  ...VIDEOS.slice(7, 11),
                  seasons[2],
                  ...VIDEOS.slice(11, 12),
                ]
              : VIDEOS.slice(12)
          return [
            {
              type: 'bilibili',
              kind: 'home',
              items,
              page,
              more: page < 2,
            },
          ]
        }
        case 'popular':
          return [{ type: 'bilibili', kind: 'popular', items: VIDEOS.slice(4) }]
        case 'ranking':
          return [{ type: 'bilibili', kind: 'ranking', rid: 0, note: '演示排行榜', items: VIDEOS.slice(2, 10) }]
        case 'live':
          return [{ type: 'bilibili', kind: 'live', items: ROOMS }]
        case 'bangumi': {
          const type = command.seasonType
          return [
            {
              type: 'bilibili',
              kind: 'bangumi',
              seasonType: type,
              page: 1,
              total: SEASON_ITEMS.length,
              items: SEASON_ITEMS.filter((item) =>
                type === 1 || type === 4 ? item.seasonType === 1 || item.seasonType === 4 : item.seasonType === type,
              ),
            },
          ]
        }
        case 'season': {
          const value = Number(command.value)
          const season = SEASONS.find((one) => one.seasonId === command.value || Number(one.seasonId) === value)
          if (!season)
            return [{ type: 'bilibili', kind: 'failed', action: 'season', code: 404, message: '没有找到这个番剧' }]
          return [
            {
              type: 'bilibili',
              kind: 'season',
              seasonId: Number(season.seasonId),
              title: season.title,
              cover: null,
              evaluate: season.evaluate,
              score: season.score,
              badge: season.badge,
              episodes: season.episodes.map((episode, index) => ({
                epId: episode.epId,
                title: episode.title,
                duration: episode.duration,
                cover: null,
                badge: episode.badge ?? '',
                index: index + 1,
              })),
            },
          ]
        }
        case 'search': {
          const said = command.value.toLocaleLowerCase()
          const matches = (value: string) => value.toLocaleLowerCase().includes(said)
          if (command.kind === 'user') {
            return [
              {
                type: 'bilibili',
                kind: 'search',
                query: command.value,
                searchKind: 'user',
                page: 1,
                total: 0,
                items: [],
                users: SEARCH_USERS.filter((up) => matches(up.name)),
              },
            ]
          }
          if (command.kind === 'bangumi' || command.kind === 'movie') {
            return [
              {
                type: 'bilibili',
                kind: 'search',
                query: command.value,
                searchKind: command.kind,
                page: 1,
                total: 0,
                items: SEASON_ITEMS.filter((item) => matches(item.title)),
                users: [],
              },
            ]
          }
          return [
            {
              type: 'bilibili',
              kind: 'search',
              query: command.value,
              searchKind: 'video',
              page: 1,
              total: 0,
              items: VIDEOS.filter((video) => matches(video.title) || matches(video.owner.name)),
              users: SEARCH_USERS.filter((up) => matches(up.name)),
            },
          ]
        }
        case 'history':
          return [{ type: 'bilibili', kind: 'history', items: HISTORY, max: 20, viewAt: 0 }]
        case 'favorites':
          return [{ type: 'bilibili', kind: 'favorites', folders: FOLDERS }]
        case 'favoriteItems':
          return [
            {
              type: 'bilibili',
              kind: 'favoriteItems',
              mediaId: Number(command.value),
              title: FOLDERS.find((one) => String(one.id) === command.value)?.title ?? '',
              items: FOLDER_ITEMS,
              hasMore: false,
            },
          ]
        case 'dynamic':
          return [{ type: 'bilibili', kind: 'dynamic', items: DYNAMIC, offset: '' }]
        case 'space':
          return [{ type: 'bilibili', kind: 'space', ...SPACE }]
        case 'detail': {
          const video = VID.get(command.value) ?? VIDEOS.find((one) => `av${one.aid}` === command.value)
          if (!video)
            return [{ type: 'bilibili', kind: 'failed', action: 'detail', code: 404, message: '没有找到这个视频' }]
          return [
            {
              type: 'bilibili',
              kind: 'detail',
              bvid: video.bvid,
              aid: video.aid,
              cid: video.cid,
              title: video.title,
              cover: null,
              desc: '浏览器预览里的演示视频。',
              duration: video.duration,
              pubdate: video.pubdate,
              owner: video.owner,
              pages: [{ cid: video.cid, page: 1, title: '正片', duration: video.duration }],
              stat: { views: video.views, likes: video.likes, coins: 0, favorites: 0, danmaku: 0 },
              like: liked,
              coin: coins,
              favorite: favorited,
            },
          ]
        }
        case 'play':
          return play(command.value, command.kind)
        case 'next': {
          // The next video (around the feed's own list), the next episode, or the next live room.
          if (!media) return []
          if (media.kind === 'video') {
            const index = VIDEOS.findIndex((video) => video.bvid === media?.bvid)
            const next = VIDEOS[(index + 1) % VIDEOS.length]
            return play(next.bvid, 'video')
          }
          if (media.kind === 'bangumi') {
            const season = SEASONS.find((one) => one.episodes.some((episode) => episode.epId === media?.epId))
            const index = season ? season.episodes.findIndex((episode) => episode.epId === media?.epId) : -1
            const next = season?.episodes[(index + 1) % season.episodes.length]
            return next ? play(String(next.epId), 'bangumi') : []
          }
          const index = ROOMS.findIndex((room) => room.roomId === String(media?.roomId))
          const next = ROOMS[(index + 1) % ROOMS.length]
          return play(next.roomId, 'live')
        }
        case 'pause':
          playing = false
          return [stateMessage()]
        case 'resume':
          playing = true
          return [stateMessage()]
        case 'seek':
          time = Math.max(0, Math.min(command.value, duration || command.value))
          return [stateMessage()]
        case 'volume':
          volume = Math.max(0, Math.min(1, command.value))
          return [stateMessage()]
        case 'rate':
          rate = command.value
          return [stateMessage()]
        case 'quality':
          return []
        case 'relations': {
          const page = Math.max(1, command.page ?? 1)
          const people = command.kind === 'followers' ? FOLLOWERS : FOLLOWING
          return [
            {
              type: 'bilibili',
              kind: 'relations',
              relationKind: command.kind,
              page,
              items: page === 1 ? people : [],
              more: false,
            },
          ]
        }
        case 'caption':
          return [stateMessage()]
        case 'like':
          liked = command.on
          return [
            {
              type: 'bilibili',
              kind: 'like',
              bvid: command.value,
              on: liked,
              ok: signedIn,
              reason: signedIn ? '' : 'login',
            },
          ]
        case 'coin':
          coins = Math.min(2, coins + command.count)
          return [
            {
              type: 'bilibili',
              kind: 'coin',
              bvid: command.value,
              count: coins,
              ok: signedIn,
              reason: signedIn ? '' : 'login',
            },
          ]
        case 'favorite':
          favorited = command.add
          return [
            {
              type: 'bilibili',
              kind: 'favorite',
              bvid: command.value,
              on: favorited,
              ok: signedIn,
              reason: signedIn ? '' : 'login',
            },
          ]
        case 'show':
          // The browser preview has no hidden page's video: its answer says the picture is showing, so the app's cut
          // and its `showing` handling can be seen (the page's cover stands in for the video itself).
          return [{ type: 'bilibili', kind: 'showing', on: true }]
        case 'crop':
          return []
        case 'hide':
          return [{ type: 'bilibili', kind: 'showing', on: false }]
        case 'close':
          return []
        case 'refresh':
          return [accountMessage(), stateMessage()]
        default:
          return []
      }
    },
  }
}

/** The kind of what plays, for the preview's own tests and the app's. */
export const PREVIEW_KINDS: readonly ('video' | 'bangumi' | 'live')[] = ['video', 'bangumi', 'live']
void PREVIEW_KINDS
