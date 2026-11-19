import type {
  NeteaseArtist,
  NeteaseHome,
  NeteaseLibraryGroup,
  NeteaseLibraryPlaylist,
  NeteaseList,
  NeteasePlayerState,
  NeteaseProfile,
  NeteaseRanking,
  NeteaseSong,
  NeteaseTrack,
  PlaylistMeta,
} from './netease'

/**
 * DEVELOPMENT PREVIEW: the invented player a plain browser gets, so the app's whole screen can be looked at
 * without WestPlay's host and NetEase's page running. Twelve recommended playlists, a song playing, and each
 * playlist's songs; the controls work (the preview's own queue, its own clock). Home's day's songs, My Music's
 * groups, a search, NetEase's rankings and the account's profile are invented the same way (a slice of those
 * playlists, so a song of them plays). Nothing here is anyone's real music, and nothing here is anyone's real
 * account.
 */

interface PreviewPlaylist {
  list: NeteaseList
  songs: NeteaseSong[]
}

/** The playlists' names and how many times they've been played. */
const NAMES: [name: string, playCount: number][] = [
  ['夜航电台', 2_184_000],
  ['沿海公路', 1_640_000],
  ['雨天车窗', 986_000],
  ['山雾来信', 754_000],
  ['晚风与柴油', 512_000],
  ['零点便利店', 438_000],
  ['副驾的猫', 361_000],
  ['长途不眠', 298_000],
  ['旧磁带', 247_000],
  ['林间隧道', 196_000],
  ['候鸟与货场', 152_000],
  ['星期天的码头', 118_000],
]

/** The songs' titles and artists: invented, and the same every time. */
const TITLES = [
  '北环线的晚风',
  '凌晨四点的加油站',
  '把月亮留在副驾',
  '雨刷的节拍',
  '隧道尽头的灯',
  '柴油与薄荷',
  '在服务区睡一会',
  '橙色路障',
  '收音机里的海',
  '空车厢',
  '第六个出口',
  '雨落在挡风玻璃',
  '一直开到天亮',
  '旧地图的褶皱',
  '夜班司机',
  '路肩上的花',
  '导航说前方右转',
  '把车停在海边',
  '慢速车道',
  '后视镜里的城',
]

const ARTISTS = [
  '山雾乐队',
  '夜航员',
  '岚与海',
  '北纬二十七',
  '慢速公路',
  '旧磁头',
  '白噪音计划',
  '木星拖拉机',
  '返程信号',
  '南方货场',
]

/** The albums: each list's songs are from one, so the preview's rows have an album to show. */
const ALBUMS = ['夜航', '沿海', '雨天', '山雾', '晚风', '零点', '副驾', '长途', '磁带', '隧道', '货场', '码头']

/** The artists as a search's cards say them (`preview-artist-1`…): a picture the preview has none of. */
const ARTIST_CARDS: NeteaseArtist[] = ARTISTS.map((name, index) => ({
  id: `preview-artist-${index + 1}`,
  name,
  cover: null,
}))

function seedOf(text: string): number {
  return [...text].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % 9973, 7)
}

function songsOf(listIndex: number, name: string): NeteaseSong[] {
  const seed = seedOf(name)
  return Array.from({ length: 14 }, (_, index): NeteaseSong => {
    const pick = seed + index * 17
    const title = TITLES[pick % TITLES.length]
    const song: NeteaseSong = {
      id: `preview-${listIndex + 1}-${index + 1}`,
      title: index === 0 ? name : title,
      artist: ARTISTS[(seed + index * 7) % ARTISTS.length],
      duration: 174 + (pick % 11) * 17,
      // A few that the preview can't play, so the app's mark for them is there to see.
      playable: !(index === 5 || (index === 2 && listIndex % 3 === 1) || (listIndex % 4 === 2 && index === 9)),
      album: ALBUMS[listIndex % ALBUMS.length],
    }
    return song
  })
}

const PLAYLISTS: PreviewPlaylist[] = NAMES.map(([name, playCount], index) => ({
  list: { id: `preview-list-${index + 1}`, name, cover: null, playCount },
  songs: songsOf(index, name),
}))

/** Home's day's songs: a slice of one list, so each of them plays in the preview too. */
const DAY: NeteaseSong[] = PLAYLISTS[2].songs

/** Home, as the host's page would say it: the day's songs, private radar, two personalised playlists and the rest. */
export function previewHome(): NeteaseHome {
  return {
    daily: DAY.slice(0, 18),
    radar: { id: 'preview-radar', name: '私人雷达', cover: null, playCount: 0 },
    personal: [PLAYLISTS[3].list, PLAYLISTS[4].list],
    recommended: PLAYLISTS.slice(5, 11).map((each) => each.list),
  }
}

/** My Music's groups (创建的歌单, 收藏的歌单), invented. */
export function previewLibrary(): NeteaseLibraryGroup[] {
  const card = (each: PreviewPlaylist, by: string): NeteaseLibraryPlaylist => ({
    ...each.list,
    songCount: each.songs.length,
    by,
  })
  return [
    { title: '创建的歌单', count: 3, playlists: PLAYLISTS.slice(0, 3).map((each) => card(each, '')) },
    {
      title: '收藏的歌单',
      count: 6,
      playlists: PLAYLISTS.slice(3, 9).map((each, index) => card(each, ARTISTS[index % ARTISTS.length])),
    },
  ]
}

/** The account's recent songs, invented (a slice of one list, so a pressed one plays). */
export function previewRecent(): NeteaseSong[] {
  return PLAYLISTS[1].songs.slice(0, 10).map((song, index) => ({
    ...song,
    // The week's own count, as the page's 听歌排行 says it.
    playCount: 9 - index,
  }))
}

/** NetEase's own rankings, invented: the four charts the page always has (官方榜) and a few of its genre charts,
 * each over one of the preview's own lists so a ranking's songs play here too. */
interface PreviewRanking {
  ranking: NeteaseRanking
  playlist: number
}

const RANKINGS: PreviewRanking[] = [
  { ranking: { id: 'preview-rank-1', name: '飙升榜', cover: null, updateFrequency: '每天更新', trackCount: 100, playCount: 6529254400, official: true }, playlist: 0 },
  { ranking: { id: 'preview-rank-2', name: '新歌榜', cover: null, updateFrequency: '每天更新', trackCount: 100, playCount: 3227623936, official: true }, playlist: 1 },
  { ranking: { id: 'preview-rank-3', name: '原创榜', cover: null, updateFrequency: '每周四更新', trackCount: 100, playCount: 624830656, official: true }, playlist: 2 },
  { ranking: { id: 'preview-rank-4', name: '热歌榜', cover: null, updateFrequency: '每天更新', trackCount: 200, playCount: 14253657088, official: true }, playlist: 3 },
  { ranking: { id: 'preview-rank-5', name: '网易云古典榜', cover: null, updateFrequency: '每周更新', trackCount: 100, playCount: 76434272, official: false }, playlist: 4 },
  { ranking: { id: 'preview-rank-6', name: '网易云电音榜', cover: null, updateFrequency: '每周五更新', trackCount: 50, playCount: 414691008, official: false }, playlist: 5 },
  { ranking: { id: 'preview-rank-7', name: '网易云中文说唱榜', cover: null, updateFrequency: '每周五更新', trackCount: 50, playCount: 553007744, official: false }, playlist: 6 },
  { ranking: { id: 'preview-rank-8', name: '网易云ACG榜', cover: null, updateFrequency: '每周更新', trackCount: 100, playCount: 93148744, official: false }, playlist: 7 },
  { ranking: { id: 'preview-rank-9', name: '黑胶VIP爱听榜', cover: null, updateFrequency: '刚刚更新', trackCount: 100, playCount: 249090928, official: false }, playlist: 8 },
  { ranking: { id: 'preview-rank-10', name: 'UK排行榜周榜', cover: null, updateFrequency: '每周一更新', trackCount: 81, playCount: 157148384, official: false }, playlist: 9 },
]

/** NetEase's own rankings, as a `rankings` answer would give them. */
export function previewRankings(): NeteaseRanking[] {
  return RANKINGS.map((each) => each.ranking)
}

/** One of those rankings: its own head and its songs (a slice of the preview's own list). */
export function previewRanking(id: string): { meta: PlaylistMeta; songs: NeteaseSong[] } | null {
  const found = RANKINGS.find((each) => each.ranking.id === id)
  if (!found) return null
  const source = PLAYLISTS[found.playlist]
  const songs = source.songs.map((song, index) => ({ ...song, id: `${found.ranking.id}-${index + 1}` }))
  return {
    songs,
    meta: {
      id: found.ranking.id,
      name: found.ranking.name,
      cover: found.ranking.cover,
      playCount: found.ranking.playCount,
      trackCount: found.ranking.trackCount,
      updateFrequency: found.ranking.updateFrequency,
      creator: '',
      description: '',
    },
  }
}

/** The account's own profile, invented (nothing here is anyone's real account). */
export function previewProfile(): NeteaseProfile {
  return {
    uid: 'preview-user-1',
    name: '夜航司机',
    avatar: null,
    signature: '把车停在海边，再开一会儿。',
    level: 9,
    listenSongs: 6682,
    follows: 46,
    fans: 7,
    playlistCount: 12,
    createDays: 2764,
    vipType: 11,
    background: null,
  }
}

/** A search of the preview's own lists: its songs, its artists and its playlists, as the host's answer would have
 * them (the host's own page's categories, invented here). */
export interface PreviewSearch {
  songs: NeteaseSong[]
  artists: NeteaseArtist[]
  playlists: NeteaseList[]
}

/** A search over the preview's own lists (the v1 app's local filter, as the preview's answer). */
export function previewSearch(query: string): PreviewSearch {
  const wanted = query.trim().toLocaleLowerCase()
  if (!wanted) return { songs: [], artists: [], playlists: [] }
  const songs: NeteaseSong[] = []
  for (const playlist of PLAYLISTS) {
    for (const song of playlist.songs) {
      if (songs.some((each) => each.id === song.id)) continue
      if (song.title.toLocaleLowerCase().includes(wanted) || song.artist.toLocaleLowerCase().includes(wanted)) {
        songs.push(song)
      }
    }
  }
  const artists = ARTIST_CARDS.filter((artist) => artist.name.toLocaleLowerCase().includes(wanted))
  const playlists = PLAYLISTS.map((each) => each.list).filter((list) => list.name.toLocaleLowerCase().includes(wanted))
  return { songs: songs.slice(0, 30), artists, playlists }
}

/** An artist's page of the preview: their name, alias and a slice of one list's songs, so each of them plays. */
export function previewArtist(id: string): {
  name: string
  alias: string
  cover: null
  description: string
  songs: NeteaseSong[]
} {
  const at = Math.max(0, ARTIST_CARDS.findIndex((artist) => artist.id === id))
  const name = ARTIST_CARDS[at]?.name ?? '艺人'
  // The songs the preview's lists have of them, so a pressed one plays (and the page isn't empty).
  const songs = PLAYLISTS.flatMap((each) => each.songs).filter((song) => song.artist === name)
  return {
    name,
    alias: 'Preview Artist',
    cover: null,
    description: '纯粹是预演里假造的一位艺人，好让他的页面有个样子。',
    songs: (songs.length > 0 ? songs : PLAYLISTS[at % PLAYLISTS.length].songs).slice(0, 20),
  }
}

/** What a playlist page of the preview is headed with: its playlist, by id. */
export function previewPlaylists(): NeteaseList[] {
  return PLAYLISTS.map((each) => each.list)
}

/** `album` of a preview track: the playlist it came from. */
function toTrack(song: NeteaseSong, album: string): NeteaseTrack {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album ?? album,
    cover: null,
    duration: song.duration,
    position: 0,
    playable: song.playable,
  }
}

/** The first song from `from` that NetEase's rights allow. */
function playableFrom(songs: NeteaseSong[], from: number): number {
  for (let step = 0; step < songs.length; step++) {
    const at = (from + step) % songs.length
    if (songs[at]?.playable) return at
  }
  return from
}

/** The preview's player, driven as the hidden page would be. */
export interface Preview {
  /** What plays now, as the host would say it (`track.position` folded in at the moment it's read). */
  read(): NeteasePlayerState
  /** A playlist's songs, as an `openPlaylist` answer would give. */
  songs(id: string): NeteaseSong[]
  /** Home, as a `home` answer would give (its day's songs and shelves). */
  home(): NeteaseHome
  /** My Music's playlists, as a `library` answer would give. */
  library(): NeteaseLibraryGroup[]
  /** The recent songs, as a `recent` answer would give. */
  recent(): NeteaseSong[]
  /** A search's songs, artists and playlists, as a `search` answer would give. */
  search(query: string): PreviewSearch
  /** An artist's page, as an `artist` answer would give. */
  artist(id: string): { name: string; alias: string; cover: null; description: string; songs: NeteaseSong[] }
  /** NetEase's own rankings, as a `rankings` answer would give them. */
  rankings(): NeteaseRanking[]
  /** One of those rankings, as an `openRanking` answer would give it (a `playlist` message's own head and songs). */
  ranking(id: string): { meta: PlaylistMeta; songs: NeteaseSong[] } | null
  /** The account's own profile, as a `profile` answer would give it. */
  profile(): NeteaseProfile
  play(playing: boolean): void
  playPlaylist(id: string): void
  playSong(id: string, song: NeteaseSong): void
  /** A song of the session's recent list (no playlist known): the playlist the preview made it in. */
  playHistory(song: NeteaseSong): void
  /** A heart pressed in the preview: its own liked songs, and whether the song is in them now. */
  setLiked(id: string, liked: boolean): boolean
  skip(direction: 1 | -1): void
  seek(seconds: number): void
  setVolume(share: number): void
  refresh(): void
}

export function createPreview(): Preview {
  let lists = previewPlaylists()
  let signedIn: boolean | null = true
  let signingIn = false
  let playing = true
  let volume = 0.8
  /** Where playback is: a list's songs, and the one playing. */
  let queue: NeteaseSong[] = PLAYLISTS[0].songs
  let album = PLAYLISTS[0].list.name
  let index = 0
  // The preview's own liked songs (its own 我喜欢的音乐): the playing one's heart says so.
  const liked = new Set<string>()
  // 42 seconds in, as if the page had been playing all along.
  let position = 42
  let since = performance.now()

  const nowPosition = (): number => {
    const song = queue[index]
    if (!song) return 0
    const position_ = playing ? position + Math.max(0, performance.now() - since) / 1000 : position
    return Math.min(Math.max(0, position_), song.duration)
  }

  /** Folds the running clock into the position: every change starts from where the song is. */
  const fold = (): void => {
    position = nowPosition()
    since = performance.now()
  }

  const startAt = (nextQueue: NeteaseSong[], nextIndex: number, nextAlbum: string): void => {
    queue = nextQueue
    index = nextIndex
    album = nextAlbum
    position = 0
    since = performance.now()
    playing = true
  }

  const current = (): NeteaseTrack | null => {
    const song = queue[index]
    return song ? { ...toTrack(song, album), position } : null
  }

  const read = (): NeteasePlayerState => {
    fold()
    return { signedIn, signingIn, playing, volume, track: current(), liked: queue[index] ? liked.has(queue[index].id) : null, lists: [...lists] }
  }

  // The list a page of the preview plays from: a playlist's own, or the one a ranking's songs were made of.
  const songsOfId = (id: string): NeteaseSong[] => {
    const found = PLAYLISTS.find((each) => each.list.id === id)
    if (found) return found.songs
    return []
  }

  return {
    read,
    songs: (id) => songsOfId(id),
    home: () => previewHome(),
    library: () => previewLibrary(),
    recent: () => previewRecent(),
    search: (query) => previewSearch(query),
    artist: (id) => previewArtist(id),
    rankings: () => previewRankings(),
    ranking: (id) => previewRanking(id),
    profile: () => previewProfile(),
    play: (next) => {
      fold()
      playing = next
    },
    playPlaylist: (id) => {
      // A ranking's page plays the list its own songs were made of.
      const ranking = RANKINGS.find((each) => each.ranking.id === id)
      const found = PLAYLISTS.find((each) => each.list.id === id) ?? (ranking ? PLAYLISTS[ranking.playlist] : undefined)
      if (!found) return
      startAt(
        ranking ? previewRanking(id)?.songs ?? found.songs : found.songs,
        playableFrom(ranking ? previewRanking(id)?.songs ?? found.songs : found.songs, 0),
        ranking?.ranking.name ?? found.list.name,
      )
    },
    playSong: (id, song) => {
      if (!song.playable) return
      const ranking = RANKINGS.find((each) => each.ranking.id === id)
      const made = ranking ? previewRanking(id) : null
      const found = PLAYLISTS.find((each) => each.list.id === id) ?? (ranking ? PLAYLISTS[ranking.playlist] : undefined)
      if (!found) return
      const songs = made ? made.songs : found.songs
      const at = songs.findIndex((each) => each.id === song.id)
      startAt(songs, Math.max(0, at < 0 && made ? songs.findIndex((each) => each.title === song.title) : at), ranking?.ranking.name ?? found.list.name)
    },
    playHistory: (song) => {
      if (!song.playable) return
      const found = PLAYLISTS.find((each) => each.songs.some((made) => made.id === song.id))
      if (!found) return
      startAt(
        found.songs,
        Math.max(
          0,
          found.songs.findIndex((made) => made.id === song.id),
        ),
        found.list.name,
      )
    },
    setLiked: (id, now) => {
      if (now) liked.add(id)
      else liked.delete(id)
      return liked.has(id)
    },
    skip: (direction) => {
      fold()
      // Back within the song's first seconds: to the song before; later, to its start (as the cab's players do).
      if (direction === -1 && position > 3) {
        position = 0
        since = performance.now()
        return
      }
      const count = queue.length
      if (count === 0) return
      let next = index
      // NetEase's rights skip what it can't play: the next song that it can.
      for (let step = 0; step < count; step++) {
        next = (next + direction + count) % count
        if (queue[next]?.playable) break
      }
      if (!queue[next]?.playable) return
      index = next
      position = 0
      since = performance.now()
      playing = true
    },
    seek: (seconds) => {
      fold()
      const song = queue[index]
      position = Math.min(Math.max(0, seconds), song?.duration ?? 0)
    },
    setVolume: (share) => {
      volume = Math.min(1, Math.max(0, share))
    },
    refresh: () => {
      // The page read anew: the playlists' counts move on, and the first one comes to the end.
      lists = [...lists.slice(1), lists[0]].map((list, at) => ({
        ...list,
        playCount: list.playCount + (at + 1) * 173,
      }))
    },
  }
}
