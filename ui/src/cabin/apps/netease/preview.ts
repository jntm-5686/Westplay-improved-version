import type { NeteaseList, NeteasePlayerState, NeteaseSong, NeteaseTrack } from './netease'

/**
 * DEVELOPMENT PREVIEW: the invented player a plain browser gets, so the app's whole screen can be looked at
 * without WestPlay's host and NetEase's page running. Twelve recommended playlists, a song playing, and each
 * playlist's songs; the controls work (the preview's own queue, its own clock). Nothing here is anyone's real
 * music, and nothing here is anyone's real account.
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

function seedOf(text: string): number {
  return [...text].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % 9973, 7)
}

function songsOf(listIndex: number, name: string): NeteaseSong[] {
  const seed = seedOf(name)
  return Array.from({ length: 14 }, (_, index): NeteaseSong => {
    const pick = seed + index * 17
    const title = TITLES[pick % TITLES.length]
    return {
      id: `preview-${listIndex + 1}-${index + 1}`,
      title: index === 0 ? name : title,
      artist: ARTISTS[(seed + index * 7) % ARTISTS.length],
      duration: 174 + (pick % 11) * 17,
      // A few that the preview can't play, so the app's mark for them is there to see.
      playable: !(index === 5 || (index === 2 && listIndex % 3 === 1) || (listIndex % 4 === 2 && index === 9)),
    }
  })
}

const PLAYLISTS: PreviewPlaylist[] = NAMES.map(([name, playCount], index) => ({
  list: { id: `preview-list-${index + 1}`, name, cover: null, playCount },
  songs: songsOf(index, name),
}))

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
    album,
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
  play(playing: boolean): void
  playPlaylist(id: string): void
  playSong(id: string, song: NeteaseSong): void
  /** A song of the session's recent list (no playlist known): the playlist the preview made it in. */
  playHistory(song: NeteaseSong): void
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
    return { signedIn, signingIn, playing, volume, track: current(), lists: [...lists] }
  }

  return {
    read,
    songs: (id) => PLAYLISTS.find((each) => each.list.id === id)?.songs ?? [],
    play: (next) => {
      fold()
      playing = next
    },
    playPlaylist: (id) => {
      const found = PLAYLISTS.find((each) => each.list.id === id)
      if (!found) return
      startAt(found.songs, playableFrom(found.songs, 0), found.list.name)
    },
    playSong: (id, song) => {
      if (!song.playable) return
      const found = PLAYLISTS.find((each) => each.list.id === id)
      if (!found) return
      const at = found.songs.findIndex((each) => each.id === song.id)
      startAt(found.songs, Math.max(0, at), found.list.name)
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
