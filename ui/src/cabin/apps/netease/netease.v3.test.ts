import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreview } from './preview'

/**
 * v3's own protocol (`notes/netease-v3-protocol.md`): NetEase's rankings list and a ranking's songs, the account's
 * own profile, a playlist's own head, and the preview's answers for all of them. The host's page is stubbed the way
 * the other tests stub it, so the commands the app sends are the ones a real cabin page sends.
 */

function inHost() {
  const posted: { type: string; kind?: string; command?: unknown }[] = []
  vi.stubGlobal('window', {
    chrome: {
      webview: {
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: (message: { type: string; kind?: string; command?: unknown }) => posted.push(message),
      },
    },
  })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  })
  return { commands: () => posted.filter((message) => message.type === 'netease').map((message) => message.command) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const RANKING = {
  id: '19723756',
  name: '飙升榜',
  cover: 'https://p2.music.126.net/a.jpg?param=300y300',
  updateFrequency: '刚刚更新',
  trackCount: 100,
  playCount: 6529254400,
  official: true,
}

describe('the rankings', () => {
  it('applies NetEase’s own list, its card fields and its official mark', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    receiveMessage({ type: 'netease', kind: 'rankings', rankings: [RANKING, { ...RANKING, id: '71384707', name: '网易云古典榜', official: false }] })
    const state = useNetease.getState()
    expect(state.rankings?.map((ranking) => ranking.name)).toEqual(['飙升榜', '网易云古典榜'])
    expect(state.rankings?.[0]).toMatchObject({ updateFrequency: '刚刚更新', trackCount: 100, official: true })
    expect(state.rankings?.[1].official).toBe(false)
    expect(state.rankingsAsking).toEqual({ waiting: false, failed: false })
  })

  it('asks the page for them, and shows a list read before as it is', async () => {
    const host = inHost()
    const { requestRankings, useNetease } = await import('./netease')
    requestRankings()
    expect(host.commands()).toEqual([{ action: 'rankings' }])
    expect(useNetease.getState().rankingsAsking.waiting).toBe(true)
    requestRankings()
    expect(host.commands()).toEqual([{ action: 'rankings' }])
  })

  it('opens a ranking: its view, its own songs as a playlist’s, and its head kept', async () => {
    const host = inHost()
    const { openRanking, receiveMessage, useNetease } = await import('./netease')
    openRanking(RANKING.id)
    expect(host.commands()).toEqual([{ action: 'openRanking', value: RANKING.id }])
    const view = useNetease.getState().views[useNetease.getState().tab].at(-1)
    expect(view).toMatchObject({ kind: 'ranking', rankingId: RANKING.id })
    expect(useNetease.getState().playlists[RANKING.id]).toMatchObject({ songs: null, waiting: true })
    receiveMessage({
      type: 'netease',
      kind: 'playlist',
      id: RANKING.id,
      name: '飙升榜',
      cover: 'https://p2.music.126.net/a.jpg?param=300y300',
      playCount: 6529254400,
      trackCount: 100,
      updateFrequency: '刚刚更新',
      creator: '',
      description: '',
      songs: [{ id: '168091', title: '蓝莲花', artist: '许巍', album: '时光.漫步', duration: 271, playable: true }],
    })
    const page = useNetease.getState().playlists[RANKING.id]
    expect(page.songs?.map((song) => song.title)).toEqual(['蓝莲花'])
    expect(page.songs?.[0].album).toBe('时光.漫步')
    expect(page.waiting).toBe(false)
    expect(page.meta).toMatchObject({ name: '飙升榜', updateFrequency: '刚刚更新', trackCount: 100 })
  })

  it('asks again for a ranking’s songs without opening its page again', async () => {
    const host = inHost()
    const { retryRanking, useNetease } = await import('./netease')
    retryRanking('19723756')
    expect(host.commands()).toEqual([{ action: 'openRanking', value: '19723756' }])
    expect(useNetease.getState().views[useNetease.getState().tab]).toEqual([])
    expect(useNetease.getState().playlists['19723756'].waiting).toBe(true)
  })

  it('knows a ranking’s card for its page’s head, and finds a ranking’s playlist the same way', async () => {
    inHost()
    const { findPlaylistMeta, findRankingMeta } = await import('./netease')
    expect(findRankingMeta([RANKING], RANKING.id)?.name).toBe('飙升榜')
    expect(findRankingMeta([], RANKING.id)).toBeNull()
    expect(findPlaylistMeta({ lists: [], home: null, library: null, rankings: [RANKING] }, RANKING.id)?.name).toBe('飙升榜')
  })
})

describe('the account’s profile', () => {
  it('applies the page’s own user detail, and the rail’s account with it when the state hasn’t said', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'profile',
      profile: {
        uid: '1835963976',
        name: 'dReLuNEstella',
        avatar: 'https://p1.music.126.net/a.jpg?param=140y140',
        signature: '皮粥',
        level: 8,
        listenSongs: 6682,
        follows: 46,
        fans: 7,
        playlistCount: 5,
        createDays: 2764,
        vipType: 11,
        background: null,
      },
    })
    const state = useNetease.getState()
    expect(state.profile).toMatchObject({ uid: '1835963976', name: 'dReLuNEstella', level: 8, fans: 7, listenSongs: 6682 })
    expect(state.profileAsking).toEqual({ waiting: false, failed: false })
    expect(state.account).toEqual({ name: 'dReLuNEstella', avatar: 'https://p1.music.126.net/a.jpg?param=140y140' })
  })

  it('asks the page for it, and leaves the profile unread while the page says it has none', async () => {
    const host = inHost()
    const { receiveMessage, requestProfile, useNetease } = await import('./netease')
    requestProfile()
    expect(host.commands()).toEqual([{ action: 'profile' }])
    expect(useNetease.getState().profileAsking.waiting).toBe(true)
    receiveMessage({ type: 'netease', kind: 'profile', profile: null })
    expect(useNetease.getState().profile).toBeNull()
    expect(useNetease.getState().profileAsking.waiting).toBe(true)
  })
})

describe('a playlist’s own head', () => {
  it('keeps the answer’s cover, counts and update frequency beside its songs', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'playlist',
      id: '3778678',
      name: '热歌榜',
      cover: 'https://p1.music.126.net/a.jpg?param=300y300',
      playCount: 14253657088,
      trackCount: 200,
      updateFrequency: '每天更新',
      creator: '',
      description: '',
      songs: [],
    })
    expect(useNetease.getState().playlists['3778678'].meta).toMatchObject({
      name: '热歌榜',
      cover: 'https://p1.music.126.net/a.jpg?param=300y300',
      playCount: 14253657088,
      trackCount: 200,
      updateFrequency: '每天更新',
    })
  })
})

describe('the preview’s v3 answers', () => {
  it('has NetEase’s rankings, their own songs and the account’s profile', () => {
    const preview = createPreview()
    const rankings = preview.rankings()
    expect(rankings.length).toBeGreaterThan(5)
    expect(rankings.slice(0, 4).map((ranking) => ranking.name)).toEqual(['飙升榜', '新歌榜', '原创榜', '热歌榜'])
    expect(rankings.slice(0, 4).every((ranking) => ranking.official)).toBe(true)
    expect(rankings.some((ranking) => !ranking.official)).toBe(true)
    expect(rankings.every((ranking) => ranking.updateFrequency.length > 0)).toBe(true)
    const ranking = preview.ranking(rankings[0].id)
    expect(ranking?.meta.name).toBe('飙升榜')
    expect(ranking?.songs.length).toBeGreaterThan(10)
    expect(ranking?.songs.every((song) => song.playable !== undefined)).toBe(true)
    expect(preview.ranking('no-such-ranking')).toBeNull()
    const profile = preview.profile()
    expect(profile.uid).not.toBe('')
    expect(profile.name).not.toBe('')
    expect(profile.level).toBeGreaterThan(0)
  })

  it('plays a ranking’s song in the preview, its own song still what plays', () => {
    const preview = createPreview()
    const ranking = preview.rankings()[4]
    const page = preview.ranking(ranking.id)
    const song = page?.songs.find((each) => each.playable)
    expect(song).toBeDefined()
    preview.playSong(ranking.id, song!)
    expect(preview.read().track?.title).toBe(song!.title)
    expect(preview.read().playing).toBe(true)
    preview.playPlaylist(ranking.id)
    expect(preview.read().track?.playable).toBe(true)
  })
})

describe('the artist’s page', () => {
  it('keeps the page’s own brief introduction', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'artist',
      id: '5770',
      name: '许巍',
      alias: '',
      cover: null,
      description: '内地摇滚音乐界的重要人物。',
      songs: [],
    })
    expect(useNetease.getState().artists['5770'].description).toBe('内地摇滚音乐界的重要人物。')
  })
})
