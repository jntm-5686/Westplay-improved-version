// WestPlay, in NetEase Cloud Music's web player (music.163.com, netease.rs): the official page, run hidden under
// the cab. The NetEase app the player sees is WestPlay's own (ui/src/cabin/apps/netease); this reads the page's
// player and its data, and plays through the page's own player.
//
// v3, the whole account read live from the page's own same-origin interface. Everything the app shows is
// `fetch('/api/…')` with the page's own session (its cookies): Home's 每日歌曲推荐, 私人雷达 and personalised
// playlists, My Music's playlists and 听歌排行, NetEase's rankings, the account's profile, a playlist's songs, a
// search's songs/artists/playlists and an artist's page. Nothing is navigated for any of it: the content frame stays
// where it is while the music plays (navigating rebuilds the page's player and loses its queue — the owner's "three
// songs in, and it sticks" — and the whole v3 data path is the interface, never a page). Only the shell's play bar is
// read as DOM (the song's name, artist, progress and the player's own buttons).
//
// Playing is the page's own player's way, and the page's own queue is used when there is one (owner: "never a song
// without sound", "switching songs must be smooth"): a song played from a list the app has read (a playlist's, a
// ranking's, the day's, the recent songs, a search's, an artist's) is that list handed to the page's own player
// (`player.addTo(tracks, clear, play)`, the call its own list pages make), rotated so the song asked for is the first
// of it — its next and previous then walk the list and its own preload runs inside it. A song with no list of the
// app's is played on its own (`nm.x.ceo2i('play', 18, <id>)`, what its own links call). Every command is watched
// from the moment it is sent, with a ladder that starts in about a second, shorter inside the page's own queue:
//   - its own queue started again / its own player's way again (1.2 s on its own, 0.7 s in a queue; a skip whose song
//     didn't even change presses its own button once more — never a burst of presses, never a skip two songs on);
//   - the song's own row's play where the content page happens to show it (its own queue kept), or its own play
//     button (2.4 s / 1.5 s);
//   - the hidden page loaded anew, the song played on as soon as this script is back (only when the sound really
//     can't come: 4 s / 3.2 s; the queue is lost, the sound isn't).
// A player that says it plays while its clock stands still ("silent playing": the app's screen moves on and nothing is
// heard) is caught the same way, within about 2.5 s, and taken into the same ladder. Every play says its timing (what
// was asked, how long its sound took, which rescue came, each step) to the host, for its log (`timing`).
//
// Messages to the host (netease.rs), over `chrome.webview.postMessage` as the other players':
//   { state: { signedIn, playing, volume, track, liked?, lists?, account?, audio? } }   what the page says of itself
//   { playlist: { id, name, songs: [{ id, title, artist, album?, duration, playable }], cover?, playCount?,
//                 trackCount?, updateFrequency?, creator?, description? } }   a playlist's (or a ranking's) songs
//   { home: { daily: { songs } | null, radar, personal, recommended } }   Home's day and its playlist shelves
//   { library: { groups: [{ title, count, playlists: [{ id, name, cover, playCount, songCount, by }] }] } }
//   { search: { query, songs, artists, playlists, songsTotal, artistsTotal, playlistsTotal } }
//   { artist: { id, name, alias, cover, description, songs } }   an artist's page asked for (openArtist)
//   { recent: { songs: [{ …, playCount? }] } }   the account's week's songs (听歌排行)
//   { rankings: { rankings: [{ id, name, cover, updateFrequency, trackCount, playCount, official }] } }
//   { profile: { uid, name, avatar, signature, level, listenSongs, follows, fans, playlistCount, createDays,
//                vipType, background } | null }   the account's own profile
//   { like: { id, liked, ok, reason } }   a like asked for, done (or not)
//   { timing: { action, sounding, steps, rescue?, reloading? } }   a play timed, with what its rescues did
//   { ready: true }   the page loaded (anew)
// and the host's to it: { action, value?, list? } — the app's own commands (netease.rs's Command), `refresh`, and the
// cab's (cab_sound.js: speakers, head, outside, menu, equalizer, spectrum).
//
// Every selector this script uses is in `S` below, and nowhere else: NetEase's page changes, that's what to fix.
;(() => {
  if (location.hostname !== 'music.163.com' || window.top !== window) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const now = () => performance.now()

  // --- The page's own structure: the selectors this script knows it by ----------------------------------------
  //
  // The shell's own page (`https://music.163.com/`): the play bar at the bottom (`#g_player`), the account at the top
  // right (`.m-tophead`), and the content's frame (`#g_iframe`, only for the one row a rescue plays from).
  const S = {
    // The content's document: a frame of the page's own, on the same origin (never navigated: data is the interface).
    frame: '#g_iframe',
    // The play bar, at the bottom of the shell's page.
    play: '#g_player .ply', // `pas` (and data-action="pause") while playing
    previous: '.m-playbar .prv',
    next: '.m-playbar .nxt',
    trackName: '.m-playbar .words .name', // <a href="/song?id=…" title="…">
    trackArtist: '.m-playbar .words .by',
    cover: '.m-playbar .head img',
    progress: '.m-pbar .barbg .cur', // its width: how far into the song
    progressTrack: '.m-pbar .barbg',
    time: '.m-pbar .time', // "01:23 / 04:32"
    // The account: the top bar's right side, filled by the page once it knows (the login link when signed out).
    account: '.m-tophead',
    login: '.m-tophead a[data-action="login"]',
    accountName: '.m-tophead a.name',
    accountAvatar: '.m-tophead .head img',
    // A song's row in the content page (a playlist's, or a ranking's) — read only when a rescue plays the song from
    // its own row (the page's own queue kept); never a navigation.
    rows: '.m-table tbody tr',
    rowPlay: '.hd .ply',
  }
  // How many of the day's, an artist's, the recent and the rankings' lists are read, and how long the interface's
  // own answers may take.
  const LIST_MOST = 12
  const DAILY_MOST = 100
  const ARTIST_MOST = 50
  const RECENT_MOST = 100
  const RANKINGS_MOST = 100
  const SONGS_MOST = 500
  const API_TIMEOUT = 8000
  const ACCOUNT_WAIT = 20000

  // --- Small readings of the page's own words -----------------------------------------------------------------

  const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const idOf = (href) => /[?&]id=(\d{1,20})(?:[&#]|$)/.exec(String(href ?? ''))?.[1] ?? null
  // A row's own `data-res-id` (a plain NetEase id, not an address with `?id=` in it).
  const dataId = (said) => {
    const found = /^(\d{1,20})$/.exec(String(said ?? '').trim())
    return found ? found[1] : null
  }
  // A cover as the app shows it: on NetEase's own image hosts (https: the page's addresses come as http), at a size
  // the cab's cards show.
  const wide = (url, size = '300y300') => {
    if (!url) return null
    try {
      const address = new URL(url, location.href)
      if (address.protocol !== 'https:' && address.protocol !== 'http:') return null
      if (!/(^|\.)126\.net$/.test(address.hostname)) return null
      address.protocol = 'https:'
      address.search = `param=${size}`
      return address.href
    } catch {
      return null
    }
  }
  // How far the page's own play bar says the song is, in seconds (NaN when it isn't readable): the clock the
  // self-heal watches (a page's player can say it plays while its sound never moves).
  const barSeconds = () => {
    const said = text(document.querySelector(S.time))
    const match = /(\d{1,3}):(\d{2})/.exec(said)
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
  }
  const clock = (said) => {
    const found = /(?:(\d{1,3}):(\d{2}))?\s*\/\s*(\d{1,3}):(\d{2})/.exec(said ?? '')
    if (found) {
      return { position: Number(found[1] ?? 0) * 60 + Number(found[2] ?? 0), duration: Number(found[3]) * 60 + Number(found[4]) }
    }
    const alone = /^(\d{1,3}):(\d{2})$/.exec((said ?? '').trim())
    return alone ? { position: Number(alone[1]) * 60 + Number(alone[2]), duration: 0 } : null
  }

  // --- The page's own interface, as its own pages ask it -------------------------------------------------------
  //
  // Everything the app shows comes from here (its own session, its own JSON): no page is ever navigated for data.
  const api = async (path) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT)
    try {
      const response = await fetch(path, { credentials: 'same-origin', signal: controller.signal })
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  const apiPost = async (path, body) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT)
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
        signal: controller.signal,
      })
      const answer = await response.json().catch(() => null)
      return { ok: response.ok, status: response.status, answer }
    } catch {
      return { ok: false, status: 0, answer: null }
    } finally {
      clearTimeout(timer)
    }
  }
  // The songs the app has seen, by id (its own album, cover and length, for the play bar, which has none of them).
  const knownSongs = new Map()
  const rememberSong = (song) => {
    if (!song?.id) return
    const before = knownSongs.get(song.id)
    knownSongs.set(song.id, {
      album: song.album || before?.album || '',
      cover: song.cover || before?.cover || null,
      duration: song.duration || before?.duration || 0,
      playable: song.playable ?? before?.playable ?? true,
    })
    if (knownSongs.size > 3000) knownSongs.delete(knownSongs.keys().next().value)
  }
  // The page's own player's queue: the song objects its own `player.addTo` takes (built from the answers the app has
  // read, in that answer's own shape), and the lists those came from. A play from a list is then the page's own queue
  // started where it's told — its next and previous walk that list, and it preloads within it.
  const pageTracks = new Map()
  const rememberPageTrack = (song) => {
    if (!song?.id) return
    const id = String(song.id)
    const artists = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : []
    const album = song.al ?? song.album ?? null
    if (artists.length === 0 && !album) return
    pageTracks.set(id, {
      id: Number(id) || id,
      name: String(song.name ?? ''),
      title: String(song.name ?? ''),
      duration: Number(song.dt ?? song.duration) || 0,
      album: { id: Number(album?.id) || 0, name: String(album?.name ?? ''), picUrl: album?.picUrl ?? '' },
      artists: artists.map((artist) => ({ id: Number(artist?.id) || 0, name: String(artist?.name ?? '') })),
      alias: Array.isArray(song.alia) ? song.alia : [],
      commentThreadId: `R_SO_4_${id}`,
      copyrightId: Number(song.cp) || 0,
      mvid: Number(song.mv) || 0,
      cd: song.cd,
      position: Number(song.no) || 0,
      ringtone: song.rt,
      rtUrl: song.rtUrl,
      status: Number(song.st ?? song.status) || 0,
      pstatus: Number(song.pst) || 0,
      fee: Number(song.fee) || 0,
      version: Number(song.v) || 0,
      songType: Number(song.t) || 0,
      mst: song.mst,
      score: Number(song.pop) || 0,
      ftype: song.ftype,
      rtUrls: song.rtUrls,
      transNames: song.tns,
      privilege: song.privilege,
    })
    if (pageTracks.size > 4000) pageTracks.delete(pageTracks.keys().next().value)
  }
  const pageTrackOf = (song) => {
    if (!song?.id) return null
    const id = String(song.id)
    const known = pageTracks.get(id)
    if (known) return known
    const artists = String(song.artist ?? '')
      .split('/')
      .map((name) => name.trim())
      .filter(Boolean)
    const cover = knownSongs.get(id)?.cover ?? null
    const track = {
      id: Number(id) || id,
      name: String(song.title ?? ''),
      title: String(song.title ?? ''),
      duration: Math.round((Number(song.duration) || 0) * 1000),
      album: { id: 0, name: String(song.album ?? ''), picUrl: cover ?? '' },
      artists: artists.map((name) => ({ id: 0, name })),
      alias: [],
      commentThreadId: `R_SO_4_${id}`,
      status: 0,
      pstatus: 0,
      fee: 0,
      version: 0,
      songType: 0,
      score: 0,
      mst: 0,
      ftype: 0,
      rtUrls: [],
      // No privilege the page's own playability test reads as "not playable": the app has already left such a song
      // out of the list it plays.
      privilege: { id: Number(id) || id, st: 0, fee: 0, payed: 1, pl: 999000, dl: 999000, flag: 0, toast: false },
    }
    if (track.duration <= 0) return null
    pageTracks.set(id, track)
    if (pageTracks.size > 4000) pageTracks.delete(pageTracks.keys().next().value)
    return track
  }
  // The lists the app has read, newest last, by the page's own key (a playlist's id, "daily", "recent", "search",
  // "artist:<id>"): a song played from one of them is played with the page's own queue made of it.
  const contexts = new Map()
  const rememberContext = (key, songs) => {
    if (!key || !Array.isArray(songs) || songs.length === 0) return
    contexts.delete(key)
    contexts.set(key, songs)
    while (contexts.size > 8) contexts.delete(contexts.keys().next().value)
  }
  // The list a play is to be made from: the one it named, or the most recently read one that has the song (its own
  // order is what the page's next and previous then walk).
  const contextFor = (list, id) => {
    if (list && contexts.has(list)) {
      const songs = contexts.get(list)
      if (!id || songs.some((song) => String(song.id) === String(id))) return { key: list, songs }
    }
    if (!id) return null
    let found = null
    for (const [key, songs] of contexts) {
      if (songs.some((song) => String(song.id) === String(id))) found = { key, songs }
    }
    return found
  }
  // A song as the page's own answers say it: its id, name, artists (joined as its pages show them), length (its
  // answers' milliseconds), album and cover, and whether the account's own rights let it play (`st` below 0: not; a
  // fee of 4 or 8 without a privilege is an album's to buy).
  const songOf = (song) => {
    if (!song?.id || !song?.name) return null
    const artists = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : []
    const album = song.al ?? song.album ?? null
    const privilege = song.privilege
    const right = song.st !== undefined ? Number(song.st) : privilege ? Number(privilege.st ?? 0) : null
    const read = {
      id: String(song.id),
      title: String(song.name),
      artist: artists.map((artist) => artist?.name).filter(Boolean).join('/'),
      duration: Math.round((Number(song.dt ?? song.duration) || 0) / 1000),
      playable: (right !== null ? right >= 0 : Number(song.fee ?? 0) < 4) && !song.noCopyrightRcmd,
      album: album?.name ? String(album.name) : '',
      cover: wide(album?.picUrl ?? null),
    }
    rememberSong(read)
    rememberPageTrack(song)
    return read
  }
  // A song as the app's own messages carry it: its album left out when the answer had none (never an empty field).
  const songOut = ({ cover, ...song }) => (song.album ? song : { ...song, album: undefined })
  // A playlist as the page's own cards say it.
  const playlistOf = (list) => {
    if (!list?.id || !list?.name) return null
    return {
      id: String(list.id),
      name: String(list.name),
      cover: wide(list.picUrl ?? list.coverImgUrl),
      playCount: Math.round(Number(list.playcount ?? list.playCount) || 0),
    }
  }
  // Songs by their ids, as the page's own song detail gives them (each with its rights and its full privilege, for the
  // page's own player's queue too), in batches of 200 (its own interface's size).
  const songsByIds = async (ids) => {
    const wanted = [...new Set(ids.map(String).filter((id) => /^\d{1,20}$/.test(id)))]
    const songs = []
    for (let at = 0; at < wanted.length; at += 200) {
      const batch = wanted.slice(at, at + 200)
      const { answer } = await apiPost(
        '/api/v3/song/detail',
        `c=${encodeURIComponent(JSON.stringify(batch.map((id) => ({ id: Number(id) }))))}`,
      )
      const privileges = new Map((Array.isArray(answer?.privileges) ? answer.privileges : []).map((one) => [String(one.id), one]))
      for (const song of Array.isArray(answer?.songs) ? answer.songs : []) {
        const privilege = privileges.get(String(song.id))
        const read = songOf(privilege ? { ...song, st: Number(privilege.st), privilege } : song)
        if (read) songs.push(read)
      }
    }
    return songs
  }

  // --- The player's own audio element -------------------------------------------------------------------------
  //
  // The page makes it itself (it may never be in the document): kept as it plays or as its keys are given to it, for
  // the speakers (cab_sound.js), the volume the app sets, and the play watcher's own clock.
  const media = new Set()
  let wantedVolume = null
  // The newest element the page plays (a rescue may start a second one while the first it did not hear stays behind).
  const playingNow = () => {
    const all = [...media]
    return all.filter((element) => !element.paused && !element.ended).at(-1) ?? all.at(-1) ?? null
  }
  const take = (element) => {
    if (!(element instanceof HTMLMediaElement)) return
    media.add(element)
    // The volume the app set, as the page gives its own back on a new song: the app's, not the page's own.
    if (wantedVolume !== null) element.volume = wantedVolume
  }
  const mediaPlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...args) {
    take(this)
    return mediaPlay.apply(this, args)
  }
  const setMediaKeys = HTMLMediaElement.prototype.setMediaKeys
  HTMLMediaElement.prototype.setMediaKeys = function (...args) {
    take(this)
    return setMediaKeys.apply(this, args)
  }
  for (const name of ['playing', 'loadedmetadata']) addEventListener(name, (event) => take(event.target), true)
  // The app's own commands, at once as the page says it: the app's scene shows the state as it is (the 1 s reading is
  // for the rest).
  for (const name of ['play', 'pause', 'ended', 'volumechange']) addEventListener(name, () => tell(), true)
  // How loud it is through the speakers, each ear (and the limiter's cut), for the live test (netease.rs).
  const volume = () => wantedVolume ?? playingNow()?.volume ?? 0.8
  const setVolume = (value) => {
    wantedVolume = Math.min(1, Math.max(0, Number(value) || 0))
    for (const element of media) element.volume = wantedVolume
  }
  // The sound's own element now: the newest one playing, else the last it made (it may not be in the document).
  const soundingNow = () => {
    const all = [...media]
    return all.filter((element) => !element.paused && !element.ended).at(-1) ?? all.at(-1) ?? null
  }
  // What that element says now: the timing report's own facts (never its address).
  const elementState = () => {
    const element = soundingNow()
    if (!element) return null
    return {
      paused: Boolean(element.paused),
      at: Number.isFinite(element.currentTime) ? Math.round(element.currentTime * 10) / 10 : null,
      duration: Number.isFinite(element.duration) ? Math.round(element.duration) : null,
      ready: element.readyState,
    }
  }
  // What the page's own player is doing, for the host's log when the two disagree (the play bar says playing while
  // no sound element is: the app's screen moves on and nothing is heard).
  const audioState = () => {
    const all = [...media]
    const playing = all.filter((element) => !element.paused && !element.ended).at(-1) ?? null
    const element = playing ?? all.at(-1) ?? null
    return {
      elements: all.length,
      playing: Boolean(playing),
      paused: element ? element.paused : null,
      at: element && Number.isFinite(element.currentTime) ? Math.round(element.currentTime) : null,
    }
  }

  // --- What the page says of the player -----------------------------------------------------------------------

  // Whether it's playing: its own play/pause button says so (`pas`, and `data-action="pause"`, while playing).
  const isPlaying = () => {
    const button = document.querySelector(S.play)
    return Boolean(button && (button.classList.contains('pas') || button.dataset.action === 'pause'))
  }
  // Signed in (`true`), signed out (`false`), or not said yet (`null`: the page still loading its account). The
  // page's own account not there a while after it loaded (its own request for it failed): signed out, so the app is
  // never left without a state (a sign-in then works as usual).
  const started = Date.now()
  const signedIn = () => {
    const head = document.querySelector(S.account)
    if (head) {
      if (head.querySelector('[data-action="logout"], a.name, .head img')) return true
      if (document.querySelector(S.login)) return false
    }
    return Date.now() - started > ACCOUNT_WAIT ? false : null
  }
  // The account, as the page's top bar says it (`null` while it shows none). The picture asked for at a size the
  // cab's rail shows, not the page's own 30 pixels.
  const account = () => {
    const name = text(document.querySelector(S.accountName))
    const avatar = document.querySelector(S.accountAvatar)?.getAttribute('src') ?? null
    if (!name && !avatar) return null
    return { name, avatar: wide(avatar, '140y140') }
  }
  // The account's own user id, from its name's address in the top bar (`/user/home?id=…`): the page's own lists that
  // are by the account ask it, and nothing of the account leaves the page but what the app shows.
  const uidOf = () => idOf(document.querySelector(S.accountName)?.getAttribute('href'))
  // The song the play bar shows: its own address's id.
  const trackId = () => idOf(document.querySelector(S.trackName)?.getAttribute('href'))
  const track = () => {
    const name = document.querySelector(S.trackName)
    const title = name?.getAttribute('title') || text(name) || ''
    if (!title) return null
    const id = idOf(name.getAttribute('href')) ?? ''
    const known = id ? knownSongs.get(id) : null
    const time = clock(text(document.querySelector(S.time)))
    const width = parseFloat(document.querySelector(S.progress)?.style.width) || 0
    const duration = time?.duration || known?.duration || 0
    // Where it is: the sound's own clock while it plays (finer than the bar's), else the bar's own.
    const element = soundingNow()
    const position =
      element && !element.paused && Number.isFinite(element.currentTime)
        ? element.currentTime
        : duration > 0
          ? (duration * Math.min(100, width)) / 100
          : (time?.position ?? 0)
    return {
      id,
      title,
      artist: text(document.querySelector(S.trackArtist)),
      album: known?.album ?? '',
      cover: known?.cover ?? wide(document.querySelector(S.cover)?.getAttribute('src')),
      duration,
      position: Math.round(position * 10) / 10,
      playable: true,
    }
  }
  // The playing song's own album and cover, asked of the page's own interface the first time it plays (the play bar
  // has neither): the app's state says them a moment after the song starts.
  const detailAsked = new Set()
  const learnCurrent = () => {
    const id = trackId()
    if (!id || knownSongs.has(id) || detailAsked.has(id)) return
    detailAsked.add(id)
    songsByIds([id]).then((songs) => {
      if (songs[0]) {
        rememberSong(songs[0])
        tell(true)
      }
    })
  }

  // --- Playing: the page's own player, its own queue, watched from the first moment ---------------------------
  //
  // A song is played two ways, both the page's own (no page opened, no row clicked):
  //   - from a list the app has read: the page's own player is handed that list as its queue (`player.addTo(tracks,
  //     clear, play)`, the call its own list pages make), rotated so the song asked for is the first of it. Its own
  //     next and previous then walk the list, and its own preload runs inside it: a switch sounds in ~0.1-0.4 s
  //     (measured on the owner's own page, 2026-11-19), where a single song loaded afresh took ~0.2-0.5 s and its
  //     next couldn't know the list;
  //   - on its own (`nm.x.ceo2i('play', 18, <id>)`, what its own links call) when no list of the app's has the song.
  //
  // Each command is watched every 50 ms from the moment it is sent; a song that doesn't sound is rescued at once (owner:
  // "never a song without sound", "switching songs must be smooth"; Spotify's bridge recovers in 10 s, far too late).
  // The ladder is shorter inside the page's own queue than for a song loaded on its own, because the queue's switch is
  // the page's own. Each step, its moment and what the player's element said then go to the host in the timing report,
  // whose `sounding` is the command-to-sound time it was asked for.
  const LADDER = {
    // A song loaded on its own: its own stream and its own data, the way its own links play a single song.
    single: { one: 1200, two: 2400, three: 4000 },
    // A play or a skip inside the page's own queue: the page has the list and its preload, so a normal switch sounds
    // well under a second; anything slower is rescued earlier.
    queue: { one: 700, two: 1500, three: 3200 },
  }
  const playerOf = () => {
    try {
      return window.nm?.x?.ceo2i
    } catch {
      return null
    }
  }
  const playByPlayer = (id) => {
    const play = playerOf()
    if (typeof play !== 'function' || !id) return false
    try {
      play('play', 18, Number(id) || id)
      return true
    } catch {
      return false
    }
  }
  // The page's own player object, whose queue `addTo` sets (the shell's player, the same its own list pages call).
  const pagePlayer = () => {
    try {
      return window.player ?? null
    } catch {
      return null
    }
  }
  const click = (selector) => {
    const button = document.querySelector(selector)
    button?.click()
    return Boolean(button)
  }
  const frameDocument = () => {
    try {
      return document.querySelector(S.frame)?.contentDocument ?? null
    } catch {
      // A frame of another origin (never NetEase's own): nothing of it is read.
      return null
    }
  }
  // The song's own row in the content page, when the page happens to show it (a playlist's or a ranking's page).
  const rowOf = (id) => {
    const doc = frameDocument()
    if (!id || !doc) return null
    return (
      [...doc.querySelectorAll(S.rows)].find((row) => dataId(row.querySelector(S.rowPlay)?.getAttribute('data-res-id')) === String(id)) ??
      null
    )
  }
  const RELOAD_KEY = 'westplay.netease.reload-play'
  const WATCH_STEP = 50
  // The page's own queue as this script set it: its list's own order from the song asked for, and where in it the
  // page's player now is (for its next and previous).
  let queue = { list: null, ids: [], index: -1, expected: null }
  const queueDuration = (id) => knownSongs.get(String(id ?? ''))?.duration || null
  const watch = {
    timer: null,
    action: null,
    id: null,
    expectedId: null,
    duration: null,
    ladder: LADDER.single,
    queue: false,
    queueStart: null,
    startKey: '',
    trackChanged: false,
    since: 0,
    steps: [],
    level: 0,
    lastAt: null,
    lastBar: null,
    trackKey: '',
    stopped: true,
  }
  const stepLine = (what) => {
    if (watch.steps.length < 60) watch.steps.push(`${what}@${Math.round(now() - watch.since)}ms`)
  }
  const stopWatch = () => {
    clearInterval(watch.timer)
    watch.timer = null
    watch.stopped = true
  }
  const sayTiming = (sounding, extra = {}) =>
    post({ timing: { action: watch.action, sounding, steps: watch.steps.join(', '), ...extra } })
  // The page's own queue handed to its own player: the list rotated so the song asked for is the first of it.
  const addQueue = (context, at) => {
    const player = pagePlayer()
    if (!player || typeof player.addTo !== 'function' || !context?.songs || context.songs.length < 2) return false
    const index = Math.max(0, Number(at) || 0)
    const ordered = context.songs.slice(index).concat(context.songs.slice(0, index))
    const tracks = ordered.map(pageTrackOf).filter(Boolean)
    if (tracks.length < 2) return false
    try {
      player.addTo(JSON.parse(JSON.stringify(tracks)), true, true)
    } catch {
      return false
    }
    queue = { list: context.key, ids: ordered.map((song) => String(song.id)), index: 0, expected: String(ordered[0].id) }
    return true
  }
  // A rescue, one level at a time (`level`: 1, 2 or 3): each says its own moment and the player's own state then.
  const rescue = (level) => {
    watch.level = level
    const state = elementState()
    const facts = state ? JSON.stringify(state) : 'no-element'
    const currentId = trackId() ?? watch.id
    if (level === 1) {
      stepLine(`rescue1 play-again ${facts}`)
      if (watch.action === 'next' || watch.action === 'previous') {
        // A skip: its own button once more only when the song didn't change at all (that press was lost); otherwise
        // its own player plays the song it moved to.
        if (!watch.trackChanged) click(watch.action === 'next' ? S.next : S.previous)
        else if (currentId) playByPlayer(currentId)
        stepLine(watch.trackChanged ? `rescue1 play ${currentId}` : 'rescue1 button')
      } else if (watch.queueStart && addQueue(watch.queueStart.context, watch.queueStart.at)) {
        // A queue play again: the page's own queue from the same song (its own next/previous kept).
        tell(true)
        stepLine('rescue1 queue')
      } else if (watch.id) {
        playByPlayer(watch.id)
      } else if (currentId) {
        playByPlayer(currentId)
      }
      sayTiming(null, { rescue: 1 })
      return
    }
    if (level === 2) {
      stepLine(`rescue2 row-or-button ${facts}`)
      const row = rowOf(currentId)
      if (row) {
        row.querySelector(S.rowPlay)?.click()
        stepLine('rescue2 row')
      } else if (!isPlaying() && click(S.play)) {
        stepLine('rescue2 button')
      } else if (currentId) {
        playByPlayer(currentId)
        stepLine('rescue2 player')
      }
      sayTiming(null, { rescue: 2 })
      return
    }
    // The page loaded anew: the song played on once this script runs again and the page is up.
    stepLine(`rescue3 reload ${facts}`)
    try {
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ id: watch.id ?? currentId, at: Date.now() }))
    } catch {
      // Storage blocked: the reload happens, the song isn't played on (the app's own play is still there).
    }
    sayTiming(null, { rescue: 3, reloading: true })
    stopWatch()
    location.reload()
  }
  // A play watched, from the moment its command is sent: the sound's own clock moving for the song asked is the
  // normal way (the took it says); a song without sound enters the ladder at the times of its own kind (the queue's
  // shorter than a single song's).
  const timePlay = (action, options = {}) => {
    stopWatch()
    Object.assign(watch, {
      action,
      id: options.id ?? null,
      expectedId: options.expectedId ?? null,
      duration: options.duration ?? null,
      ladder: options.ladder ?? (options.queue ? LADDER.queue : LADDER.single),
      queue: Boolean(options.queue),
      queueStart: options.queueStart ?? null,
      startKey: String(trackId() ?? ''),
      trackChanged: false,
      since: now(),
      steps: [],
      level: 0,
      lastAt: null,
      lastBar: barSeconds(),
      trackKey: String(trackId() ?? ''),
      stopped: false,
    })
    const before = elementState()
    if (before) stepLine(`before ${JSON.stringify(before)}`)
    if (options.immediate) rescue(1)
    watch.timer = setInterval(() => {
      if (watch.stopped) return
      const took = Math.round(now() - watch.since)
      const state = elementState()
      const current = track()
      const key = String(current?.id ?? current?.title ?? '')
      if (key !== watch.trackKey) {
        watch.trackKey = key
        watch.lastAt = null
        watch.lastBar = barSeconds()
        if (key && key !== watch.startKey) watch.trackChanged = true
        stepLine(`track ${key}`)
      }
      const at = state && !state.paused && Number.isFinite(state.at) ? state.at : null
      const bar = barSeconds()
      let moving = false
      if (at !== null) {
        if (watch.lastAt !== null && at > watch.lastAt + 0.05) moving = true
        watch.lastAt = at
      } else if (Number.isFinite(bar)) {
        if (watch.lastBar !== null && bar > watch.lastBar) moving = true
        watch.lastBar = bar
      }
      // The sound of the song asked for: the element's own length says so too (an element left behind by the song
      // before it isn't it).
      const lengthOk = !watch.duration || !state || state.duration === null || Math.abs(state.duration - watch.duration) <= 2
      const ours =
        watch.action === 'resume' || watch.action === 'heal'
          ? true
          : watch.action === 'next' || watch.action === 'previous'
            ? watch.expectedId
              ? key === String(watch.expectedId)
              : watch.trackChanged
            : !watch.id || key === String(watch.id)
      if (moving && ours && lengthOk) {
        stopWatch()
        stepLine(`sounding ${took}ms`)
        if (watch.queue && key && queue.ids.includes(key)) queue.index = queue.ids.indexOf(key)
        if (key) queue.expected = key
        sayTiming(took, watch.level ? { rescue: watch.level } : {})
        return
      }
      if (took >= watch.ladder.three) {
        // The ladder's own end without a sound: the page loaded anew (the last rescue), and this watch is done.
        if (watch.level < 3) rescue(3)
        stopWatch()
        return
      }
      if (took >= watch.ladder.two && watch.level < 2) rescue(2)
      else if (took >= watch.ladder.one && watch.level < 1) rescue(1)
    }, WATCH_STEP)
  }
  // The page's own queue started from a list's song: its own player starts it, its next/previous then walk the list
  // and it preloads within it. The app's own state moves at once (the page's own bar does), while the sound follows.
  const startQueue = (context, at) => {
    if (!addQueue(context, at)) return false
    tell(true)
    timePlay('play', {
      id: queue.ids[0],
      duration: queueDuration(queue.ids[0]),
      queue: true,
      queueStart: { context, at: Math.max(0, Number(at) || 0) },
    })
    return true
  }
  // A song played: the page's own queue when the app has read the list it's from, its own player when it hasn't.
  const playSong = (id, list = null) => {
    const wanted = String(id ?? '')
    if (!wanted) return false
    const context = contextFor(list, wanted)
    const at = context ? context.songs.findIndex((song) => String(song.id) === wanted) : -1
    if (context && at >= 0 && startQueue(context, at)) return true
    if (!playByPlayer(wanted)) return false
    queue = { list: null, ids: [], index: -1, expected: null }
    timePlay('play', { id: wanted, duration: queueDuration(wanted) })
    // The app's own state at once (the page's own bar takes a moment to show the new song).
    setTimeout(() => tell(true), 120)
    return true
  }
  // Playing on: its own play button when its own state says it's paused; a player that says it plays while its sound
  // doesn't is taken into the watch's own ladder at once (its own player's way, not its button's: a button would pause
  // what the ladder just started).
  const resume = () => {
    const playing = isPlaying()
    const sounding = Boolean(audioState().playing)
    if (playing && sounding) return false
    timePlay('resume', { id: trackId(), duration: queueDuration(trackId()), immediate: playing && !sounding })
    if (!playing) click(S.play)
    return true
  }
  // Paused: its own play button, only when its own state says it plays.
  const pause = () => {
    if (!isPlaying()) return false
    return click(S.play)
  }
  // Its own next and previous buttons, each watched from the press: inside the page's own queue the song that comes is
  // known (the list's next), so a switch that doesn't sound is rescued at once.
  const skip = (direction) => {
    const before = String(trackId() ?? '')
    const queued = queue.ids.length > 1 && queue.ids.includes(before)
    const index = queued ? queue.ids.indexOf(before) : -1
    const expected = index >= 0 ? queue.ids[(index + direction + queue.ids.length) % queue.ids.length] : null
    const pressed = click(direction > 0 ? S.next : S.previous)
    if (pressed) {
      timePlay(direction > 0 ? 'next' : 'previous', {
        expectedId: expected,
        duration: expected ? queueDuration(expected) : null,
        queue: queued,
      })
      // The app's own state at once (the page's own bar does move at the press).
      setTimeout(() => tell(true), 60)
    }
    return pressed
  }
  // The page's progress bar, dragged as the mouse drags it: from where it is to `to` seconds in.
  const seek = (to) => {
    const bar = document.querySelector(S.progressTrack)
    if (!bar) return
    const time = clock(text(document.querySelector(S.time)))
    const duration = time?.duration || soundingNow()?.duration || 0
    if (!(duration > 0)) return
    const share = Math.min(1, Math.max(0, Number(to) / duration))
    const box = bar.getBoundingClientRect()
    const mouse = (type, target, clientX, clientY) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }))
    mouse('mousedown', bar, box.left + box.width * share, box.top + box.height / 2)
    mouse('mousemove', document, box.left + box.width * share, box.top + box.height / 2)
    mouse('mouseup', document, box.left + box.width * share, box.top + box.height / 2)
  }

  // --- The data: the page's own interface, answered as the app's messages --------------------------------------

  // A playlist's (or a ranking's) songs, its own detail by its id (name, track ids and own head), the songs then
  // asked for by their ids (each with the account's rights). "daily" is the day's own songs, not a playlist's.
  const answerPlaylist = async (id, ranking = false) => {
    if (id === 'daily') {
      const songs = await dailySongs()
      rememberContext('daily', songs)
      return post({ playlist: { id, name: '每日歌曲推荐', songs: songs.map(songOut) } })
    }
    const detail = await api(`/api/v1/playlist/detail?id=${encodeURIComponent(id)}`)
    const playlist = detail?.playlist
    if (!playlist) return post({ playlist: { id, name: '', songs: [] } })
    const ids = (Array.isArray(playlist.trackIds) ? playlist.trackIds : []).map((each) => String(each.id))
    const songs = await songsByIds(ids.slice(0, SONGS_MOST))
    // The list as the page's own queue, kept for the plays from it.
    rememberContext(String(id), songs)
    const meta = ranking ? await rankingMeta(id) : null
    post({
      playlist: {
        id,
        name: String(playlist.name ?? ''),
        cover: wide(playlist.coverImgUrl),
        playCount: Math.round(Number(playlist.playCount) || 0),
        trackCount: Math.max(0, Math.round(Number(playlist.trackCount) || ids.length)),
        updateFrequency: String(meta?.updateFrequency ?? playlist.updateFrequency ?? ''),
        creator: String(playlist.creator?.nickname ?? ''),
        description: String(playlist.description ?? '').slice(0, 400),
        songs: songs.map(songOut),
      },
    })
  }
  // A ranking's own card from NetEase's rankings list (its update frequency isn't in a playlist's own detail): the
  // list once read is kept, and asked for when it isn't.
  let rankingsCache = []
  const rankingMeta = async (id) => {
    if (rankingsCache.length === 0) {
      const answer = await api('/api/toplist')
      rankingsCache = rankingsOf(answer)
    }
    return rankingsCache.find((one) => one.id === String(id)) ?? null
  }
  const rankingsOf = (answer) => {
    const list = Array.isArray(answer?.list) ? answer.list : []
    const rankings = []
    for (const one of list) {
      if (!one?.id || !one?.name) continue
      const id = String(one.id)
      if (rankings.some((each) => each.id === id)) continue
      rankings.push({
        id,
        name: String(one.name),
        cover: wide(one.coverImgUrl),
        updateFrequency: String(one.updateFrequency ?? ''),
        trackCount: Math.max(0, Math.round(Number(one.trackCount) || 0)),
        playCount: Math.max(0, Math.round(Number(one.playCount) || 0)),
        official: Boolean(one.ToplistType),
      })
      if (rankings.length >= RANKINGS_MOST) break
    }
    return rankings
  }
  // NetEase's own rankings list (`rankings`).
  const answerRankings = async () => {
    let answer = await api('/api/toplist')
    if (!answer?.list) answer = await api('/api/toplist/detail')
    rankingsCache = rankingsOf(answer)
    post({ rankings: { rankings: rankingsCache } })
  }

  // Home: the day's own songs (每日歌曲推荐), the account's cards (私人雷达 and its own recommended playlists) and the
  // page's recommended ones — the page's own interface, no account needed for the recommended ones.
  const RADAR_ID = '3136952023'
  const dailySongs = async () => {
    const answer = await api('/api/v1/discovery/recommend/songs')
    const rows = Array.isArray(answer?.data?.dailySongs) ? answer.data.dailySongs : Array.isArray(answer?.recommend) ? answer.recommend : []
    return rows.map(songOf).filter(Boolean).slice(0, DAILY_MOST)
  }
  // The recommended playlists last answered to the state's own v1 list (the app's old shelf, kept for compatibility).
  let recommendedLists = []
  const answerHome = async () => {
    const [own, cards] = await Promise.all([
      api('/api/v1/discovery/recommend/resource'),
      api(`/api/personalized/playlist?limit=${LIST_MOST}`),
    ])
    const recommend = Array.isArray(own?.recommend) ? own.recommend : []
    const radarCard = recommend.find((item) => String(item.id) === RADAR_ID) ?? null
    const radar = radarCard ? playlistOf(radarCard) : null
    const personal = recommend
      .filter((item) => String(item.id) !== RADAR_ID)
      .map(playlistOf)
      .filter(Boolean)
      .slice(0, LIST_MOST)
    const recommended = (Array.isArray(cards?.result) ? cards.result : [])
      .filter((item) => Number(item?.type) === 0)
      .map(playlistOf)
      .filter(Boolean)
      .filter((list) => !personal.some((each) => each.id === list.id))
      .slice(0, LIST_MOST)
    recommendedLists = recommended
    // Its cards are known before its day's songs: the app draws them, and its day's page comes with them.
    post({ home: { radar, personal, recommended, daily: null } })
    const daily = await dailySongs()
    rememberContext('daily', daily)
    post({ home: { radar, personal, recommended, daily: { songs: daily.map(songOut) } } })
  }

  // My Music's own playlists, by group (创建的歌单, 收藏的歌单): its user's own interface in one answer, the groups made
  // from who made each (the account, or another for one collected). Its 我喜欢的音乐 (specialType 5) is the liked
  // state's own list, kept here for that.
  let likedPlaylistId = null
  const findLikedPlaylist = (lists) => {
    const liked =
      lists.find((list) => Number(list.specialType) === 5) ??
      lists.find((list) => list?.id && /喜欢的音乐$/.test(String(list.name ?? '')))
    if (liked?.id) likedPlaylistId = String(liked.id)
    return liked
  }
  const answerLibrary = async () => {
    const uid = uidOf()
    if (!uid) return post({ library: { groups: [] } })
    const own = await api(`/api/user/playlist?uid=${encodeURIComponent(uid)}&limit=100&offset=0`)
    const lists = Array.isArray(own?.playlist) ? own.playlist : []
    findLikedPlaylist(lists)
    const cards = lists
      .filter((list) => list?.id && list?.name)
      .map((list) => ({
        id: String(list.id),
        name: String(list.name),
        cover: wide(list.coverImgUrl),
        playCount: Math.round(Number(list.playCount) || 0),
        songCount: Math.max(0, Math.round(Number(list.trackCount) || 0)),
        by: String(list.creator?.nickname ?? ''),
        owned: String(list.creator?.userId ?? '') === String(uid),
      }))
    const group = (title, picked) => ({ title, count: picked.length, playlists: picked.map(({ owned, ...rest }) => rest) })
    const created = cards.filter((list) => list.owned)
    const collected = cards.filter((list) => !list.owned)
    const groups = []
    if (created.length > 0) groups.push(group('创建的歌单', created))
    if (collected.length > 0) groups.push(group('收藏的歌单', collected))
    post({ library: { groups } })
  }

  // A search: the page's own interface, its three kinds the app shows — its songs (单曲), its artists (歌手) and its
  // playlists (歌单), each with its page's own count. The last search asked is the only one answered (a newer one
  // takes over).
  const SEARCH_KINDS = { songs: 1, artists: 100, playlists: 1000 }
  let searchAsked = 0
  const searchKind = async (query, type) => {
    const limit = type === SEARCH_KINDS.songs ? 60 : 30
    const answer = await api(`/api/search/get?s=${encodeURIComponent(query)}&type=${type}&limit=${limit}&offset=0`)
    return answer?.result ?? null
  }
  const answerSearch = async (query) => {
    const said = String(query ?? '').trim().slice(0, 60)
    const token = ++searchAsked
    const answer = { search: { query: said, songs: [], artists: [], playlists: [], songsTotal: 0, artistsTotal: 0, playlistsTotal: 0 } }
    if (!said) return post(answer)
    const [songResults, artistResults, playlistResults] = await Promise.all([
      searchKind(said, SEARCH_KINDS.songs),
      searchKind(said, SEARCH_KINDS.artists),
      searchKind(said, SEARCH_KINDS.playlists),
    ])
    if (token !== searchAsked) return
    const raw = Array.isArray(songResults?.songs) ? songResults.songs : []
    // Its search's answer has no rights: its own song detail has each one's `st`.
    const details = await songsByIds(raw.map((song) => song.id))
    if (token !== searchAsked) return
    const known = new Map(details.map((song) => [song.id, song]))
    const found = raw
      .map((song) => known.get(String(song.id)) ?? songOf(song))
      .filter(Boolean)
      .slice(0, 60)
    rememberContext('search', found)
    answer.search.songs = found.map(songOut)
    answer.search.songsTotal = Math.max(0, Number(songResults?.songCount) || answer.search.songs.length)
    answer.search.artists = (Array.isArray(artistResults?.artists) ? artistResults.artists : [])
      .map((artist) => ({
        id: String(artist?.id ?? ''),
        name: String(artist?.name ?? ''),
        cover: wide(artist?.picUrl ?? artist?.img1v1Url, '130y130'),
      }))
      .filter((artist) => artist.id && artist.name)
      .slice(0, 30)
    answer.search.artistsTotal = Math.max(0, Number(artistResults?.artistCount) || answer.search.artists.length)
    answer.search.playlists = (Array.isArray(playlistResults?.playlists) ? playlistResults.playlists : [])
      .map(playlistOf)
      .filter(Boolean)
      .slice(0, 30)
    answer.search.playlistsTotal = Math.max(0, Number(playlistResults?.playlistCount) || answer.search.playlists.length)
    post(answer)
  }

  // An artist's page: its own artist (name, alias, picture, introduction) and its songs (its own `artist/songs`, the
  // page's own hot ones under it; each with the account's own right).
  const answerArtist = async (id) => {
    const detail = await api(`/api/v1/artist/${encodeURIComponent(id)}`)
    const artist = detail?.artist
    if (!artist) return post({ artist: { id, name: '', alias: '', cover: null, description: '', songs: [] } })
    const alias = Array.isArray(artist.alias) ? artist.alias.filter(Boolean).join(' / ') : String(artist.alias ?? '')
    // `artist/songs` wants an offset (a request without one is its own "参数错误"); `hotSongs` is the page's own list
    // under it, for an artist whose songs answer is empty.
    const songsAnswer = await api(`/api/v1/artist/songs?id=${encodeURIComponent(id)}&limit=${ARTIST_MOST}&offset=0`)
    const rows = Array.isArray(songsAnswer?.songs) && songsAnswer.songs.length > 0 ? songsAnswer.songs : Array.isArray(detail.hotSongs) ? detail.hotSongs : []
    const songs = rows.map(songOf).filter(Boolean).slice(0, ARTIST_MOST)
    rememberContext(`artist:${id}`, songs)
    post({
      artist: {
        id,
        name: String(artist.name ?? ''),
        alias,
        cover: wide(artist.picUrl ?? artist.cover ?? artist.img1v1Url),
        description: String(artist.briefDesc ?? '').slice(0, 600),
        songs: songs.map(songOut),
      },
    })
  }

  // The account's recent songs: the web player has no 最近播放 page of its own (checked on the signed-in page,
  // 2026-11-19): what it has is 听歌排行, the songs the account played this week, which its own page asks its own
  // API for. Read the same way (same origin, the page's own session).
  const recentSongs = async () => {
    const uid = uidOf()
    if (!uid) return []
    const answer = await api(`/api/v1/play/record?type=1&uid=${encodeURIComponent(uid)}&limit=${RECENT_MOST}`)
    const rows = Array.isArray(answer?.weekData) ? answer.weekData : []
    const songs = []
    for (const row of rows) {
      const read = songOf(row?.song)
      if (!read) continue
      const playCount = Math.max(0, Math.round(Number(row?.playCount) || 0))
      songs.push(playCount > 0 ? { ...read, playCount } : read)
      if (songs.length >= RECENT_MOST) break
    }
    return songs
  }
  const answerRecent = async () => {
    const songs = await recentSongs()
    rememberContext('recent', songs)
    post({ recent: { songs: songs.map(songOut) } })
  }

  // The account's own profile: its user detail (by uid, as its own home page asks it: the path's last part, not a
  // query) and its music level. The page's top bar says the name and picture even when the detail doesn't come.
  const answerProfile = async () => {
    const uid = uidOf()
    if (!uid) return post({ profile: null })
    const [detail, level] = await Promise.all([
      api(`/api/v1/user/detail/${encodeURIComponent(uid)}`),
      api(`/api/user/level?uid=${encodeURIComponent(uid)}`),
    ])
    const profile = detail?.profile ?? null
    const name = String(profile?.nickname ?? account()?.name ?? '')
    if (!name) return post({ profile: null })
    post({
      profile: {
        uid,
        name,
        avatar: wide(profile?.avatarUrl, '140y140'),
        signature: String(profile?.signature ?? '').slice(0, 200),
        level: Math.max(0, Math.round(Number(detail?.level ?? level?.data?.level) || 0)),
        listenSongs: Math.max(0, Math.round(Number(detail?.listenSongs) || 0)),
        follows: Math.max(0, Math.round(Number(profile?.follows) || 0)),
        fans: Math.max(0, Math.round(Number(profile?.followeds) || 0)),
        playlistCount: Math.max(0, Math.round(Number(profile?.playlistCount) || 0)),
        createDays: Math.max(0, Math.round(Number(detail?.createDays) || 0)),
        vipType: Math.max(0, Math.round(Number(profile?.vipType) || 0)),
        background: wide(profile?.backgroundUrl, '600y300'),
      },
    })
  }

  // --- 红心: the account's own 我喜欢的音乐 ---------------------------------------------------------------
  //
  // NetEase's "liked" is a song's place in the account's own 我喜欢的音乐 playlist (its `specialType` 5): the state is
  // read from that playlist's own track ids (the page's own interface), and a like adds the song to it, an unlike
  // takes it out (`/api/playlist/manipulate/tracks`, its own `csrf_token` the page's own cookie, the same the page's
  // own collect menu sends). Verified on the owner's account 2026-11-19: add -> count 2748, the song in `trackIds`;
  // del -> count 2747, gone.
  let likedIds = null
  let likedFetchedAt = 0
  let likedForTrack = ''
  const csrf = () => /(?:^|;\s*)__csrf=([^;]+)/.exec(document.cookie)?.[1] ?? ''
  // The account's own 我喜欢的音乐 playlist's id (from its own user playlists): null while signed out.
  const likedPlaylist = async () => {
    if (likedPlaylistId) return likedPlaylistId
    const uid = uidOf()
    if (!uid) return null
    const answer = await api(`/api/user/playlist?uid=${encodeURIComponent(uid)}&limit=100&offset=0`)
    const lists = Array.isArray(answer?.playlist) ? answer.playlist : []
    findLikedPlaylist(lists)
    return likedPlaylistId
  }
  // That playlist's own track ids: a Set, kept a minute (a song's own like asks it for itself).
  const likedSet = async (force = false) => {
    const at = Date.now()
    if (!force && likedIds && at - likedFetchedAt < 60000) return likedIds
    const id = await likedPlaylist()
    if (!id) {
      likedIds = null
      return null
    }
    const detail = await api(`/api/v1/playlist/detail?id=${encodeURIComponent(id)}`)
    const ids = detail?.playlist?.trackIds
    likedIds = Array.isArray(ids) ? new Set(ids.map((each) => String(each.id))) : null
    likedFetchedAt = at
    return likedIds
  }
  // Whether a song is in it now (null while the list isn't known: signed out, or still coming).
  const likedNow = (id) => {
    if (!likedIds || !id) return null
    return likedIds.has(String(id))
  }
  // A like asked for (the app's own heart): added to or taken from 我喜欢的音乐, said as it's done (or not), and the
  // state's own said after it. Never a press of its page's own button: this is the page's own collect interface, and
  // whether it really landed is read back from the playlist itself.
  const setLiked = async (id, liked) => {
    const playlist = await likedPlaylist()
    const token = csrf()
    if (!playlist || !token) return post({ like: { id, liked, ok: false, reason: playlist ? 'csrf' : 'account' } })
    const body = `op=${liked ? 'add' : 'del'}&pid=${encodeURIComponent(playlist)}&trackIds=${encodeURIComponent(`[${id}]`)}&csrf_token=${encodeURIComponent(token)}`
    const { answer } = await apiPost('/api/playlist/manipulate/tracks', body)
    const code = Number(answer?.code)
    // 200: done. 502 ("歌单内歌曲重复"): it was already liked (a state read a moment late): done, too.
    const said = code === 200 || /重复/.test(String(answer?.message ?? answer?.msg ?? ''))
    if (!said) return post({ like: { id, liked, ok: false, reason: String(answer?.message ?? answer?.msg ?? code ?? 'http').slice(0, 80) } })
    // Whether it landed: the playlist's own ids again (never the answer alone).
    const ids = await likedSet(true)
    const ok = ids ? ids.has(String(id)) === Boolean(liked) : true
    post({ like: { id, liked, ok, reason: ok ? '' : 'verify' } })
    tell(true)
  }

  // --- The app's commands, as the host passes them on (netease.rs's Command) -----------------------------------
  //
  //   { action: "play" }                        play on (its own play button, when its state says paused)
  //   { action: "play", value: "<song id>", list?: "<list>" }  that song played by the page's own player: its own
  //                                             queue when `list` (a playlist's or a ranking's id, "daily", "recent",
  //                                             "search", "artist:<id>") is one the page has read, its own player's way
  //                                             otherwise; watched for its sound, rescued in the ladder's own time.
  //                                             Only digits (and the lists' own names): the host lets no other id in.
  //   { action: "pause" | "next" | "prev" }     its own play/pause, next and previous buttons (each watched)
  //   { action: "seek", value: <seconds> }      its progress bar, dragged there as a mouse drags it
  //   { action: "volume", value: <0 to 1> }     its own audio element's volume (kept over the page's own changes)
  //   { action: "setLike", value: "<id>", liked: <bool> }  that song added to or taken from 我喜欢的音乐 (`like`)
  //   { action: "openPlaylist", value: "<id>" } that playlist's songs asked of the page's own interface (`playlist`)
  //   { action: "openRanking", value: "<id>" }  that ranking's songs, its own head too (`playlist`)
  //   { action: "openArtist", value: "<id>" }   that artist's page asked of the page's own interface (`artist`)
  //   { action: "home" }                        Home's cards and the day's own songs (`home`)
  //   { action: "library" }                     the account's own playlists, by group (`library`)
  //   { action: "search", value: "<words>" }    the page's own search of them, its songs, artists and playlists
  //                                             answered (`search`)
  //   { action: "recent" }                      the account's recent songs (its 听歌排行 this week) (`recent`)
  //   { action: "rankings" }                    NetEase's own rankings list (`rankings`)
  //   { action: "profile" }                     the account's own profile (`profile`)
  //   { action: "refresh" }                     the state and the recommended playlists read again
  //
  // and the cab's own (cab_sound.js: speakers, head, outside, menu, equalizer, spectrum), not the app's.
  const CONTROLS = {
    play: ({ value, list }) => (value ? playSong(String(value), list ? String(list) : null) : resume()),
    pause: () => pause(),
    next: () => skip(1),
    prev: () => skip(-1),
    seek: ({ value }) => seek(value),
    volume: ({ value }) => setVolume(value),
    setLike: ({ value, liked }) => setLiked(String(value), Boolean(liked)),
    openPlaylist: ({ value }) => answerPlaylist(String(value), false),
    openRanking: ({ value }) => answerPlaylist(String(value), true),
    openArtist: ({ value }) => answerArtist(String(value)),
    home: () => answerHome(),
    library: () => answerLibrary(),
    search: ({ value }) => answerSearch(value),
    recent: () => answerRecent(),
    rankings: () => answerRankings(),
    profile: () => answerProfile(),
    // The state and the lists read again (as if the page loaded anew): the app's pull to refresh.
    refresh: () => {
      told = ''
      tell(true)
    },
  }

  // --- The truck's own speakers, the cab, and the app ---------------------------------------------------------

  // The sound's own element (the page's audio), made through the truck's speakers (cab_sound.js, loaded first): told
  // the speakers, the head and the camera by the host.
  const cab = window.westplayCabSound?.(() => playingNow() ?? document.querySelector('audio, video'), post)
  if (cab) setInterval(() => cab.tick(), 250)
  window.westplaySpeakerLevel = () => cab?.level() ?? null
  const CAB = {
    speakers: (data) => cab?.speakers(data.speakers),
    head: (data) => cab?.head(data),
    outside: (data) => cab?.outside(data.on, data.distance),
    menu: (data) => cab?.menu(data.up),
    equalizer: (data) => cab?.equalizer(data),
    spectrum: (data) => cab?.spectrum(data.on),
  }

  window.chrome?.webview?.addEventListener('message', ({ data }) => {
    if (CAB[data?.action]) CAB[data.action](data)
    else CONTROLS[data?.action]?.(data)?.catch?.(() => {})
  })

  // --- A play the page's sound doesn't follow (the last resort of a player that says it plays) ----------------
  //
  // The command watch (timePlay) rescues a song that doesn't start; this watches a player that says it plays on while
  // its own clock stands still (owner: "three songs in, and it sticks"): paused=false with the sound's clock not
  // moving, or (no element known) the play bar's own clock stopped, for STALL_FOR, and it is taken into the same
  // ladder at once. Never a skip, never a burst of presses; at most one heal at a time and not more often than every
  // HEAL_COOLDOWN while it keeps failing.
  const STALL_FOR = 2000
  const HEAL_COOLDOWN = 8000
  const HEAL_INTERVAL = 500
  let stall = { key: '', since: 0, lastAt: null, lastBar: null }
  let lastHeal = 0
  let heals = 0
  const heal = () => {
    if (!isPlaying()) {
      stall = { key: '', since: 0, lastAt: null, lastBar: null }
      return
    }
    const current = track()
    const key = String(current?.id || current?.title || '')
    const state = elementState()
    const at = state && !state.paused && Number.isFinite(state.at) ? state.at : null
    const bar = barSeconds()
    if (key !== stall.key) {
      stall = { key, since: 0, lastAt: at, lastBar: Number.isFinite(bar) ? bar : null }
      return
    }
    const moved =
      (state && !state.paused && at !== null && stall.lastAt !== null && at > stall.lastAt + 0.05) ||
      (at === null && Number.isFinite(bar) && stall.lastBar !== null && bar > stall.lastBar)
    if (moved) {
      stall.since = 0
      stall.lastAt = at
      stall.lastBar = Number.isFinite(bar) ? bar : stall.lastBar
      return
    }
    if (!stall.since) stall.since = Date.now()
    if (Date.now() - stall.since < STALL_FOR) return
    // A watch of its own is already taking care of it.
    if (watch.timer) return
    if (Date.now() - lastHeal < HEAL_COOLDOWN) return
    lastHeal = Date.now()
    heals += 1
    stall.since = 0
    stepLine(`heal ${state ? JSON.stringify(state) : 'no-element'}`)
    // Straight into the ladder: its own player's way at once, then the same rescue times as a command's.
    timePlay('heal', { id: current?.id || null, duration: current?.duration ?? null, immediate: true })
  }
  setInterval(heal, HEAL_INTERVAL)

  // A play whose own rescue reloaded the page (timePlay's level 3): the song played on once this script is back (the
  // page's queue is lost; the sound isn't), at most a minute after the reload asked for it.
  const resumeAfterReload = () => {
    let saved = null
    try {
      saved = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null')
      sessionStorage.removeItem(RELOAD_KEY)
    } catch {
      saved = null
    }
    const id = saved?.id ? String(saved.id) : ''
    if (!id || Date.now() - Number(saved.at ?? 0) > 60000) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (isPlaying() || tries > 120) {
        clearInterval(timer)
        return
      }
      if (playByPlayer(id)) {
        clearInterval(timer)
        timePlay('play', { id })
      }
    }, 500)
  }

  // What the page says of itself, said to the host as it changes (once a second): signed in or not (said only once
  // the page knows), playing, the volume, what plays, the heart's state, the account, and the recommended playlists
  // (v1's own list, kept for compatibility).
  let told = ''
  const tell = (always = false) => {
    const signed = signedIn()
    if (signed === null) return
    const playing = track()
    // A song's own liked state: its playlist's ids asked as the song changes (never on every reading), and the song's
    // own album/cover asked of the interface once (the play bar has neither).
    if (playing?.id && playing.id !== likedForTrack) {
      likedForTrack = playing.id
      learnCurrent()
      likedSet().then((known) => {
        if (known) tell(true)
      })
    }
    const state = {
      signedIn: signed,
      playing: isPlaying(),
      volume: volume(),
      track: playing,
      liked: likedNow(playing?.id),
      lists: recommendedLists,
      account: account(),
      audio: audioState(),
    }
    const said = JSON.stringify(state)
    if (!always && said === told) return
    told = said
    post({ state })
  }
  setInterval(() => tell(), 1000)

  // The live test's own hand (netease.rs's ignored probe): a player that says it plays while its sound stops, and the
  // same player released again, so the silent-playing rescue can be seen on a real page. Nothing of the app uses it.
  // Both hands are for every element the page keeps (it may keep two behind the one it plays): the sound really stops.
  window.westplayNeteaseTest = {
    // The sound's own clock stopped while the play bar still says it plays (its own elements frozen).
    freeze: (rate = 0) => {
      let found = false
      for (const element of media) {
        element.playbackRate = Math.min(16, Math.max(0, Number(rate) || 0))
        found = true
      }
      return found
    },
    // The elements paused under a page that still says it plays.
    silence: () => {
      let found = false
      for (const element of media) {
        if (element.paused) continue
        element.pause()
        found = true
      }
      return found
    },
    // What those elements are doing now (the live test's own reading: a rate the page's player resets, a clock that
    // stands still).
    // What the play watcher and the silent-playing healer are doing now (the live test's own reading).
    stall: () => ({ since: stall.since ? Date.now() - stall.since : 0, key: stall.key, lastHeal: lastHeal ? Date.now() - lastHeal : 0, heals }),
    elements: () =>
      [...media].map((element) => ({
        rate: element.playbackRate,
        paused: element.paused,
        ended: element.ended,
        at: Math.round(element.currentTime * 10) / 10,
        length: Number.isFinite(element.duration) ? Math.round(element.duration) : null,
        ready: element.readyState,
      })),
    // A player whose sound's own clock stands still while it says it plays (paused=false, the page's bar playing): what
    // the silent-playing rescue is for. The clock reads one value until `unwrapClock` (the real one is untouched).
    stallClock: () => {
      let found = false
      for (const element of media) {
        if (element.__westplayStall !== undefined) continue
        element.__westplayStall = Math.round(element.currentTime * 100) / 100
        Object.defineProperty(element, 'currentTime', {
          configurable: true,
          get: () => element.__westplayStall,
        })
        found = true
      }
      return found
    },
    unwrapClock: () => {
      let found = false
      for (const element of media) {
        if (element.__westplayStall === undefined) continue
        delete element.currentTime
        delete element.__westplayStall
        found = true
      }
      return found
    },
  }

  // The live test (netease.rs's own ignored probe): what the page says of itself, and what the interface answered.
  window.westplayNetease = () => ({
    signedIn: signedIn(),
    playing: isPlaying(),
    volume: volume(),
    track: track(),
    lists: recommendedLists,
    account: account(),
    uid: uidOf(),
    audio: audioState(),
    // The page's own player's ways (playback needs an account).
    playAPI: typeof window.nm?.x?.ceo2i,
    queueAPI: typeof pagePlayer()?.addTo,
    queue: queue.ids.length,
    frame: (() => {
      try {
        return frameDocument()?.location?.href ?? null
      } catch {
        return null
      }
    })(),
    known: knownSongs.size,
    contexts: contexts.size,
    rankings: rankingsCache.length,
    heals,
    stuck: Boolean(stall.since) && Date.now() - stall.since > STALL_FOR,
    // The play's own timing steps, and the song's own liked state (the app's heart).
    timing: watch.steps.join(', '),
    watching: watch.timer !== null,
    liked: likedNow(track()?.id),
    likedKnown: likedIds ? likedIds.size : null,
  })

  addEventListener('DOMContentLoaded', () => post({ ready: true }))
  // A play its own rescue reloaded the page for: the song played on as this script is back.
  resumeAfterReload()
  tell()
})()
