import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreview } from './preview'
import { sourceOf } from './source'
import { neteaseWords } from './words'

/**
 * The NetEase app's own pieces: what the preview answers, how the player's clock reads, and the commands the
 * hidden page is sent (the host's page stubbed, as the Spotify app's tests stub its own).
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

const SONG = { id: 'song-1', title: '北环线的晚风', artist: '山雾乐队', duration: 240, playable: true }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the host’s hidden page', () => {
  it('is asked for a playlist as its page opens, and told the song by id when one is pressed', async () => {
    const host = inHost()
    const { receivePlaylist, openPlaylist, playSong } = await import('./netease')
    openPlaylist('list-7')
    expect(host.commands()).toContainEqual({ action: 'openPlaylist', value: 'list-7' })
    receivePlaylist('list-7', [SONG])
    playSong('list-7', SONG)
    // The list it's from goes with it: the page plays it in its own queue (its own next/preload).
    expect(host.commands()).toContainEqual({ action: 'play', value: 'song-1', list: 'list-7' })
  })

  it('plays a playlist from its first playable song when Play all is pressed', async () => {
    const host = inHost()
    const { playPlaylist, receivePlaylist } = await import('./netease')
    const unplayable = { ...SONG, id: 'vip-only', title: '会员曲', playable: false }
    // Songs not known yet: Play all waits for them, then asks for the first it can play.
    playPlaylist('list-1')
    expect(host.commands()).toEqual([{ action: 'openPlaylist', value: 'list-1' }])
    receivePlaylist('list-1', [unplayable, SONG])
    expect(host.commands()).toContainEqual({ action: 'play', value: 'song-1', list: 'list-1' })
  })

  it('never asks for a song NetEase’s rights don’t allow', async () => {
    const host = inHost()
    const { playSong } = await import('./netease')
    playSong('list-1', { ...SONG, playable: false })
    expect(host.commands()).toEqual([])
  })

  it('keeps an unplayable song marked, and the position it was given', async () => {
    inHost()
    const { receiveState, useNetease } = await import('./netease')
    receiveState({
      signedIn: true,
      signingIn: false,
      playing: true,
      volume: 0.7,
      track: { ...SONG, album: '夜航电台', cover: null, position: 63, playable: false },
      lists: [{ id: 'list-1', name: '夜航电台', cover: null, playCount: 2184000 }],
    })
    const state = useNetease.getState()
    expect(state.track?.playable).toBe(false)
    expect(state.track?.position).toBe(63)
    expect(state.lists).toHaveLength(1)
    expect(state.heard).toBe(true)
  })
})

describe('the player’s clock', () => {
  it('runs on while playing, stops while paused, and never past the song', async () => {
    inHost()
    const { positionOf } = await import('./netease')
    const track = { ...SONG, album: 'x', cover: null, position: 30, playable: true }
    expect(positionOf(track, false, 0, 100_000)).toBe(30)
    expect(positionOf(track, true, 0, 5000)).toBe(35)
    expect(positionOf(track, true, 0, 1_000_000)).toBe(240)
  })
})

describe('the account', () => {
  it('says signing in over signed in or out, and unknown until the page has said', async () => {
    inHost()
    const { accountOf } = await import('./netease')
    expect(accountOf({ signedIn: null, signingIn: false })).toBe('unknown')
    expect(accountOf({ signedIn: false, signingIn: false })).toBe('out')
    expect(accountOf({ signedIn: true, signingIn: false })).toBe('in')
    expect(accountOf({ signedIn: false, signingIn: true })).toBe('signingIn')
  })
})

describe('the preview', () => {
  it('answers twelve playlists, each with its songs, a few of them unplayable', () => {
    const preview = createPreview()
    const state = preview.read()
    expect(state.signedIn).toBe(true)
    expect(state.lists).toHaveLength(12)
    expect(state.track).not.toBeNull()
    const songs = preview.songs(state.lists[0].id)
    expect(songs.length).toBeGreaterThan(10)
    expect(preview.songs('no-such-list')).toEqual([])
    const unplayable = state.lists.flatMap((list) => preview.songs(list.id).filter((song) => !song.playable))
    expect(unplayable.length).toBeGreaterThan(0)
  })

  it('plays what it is asked to, skips what NetEase wouldn’t, and seeks within the song', () => {
    const preview = createPreview()
    const first = preview.songs(preview.read().lists[2].id)
    preview.playSong(preview.read().lists[2].id, first[3])
    expect(preview.read().track?.title).toBe(first[3].title)
    preview.skip(1)
    const skipped = preview.read().track
    expect(skipped?.playable).toBe(true)
    preview.seek(9999)
    expect(preview.read().track?.position).toBe(skipped?.duration ?? 0)
    preview.play(false)
    expect(preview.read().playing).toBe(false)
  })
})

describe('the app’s words', () => {
  it('writes the same counts the cab does in Chinese and English', () => {
    expect(neteaseWords('zh-CN').plays(2_184_000)).toBe('218万次播放')
    expect(neteaseWords('en-US').plays(2_184_000)).toBe('2.2M plays')
    expect(neteaseWords('zh-CN').songs(14)).toBe('14 首')
  })
})

describe('what the Dashboard shows of it', () => {
  it('says the song, its cover, and how far in it is when the state was read', () => {
    const track = {
      id: '42',
      title: '夜航电台',
      artist: '北纬二十七',
      album: '公路与夜',
      cover: 'https://p1.music.126.net/a.jpg',
      duration: 240,
      position: 63,
      playable: true,
    }
    const now = sourceOf(track, true, 1000)
    expect(now?.source).toMatchObject({
      id: 'westplay-netease',
      service: 'netease',
      title: '夜航电台',
      artist: '北纬二十七',
      album: '公路与夜',
      status: 'playing',
      positionMs: 63_000,
      durationMs: 240_000,
    })
    expect(now?.source.controls).toMatchObject({ playPause: true, next: true, previous: true })
    expect(now?.artwork).toBe('https://p1.music.126.net/a.jpg')
    // The clock's place is the Unix time of the state, not of now.
    expect(Number.isInteger(now?.source.positionAt)).toBe(true)
    expect(now!.source.positionAt).toBeGreaterThan(1_000)

    const paused = sourceOf(track, false, 1000)
    expect(paused?.source.status).toBe('paused')
  })

  it('shows nothing without a song', () => {
    expect(sourceOf(null, false, 0)).toBeNull()
  })
})

describe('the host’s v2 answers', () => {
  it('applies Home as it comes: its cards first (the day still to come), then its day’s songs', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    const radar = { id: '3136952023', name: '私人雷达', cover: null, playCount: 0 }
    receiveMessage({ type: 'netease', kind: 'home', radar, personal: [], recommended: [] })
    let state = useNetease.getState()
    expect(state.home?.radar?.name).toBe('私人雷达')
    expect(state.home?.daily).toBeNull()
    expect(state.homeAsking.waiting).toBe(true)
    expect(state.heard).toBe(true)
    receiveMessage({
      type: 'netease',
      kind: 'home',
      daily: { songs: [{ id: 'daily-1', title: '今天的歌', artist: '人', duration: 200, playable: true }] },
      radar,
      personal: [{ id: 'list-3', name: '个性化', cover: null, playCount: 7 }],
      recommended: [{ id: 'list-4', name: '热门', cover: null, playCount: 100 }],
    })
    state = useNetease.getState()
    expect(state.home?.daily?.map((song) => song.title)).toEqual(['今天的歌'])
    expect(state.home?.personal.map((list) => list.name)).toEqual(['个性化'])
    expect(state.home?.recommended.map((list) => list.name)).toEqual(['热门'])
    expect(state.homeAsking).toEqual({ waiting: false, failed: false })
  })

  it('applies My Music’s groups and the recent songs', async () => {
    inHost()
    const { receiveMessage, useNetease } = await import('./netease')
    receiveMessage({
      type: 'netease',
      kind: 'library',
      groups: [
        {
          title: '创建的歌单',
          count: 1,
          playlists: [{ id: '1', name: '乐队', cover: null, songCount: 13, by: '' }],
        },
      ],
    })
    expect(useNetease.getState().library?.[0].playlists[0]).toMatchObject({ name: '乐队', songCount: 13 })
    receiveMessage({
      type: 'netease',
      kind: 'recent',
      songs: [{ id: '7', title: 'Breath', artist: 'Pluto', duration: 201, playable: true }],
    })
    expect(useNetease.getState().recent?.[0]).toMatchObject({ title: 'Breath', artist: 'Pluto' })
  })

  it('shows only the last search asked, not an earlier answer arriving late', async () => {
    inHost()
    const { receiveMessage, searchFor, useNetease } = await import('./netease')
    searchFor('周杰伦')
    searchFor('Taylor Swift')
    receiveMessage({
      type: 'netease',
      kind: 'search',
      query: '周杰伦',
      songs: [{ id: '1', title: '屋顶', artist: '周杰伦', duration: 300, playable: true }],
    })
    expect(useNetease.getState().search).toBeNull()
    receiveMessage({
      type: 'netease',
      kind: 'search',
      query: 'Taylor Swift',
      songs: [{ id: '2', title: 'Love Story', artist: 'Taylor Swift', duration: 236, playable: true }],
    })
    const search = useNetease.getState().search
    expect(search?.query).toBe('Taylor Swift')
    expect(search?.songs[0].title).toBe('Love Story')
    expect(useNetease.getState().searchAsking).toEqual({ waiting: false, failed: false })
  })
})

describe('the app asks the host’s page', () => {
  it('for Home, My Music’s playlists and the recent songs as the app opens them', async () => {
    const host = inHost()
    const { requestHome, requestLibrary, requestRecent } = await import('./netease')
    requestHome()
    requestLibrary()
    requestRecent()
    expect(host.commands()).toEqual([{ action: 'home' }, { action: 'library' }, { action: 'recent' }])
  })

  it('opens the recent page over the tab, and plays a found song by its id (the day’s first, for Play all)', async () => {
    const host = inHost()
    const { openRecent, playDaily, playFound, receiveMessage, useNetease } = await import('./netease')
    openRecent()
    expect(host.commands()).toContainEqual({ action: 'recent' })
    const state = useNetease.getState()
    expect(state.views[state.tab].at(-1)).toMatchObject({ kind: 'recent' })
    playFound({ id: '42', title: 'x', artist: 'y', duration: 10, playable: true })
    expect(host.commands()).toContainEqual({ action: 'play', value: '42' })
    receiveMessage({
      type: 'netease',
      kind: 'home',
      daily: {
        songs: [
          { id: 'a', title: 'a', artist: '', duration: 10, playable: false },
          { id: 'b', title: 'b', artist: '', duration: 10, playable: true },
        ],
      },
      radar: null,
      personal: [],
      recommended: [],
    })
    playDaily()
    expect(host.commands()).toContainEqual({ action: 'play', value: 'b', list: 'daily' })
  })

  it('knows a playlist’s card from Home’s shelves or My Music’s groups, for its page’s head', async () => {
    inHost()
    const { findPlaylistMeta } = await import('./netease')
    const radar = { id: '3136952023', name: '私人雷达', cover: null, playCount: 0 }
    const library = [
      {
        title: '收藏的歌单',
        count: 1,
        playlists: [{ id: '9', name: '收藏的', cover: null, playCount: 0, songCount: 12, by: '人' }],
      },
    ]
    expect(findPlaylistMeta({ lists: [], home: null, library }, '9')?.name).toBe('收藏的')
    expect(
      findPlaylistMeta({ lists: [], home: { daily: null, radar, personal: [], recommended: [] }, library: null }, radar.id)
        ?.name,
    ).toBe('私人雷达')
    expect(findPlaylistMeta({ lists: [], home: null, library: null }, 'nothing')).toBeNull()
  })
})

describe('the preview’s v2 answers', () => {
  it('has Home’s day and shelves, My Music’s groups, a search and the recent songs', () => {
    const preview = createPreview()
    const home = preview.home()
    expect(home.daily?.length).toBeGreaterThan(0)
    expect(home.radar?.name).toBe('私人雷达')
    expect(home.personal.length).toBeGreaterThan(0)
    expect(home.recommended.length).toBeGreaterThan(0)
    expect(preview.library().map((group) => group.title)).toEqual(['创建的歌单', '收藏的歌单'])
    expect(preview.library().flatMap((group) => group.playlists).every((list) => list.songCount > 0)).toBe(true)
    expect(preview.search('夜航').songs.length).toBeGreaterThan(0)
    expect(preview.search('')).toEqual({ songs: [], artists: [], playlists: [] })
    expect(preview.recent().length).toBeGreaterThan(0)
    // A found song plays in the preview (its own queue): the same one is what plays then.
    const found = preview.search('夜航').songs[0]
    preview.playHistory(found)
    expect(preview.read().track?.title).toBe(found.title)
  })
})

describe('the search’s own categories', () => {
  it('applies a search’s songs, artists and playlists, each with the page’s own count', async () => {
    inHost()
    const { receiveMessage, searchFor, useNetease } = await import('./netease')
    searchFor('许巍')
    receiveMessage({
      type: 'netease',
      kind: 'search',
      query: '许巍',
      songs: [{ id: '168141', title: '故乡', artist: '许巍', duration: 313, playable: true }],
      artists: [{ id: '5770', name: '许巍', cover: 'https://p1.music.126.net/a.jpg' }],
      playlists: [{ id: '8866695219', name: '听·许巍热门精选', cover: null, playCount: 3557669 }],
      songsTotal: 296,
      artistsTotal: 14,
      playlistsTotal: 285,
    })
    const search = useNetease.getState().search
    expect(search?.songs[0].title).toBe('故乡')
    expect(search?.artists[0]).toMatchObject({ id: '5770', name: '许巍' })
    expect(search?.playlists[0]).toMatchObject({ id: '8866695219', name: '听·许巍热门精选', playCount: 3557669 })
    expect([search?.songsTotal, search?.artistsTotal, search?.playlistsTotal]).toEqual([296, 14, 285])
    expect(useNetease.getState().searchAsking).toEqual({ waiting: false, failed: false })
  })

  it('reads a search of the old shape (no artists or playlists): its counts are its lists’ own', async () => {
    inHost()
    const { receiveMessage, searchFor, useNetease } = await import('./netease')
    searchFor('周杰伦')
    receiveMessage({
      type: 'netease',
      kind: 'search',
      query: '周杰伦',
      songs: [{ id: '1', title: '屋顶', artist: '周杰伦', duration: 300, playable: true }],
    })
    const search = useNetease.getState().search
    expect(search?.artists).toEqual([])
    expect(search?.playlists).toEqual([])
    expect([search?.songsTotal, search?.artistsTotal, search?.playlistsTotal]).toEqual([1, 0, 0])
  })

  it('opens an artist’s page and applies its own answer', async () => {
    const host = inHost()
    const { openArtist, receiveMessage, searchFor, useNetease } = await import('./netease')
    searchFor('许巍')
    receiveMessage({
      type: 'netease',
      kind: 'search',
      query: '许巍',
      artists: [{ id: '5770', name: '许巍', cover: null }],
      songs: [],
      playlists: [],
    })
    openArtist('5770')
    expect(host.commands()).toContainEqual({ action: 'openArtist', value: '5770' })
    const view = useNetease.getState().views[useNetease.getState().tab].at(-1)
    expect(view).toMatchObject({ kind: 'artist', artistId: '5770' })
    // Its card from the search draws its page's head before the page's own answer comes.
    expect(useNetease.getState().artists['5770']).toMatchObject({ name: '许巍', songs: null, waiting: true })
    receiveMessage({
      type: 'netease',
      kind: 'artist',
      id: '5770',
      name: '许巍',
      alias: '',
      cover: 'https://p1.music.126.net/a.jpg',
      songs: [{ id: '168091', title: '蓝莲花', artist: '许巍', duration: 270, playable: true }],
    })
    const page = useNetease.getState().artists['5770']
    expect(page?.songs?.map((song) => song.title)).toEqual(['蓝莲花'])
    expect(page?.waiting).toBe(false)
  })

  it('keeps a search’s playlist known for its own page’s head', async () => {
    inHost()
    const { findPlaylistMeta } = await import('./netease')
    const search = {
      query: '许巍',
      songs: [],
      artists: [],
      playlists: [{ id: '8866695219', name: '听·许巍热门精选', cover: null, playCount: 3557669 }],
      songsTotal: 0,
      artistsTotal: 0,
      playlistsTotal: 1,
      failed: false,
    }
    expect(findPlaylistMeta({ lists: [], home: null, library: null, search }, '8866695219')?.name).toBe(
      '听·许巍热门精选',
    )
  })
})

describe('the heart', () => {
  it('asks the page to like the playing song, and changes only as its answer says it landed', async () => {
    const host = inHost()
    const { receiveMessage, receiveState, setLiked, useNetease } = await import('./netease')
    receiveState({
      signedIn: true,
      signingIn: false,
      playing: true,
      volume: 0.7,
      track: { ...SONG, id: '42', album: 'x', cover: null, position: 0, playable: true },
      liked: false,
      lists: [],
    })
    setLiked(true)
    expect(host.commands()).toContainEqual({ action: 'setLike', value: '42', liked: true })
    expect(useNetease.getState().liking).toBe(true)
    // Not yet: the heart is still empty until the page's own answer says the song is in 我喜欢的音乐.
    expect(useNetease.getState().liked).toBe(false)
    receiveMessage({ type: 'netease', kind: 'like', id: '42', liked: true, ok: true, reason: '' })
    expect(useNetease.getState().liked).toBe(true)
    expect(useNetease.getState().liking).toBe(false)
    // A like that didn't land leaves the heart as it was, and says so.
    setLiked(false)
    receiveMessage({ type: 'netease', kind: 'like', id: '42', liked: false, ok: false, reason: 'account' })
    expect(useNetease.getState().liked).toBe(true)
    expect(useNetease.getState().likeFailure?.reason).toBe('account')
  })

  it('never asks for a heart on a song it doesn’t know yet', async () => {
    const host = inHost()
    const { receiveState, setLiked } = await import('./netease')
    receiveState({
      signedIn: false,
      signingIn: false,
      playing: true,
      volume: 0.7,
      track: { ...SONG, id: '42', album: 'x', cover: null, position: 0, playable: true },
      liked: null,
      lists: [],
    })
    setLiked(true)
    expect(host.commands()).toEqual([])
  })
})

describe('the v2 words', () => {
  it('names My Music’s groups and who a collected playlist is by', () => {
    expect(neteaseWords('zh-CN').createdPlaylists).toBe('创建的歌单')
    expect(neteaseWords('zh-CN').collectedPlaylists).toBe('收藏的歌单')
    expect(neteaseWords('zh-CN').by('微雨染尘埃')).toBe('by 微雨染尘埃')
    expect(neteaseWords('en-US').daily).toBe('Daily picks')
    expect(neteaseWords('en-US').recentSource).toBe('This week’s listening chart')
  })
})
