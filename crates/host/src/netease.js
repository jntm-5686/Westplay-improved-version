// WestPlay, in NetEase Cloud Music's web player (music.163.com, netease.rs): the official page, run hidden under
// the cab. The NetEase app the player sees is WestPlay's own (ui/src/cabin/apps/netease); this reads the page's
// player and lists from its own page, and plays through the page's own buttons, as its own page does:
//
// - The page is a shell of its own: its player at the bottom, its content in a frame of the same origin
//   (`#g_iframe`, on `https://music.163.com/discover`). The frame's document is reached from here, so the
//   recommended playlists and a playlist's songs are read without any cross-origin frame.
// - The player's state (signed in or not, playing, the song, the artist, the cover, how far in) is in the shell's
//   own play bar, read as it changes (~1 s). No request of the page's own is made for it.
// - Playing is the page's own: its play/pause button, its next and previous, its progress bar (dragged with the
//   mouse events a drag sends), its audio element's volume, and a song's own play in its list, or its own player
//   (`nm.x.ceo2i`, what its own links play a song by) — the page's own data and player, never an address asked of
//   its servers here.
// - Signing in is the page's own QR code dialog, in a window on the desktop (signin.rs); this page then loads
//   again, signed in. Nothing of the account leaves the page: only whether it's signed in is said, never its
//   name or anything else of it.
//
// Messages to the host (netease.rs), over `chrome.webview.postMessage` as the other players':
//   { state: { signedIn, playing, volume, track, lists? } }   what the page says of itself (lists when changed)
//   { playlist: { id, name, songs: [{ id, title, artist, duration, playable }] } }   a playlist asked for
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
    // A song's own page (`…/song?id=…`): its play button.
    songPlay: '#content-operation a[data-res-action="play"]',
  }
  // How many recommended playlists the app shows, how long its page has to show whose account it is, and how long
  // a playlist's page has to show its songs.
  const LISTS = 12
  const ACCOUNT_WAIT = 20000
  const PLAYLIST_WAIT = 15000
  const SONG_WAIT = 12000

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

  // A song (`id`) played as the page itself plays one: its row's own play where its list shows it (the list
  // stays the queue), or its own player's way (`nm.x.ceo2i`, what its own links play a song by: its own data
  // source and player), or its own page's play button.
  const playSong = async (id) => {
    const queued = () => {
      try {
        return window.player?.getPlaying?.() ?? null
      } catch {
        return null
      }
    }
    const doc = frame()
    const row = doc && [...doc.querySelectorAll(S.rows)].find((row) => dataId(row.querySelector(S.rowPlay)?.getAttribute('data-res-id')) === id)
    if (row) {
      row.querySelector(S.rowPlay)?.click()
      // Its own player up to it (a moment's loading, or the page refusing: no account): its own way, then.
      const until = Date.now() + 3000
      while (Date.now() < until) {
        if (isPlaying() || String(queued()?.track?.id ?? '') === id) return
        await sleep(200)
      }
    }
    try {
      const play = window.nm?.x?.ceo2i
      if (typeof play === 'function') {
        play('play', 18, id)
        return
      }
    } catch {
      // Its own player's way, changed: its own page, then.
    }
    if (!open(`/song?id=${encodeURIComponent(id)}`)) return
    const started = Date.now()
    while (Date.now() - started < SONG_WAIT) {
      await sleep(200)
      if (click(S.songPlay)) return
    }
  }
  // Playing on: its own play button, when it isn't playing.
  const resume = () => {
    if (!isPlaying()) click(S.play)
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
  // A playlist's page (`id` the playlist's), its songs answered with as soon as its page lists them: at most
  // PLAYLIST_WAIT for the page to show them (none if it doesn't).
  const answerPlaylist = async (id) => {
    const answer = { playlist: { id, name: '', songs: [] } }
    // 每日歌曲推荐 is a page of the day's songs, not a playlist of its own (`id`: "daily", the app's own name).
    const daily = id === 'daily'
    if (!open(daily ? '/discover/recommend/taste' : `/playlist?id=${encodeURIComponent(id)}`)) return post(answer)
    const started = Date.now()
    let songs = null
    while (Date.now() - started < PLAYLIST_WAIT) {
      await sleep(250)
      songs = songsNow()
      // The page's own table over the server's list: once it's there, its rows are the ones to read.
      const drawn = Boolean(frame()?.querySelector(S.rows))
      if (songs && (drawn || Date.now() - started > 6000)) break
    }
    return post({
      playlist: {
        id,
        name: daily ? '' : text(frame()?.querySelector(S.playlistName)),
        songs: songs ?? [],
      },
    })
  }

  // --- The app's commands, as the host passes them on (netease.rs's Command) -----------------------------------
  //
  //   { action: "play" }                        play on (its play/pause button, when it isn't playing)
  //   { action: "play", value: "<song id>" }    that song played (its row's own play where its list shows it, so
  //                                             the list stays the queue; else its own player `nm.x.ceo2i`; else
  //                                             its page's play button). Only digits: the host lets no other id in.
  //   { action: "pause" | "next" | "prev" }     its own play/pause, next and previous buttons
  //   { action: "seek", value: <seconds> }      its progress bar, dragged there as a mouse drags it
  //   { action: "volume", value: <0 to 1> }     its own audio element's volume (kept over the page's own changes)
  //   { action: "openPlaylist", value: "<id>" } that playlist's page opened, its songs answered with (`playlist`);
  //                                             "daily" is the day's own songs (每日歌曲推荐)
  //   { action: "refresh" }                     the state and the recommended playlists read again
  //
  // and the cab's own (cab_sound.js: speakers, head, outside, menu, equalizer, spectrum), not the app's.
  const CONTROLS = {
    play: ({ value }) => (value ? playSong(String(value)) : resume()),
    pause: () => {
      if (isPlaying()) click(S.play)
    },
    next: () => click(S.next),
    prev: () => click(S.previous),
    seek: ({ value }) => seek(value),
    volume: ({ value }) => setVolume(value),
    openPlaylist: ({ value }) => answerPlaylist(String(value)),
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
    const state = {
      signedIn: signed,
      playing: isPlaying(),
      volume: volume(),
      track: track(),
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
  })

  addEventListener('DOMContentLoaded', () => post({ ready: true }))
  // The content's page (the frame) loads after this page: its recommended playlists are read once it has.
  tell()
})()
