// WestPlay: Player's own player (music_folder.rs), in a WebView of its own hidden under the cabin page: the
// songs of the game's music folder (served at https://westplay.music/), played by one audio element, its sound
// through the truck's own speakers (cab_sound.js, loaded first). The cab's Player app says what to play; this
// says what plays.
;(() => {
  if (location.hostname !== 'westplay.player') return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const audio = new Audio()
  audio.preload = 'auto'
  // Its sound taken into the page's own sound processing (the speakers): served for any page, as asked.
  audio.crossOrigin = 'anonymous'
  const url = (file) => `https://westplay.music/${encodeURIComponent(file)}`

  // The songs as asked (the folder's order), the order they play in (shuffled or not), and which plays.
  let asked = []
  let queue = []
  let index = -1
  let shuffle = false
  let repeat = 'off'

  const shuffled = (files) => {
    const out = [...files]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  const current = () => queue[index] ?? null

  // What plays: the song, playing or not (and loading: asked to play, its sound not come yet), where, how
  // long, the options, the volume, and where it is in the songs (`null`: nothing).
  let told = ''
  const tell = () => {
    const file = current()
    const playback = file && {
      file,
      playing: !audio.paused,
      loading: !audio.paused && audio.readyState < 3,
      position: Number(audio.currentTime) || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      shuffle,
      repeat,
      volume: audio.volume,
      index,
      count: queue.length,
    }
    const now = JSON.stringify(playback ?? null)
    if (now === told) return
    told = now
    post({ playback: playback ?? null })
  }

  const load = (at, play) => {
    index = at
    const file = current()
    if (!file) {
      audio.removeAttribute('src')
      audio.load()
      tell()
      return
    }
    audio.src = url(file)
    if (play) audio.play().catch(() => tell())
    tell()
  }

  // Next (1) or back (-1); past the last: the first again with Repeat, else stopped at the last's start.
  const skip = (by, play = !audio.paused) => {
    if (queue.length === 0) return
    const next = index + by
    if (next >= queue.length) {
      if (repeat === 'all') return load(0, play)
      audio.pause()
      audio.currentTime = 0
      return tell()
    }
    load(Math.max(0, next), play)
  }

  const CONTROLS = {
    // The songs (file names, in the folder's order) from the one at `index`, shuffled or not; with none, play on.
    play({ files, index: at, shuffle: on }) {
      if (!Array.isArray(files)) {
        if (current()) audio.play().catch(() => tell())
        return
      }
      asked = files.filter((file) => typeof file === 'string')
      shuffle = Boolean(on)
      const first = shuffle && at == null ? asked[Math.floor(Math.random() * asked.length)] : asked[at ?? 0]
      queue = shuffle ? [first, ...shuffled(asked.filter((file) => file !== first))] : asked
      load(Math.max(0, queue.indexOf(first)), true)
    },
    pause: () => audio.pause(),
    next: () => skip(1),
    // Back: past a song's first seconds, its start.
    previous() {
      if (audio.currentTime > 3 || index <= 0) {
        audio.currentTime = 0
        tell()
      } else skip(-1)
    },
    seek({ seconds }) {
      if (Number.isFinite(seconds)) audio.currentTime = Math.max(0, seconds)
      tell()
    },
    volume({ percent }) {
      if (Number.isFinite(percent)) audio.volume = Math.min(1, Math.max(0, percent / 100))
    },
    shuffle({ on }) {
      const file = current()
      shuffle = Boolean(on)
      queue = shuffle ? [file, ...shuffled(asked.filter((each) => each !== file))].filter(Boolean) : asked
      index = file ? queue.indexOf(file) : -1
      tell()
    },
    repeat({ mode }) {
      repeat = ['off', 'all', 'one'].includes(mode) ? mode : 'off'
      tell()
    },
  }

  // What plays, its place, and whether it played: kept in the page's own session as it goes, and read at its
  // start. A page loaded anew (WestPlay loading it again after its process failed, `resilience` in the host)
  // plays the song on from where it was; the session keeps it across a reload of this WebView, and never across
  // a WebView of its own (a player closed and opened again starts with nothing playing).
  const RESUME_KEY = 'westplay.player.resume'
  const RESUME_FOR = 60000
  const resumeSave = () => {
    try {
      const file = current()
      if (!file) return
      sessionStorage.setItem(
        RESUME_KEY,
        JSON.stringify({
          file,
          asked,
          queue,
          index,
          at: Number(audio.currentTime) || 0,
          playing: !audio.paused,
          volume: audio.volume,
          shuffle,
          repeat,
          savedAt: Date.now(),
        }),
      )
    } catch {
      // The page's storage refused: the song isn't resumed, and plays no less.
    }
  }
  const resumeRead = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? 'null')
      sessionStorage.removeItem(RESUME_KEY)
      if (!saved?.file || !Array.isArray(saved.queue) || Date.now() - Number(saved.savedAt ?? 0) > RESUME_FOR) return null
      return saved
    } catch {
      return null
    }
  }
  const resumeNow = () => {
    const saved = resumeRead()
    if (!saved) return
    try {
      const files = (list) => (Array.isArray(list) ? list.filter((file) => typeof file === 'string') : [])
      asked = files(saved.asked).includes(saved.file) ? files(saved.asked) : [saved.file]
      queue = files(saved.queue).includes(saved.file) ? files(saved.queue) : [saved.file]
      index = Math.max(0, queue.indexOf(saved.file))
      shuffle = Boolean(saved.shuffle)
      repeat = ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off'
      audio.volume = Math.min(1, Math.max(0, Number(saved.volume) || 1))
      const at = Math.max(0, Number(saved.at) || 0)
      audio.src = url(saved.file)
      // Where it was, once the song's own length is known (seeking before it is ignored).
      const seek = () => {
        try {
          audio.currentTime = at
        } catch {
          // Its kind can't be sought: it plays from its start.
        }
      }
      if (audio.readyState >= 1) seek()
      else audio.addEventListener('loadedmetadata', seek, { once: true })
      if (saved.playing) audio.play().catch(() => tell())
      tell()
    } catch {
      // A marker the page can't use: the player still plays what the app asks for next.
    }
  }
  // Kept as it plays (once a second), and as the page goes (which a reload says first).
  setInterval(() => {
    if (!audio.paused) resumeSave()
  }, 1000)
  addEventListener('pagehide', resumeSave)
  addEventListener('beforeunload', resumeSave)

  audio.addEventListener('ended', () => {
    if (repeat === 'one') {
      audio.currentTime = 0
      audio.play().catch(() => tell())
    } else skip(1, true)
  })
  // A song that can't be played (gone from the folder, or a kind the browser can't play): the next.
  audio.addEventListener('error', () => {
    if (current() && queue.length > 1) skip(1, true)
    else tell()
  })
  for (const name of ['play', 'pause', 'playing', 'waiting', 'loadedmetadata', 'durationchange', 'seeked', 'volumechange']) {
    audio.addEventListener(name, tell)
  }

  // The truck's own speakers (cab_sound.js): this page's audio element, told the speakers, the head, the
  // camera and the tone by the host.
  const cab = window.westplayCabSound?.(() => audio, post)
  if (cab) setInterval(() => cab.tick(), 250)
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
    else CONTROLS[data?.action]?.(data)
  })

  // The song played when the page went, on from where it was (a page loaded anew: WestPlay loaded it again after
  // its process failed), then ready for the host (which tells the cab again).
  resumeNow()
  post({ ready: true })
  tell()
})()
