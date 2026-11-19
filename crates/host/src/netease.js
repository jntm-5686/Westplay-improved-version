// WestPlay, in NetEase Cloud Music's web player (music.163.com, netease.rs): the official page, run hidden under
// the cab. The NetEase app the player sees is WestPlay's own (ui/src/cabin/apps/netease); this reads the page's
// player and its data, and plays through the page's own player:
//
// - The page is a shell of its own: its player at the bottom, its content in a frame of the same origin
//   (`#g_iframe`). The player's state (signed in or not, playing, the song, the artist, the cover, how far in) is
//   in the shell's own play bar, read as it changes (~1 s).
// - Everything the app shows is read from the page's own same-origin interface (`fetch('/api/…')`, the session's
//   own cookies): Home's day and playlists, the account's playlists, a playlist's songs, a search's songs, artists
//   and playlists, an artist's page, the recent songs and the liked state. Nothing is navigated for it: the page
//   stays where it is while the music plays (navigating rebuilds its player and loses the queue, the owner's
//   "three songs in, and it sticks"), and only a page with nothing playing is ever navigated (the few fallbacks).
// - Playing is the page's own player's way (`window.nm.x.ceo2i('play', 18, <song id>)`, what its own links call):
//   its own data and player, no row clicked and no page opened. Its own play/pause and next/previous buttons are
//   pressed only when the state says they're needed, its progress bar dragged for a seek, its audio element turned
//   down for the volume. Every play is timed (10 s, then three graded rescues: play again, its own row's play, and
//   the page loaded anew) and said to the host with its steps (§ the timing report).
// - Liking is the account's own: a song added to or taken from its 我喜欢的音乐 playlist (specialType 5) through
//   the page's own same-origin interface, its state read from that playlist's own track ids.
// - Signing in is the page's own QR code dialog, in a window on the desktop (signin.rs); this page then loads
//   again, signed in. Nothing of the account leaves the page: only whether it's signed in is said, never its
//   name or anything else of it.
//
// Messages to the host (netease.rs), over `chrome.webview.postMessage` as the other players':
//   { state: { signedIn, playing, volume, track, liked?, lists? } }  what the page says of itself
//   { playlist: { id, name, songs: [{ id, title, artist, duration, playable }] } }   a playlist asked for
//   { library: { groups: [{ title, count, playlists: [{ id, name, cover, songCount, by }] }] } }
//                                                             the account's own playlists (创建/收藏的歌单)
//   { search: { query, songs: [...], artists: [...], playlists: [...], songsTotal, artistsTotal, playlistsTotal } }
//                                                             the page's own search, its three kinds
//   { artist: { id, name, alias, cover, songs: [...] } }       an artist's page asked for (openArtist)
//   { recent: { songs: [...] } }                               the account's last week's songs (听歌排行)
//   { home: { daily: { songs }, radar, personal, recommended } }  Home's day and its playlist shelves
//   { like: { id, liked, ok } }                                a like asked for, done (or not)
//   { timing: { action, sounding, steps, ... } }               a play timed, with what its rescues did
//   { ready: true }                                           the page loaded (anew)
// and the host's to it: { action, value? } — the app's own commands (netease.rs's Command), `refresh`, and the
// cab's (cab_sound.js: speakers, head, outside, menu, equalizer, spectrum).
//
// Every selector this script uses is in `S` below, and nowhere else: NetEase's page changes, that's what to fix.
;(() => {
  if (location.hostname !== 'music.163.com' || window.top !== window) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // --- The page's own structure: the selectors this script knows it by ----------------------------------------
  //
  // The shell's own page (`https://music.163.com/`): the player at the bottom (`#g_player`), the account at the
  // top right (`.m-tophead`, filled by the page once it knows), and the content's frame (`#g_iframe`).
  // The content's page (`https://music.163.com/discover`, `…/playlist?id=…`): its recommended playlists
  // (`.n-rcmd .m-cvrlst li`, and the personalised ones in `#personalRec`'s) and a playlist's songs
  // (`.m-table tbody tr`, the page's own table; `#song-list-pre-cache .f-hide li a`, the server's list under it
  // while the page draws the table).
  const S = {
    // The content's document: a frame of the page's own, on the same origin.
    frame: '#g_iframe',
    // The player, at the bottom of the shell's page.
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
    signedIn: '[data-action="logout"], .head img, a.name',
    accountName: '.m-tophead a.name',
    accountAvatar: '.m-tophead .head img',
    // The account's own recommendations (Discover › 推荐, signed in): 每日歌曲推荐, 私人雷达, personal playlists.
    personal: '#personalRec .m-cvrlst li',
    personalName: 'a.tit, .dec a',
    personalLink: 'a[href]',
    // The recommended playlists, in the content's document (Discover › 推荐; the personalised ones too).
    cards: '.n-rcmd .m-cvrlst li',
    anyCard: '.m-cvrlst li', // a card anywhere in the content's page (the recommended section isn't there)
    cardLink: 'a.msk[href^="/playlist?id="]', // a playlist's card (a podcast's is `/dj?id=…`: not a playlist)
    cardName: 'p.dec a.tit',
    cardCover: 'img',
    cardPlays: '.bottom .nb',
    // A playlist's page, in the content's document.
    playlistName: '.m-info .tit h2',
    rows: '.m-table tbody tr',
    rowPlay: '.hd .ply', // its `data-res-id` is the song's, and a click plays it (in the playlist's context)
    rowTitle: '.tt .txt a',
    rowTitleName: '.tt .txt a b', // its `title`: the song's name, without the page's own hidden letters
    rowArtist: ':scope > td:nth-child(4) .text', // its `title`: the song's artists, without those letters
    rowAlbum: ':scope > td:nth-child(5) .text',
    rowDuration: '.u-dur',
    rowDisabled: 'js-dis',
    hiddenList: '#song-list-pre-cache .f-hide li a', // the server's own list, before the table is drawn
    // Home's own page, a playlist's page and an artist's page: read only as a fallback, while nothing plays (the
    // page's own interface is the app's data; a navigation while the music plays is what loses its queue).
    cards: '.n-rcmd .m-cvrlst li',
    anyCard: '.m-cvrlst li',
    cardLink: 'a.msk[href^="/playlist?id="]',
    cardName: 'p.dec a.tit',
    cardCover: 'img',
    cardPlays: '.bottom .nb',
    personal: '#personalRec .m-cvrlst li',
    personalName: 'a.tit, .dec a',
    personalLink: 'a[href]',
    playlistName: '.m-info .tit h2',
    artistName: '.n-artist #artist-name',
    artistAlias: '.n-artist #artist-alias',
    artistCover: '.n-artist img',
    artistRows: '.m-table tbody tr',
    artistRowPlay: '.hd .ply',
    artistRowLink: '.tt .ttc .txt a',
    artistRowTitle: '.tt .ttc .txt a b', // its `title`: the name, without the page's own hidden letters
    artistRowDuration: '.u-dur',
  }
  // How many recommended playlists the app shows, how long a fallback page has to show its lists, and how many of
  // the day's, an artist's and the recent songs are read.
  const LISTS = 12
  const ACCOUNT_WAIT = 20000
  const PLAYLIST_WAIT = 15000
  const HOME_WAIT = 12000
  const ARTIST_WAIT = 12000
  const ARTIST_MOST = 50
  const RECENT_MOST = 100
  // Playing: timed from the command until its sound moves (10 s, then three graded rescues: its own player's way
  // again, the song's own row, the page loaded anew).
  const WATCH_FOR = 10000
  const RESCUE_AFTER = 3000
  const WATCH_STEP = 100

  // --- The content's document, and what its DOM says ---------------------------------------------------------

  // The content's own document (the page's frame, same origin): `null` while the frame isn't there or loaded.
  const frame = () => {
    try {
      return document.querySelector(S.frame)?.contentDocument ?? null
    } catch {
      // A frame of another origin (never NetEase's own): nothing of it is read.
      return null
    }
  }
  // The content's own path (`/discover`, `/my/`, `/playlist`, `/search/…`): only what the page at it shows is read,
  // so an answer whose page moved away under it (the app asked something else meanwhile) reads nothing wrong.
  const pathOf = () => {
    try {
      return frame()?.location?.pathname ?? ''
    } catch {
      return ''
    }
  }
  const atPath = (path) => pathOf().startsWith(path)
  const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const idOf = (href) => /[?&]id=(\d{1,20})(?:[&#]|$)/.exec(String(href ?? ''))?.[1] ?? null
  // A row's own `data-res-id` (a plain NetEase id, not an address with `?id=` in it).
  const dataId = (said) => {
    const found = /^(\d{1,20})$/.exec(String(said ?? '').trim())
    return found ? found[1] : null
  }
  // A cover as the app shows it: on NetEase's own image hosts (https: the cab's page is served over https, and
  // the page's addresses come as http), large enough for the app's cards (the page asks for 140 or 34 pixels).
  const wide = (url) => {
    if (!url) return null
    try {
      const address = new URL(url, location.href)
      if (address.protocol !== 'https:' && address.protocol !== 'http:') return null
      address.protocol = 'https:'
      address.search = 'param=300y300'
      return address.href
    } catch {
      return null
    }
  }
  // "01:23" or "01:23 / 04:32" (the play bar's time) as seconds, and the length of the song it's in.
  // How far the page's own play bar says the song is, in seconds (NaN when it isn't readable): the clock the
  // self-heal watches (a page's player can say it plays while its sound never moves).
  const barSeconds = () => {
    const said = text(document.querySelector(S.time))
    const match = /(\d{1,3}):(\d{2})/.exec(said)
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
  }
  const clock = (said) => {
    const found = /(?:(\d{1,3}):(\d{2}))?\s*\/\s*(\d{1,3}):(\d{2})/.exec(said ?? '')
    if (found) return { position: Number(found[1] ?? 0) * 60 + Number(found[2] ?? 0), duration: Number(found[3]) * 60 + Number(found[4]) }
    const alone = /^(\d{1,3}):(\d{2})$/.exec((said ?? '').trim())
    return alone ? { position: Number(alone[1]) * 60 + Number(alone[2]), duration: 0 } : null
  }
  // "04:32" (a song's length in a list) as seconds.
  const seconds = (said) => {
    const found = /^(\d{1,3}):(\d{2})$/.exec((said ?? '').trim())
    return found ? Number(found[1]) * 60 + Number(found[2]) : 0
  }
  // A card's play count ("3433万", "1.2亿", "8953") as the number the app shows.
  const playCount = (said) => {
    const found = /^([\d.]+)\s*(万|亿)?/.exec((said ?? '').trim())
    if (!found) return 0
    const unit = found[2] === '亿' ? 1e8 : found[2] === '万' ? 1e4 : 1
    return Math.round(Number(found[1]) * unit) || 0
  }

  // --- The page's own interface, as its own pages ask it -------------------------------------------------------
  //
  // Everything the app shows comes from here, not from navigating the content frame: a navigation while the music
  // plays rebuilds the page's player and loses the queue (owner: three songs in, and it sticks). Only the page's
  // own session (its cookies) is sent; nothing of the account leaves the page but what the app shows.
  const api = async (path) => {
    try {
      const response = await fetch(path, { credentials: 'same-origin' })
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }
  // A song as the page's own answers say it: its id, name, artists (joined as its pages show them), length (its
  // answers' milliseconds), and whether the account's own rights let it play (`st` below 0: not; a fee of 4 or 8
  // without a privilege is an album's to buy).
  const songOf = (song) => {
    if (!song?.id || !song?.name) return null
    const artists = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : []
    const privilege = song.privilege
    const right = song.st !== undefined ? Number(song.st) : privilege ? Number(privilege.st ?? 0) : null
    return {
      id: String(song.id),
      title: String(song.name),
      artist: artists.map((artist) => artist?.name).filter(Boolean).join('/'),
      duration: Math.round((Number(song.dt ?? song.duration) || 0) / 1000),
      playable: (right !== null ? right >= 0 : Number(song.fee ?? 0) < 4) && !song.noCopyrightRcmd,
    }
  }
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
  // Songs by their ids, as the page's own song detail gives them (each with its `st`: the account's own rights), in
  // batches of 200 (its own interface's size, not a list of thousands in one request).
  const songsByIds = async (ids) => {
    const wanted = [...new Set(ids.map(String).filter((id) => /^\d{1,20}$/.test(id)))]
    const songs = []
    for (let at = 0; at < wanted.length; at += 200) {
      const batch = wanted.slice(at, at + 200)
      try {
        const response = await fetch('/api/v3/song/detail', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: `c=${encodeURIComponent(JSON.stringify(batch.map((id) => ({ id: Number(id) }))))}`,
        })
        if (!response.ok) continue
        const answer = await response.json()
        for (const song of Array.isArray(answer?.songs) ? answer.songs : []) {
          const read = songOf(song)
          if (read) songs.push(read)
        }
      } catch {
        // Its own interface, gone: the songs it did give are the answer.
      }
    }
    return songs
  }

  // --- The player's own audio element -------------------------------------------------------------------------
  //
  // The page makes it itself (it may never be in the document): kept as it plays or as its keys are given to it,
  // for the speakers (cab_sound.js) and the volume the app sets (the page sets its own on each song).
  const media = new Set()
  let wantedVolume = null
  const playingNow = () => [...media].find((element) => !element.paused && !element.ended) ?? [...media].at(-1) ?? null
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
  // The app's own commands, at once as the page says it: the app's scene shows the state as it is (the 1 s
  // reading is for the rest).
  for (const name of ['play', 'pause', 'ended', 'volumechange']) addEventListener(name, () => tell(), true)
  // How loud it is through the speakers, each ear (and the limiter's cut), for the live test (netease.rs).
  const volume = () => wantedVolume ?? playingNow()?.volume ?? 0.8
  const setVolume = (value) => {
    wantedVolume = Math.min(1, Math.max(0, Number(value) || 0))
    for (const element of media) element.volume = wantedVolume
  }

  // --- What the page says of the player -----------------------------------------------------------------------

  // Whether it's playing: its own play/pause button says so (`pas`, and `data-action="pause"`, while playing).
  const isPlaying = () => {
    const button = document.querySelector(S.play)
    return Boolean(button && (button.classList.contains('pas') || button.dataset.action === 'pause'))
  }
  // Signed in (`true`), signed out (`false`), or not said yet (`null`: the page still loading its account). The
  // page's own account not there a while after it loaded (its own request for it failed): signed out, so the app
  // is never left without a state (a sign-in then works as usual).
  const started = Date.now()
  const signedIn = () => {
    const head = document.querySelector(S.account)
    if (head) {
      if (head.querySelector(S.signedIn)) return true
      if (document.querySelector(S.login)) return false
    }
    return Date.now() - started > ACCOUNT_WAIT ? false : null
  }
  // What plays: the play bar's own words (its name, its artist), its cover, how long it is and how far into it,
  // and the song's NetEase id (its name's own address). `null`: nothing (or nothing playable) in the play bar.
  // The account, as the page's top bar says it (`null` while it shows none). The picture asked for at a size the
  // cab's rail shows, not the page's own 30 pixels.
  const account = () => {
    const name = text(document.querySelector(S.accountName))
    const avatar = document.querySelector(S.accountAvatar)?.getAttribute('src') ?? null
    if (!name && !avatar) return null
    return { name, avatar: avatar ? avatar.replace(/param=\d+y\d+/, 'param=140y140') : null }
  }
  // The account's own user id, from its name's address in the top bar (`/user/home?id=…`): the page's own lists
  // that are by the account ask it, and nothing of the account leaves the page but what the app shows.
  const uidOf = () => {
    try {
      const link = document.querySelector(S.accountName)
      return /[?&]id=(\d{1,20})/.exec(link?.getAttribute('href') ?? '')?.[1] ?? null
    } catch {
      return null
    }
  }

  // What the page's own player is doing, for the host's log when the two disagree (the play bar says playing while
  // no sound element is: the app's screen moves on and nothing is heard).
  const audioState = () => {
    const all = [...media]
    const playing = all.find((element) => !element.paused && !element.ended) ?? null
    const element = playing ?? all.at(-1) ?? null
    return {
      elements: all.length,
      playing: Boolean(playing),
      paused: element ? element.paused : null,
      at: element && Number.isFinite(element.currentTime) ? Math.round(element.currentTime) : null,
    }
  }

  const track = () => {
    const name = document.querySelector(S.trackName)
    const title = name?.getAttribute('title') || text(name) || ''
    if (!title) return null
    const time = clock(text(document.querySelector(S.time)))
    const width = parseFloat(document.querySelector(S.progress)?.style.width) || 0
    const duration = time?.duration ?? 0
    // The album is nowhere in the play bar: it's read from the song's own row where the content's page shows it.
    return {
      id: idOf(name.getAttribute('href')) ?? '',
      title,
      artist: text(document.querySelector(S.trackArtist)),
      album: albumOf(),
      cover: wide(document.querySelector(S.cover)?.getAttribute('src')),
      duration,
      position: duration > 0 ? Math.round(duration * Math.min(100, width)) / 100 : (time?.position ?? 0),
      playable: true,
    }
  }
  // The playing song's album, from its row in the content's page (a playlist's, when one is open): none
  // elsewhere (the app shows none then).
  const albumOf = () => {
    const id = idOf(document.querySelector(S.trackName)?.getAttribute('href'))
    const doc = frame()
    if (!id || !doc) return ''
    const row = [...doc.querySelectorAll(S.rows)].find((row) => dataId(row.querySelector(S.rowPlay)?.getAttribute('data-res-id')) === id)
    const album = row?.querySelector(S.rowAlbum)
    return album?.querySelector('a')?.getAttribute('title') || text(album)
  }

  // The recommended playlists, as the content's page shows them (up to LISTS of them): their NetEase id, name,
  // cover and play count. `null` while the page doesn't show them (not loaded, or another page open).
  const shownLists = () => {
    const doc = frame()
    if (!doc) return null
    let cards = [...doc.querySelectorAll(S.cards)]
    if (cards.length === 0) cards = [...doc.querySelectorAll(S.anyCard)]
    const found = []
    for (const card of cards) {
      const link = card.querySelector(S.cardLink)
      const id = idOf(link?.getAttribute('href'))
      const name = text(card.querySelector(S.cardName)) || link?.getAttribute('title') || ''
      if (!id || !name || found.some((list) => list.id === id)) continue
      found.push({
        id,
        name,
        cover: wide(card.querySelector(S.cardCover)?.getAttribute('src')),
        playCount: playCount(text(card.querySelector(S.cardPlays))),
      })
      if (found.length >= LISTS) break
    }
    return found.length > 0 ? found : null
  }
  // The page's own recommendations, its same-origin API as its own pages ask it (no account needed): the rest of
  // the recommended playlists, when its content's page shows fewer than the app has cards for (of its 8 cards,
  // three are podcasts' (`/dj?id=…`), not playlists': five playlists alone would leave the app's home half empty).
  const recommended = async () => {
    try {
      const response = await fetch(`/api/personalized/playlist?limit=${LISTS}`, { credentials: 'same-origin' })
      if (!response.ok) return []
      const answer = await response.json()
      return (Array.isArray(answer?.result) ? answer.result : [])
        .filter((item) => Number(item?.type) === 0 && item?.id && item?.name)
        .map((item) => ({
          id: String(item.id),
          name: String(item.name),
          cover: wide(item.picUrl),
          playCount: Math.round(Number(item.playCount) || 0),
        }))
    } catch {
      return []
    }
  }
  // The page's recommended playlists: the ones its page shows, and the API's for the rest (no duplicate, at most
  // LISTS of them) — kept as they were while the content's page shows another page (a playlist's): the app's
  // home still has its lists, where the app comes back to.
  let suggested = []
  let asking = false
  let known = []
  const merged = (...parts) =>
    parts
      .flat()
      .filter((list, index, all) => all.findIndex((other) => other.id === list.id) === index)
      .slice(0, LISTS)
  // The account's own cards (Discover › 推荐's personalised section, signed in): 私人雷达 first and 每日歌曲推荐
  // second, as the owner asked, then the playlists it recommends.
  const RADAR = '3136952023'
  const personalShown = () => {
    const doc = frame()
    if (!doc) return []
    const found = []
    for (const card of doc.querySelectorAll(S.personal)) {
      const link = card.querySelector(S.personalLink)
      const href = link?.getAttribute('href') ?? ''
      const name = text(card.querySelector(S.personalName)) || link?.getAttribute('title') || ''
      const cover = wide(card.querySelector(S.cardCover)?.getAttribute('src'))
      if (!name) continue
      const id = /\/discover\/recommend\/taste/.test(href) ? 'daily' : idOf(href)
      if (!id) continue
      found.push({ id, name, cover, playCount: 0 })
    }
    return found
      .sort((a, b) => Number(b.id === RADAR) - Number(a.id === RADAR) || Number(b.id === 'daily') - Number(a.id === 'daily'))
      .slice(0, 2)
  }
  const lists = () => {
    const personal = personalShown()
    const shown = shownLists()
    if (personal.length > 0) known = merged(personal, shown ?? [], suggested)
    else if (shown) known = merged(shown, suggested)
    else if (known.length === 0 && suggested.length > 0) known = merged(suggested)
    return known
  }
  const askFor = async () => {
    asking = true
    try {
      suggested = await recommended()
    } finally {
      asking = false
    }
    tell(true)
  }

  // --- What the app asks of the page --------------------------------------------------------------------------

  // The page's own navigation of the content: its hash router, which the frame follows (`GDispatcher`); the
  // frame's own address when that isn't there, or when the router didn't move it a moment after.
  const open = (path) => {
    const address = () => {
      try {
        return frame()?.location?.href ?? ''
      } catch {
        return ''
      }
    }
    const go = () => {
      try {
        const content = frame()?.defaultView
        if (!content) return false
        content.location.href = path
        return true
      } catch {
        return false
      }
    }
    const before = address()
    let routed = false
    try {
      if (typeof window.GDispatcher?.dispatch === 'function') {
        window.GDispatcher.dispatch(path)
        routed = true
      } else if (typeof window.GDispatcher?.refreshIFrame === 'function') {
        window.GDispatcher.refreshIFrame(path)
        routed = true
      }
    } catch {
      // The page's own router isn't there (yet): the frame's address goes.
    }
    if (!routed) return go()
    setTimeout(() => {
      try {
        if (address() === before) go()
      } catch {
        // The frame's own, gone: nothing to move.
      }
    }, 1500)
    return true
  }
  const click = (selector) => {
    const button = document.querySelector(selector)
    button?.click()
    return Boolean(button)
  }

  // --- Playing: the page's own player's way, timed and rescued -------------------------------------------------
  //
  // A song is played by the page's own player (`nm.x.ceo2i('play', 18, <id>)`, what its own links call): its own
  // data source and player, no page opened and no row clicked. Each command is watched (owner: "three songs in,
  // and it sticks"; Spotify's bridge recovers in 10 s, and this one the same): every 100 ms, how far the sound's
  // own element is. Moving within 10 s is the normal way, and nothing more is done. Past 10 s: three graded
  // rescues, never a skip and never a burst of presses —
  //   1. its own player's way again (the same song); its play button only when its state says paused;
  //   2. 3 s later: the song's own row's play, where the content page still shows it (its own queue kept);
  //   3. 3 s later: the hidden page loaded anew, the song played on once the page is back (the queue is lost; the
  //      sound isn't).
  // Each step, its moment and what the player's element said then go to the host in the timing report.
  const playerOf = () => {
    try {
      return window.nm?.x?.ceo2i
    } catch {
      return null
    }
  }
  const playByPlayer = (id) => {
    const play = playerOf()
    if (typeof play !== 'function') return false
    try {
      play('play', 18, id)
      return true
    } catch {
      return false
    }
  }
  // The sound's own element now: the one playing, else the last it made (the page's may not be in the document).
  const soundingNow = () => {
    const all = [...media]
    return (
      all.find((element) => !element.paused && !element.ended && element.readyState >= 2) ??
      all.find((element) => !element.paused && !element.ended) ??
      all.at(-1) ??
      null
    )
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
  const RELOAD_KEY = 'westplay.netease.reload-play'
  const watch = { timer: null, action: null, id: null, since: 0, steps: [], level: 0, last: null, raw: null }
  const stepLine = (what) => {
    if (watch.steps.length < 40) watch.steps.push(`${what}@${Math.round(performance.now() - watch.since)}ms`)
  }
  const sayTiming = (ok, took, extra = {}) =>
    post({
      timing: { action: watch.action, sounding: ok ? took : null, steps: watch.steps.join(', '), ...extra },
    })
  const stopWatch = () => {
    clearInterval(watch.timer)
    watch.timer = null
  }
  // A rescue, one level at a time (`level`: 1, 2 or 3): each says its own moment and the player's own state then.
  const rescue = (level) => {
    watch.level = level
    const id = watch.id
    const state = elementState()
    const facts = state ? `${JSON.stringify(state)}` : 'no-element'
    if (level === 1) {
      stepLine(`rescue1 play-again ${facts}`)
      if (id) playByPlayer(id)
      if (!isPlaying() && click(S.play)) stepLine('rescue1 button')
      sayTiming(false, Math.round(performance.now() - watch.since), { rescue: 1 })
      return
    }
    if (level === 2) {
      stepLine(`rescue2 row-or-player ${facts}`)
      const doc = frame()
      const row =
        id && doc
          ? [...doc.querySelectorAll(S.rows)].find((row) => dataId(row.querySelector(S.rowPlay)?.getAttribute('data-res-id')) === id)
          : null
      if (row) {
        row.querySelector(S.rowPlay)?.click()
        stepLine('rescue2 row')
      } else if (id) {
        playByPlayer(id)
      } else if (!isPlaying()) {
        click(S.play)
      }
      sayTiming(false, Math.round(performance.now() - watch.since), { rescue: 2 })
      return
    }
    // The page loaded anew: the song played on once this script runs again and the page is up.
    stepLine(`rescue3 reload ${facts}`)
    try {
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ id, at: Date.now() }))
    } catch {
      // Storage blocked: the reload happens, the song isn't played on (the app's own play is still there).
    }
    sayTiming(false, Math.round(performance.now() - watch.since), { rescue: 3, reloading: true })
    stopWatch()
    location.reload()
  }
  // A play watched: its own element's clock moving for the song asked is the normal way (the took it says); 10 s
  // without, then the three rescues at their own times.
  const timePlay = (action, id = null) => {
    stopWatch()
    watch.action = action
    watch.id = id
    watch.since = performance.now()
    watch.steps = []
    watch.level = 0
    watch.last = null
    watch.raw = null
    const before = elementState()
    if (before) stepLine(`before ${JSON.stringify(before)}`)
    watch.timer = setInterval(() => {
      const took = Math.round(performance.now() - watch.since)
      const state = elementState()
      const at = state && !state.paused ? state.at : null
      const moving = at !== null && watch.last !== null && at > watch.last + 0.05
      if (moving && state && state.at !== null) watch.last = state.at
      const current = track()
      const ours = !id || action === 'resume' || String(current?.id ?? '') === String(id)
      if (moving && ours) {
        stopWatch()
        stepLine(`sounding ${took}ms`)
        sayTiming(true, took)
        return
      }
      if (took < WATCH_FOR) return
      const level = took >= WATCH_FOR + 2 * RESCUE_AFTER ? 3 : took >= WATCH_FOR + RESCUE_AFTER ? 2 : 1
      if (level > watch.level) rescue(level)
      if (!watch.timer) clearInterval(watch.timer)
    }, WATCH_STEP)
  }
  // A song played: its own player's way, then its own watch.
  const playSong = (id) => {
    const played = playByPlayer(id)
    if (played) timePlay('play', id)
    return played
  }
  // Playing on: its own play button, only when its own state says it's paused.
  const resume = () => {
    if (isPlaying()) return false
    timePlay('resume')
    return click(S.play)
  }
  // Paused: its own play button, only when its own state says it plays.
  const pause = () => {
    if (!isPlaying()) return false
    return click(S.play)
  }
  // Its own next and previous buttons, each timed (a skip itself isn't retried: that would move two songs on).
  const skip = (direction) => {
    timePlay(direction > 0 ? 'next' : 'previous')
    const pressed = click(direction > 0 ? S.next : S.previous)
    if (!pressed) stopWatch()
    return pressed
  }
  // The page's progress bar, dragged as the mouse drags it: from where it is to `to` seconds in.
  const seek = (to) => {
    const bar = document.querySelector(S.progressTrack)
    if (!bar) return
    const time = clock(text(document.querySelector(S.time)))
    const duration = time?.duration || playingNow()?.duration || 0
    if (!(duration > 0)) return
    const share = Math.min(1, Math.max(0, Number(to) / duration))
    const box = bar.getBoundingClientRect()
    const mouse = (type, target, clientX, clientY) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }))
    mouse('mousedown', bar, box.left + box.width * share, box.top + box.height / 2)
    mouse('mousemove', document, box.left + box.width * share, box.top + box.height / 2)
    mouse('mouseup', document, box.left + box.width * share, box.top + box.height / 2)
  }

  // A playlist's songs, as its page lists them: the page's own table (id, name, artist, length and whether it
  // plays), or the server's own list of them while the table is drawn (their ids and names only).
  const songsNow = () => {
    const doc = frame()
    if (!doc) return null
    const rows = [...doc.querySelectorAll(S.rows)]
    if (rows.length > 0) {
      return rows.map((row) => {
        const play = row.querySelector(S.rowPlay)
        const name = row.querySelector(S.rowTitle)
        const clean = row.querySelector(S.rowTitleName)?.getAttribute('title')
        const artist = row.querySelector(S.rowArtist)
        return {
          id: dataId(play?.getAttribute('data-res-id')) ?? idOf(name?.getAttribute('href')) ?? '',
          // The page hides letters in some names (a `div.soil` inside them): its own titles are the names.
          title: clean || text(name) || name?.getAttribute('title') || '',
          artist: artist?.getAttribute('title') || text(artist),
          duration: seconds(text(row.querySelector(S.rowDuration))),
          // NetEase's own "not playable" row (no right to the song, or VIP only): never pressed.
          playable: !row.classList.contains(S.rowDisabled),
        }
      })
    }
    const hidden = [...doc.querySelectorAll(S.hiddenList)].map((link) => ({
      id: idOf(link.getAttribute('href')) ?? '',
      title: text(link),
      artist: '',
      duration: 0,
      playable: true,
    }))
    return hidden.length > 0 ? hidden : null
  }
  // A playlist's songs, its own page's detail by its id (its name and its track ids), the songs then asked for by
  // their ids (the page's own interface): no page navigated. "daily" is the day's own songs, not a playlist's, and
  // comes from the day's own interface. A page is read instead only when its own interface fails and nothing
  // plays (a navigation while the music plays is what loses its queue).
  const answerPlaylist = async (id) => {
    const answer = { playlist: { id, name: '', songs: [] } }
    if (id === 'daily') {
      const songs = await dailySongs()
      if (songs.length > 0 || isPlaying()) return post({ playlist: { id, name: '', songs } })
      if (!open('/discover/recommend/taste')) return post(answer)
      return post({ playlist: { id, name: '', songs: await songsOnPage() } })
    }
    const detail = await api(`/api/v1/playlist/detail?id=${encodeURIComponent(id)}`)
    const playlist = detail?.playlist
    if (playlist) {
      const name = String(playlist.name ?? '')
      const ids = (Array.isArray(playlist.trackIds) ? playlist.trackIds : []).map((each) => String(each.id))
      const songs = await songsByIds(ids.slice(0, 1000))
      return post({ playlist: { id, name, songs } })
    }
    if (isPlaying()) return post(answer)
    if (!open(`/playlist?id=${encodeURIComponent(id)}`)) return post(answer)
    const songs = await songsOnPage()
    return post({ playlist: { id, name: atPath('/playlist') ? text(frame()?.querySelector(S.playlistName)) : '', songs } })
  }
  // A playlist's page's songs, as a fallback reads them (a page opened only while nothing plays), at most
  // PLAYLIST_WAIT.
  const songsOnPage = async (wait = PLAYLIST_WAIT) => {
    const started = Date.now()
    let songs = null
    while (Date.now() - started < wait) {
      await sleep(250)
      songs = songsNow()
      // The page's own table over the server's list: once it's there, its rows are the ones to read.
      if (songs && (frame()?.querySelector(S.rows) || Date.now() - started > 6000)) break
    }
    return songs ?? []
  }

  // --- Home: the day's own songs, and the account's playlists ------------------------------------------------
  //
  // The page's own interface: the day's songs (its own 每日歌曲推荐), the account's cards (私人雷达 and its own
  // playlists, the account's recommendation interface's own, whose first is the radar), and the page's recommended
  // ones. A page is navigated only when its interface fails and nothing plays.

  // The day's own songs (每日歌曲推荐): its interface's own, 33 for the day; its page's table read instead only
  // when that fails and nothing plays (a navigation would rebuild the player).
  const dailySongs = async () => {
    const answer = await api('/api/v1/discovery/recommend/songs')
    const rows = Array.isArray(answer?.data?.dailySongs)
      ? answer.data.dailySongs
      : Array.isArray(answer?.recommend)
        ? answer.recommend
        : []
    const songs = rows.map(songOf).filter(Boolean)
    if (songs.length > 0 || isPlaying()) return songs
    if (!open('/discover/recommend/taste')) return []
    return songsOnPage(HOME_WAIT)
  }
  // The account's own 私人雷达: the recommendation interface's own first card.
  const RADAR_ID = '3136952023'
  const answerHome = async () => {
    const [own, cards] = await Promise.all([
      api('/api/v1/discovery/recommend/resource'),
      api(`/api/personalized/playlist?limit=${LISTS}`),
    ])
    const recommend = Array.isArray(own?.recommend) ? own.recommend : []
    const radarCard = recommend.find((item) => String(item.id) === RADAR_ID) ?? null
    const personal = recommend
      .filter((item) => String(item.id) !== RADAR_ID)
      .map(playlistOf)
      .filter(Boolean)
      .slice(0, LISTS)
    const recommended = (Array.isArray(cards?.result) ? cards.result : [])
      .filter((item) => Number(item?.type) === 0)
      .map(playlistOf)
      .filter(Boolean)
      .filter((list) => !personal.some((each) => each.id === list.id))
      .slice(0, LISTS)
    // Its cards are known before its day's songs: the app draws them, and its day's page comes with them.
    post({ home: { radar: radarCard ? playlistOf(radarCard) : null, personal, recommended, daily: null } })
    post({ home: { radar: radarCard ? playlistOf(radarCard) : null, personal, recommended, daily: { songs: await dailySongs() } } })
  }

  // --- The account's own playlists: its own interface (我的音乐) ----------------------------------------------

  // The account's playlists, by the page's own groups (创建的歌单, 收藏的歌单): its user's own interface in one
  // answer, the groups made from who made each (the account, or another for one collected). Its 我喜欢的音乐
  // (specialType 5) is the liked state's own list, kept here for that.
  const answerLibrary = async () => {
    const answer = { library: { groups: [] } }
    const uid = uidOf()
    if (!uid) return post(answer)
    const own = await api(`/api/user/playlist?uid=${encodeURIComponent(uid)}&limit=100&offset=0`)
    const lists = Array.isArray(own?.playlist) ? own.playlist : []
    const liked =
      lists.find((list) => Number(list.specialType) === 5) ?? lists.find((list) => /喜欢的音乐$/.test(String(list.name ?? '')))
    if (liked?.id) likedPlaylistId = String(liked.id)
    const cards = lists
      .filter((list) => list?.id && list?.name)
      .map((list) => ({
        id: String(list.id),
        name: String(list.name),
        cover: wide(list.coverImgUrl),
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

  // --- A search: the page's own interface (its 单曲, 歌手 and 歌单) -------------------------------------------
  //
  // Its own interface's search, its three kinds the app shows: its songs (单曲), its artists (歌手) and its
  // playlists (歌单), each with its page's own count. The last search asked is the only one answered (a newer one
  // takes over). No page is navigated for it.
  const SEARCH_KINDS = { songs: 1, artists: 100, playlists: 1000 }
  let searchAsked = 0

  // One of a search's kinds, as its own interface answers it: its result (its songs, artists or playlists in it),
  // or null. Its songs' own rights are asked for after (its search's answer has none).
  const searchKind = async (query, type) => {
    const limit = type === SEARCH_KINDS.songs ? 60 : 30
    const answer = await api(`/api/search/get?s=${encodeURIComponent(query)}&type=${type}&limit=${limit}&offset=0`)
    return answer?.result ?? null
  }
  const answerSearch = async (query) => {
    const said = String(query ?? '').trim().slice(0, 60)
    const token = ++searchAsked
    const answer = {
      search: { query: said, songs: [], artists: [], playlists: [], songsTotal: 0, artistsTotal: 0, playlistsTotal: 0 },
    }
    if (!said) return post(answer)
    // Its three kinds at once (its own interface's own search), the songs' rights asked for after (its search's
    // answer has none: its own song detail has each one's `st`).
    const [songResults, artistResults, playlistResults] = await Promise.all([
      searchKind(said, SEARCH_KINDS.songs),
      searchKind(said, SEARCH_KINDS.artists),
      searchKind(said, SEARCH_KINDS.playlists),
    ])
    if (token !== searchAsked) return
    const raw = Array.isArray(songResults?.songs) ? songResults.songs : []
    const details = await songsByIds(raw.map((song) => song.id))
    if (token !== searchAsked) return
    const known = new Map(details.map((song) => [song.id, song]))
    answer.search.songs = raw
      .map((song) => known.get(String(song.id)) ?? songOf(song))
      .filter(Boolean)
      .slice(0, 60)
    answer.search.songsTotal = Math.max(0, Number(songResults?.songCount) || answer.search.songs.length)
    answer.search.artists = (Array.isArray(artistResults?.artists) ? artistResults.artists : [])
      .map((artist) => ({
        id: String(artist?.id ?? ''),
        name: String(artist?.name ?? ''),
        cover: wide(artist?.picUrl ?? artist?.img1v1Url),
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

  // --- An artist's page ---------------------------------------------------------------------------------------

  // An artist's page, from the page's own interface: its artist (name, alias, picture) and their most played songs
  // (its own `hotSongs`, each with the account's own right). Its page is read instead only when that fails and
  // nothing plays.
  const answerArtist = async (id) => {
    const answer = { artist: { id, name: '', alias: '', cover: null, songs: [] } }
    const detail = await api(`/api/v1/artist/${encodeURIComponent(id)}`)
    const artist = detail?.artist
    if (artist) {
      const alias = Array.isArray(artist.alias) ? artist.alias.filter(Boolean).join(' / ') : String(artist.alias ?? '')
      const songs = (Array.isArray(detail.hotSongs) ? detail.hotSongs : []).map(songOf).filter(Boolean).slice(0, ARTIST_MOST)
      return post({
        artist: {
          id,
          name: String(artist.name ?? ''),
          alias,
          cover: wide(artist.cover ?? artist.picUrl ?? artist.img1v1Url),
          songs,
        },
      })
    }
    if (isPlaying()) return post(answer)
    if (!open(`/artist?id=${encodeURIComponent(id)}`)) return post(answer)
    const started = Date.now()
    let page = null
    while (Date.now() - started < ARTIST_WAIT) {
      await sleep(250)
      if (!atPath('/artist') || idOf(frame()?.location?.search) !== id) continue
      page = artistOnPage()
      // Its own header's there: its songs come under it (an artist's page may have none at all).
      if (page && page.songs.length > 0) break
    }
    post({ artist: page ? { id, ...page } : answer.artist })
  }
  // An artist's page's own header and table, as the fallback reads them.
  const artistOnPage = () => {
    const doc = frame()
    if (!doc) return null
    const name = text(doc.querySelector(S.artistName)).replace(/\s*-\s*$/, '')
    if (!name) return null
    const alias = text(doc.querySelector(S.artistAlias)).replace(/\s*-\s*$/, '')
    const songs = []
    for (const row of doc.querySelectorAll(S.artistRows)) {
      const play = row.querySelector(S.artistRowPlay)
      const link = row.querySelector(S.artistRowLink)
      const songId = dataId(play?.getAttribute('data-res-id')) ?? idOf(link?.getAttribute('href'))
      const title = row.querySelector(S.artistRowTitle)?.getAttribute('title') || text(link) || ''
      if (!songId || !title) continue
      songs.push({
        id: songId,
        title,
        artist: name,
        duration: seconds(text(row.querySelector(S.artistRowDuration))),
        // The page's own "not playable" row (no right to the song, or VIP only).
        playable: !row.classList.contains(S.rowDisabled),
      })
      if (songs.length >= ARTIST_MOST) break
    }
    return { name, alias, cover: wide(doc.querySelector(S.artistCover)?.getAttribute('src')), songs }
  }

  // --- The account's own recent songs ------------------------------------------------------------------------
  //
  // The web player has no 最近播放 page of its own (checked on the signed-in page, 2026-11-19): what it has is
  // 听歌排行, the songs the account played this week, which its own page asks its own API for. Read the same way
  // (same origin, the page's own session): the account's own list, and nothing of it written down here.
  const recentSongs = async () => {
    const uid = uidOf()
    if (!uid) return []
    try {
      const response = await fetch(`/api/v1/play/record?type=1&uid=${uid}&limit=${RECENT_MOST}`, {
        credentials: 'same-origin',
      })
      if (!response.ok) return []
      const answer = await response.json()
      const rows = Array.isArray(answer?.weekData) ? answer.weekData : []
      return rows
        .slice(0, RECENT_MOST)
        .map((row) => {
          const song = row?.song
          if (!song?.id || !song?.name) return null
          const artists = (Array.isArray(song.ar) ? song.ar : [])
            .map((artist) => artist?.name)
            .filter(Boolean)
            .join('/')
          return {
            id: String(song.id),
            title: String(song.name),
            artist: artists,
            duration: Math.round((Number(song.dt) || 0) / 1000),
            // Its own privilege: below 0 is the account's rights not letting it play.
            playable: Number(song.privilege?.st ?? 0) >= 0,
          }
        })
        .filter(Boolean)
    } catch {
      return []
    }
  }
  const answerRecent = async () => post({ recent: { songs: await recentSongs() } })

  // --- 红心: the account's own 我喜欢的音乐 ---------------------------------------------------------------
  //
  // NetEase's "liked" is a song's place in the account's own 我喜欢的音乐 playlist (its `specialType` 5): the
  // state is read from that playlist's own track ids (the page's own interface), and a like adds the song to it,
  // an unlike takes it out (`/api/playlist/manipulate/tracks`, its own `csrf_token` the page's own cookie, the
  // same the page's own collect menu sends). Verified on the owner's account 2026-11-19: add -> count 2748, the
  // song in `trackIds`; del -> count 2747, gone.
  let likedPlaylistId = null
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
    const liked = lists.find((list) => Number(list.specialType) === 5) ?? lists.find((list) => /喜欢的音乐$/.test(String(list.name ?? '')))
    likedPlaylistId = liked?.id ? String(liked.id) : null
    return likedPlaylistId
  }
  // That playlist's own track ids: a Set, kept a minute (a song's own like asks it for itself).
  const likedSet = async (force = false) => {
    const now = Date.now()
    if (!force && likedIds && now - likedFetchedAt < 60000) return likedIds
    const id = await likedPlaylist()
    if (!id) {
      likedIds = null
      return null
    }
    const detail = await api(`/api/v1/playlist/detail?id=${encodeURIComponent(id)}`)
    const ids = detail?.playlist?.trackIds
    likedIds = Array.isArray(ids) ? new Set(ids.map((each) => String(each.id))) : null
    likedFetchedAt = now
    return likedIds
  }
  // Whether a song is in it now (null while the list isn't known: signed out, or still coming).
  const likedNow = (id) => {
    if (!likedIds || !id) return null
    return likedIds.has(String(id))
  }
  // A like asked for (the app's own heart): added to or taken from 我喜欢的音乐, said as it's done (or not), and
  // the state's own said after it. Never a press of its page's own button: this is the page's own collect
  // interface, and whether it really landed is read back from the playlist itself.
  const setLiked = async (id, liked) => {
    const playlist = await likedPlaylist()
    const token = csrf()
    if (!playlist || !token) {
      post({ like: { id, liked, ok: false, reason: playlist ? 'csrf' : 'account' } })
      return
    }
    let ok = false
    try {
      const body = `op=${liked ? 'add' : 'del'}&pid=${encodeURIComponent(playlist)}&trackIds=${encodeURIComponent(`[${id}]`)}&csrf_token=${encodeURIComponent(token)}`
      const response = await fetch('/api/playlist/manipulate/tracks', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      })
      const answer = await response.json().catch(() => null)
      const code = Number(answer?.code)
      // 200: done. 502 ("歌单内歌曲重复"): it was already liked (a state read a moment late): done, too.
      ok = code === 200 || /重复/.test(String(answer?.message ?? '')) || /重复/.test(String(answer?.msg ?? ''))
    } catch {
      ok = false
    }
    // Whether it landed: the playlist's own ids again (never the answer alone).
    if (ok) await likedSet(true)
    post({ like: { id, liked, ok } })
    tell(true)
  }

  // --- The app's commands, as the host passes them on (netease.rs's Command) -----------------------------------
  //
  //   { action: "play" }                        play on (its own play button, when its state says paused)
  //   { action: "play", value: "<song id>" }    that song played by its own player (`nm.x.ceo2i('play', 18, id)`),
  //                                             watched for its sound, rescued if it doesn't come. Only digits:
  //                                             the host lets no other id in.
  //   { action: "pause" | "next" | "prev" }     its own play/pause, next and previous buttons (each timed)
  //   { action: "seek", value: <seconds> }      its progress bar, dragged there as a mouse drags it
  //   { action: "volume", value: <0 to 1> }     its own audio element's volume (kept over the page's own changes)
  //   { action: "setLike", value: "<id>", liked: <bool> }  that song added to or taken from 我喜欢的音乐, done
  //                                             through the page's own collect interface (`like` answered)
  //   { action: "openPlaylist", value: "<id>" } that playlist's songs asked of the page's own interface (`playlist`)
  //   { action: "openArtist", value: "<id>" }   that artist's page asked of the page's own interface (`artist`)
  //   { action: "home" }                        Home's cards and the day's own songs (`home`)
  //   { action: "library" }                     the account's own playlists, by group (`library`)
  //   { action: "search", value: "<words>" }    the page's own search of them, its songs, artists and playlists
  //                                             answered (`search`)
  //   { action: "recent" }                      the account's recent songs (its 听歌排行 this week) (`recent`)
  //   { action: "refresh" }                     the state and the recommended playlists read again
  //
  // and the cab's own (cab_sound.js: speakers, head, outside, menu, equalizer, spectrum), not the app's.
  const CONTROLS = {
    play: ({ value }) => (value ? playSong(String(value)) : resume()),
    pause: () => pause(),
    next: () => skip(1),
    prev: () => skip(-1),
    seek: ({ value }) => seek(value),
    volume: ({ value }) => setVolume(value),
    setLike: ({ value, liked }) => setLiked(String(value), Boolean(liked)),
    openPlaylist: ({ value }) => answerPlaylist(String(value)),
    openArtist: ({ value }) => answerArtist(String(value)),
    home: () => answerHome(),
    library: () => answerLibrary(),
    search: ({ value }) => answerSearch(value),
    recent: () => answerRecent(),
    // The state and the lists read again (as if the page loaded anew): the app's pull to refresh.
    refresh: () => {
      told = ''
      toldLists = ''
      asked = false
      tell(true)
    },
  }

  // --- The truck's own speakers, the cab, and the app ---------------------------------------------------------

  // The sound's own element (the page's audio), made through the truck's speakers (cab_sound.js, loaded first):
  // told the speakers, the head and the camera by the host.
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

  // --- A play the page's sound doesn't follow (the last resort) -----------------------------------------------
  //
  // A play's own watch (timePlay) rescues a song that doesn't start; this watches a play on (owner: "it plays three
  // songs and sticks"): the play bar says it plays while its own clock stands still (and its element's). The page is
  // left alone for 15 s first (a song loading, a buffering moment), then its own player's way once, and no more
  // often than every 20 s — never a skip, never a burst of presses.
  const HEAL_AFTER = 15000
  const HEAL_COOLDOWN = 20000
  const HEAL_INTERVAL = 1500
  let stuckSince = 0
  let stuckTrack = ''
  let lastHeal = 0
  let heals = 0
  let lastAt = null
  let lastAtSince = 0
  const heal = () => {
    if (!isPlaying()) {
      stuckSince = 0
      stuckTrack = ''
      return
    }
    const now = track()
    const audio = audioState()
    // Its own element (when one is known) going quiet is a stuck play too, even while its play bar's clock moves.
    const silent = audio.elements > 0 && !audio.playing
    const at = Number.isFinite(audio.at) ? audio.at : barSeconds()
    const key = String(now?.id || now?.title || '')
    if (key !== stuckTrack) {
      stuckTrack = key
      stuckSince = 0
      lastAt = at
      lastAtSince = Date.now()
      return
    }
    if (!silent && at !== lastAt) {
      lastAt = at
      lastAtSince = Date.now()
    }
    // Its own clock moved a moment ago: a song loading, not one stuck.
    if (!silent && Number.isFinite(at) && Date.now() - lastAtSince < HEAL_AFTER) {
      stuckSince = 0
      return
    }
    if (!stuckSince) stuckSince = Date.now()
    if (Date.now() - stuckSince < HEAL_AFTER || Date.now() - lastHeal < HEAL_COOLDOWN) return
    lastHeal = Date.now()
    heals += 1
    const state = elementState()
    stepLine(`heal ${state ? JSON.stringify(state) : 'no-element'}`)
    post({ timing: { action: 'heal', sounding: null, steps: watch.steps.join(', '), rescue: 0 } })
    if (now?.id) playByPlayer(now.id)
    else if (!audio.playing) click(S.play)
    stuckSince = Date.now()
  }
  setInterval(heal, HEAL_INTERVAL)

  // A play whose own rescue reloaded the page (timePlay's level 3): the song played on once this script is back
  // (the page's queue is lost; the sound isn't), at most a minute after the reload asked for it.
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
        timePlay('play', id)
      }
    }, 500)
  }


  // What the page says of itself, said to the host as it changes (once a second): signed in or not (said only
  // once the page knows), playing, the volume, what plays, and the recommended playlists when they change.
  let told = ''
  let toldLists = ''
  let asked = false
  const tell = (always = false) => {
    const signed = signedIn()
    if (signed === null) return
    const current = lists()
    const saidLists = current.length > 0 && JSON.stringify(current) !== toldLists ? current : null
    if (saidLists) toldLists = JSON.stringify(current)
    // The content's page shows some of the recommended playlists only (its own API the rest): asked once.
    if (!asked && current.length < LISTS && !asking) {
      asked = true
      askFor()
    }
    const playing = track()
    // A song's own liked state: its playlist's ids asked as the song changes (never on every reading).
    if (playing?.id && playing.id !== likedForTrack) {
      likedForTrack = playing.id
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
      account: account(),
      audio: audioState(),
    }
    const now = JSON.stringify(state)
    if (!always && now === told && !saidLists) return
    told = now
    post({ state: saidLists ? { ...state, lists: saidLists } : state })
  }
  setInterval(() => tell(), 1000)

  // The live test (netease.rs): what the page says of itself, and the content's own address and lists' count.
  window.westplayNetease = () => ({
    signedIn: signedIn(),
    playing: isPlaying(),
    volume: volume(),
    track: track(),
    lists: lists(),
    account: account(),
    audio: audioState(),
    personal: personalShown(),
    // The page's own player's way to play a song (the live test checks it's there; playback needs an account).
    playAPI: typeof window.nm?.x?.ceo2i,
    frame: (() => {
      try {
        return frame()?.location?.href ?? null
      } catch {
        return null
      }
    })(),
    cards: frame()?.querySelectorAll(S.cards)?.length ?? -1,
    rows: frame()?.querySelectorAll(S.rows)?.length ?? -1,
    // The play the sound didn't follow, and how often the page woke it (the live test watches the log's line).
    heals,
    stuck: Boolean(stuckSince) && Date.now() - stuckSince > HEAL_AFTER,
    // The play's own timing steps, and the song's own liked state (the app's heart).
    timing: watch.steps.join(', '),
    liked: likedNow(track()?.id),
    likedKnown: likedIds ? likedIds.size : null,
  })

  addEventListener('DOMContentLoaded', () => post({ ready: true }))
  // A play its own rescue reloaded the page for: the song played on as this script is back.
  resumeAfterReload()
  // The content's page (the frame) loads after this page: its recommended playlists are read once it has.
  tell()
})()
