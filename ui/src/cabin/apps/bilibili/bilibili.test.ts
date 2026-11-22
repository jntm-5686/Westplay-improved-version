import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Bilibili app's talk with its host (`notes/bilibili-v1-host.md`): the commands it posts, and how the host's
 * messages fill the app. The host's WebView is stubbed, as the NetEase app's tests stub its own; the browser preview is
 * stubbed too (a window with no `chrome.webview`).
 */

function inHost() {
  const posted: { type: string; kind?: string; command?: { action?: string; [key: string]: unknown } }[] = []
  vi.stubGlobal('window', {
    chrome: {
      webview: {
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: (message: { type: string; kind?: string; command?: { action?: string } }) => posted.push(message),
      },
    },
  })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
  return { posted, commands: () => posted.filter((one) => one.kind === 'command').map((one) => one.command!) }
}

function inBrowser() {
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
}

const VIDEO = {
  kind: 'video',
  bvid: 'BV1test',
  aid: 42,
  cid: 420,
  title: '雨里的天文台',
  cover: 'https://example.invalid/cover.jpg',
  duration: 213,
  owner: { mid: 7, name: '夜航研究所', avatar: null },
  views: 12_000,
  pubdate: 1_766_000_000,
}

const MEDIA = {
  kind: 'media',
  seasonId: 47836,
  mediaId: 0,
  epId: 501,
  title: '星海邮差',
  cover: null,
  score: '9.4',
  indexShow: '更新至第 12 话',
  badge: '大会员',
  seasonType: 1,
  url: '',
}

const LIVE = {
  kind: 'live',
  roomId: 9101,
  title: '深夜电台',
  cover: null,
  uname: '夜航研究所',
  face: null,
  area: '电台',
  online: 21_400,
  live: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.useRealTimers()
})

describe('the commands the app posts', () => {
  it('posts each command as {type:"bilibili", kind:"command", command}', async () => {
    const host = inHost()
    const { bilibili } = await import('./bilibili')
    bilibili({ action: 'home' })
    bilibili({ action: 'search', value: '公路', kind: 'video', page: 1 })
    bilibili({ action: 'history', max: 20, viewAt: 0 })
    bilibili({ action: 'show', x: 10, y: 20, width: 300, height: 200, crop: true })
    expect(host.commands()).toEqual([
      { action: 'home' },
      { action: 'search', value: '公路', kind: 'video', page: 1 },
      { action: 'history', max: 20, viewAt: 0 },
      { action: 'show', x: 10, y: 20, width: 300, height: 200, crop: true },
    ])
  })

  it('plays a video with its kind and asks for its detail', async () => {
    const host = inHost()
    const { playVideo, useBilibili } = await import('./bilibili')
    playVideo({
      id: 'BV1test',
      title: '雨里的天文台',
      cover: null,
      duration: 213,
      up: { uid: '7', name: '夜航研究所', avatar: null },
      views: 12_000,
    })
    expect(host.commands()).toEqual([
      { action: 'play', value: 'BV1test', kind: 'video' },
      { action: 'detail', value: 'BV1test' },
    ])
    const state = useBilibili.getState()
    expect(state.now).toMatchObject({ id: 'BV1test', kind: 'video', title: '雨里的天文台' })
    expect(state.stage).toBe('enter')
    expect(state.playing).toBe(true)
  })

  it('sends the player controls as Bilibili’s own commands', async () => {
    const host = inHost()
    const { receiveMessage, seekTo, setRate, setVolume, togglePlay, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'state',
      state: {
        signedIn: true,
        playing: true,
        time: 10,
        duration: 213,
        media: { kind: 'video', bvid: 'BV1test', title: '雨里的天文台', owner: { mid: 7, name: '夜航研究所' } },
      },
    })
    seekTo(42)
    setVolume(0.4)
    setRate(1.5)
    togglePlay()
    const actions = host.commands().map((one) => one.action)
    expect(actions).toContain('seek')
    expect(actions).toContain('volume')
    expect(actions).toContain('rate')
    expect(actions).toContain('pause')
    expect(useBilibili.getState().rate).toBe(1.5)
    expect(useBilibili.getState().volume).toBe(0.4)
  })

  it('asks for the next video (Now Playing’s next) with its own command', async () => {
    const host = inHost()
    const { nextBilibili } = await import('./bilibili')
    nextBilibili()
    expect(host.commands()).toContainEqual({ action: 'next' })
  })

  it('signs in through the host’s own window, and says it is waiting', async () => {
    const host = inHost()
    const { signIn, useBilibili } = await import('./bilibili')
    signIn()
    expect(host.commands()).toEqual([{ action: 'signIn' }])
    expect(useBilibili.getState().signingIn).toBe(true)
  })
})

describe('the host’s messages', () => {
  beforeEach(() => {
    inHost()
  })

  it('reads what plays, its account and its progress', async () => {
    const { receiveMessage, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'state',
      state: {
        signedIn: true,
        signingIn: false,
        playing: true,
        volume: 0.8,
        rate: 1,
        time: 12.5,
        duration: 213,
        // A portrait video: the player stands it up whole (its width ÷ its height).
        aspect: 0.5625,
        media: {
          kind: 'video',
          bvid: 'BV1test',
          aid: 42,
          title: '雨里的天文台',
          owner: { mid: 7, name: '夜航研究所', avatar: null },
          cover: null,
          live: false,
          page: 1,
          pages: 1,
        },
        captions: [],
        caption: null,
      },
    })
    const state = useBilibili.getState()
    expect(state.ready).toBe(true)
    expect(state.signedIn).toBe(true)
    expect(state.playing).toBe(true)
    expect(state.progress).toBe(12.5)
    expect(state.duration).toBe(213)
    expect(state.aspect).toBe(0.5625)
    expect(state.now).toMatchObject({
      id: 'BV1test',
      kind: 'video',
      title: '雨里的天文台',
      up: { uid: '7', name: '夜航研究所' },
    })
  })

  it('takes a bad or missing aspect as 16:9', async () => {
    const { aspectOf } = await import('./bilibili')
    expect(aspectOf(0.5625)).toBe(0.5625)
    expect(aspectOf(null)).toBeCloseTo(16 / 9)
    expect(aspectOf('nonsense')).toBeCloseTo(16 / 9)
    expect(aspectOf(-1)).toBeCloseTo(16 / 9)
  })

  it('reads the account', async () => {
    const { receiveMessage, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'account',
      account: { signedIn: true, uid: 7, name: '夜航研究所', avatar: 'https://example.invalid/a.png' },
    })
    expect(useBilibili.getState().signedIn).toBe(true)
    expect(useBilibili.getState().user).toMatchObject({ uid: '7', name: '夜航研究所' })
  })

  it('splits the lists into videos, seasons and live rooms by their kind', async () => {
    const { receiveMessage, useBilibili } = await import('./bilibili')
    receiveMessage({ type: 'bilibili', kind: 'home', items: [VIDEO, MEDIA, LIVE] })
    receiveMessage({ type: 'bilibili', kind: 'bangumi', seasonType: 1, items: [MEDIA] })
    receiveMessage({
      type: 'bilibili',
      kind: 'bangumi',
      seasonType: 2,
      items: [{ ...MEDIA, seasonId: 70001, seasonType: 2 }],
    })
    receiveMessage({ type: 'bilibili', kind: 'live', items: [LIVE] })
    const state = useBilibili.getState()
    expect(state.home).toHaveLength(1)
    expect(state.home?.[0]).toMatchObject({ id: 'BV1test', up: { uid: '7' }, views: 12_000 })
    expect(state.anime?.[0]).toMatchObject({
      seasonId: '47836',
      kind: 'anime',
      progress: '更新至第 12 话',
      rating: 9.4,
    })
    expect(state.cinema?.[0]).toMatchObject({ seasonId: '70001', kind: 'cinema' })
    expect(state.liveRooms?.[0]).toMatchObject({ roomId: '9101', uname: '夜航研究所', online: 21_400 })
  })

  it('adds Home’s next page to the feed, and stops when there is no more', async () => {
    const { receiveMessage, requestHomeMore, useBilibili } = await import('./bilibili')
    receiveMessage({ type: 'bilibili', kind: 'home', items: [VIDEO], page: 1, more: true })
    expect(useBilibili.getState().home).toHaveLength(1)
    expect(useBilibili.getState().homeMore).toBe(true)
    requestHomeMore()
    receiveMessage({
      type: 'bilibili',
      kind: 'home',
      items: [{ ...VIDEO, bvid: 'BV1test2', title: '第二页的视频' }],
      page: 2,
      more: false,
    })
    const state = useBilibili.getState()
    expect(state.home?.map((video) => video.id)).toEqual(['BV1test', 'BV1test2'])
    expect(state.homePage).toBe(2)
    expect(state.homeMore).toBe(false)
  })

  it('reads a video’s own page and 我的粉丝 / 我关注的人', async () => {
    const { receiveMessage, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'detail',
      bvid: 'BV1test',
      title: '雨里的天文台',
      cover: null,
      desc: '一段简介。',
      duration: 213,
      owner: { mid: 7, name: '夜航研究所', avatar: null },
      stat: { views: 1200, likes: 34, coins: 12, favorites: 5 },
      like: true,
      coin: 1,
      favorite: false,
    })
    const detail = useBilibili.getState().videoDetails['BV1test']
    expect(detail).toMatchObject({ title: '雨里的天文台', description: '一段简介。', liked: true, coins: 1 })
    expect(detail?.stat).toMatchObject({ views: 1200, likes: 34, coins: 12, favorites: 5 })

    receiveMessage({
      type: 'bilibili',
      kind: 'relations',
      relationKind: 'followers',
      page: 1,
      items: [{ uid: 2001, name: '副驾上的猫', avatar: null, sign: '喜欢晒太阳。' }],
      more: false,
    })
    const relations = useBilibili.getState().relations.followers
    expect(relations?.[0]).toMatchObject({ uid: '2001', name: '副驾上的猫', sign: '喜欢晒太阳。' })
    expect(useBilibili.getState().relationsMore.followers).toBe(false)
  })

  it('keeps Home’s 番剧/影视 cards among its videos (the banner’s candidates)', async () => {
    const { receiveMessage, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'home',
      page: 1,
      items: [
        VIDEO,
        {
          kind: 'media',
          seasonId: 47836,
          title: '星海邮差',
          cover: 'https://example.invalid/season.jpg',
          score: '9.4',
          indexShow: '更新至第 12 话',
          badge: '大会员',
          seasonType: 1,
          epId: 501,
        },
      ],
      more: false,
    })
    const state = useBilibili.getState()
    expect(state.home).toHaveLength(1)
    expect(state.homeSeasons?.[0]).toMatchObject({
      seasonId: '47836',
      title: '星海邮差',
      kind: 'anime',
      badge: '大会员',
    })
  })

  it('reads a season’s page and its episodes', async () => {
    const { receiveMessage, requestSeason, useBilibili } = await import('./bilibili')
    requestSeason('47836')
    receiveMessage({
      type: 'bilibili',
      kind: 'season',
      seasonId: 47836,
      title: '星海邮差',
      cover: null,
      evaluate: '一位骑摩托的邮差。',
      score: '9.4',
      badge: '大会员',
      episodes: [
        { epId: 501, title: '1', long_title: '出发之前', duration: 1_440, cover: null, badge: '会员' },
        { epId: 502, title: '第 2 话', duration: 1_440, cover: null },
      ],
    })
    const season = useBilibili.getState().seasonDetails['47836']
    expect(season).toMatchObject({
      seasonId: '47836',
      title: '星海邮差',
      rating: 9.4,
      description: '一位骑摩托的邮差。',
    })
    expect(season?.episodes).toHaveLength(2)
    expect(season?.episodes[0]).toMatchObject({ index: 1, title: '出发之前', longTitle: '出发之前', badge: '会员' })
    expect(season?.episodes[1]).toMatchObject({ index: 2, title: '第 2 话' })
    expect(season?.episodes[1]?.badge).toBeUndefined()
    expect(useBilibili.getState().seasonAsking['47836']).toEqual({ waiting: false, failed: false })
  })

  it('takes a search’s answer for the words asked, and only those', async () => {
    const { receiveMessage, searchFor, setSearchTab, useBilibili } = await import('./bilibili')
    searchFor('公路')
    receiveMessage({ type: 'bilibili', kind: 'search', query: '公路', searchKind: 'video', items: [VIDEO], users: [] })
    expect(useBilibili.getState().search.video?.[0].id).toBe('BV1test')
    // A stale answer to other words is dropped.
    receiveMessage({ type: 'bilibili', kind: 'search', query: '夜航', searchKind: 'video', items: [] })
    expect(useBilibili.getState().search.video).toHaveLength(1)
    // The UP主 filter asks its own kind.
    setSearchTab('user')
    const state = useBilibili.getState()
    expect(state.searchAsking.user.waiting).toBe(true)
    receiveMessage({
      type: 'bilibili',
      kind: 'search',
      query: '公路',
      searchKind: 'user',
      items: [],
      users: [{ mid: 7, name: '夜航研究所', avatar: null, fans: 128_000 }],
    })
    expect(useBilibili.getState().search.user?.[0]).toMatchObject({ uid: '7', name: '夜航研究所', fans: 128_000 })
  })

  it('marks a like, a coin and a favorite from their receipts', async () => {
    const { receiveMessage, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'state',
      state: { signedIn: true, playing: true, media: { kind: 'video', bvid: 'BV1test', title: '雨里的天文台' } },
    })
    receiveMessage({ type: 'bilibili', kind: 'like', bvid: 'BV1test', on: true, ok: true, reason: '' })
    expect(useBilibili.getState().liked).toBe(true)
    expect(useBilibili.getState().toast).not.toBeNull()
    receiveMessage({ type: 'bilibili', kind: 'coin', bvid: 'BV1test', count: 2, ok: true, reason: '' })
    expect(useBilibili.getState().coins).toBe(2)
    receiveMessage({ type: 'bilibili', kind: 'favorite', bvid: 'BV1test', on: true, ok: true, reason: '' })
    expect(useBilibili.getState().favorited).toBe(true)
    // A refused like leaves the mark as it was.
    receiveMessage({ type: 'bilibili', kind: 'like', bvid: 'BV1test', on: false, ok: false, reason: 'login' })
    expect(useBilibili.getState().liked).toBe(true)
  })

  it('explains a list Bilibili refused with its own reason', async () => {
    const { receiveMessage, requestHistory, useBilibili } = await import('./bilibili')
    requestHistory()
    receiveMessage({ type: 'bilibili', kind: 'failed', action: 'history', code: -101, message: '账号未登录' })
    expect(useBilibili.getState().historyAsking.failed).toBe(true)
    expect(useBilibili.getState().failure).toEqual({ action: 'history', code: -101, message: '账号未登录' })
  })

  it('opens the picture only on the host’s showing, and closes it when the host says it’s gone', async () => {
    inHost()
    const { playVideo, receiveMessage, settlePlayerPage, useBilibili } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'state',
      state: { signedIn: true, media: { kind: 'video', bvid: 'BV1test', title: '雨里的天文台' } },
    })
    playVideo({
      id: 'BV1test',
      title: '雨里的天文台',
      cover: null,
      duration: 213,
      up: { uid: '7', name: '夜航研究所', avatar: null },
      views: 1_200,
    })
    settlePlayerPage()
    expect(useBilibili.getState().pictureShown).toBe(false)
    receiveMessage({ type: 'bilibili', kind: 'showing', on: true })
    expect(useBilibili.getState().pictureShown).toBe(true)
    receiveMessage({ type: 'bilibili', kind: 'showing', on: false })
    expect(useBilibili.getState().pictureShown).toBe(false)
    expect(useBilibili.getState().picture).toBe(false)
  })

  it('keeps its player timeline for the next flash of black (the last 200 events)', async () => {
    inHost()
    const { recordTimeline } = await import('./bilibili')
    const win = window as Window & { __bbTimeline?: { event: string }[] }
    win.__bbTimeline = []
    for (let index = 0; index < 205; index += 1) recordTimeline(`event ${index}`)
    expect(win.__bbTimeline).toHaveLength(200)
    expect(win.__bbTimeline?.[0].event).toBe('event 5')
    expect(win.__bbTimeline?.[199].event).toBe('event 204')
  })

  it('closes the player page after its way out', async () => {
    inHost()
    vi.useFakeTimers()
    const { closePlayerPage, receiveMessage, settlePlayerPage } = await import('./bilibili')
    receiveMessage({
      type: 'bilibili',
      kind: 'state',
      state: { signedIn: true, media: { kind: 'video', bvid: 'BV1test', title: '雨里的天文台' } },
    })
    const { playVideo, useBilibili } = await import('./bilibili')
    playVideo({
      id: 'BV1test',
      title: '雨里的天文台',
      cover: null,
      duration: 213,
      up: { uid: '7', name: '夜航研究所', avatar: null },
      views: 1,
    })
    settlePlayerPage()
    closePlayerPage()
    expect(useBilibili.getState().stage).toBe('leave')
    vi.advanceTimersByTime(700)
    expect(useBilibili.getState().stage).toBe('closed')
  })
})

describe('the browser preview', () => {
  it('answers the app’s commands with the host’s own messages', async () => {
    inBrowser()
    const { bilibili, useBilibili } = await import('./bilibili')
    bilibili({ action: 'home' })
    expect(useBilibili.getState().home?.length).toBeGreaterThan(0)
    bilibili({ action: 'bangumi', seasonType: 1, page: 1 })
    expect(useBilibili.getState().anime?.length).toBeGreaterThan(0)
    bilibili({ action: 'bangumi', seasonType: 2, page: 1 })
    expect(useBilibili.getState().cinema?.length).toBeGreaterThan(0)
    bilibili({ action: 'live' })
    expect(useBilibili.getState().liveRooms?.length).toBeGreaterThan(0)
    bilibili({ action: 'play', value: 'BV1preview001', kind: 'video' })
    const state = useBilibili.getState()
    expect(state.now).toMatchObject({ id: 'BV1preview001', kind: 'video' })
    expect(state.playing).toBe(true)
    expect(state.duration).toBeGreaterThan(0)
  })
})
