// WestPlay, in Bilibili's own pages (www.bilibili.com, live.bilibili.com, bangumi pages — bilibili.rs): the real
// site in a hidden WebView of its own, signed in with the player's own Bilibili account, playing what the cabin's
// Bilibili app (ui/src/cabin/apps/bilibili) asks it to play and reading what the app shows from the site's own
// same-origin interface.
//
//   - Playback is the page's own player's: a video is navigated to its own page (video/BV…, bangumi/play/ep…,
//     live.bilibili.com/<room>) and its own player plays it. The site's chrome is hidden by CSS and the player is
//     stretched over the whole page, whose picture the host shows under the cabin page in the rectangle the app
//     gives (show/hide/crop, as YouTube's youtube.js). Play/pause/seek/volume/rate are the video element's (the
//     player's own element), quality is the player's (`window.player` when the page has one), subtitles are read
//     from the page's own `/x/player/v2` and drawn by this script over the video (the site's own subtitle panel
//     hidden), so they work the same on every page.
//   - Everything the app shows is fetched from the page's own interface with the page's own session: nav (who is
//     signed in), the home feed's recommended items (`wbi/index/top/feed/rcmd`), popular, rankings, search (videos,
//     UPs, bangumi, movies, live), the bangumi/movie index and a season's episodes, the live rooms, the account's
//     history, its favourite folders and their videos, its following feed (dynamics) and an UP's space. Interfaces
//     that need wbi are signed with the page's own `nav` key (`wbiImgToMixinKey`, `wbiSign`; MD5 here: Web Crypto
//     has no MD5). Nothing of the account is kept or logged, and no page is navigated for data: only a play
//     navigates.
//   - Like, coin and favourite are the site's own interfaces, with the page's own `bili_jct` (the CSRF token) and
//     its own cookies (`archive/like`, `coin/add`, `fav/resource/deal`).
//   - Sound comes from the truck's own speakers (`cab_sound.js`, loaded before this): its media is the video
//     element found here, its message the host's.
//
// Messages to the host, `chrome.webview.postMessage` (bilibili.rs), each `{ <kind>: {...} }`:
//   { ready: true }
//   { state: { signedIn, playing, volume, rate, time, duration, media, qualities, quality, qualityLabel,
//              captions, caption, cabLevel } }
//   { account: { signedIn, uid, name, avatar } }
//   { home: { items } }                       the recommended feed (videos, bangumi/films, live rooms)
//   { popular: { items } }
//   { ranking: { rid, note, items } }
//   { search: { query, kind, page, total, items, users } }
//   { bangumi: { seasonType, page, total, items } }
//   { season: { seasonId, title, cover, evaluate, score, badge, episodes, sections } }
//   { live: { items } }
//   { history: { items, max, viewAt } }
//   { favorites: { folders } } / { favoriteItems: { mediaId, title, items, hasMore } }
//   { dynamic: { items, offset } }
//   { space: { mid, name, avatar, sign, level, fans, videos, items, hasMore } }
//   { detail: { bvid, aid, cid, title, cover, desc, duration, pubdate, owner, pages, stat, like, coin, favorite } }
//   { like: { bvid, on, ok, reason } } / { coin: { bvid, count, ok, reason } } /
//   { favorite: { bvid, on, ok, reason } }
//   { failed: { action, code, message } }     an interface refused (signed out, risk control, an error)
//   { spectrum: [48 bars] }                   cab_sound.js's own, while the cab's equalizer asks
// and the host's to it: { action, … } — the app's commands (bilibili.rs's Command), the cab's (speakers, head,
// outside, menu, equalizer, spectrum) and the playback ones.
//
// Every selector of the site's own is in `S` below, and nowhere else: Bilibili's pages change, that's what to fix.
;(() => {
  // This script runs in every frame of the hidden WebView: the site's pages (www, live) and the space page of a
  // frame of its own (space.bilibili.com: its interfaces are the only ones the site serves only there).
  const host = location.hostname
  const isSpaceFrame = host === 'space.bilibili.com'
  const isTop = /(^|\.)bilibili\.com$/.test(host) && window.top === window && !isSpaceFrame
  if (!isTop && !isSpaceFrame) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  // Bilibili's player asks the browser whether its local network access is granted (`navigator.permissions.query`
  // for `local-network-access`), and with a "denied" it puts its 网络状况异常 / 本地网络访问权限 wall over a play
  // (a hidden WebView2 has no one to ask, so the answer is denied: measured in its own bundle). The page is told
  // it's granted; the host also turns the checks off for this browser (bilibili.rs's `--disable-features`).
  const grantLocalNetwork = () => {
    try {
      const permissions = navigator.permissions
      if (!permissions || typeof permissions.query !== 'function') return
      const query = permissions.query.bind(permissions)
      permissions.query = function (descriptor) {
        try {
          const name = String(descriptor?.name ?? '')
          if (/local.?network/i.test(name)) {
            return Promise.resolve({
              state: 'granted',
              name,
              onchange: null,
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent: () => true,
            })
          }
        } catch {
          // A descriptor it doesn't take: the browser's own answer.
        }
        return query(descriptor)
      }
    } catch {
      // No permissions here (a browser of its own): nothing asked.
    }
  }
  grantLocalNetwork()

  // --- The site's own structure: the selectors this script knows it by --------------------------------------
  const S = {
    // The player's box on a video's, a bangumi's and a live room's page (the bpx player or the live one), and the
    // video element inside it.
    player:
      '#bilibili-player, #bpx-player-container, .bpx-player-container, #live-player, .bilibili-live-player, .live-player, #playerWrap, #live-player-wrap',
    video: '#bpx-player-container video, .bpx-player-video-wrap video, #bilibili-player video, #live-player video, .bilibili-live-player video, .live-player video, video',
    // The page's headline (its own title element), where there is one.
    title: 'h1.video-title, .video-title, h1.title, .bpx-player-title, .room-title, h1',
    // The UP's or anchor's name and picture on the page.
    owner: '.up-name, .username, .room-owner-name, .up-info--name, .bili-avatar-name, .anchor-name',
    ownerFace: '.up-avatar img, .bili-avatar img, .room-owner-face img, .anchor-avatar img',
    // The site's chrome, put away while the page plays (the player itself always shows).
    chrome: '.bili-header, #biliMainHeader, .bili-header__bar, .mini-header, .nav-mask, .bili-footer, #bilibili-bangumi-wrap, .bangumi-header, .live-tabs, .room-info, .aside, .side-bar, .right-container, .video-page-special, .video-page-container, .bangumi-container, .live-container, #commentapp, .comment, .bili-dyn-card, .fixed-tips, .bpx-player-dm-wrap, .bpx-player-subtitle-panel, .bpx-player-control-wrap, .bpx-player-control-bottom, .bili-live-player-control, .live-player-control, .bpx-player-ending-panel, .bpx-player-video-btn, .bpx-player-ctrl-btn',
    // The login link at the top (signed out), and the account's own picture (signed in).
    login: '.header-login-entry, .login-btn, .bili-header__bar .login, a[href*="passport.bilibili.com/login"]',
    avatar: '.header-avatar-wrap, .bili-avatar, .header-entry-avatar, .bili-header__avatar, .avatar-wrap',
  }
  // How long an interface's answer may take, and how many items a page of each kind is read with.
  const API_TIMEOUT = 10000
  const PAGE_SIZE = 20
  const MAX_TEXT = 300
  // The watch state (the player stretched over the page) survives the page's own navigation: a play navigates.
  const WATCH = 'westplay.bilibili.watch'
  const CROP = 'westplay.bilibili.crop'
  const RATE = 'westplay.bilibili.rate'
  const VOLUME = 'westplay.bilibili.volume'
  const CAPTION = 'westplay.bilibili.caption'
  const QUALITY = 'westplay.bilibili.quality'
  const store = {
    get(key) {
      try {
        return sessionStorage.getItem(key)
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        if (value == null) sessionStorage.removeItem(key)
        else sessionStorage.setItem(key, String(value))
      } catch {
        // The page's storage refused: the setting lasts this page.
      }
    },
  }

  // --- Small readings of the site's own words ------------------------------------------------------------------
  const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') ?? ''
  // A picture on Bilibili's own image hosts (its answers give `//i0.hdslb.com/…` or `http://`, https is wanted).
  const picture = (url) => {
    if (!url || typeof url !== 'string') return null
    try {
      const address = new URL(url.startsWith('//') ? `https:${url}` : url, location.href)
      if (address.protocol !== 'https:' && address.protocol !== 'http:') return null
      if (!/(^|\.)(hdslb\.com|bilibili\.com|bilivideo\.com|biliapi\.net)$/.test(address.hostname)) return null
      address.protocol = 'https:'
      return address.href
    } catch {
      return null
    }
  }
  // A time, in seconds: the interface's number, or its "13:31" (a video's own length text).
  const seconds = (said) => {
    if (typeof said === 'number' && Number.isFinite(said)) return Math.max(0, Math.round(said))
    const found = /^(?:(\d{1,3}):)?(\d{1,3}):(\d{2})$/.exec(String(said ?? '').trim())
    if (found) return Number(found[1] ?? 0) * 3600 + Number(found[2]) * 60 + Number(found[3])
    const plain = Number(said)
    return Number.isFinite(plain) ? Math.max(0, Math.round(plain)) : 0
  }
  const cut = (value, most = MAX_TEXT) => {
    const said = typeof value === 'string' ? value : ''
    return said.length > most ? said.slice(0, most) : said
  }
  // The interface's numbers: it may say them as strings ("1.2万", "665930"), or not at all.
  const number = (said) => {
    if (typeof said === 'number' && Number.isFinite(said)) return Math.max(0, Math.trunc(said))
    const found = /([\d.]+)\s*(万|亿)?/.exec(String(said ?? '').replace(/,/g, ''))
    if (!found) return 0
    const value = Number(found[1]) * (!found[2] ? 1 : found[2] === '万' ? 10_000 : 100_000_000)
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  }

  // --- The site's own interface, as its own pages ask it ------------------------------------------------------
  //
  // Its session's cookies go with every call (`credentials: 'include'`: api.bilibili.com is another host but the
  // same site); its answers are cut down here to the few fields the app shows, and nothing of its account leaves
  // this page but whether it's signed in and what the app asked for.
  const api = async (path, params, base = 'https://api.bilibili.com', { post: form = false } = {}) => {
    const query = params && !form ? `?${new URLSearchParams(params).toString()}` : ''
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT)
    try {
      const answer = await fetch(base + path + query, {
        method: form ? 'POST' : 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : undefined,
        body: form && params ? new URLSearchParams(params).toString() : undefined,
      })
      if (!answer.ok) return { code: answer.status, message: `HTTP ${answer.status}` }
      return await answer.json()
    } catch (error) {
      return { code: 0, message: String(error?.message ?? error) }
    } finally {
      clearTimeout(timer)
    }
  }
  // An interface's refusal, said to the host (the app shows why it has nothing), and `null` for its answer.
  const failed = (action, answer) => {
    const code = Number(answer?.code ?? 0)
    const message = cut(answer?.message ?? '', 120)
    if (code === 0) return null
    if (code === -101 || code === -400) return { action, code, message: message || 'not signed in' }
    post({ failed: { action, code, message } })
    return { action, code, message }
  }
  const data = (answer) => (answer && Number(answer.code) === 0 ? answer.data : null)

  // --- wbi: the site's own signed requests --------------------------------------------------------------------
  // Some of its interfaces (the home feed, a search, an UP's space) want its own `w_rid` signature: the parameters
  // sorted, its `wts` (seconds) and `w_rid` = md5(query + its mixin key), whose key is its `nav`'s two wbi pictures'
  // names rearranged. Web Crypto has no MD5, so one is here (the site's own algorithm, 512 bits).
  const MIXIN = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38,
    41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
    20, 34, 44, 52,
  ]
  const MD5 = (() => {
    const ADD = [0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
      0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562,
      0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6,
      0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122,
      0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
      0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3,
      0x8f0ccc92, 0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235,
      0x2ad7d2bb, 0xeb86d391]
    const SHIFT = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
      21, 6, 10, 15, 21]
    const rotl = (x, n) => (x << n) | (x >>> (32 - n))
    const utf8 = (text) => {
      const bytes = []
      for (const char of String(text)) {
        let code = char.codePointAt(0)
        if (code < 0x80) bytes.push(code)
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
        else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      }
      return bytes
    }
    const sum = (bytes) => {
      const length = bytes.length
      const bits = length * 8
      const words = new Uint32Array((((length + 8) >> 6) + 1) * 16)
      for (let i = 0; i < length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8)
      words[length >> 2] |= 0x80 << ((length % 4) * 8)
      words[words.length - 2] = bits >>> 0
      words[words.length - 1] = Math.floor(bits / 4294967296)
      let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
      for (let chunk = 0; chunk < words.length; chunk += 16) {
        let [A, B, C, D] = [a0, b0, c0, d0]
        for (let i = 0; i < 64; i++) {
          let F, g
          if (i < 16) {
            F = (B & C) | (~B & D)
            g = i
          } else if (i < 32) {
            F = (D & B) | (~D & C)
            g = (5 * i + 1) % 16
          } else if (i < 48) {
            F = B ^ C ^ D
            g = (3 * i + 5) % 16
          } else {
            F = C ^ (B | ~D)
            g = (7 * i) % 16
          }
          const held = D
          D = C
          C = B
          B = (B + rotl((A + F + ADD[i] + words[chunk + g]) >>> 0, SHIFT[i])) >>> 0
          A = held
        }
        a0 = (a0 + A) >>> 0
        b0 = (b0 + B) >>> 0
        c0 = (c0 + C) >>> 0
        d0 = (d0 + D) >>> 0
      }
      const hex = (word) => [...Array(4)].map((_, i) => ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('')
      return hex(a0) + hex(b0) + hex(c0) + hex(d0)
    }
    return { sum: (text) => sum(utf8(text)) }
  })()
  // The mixin key from the page's own signature pictures: their names' characters rearranged by the site's table.
  const mixinKey = (nav) => {
    const wbi = nav?.data?.wbi_img
    if (!wbi) return null
    const name = (url) => {
      const found = /\/([^/]+)\.(?:png|jpe?g)$/.exec(String(url ?? ''))
      return found ? found[1] : ''
    }
    const raw = name(wbi.img_url) + name(wbi.sub_url)
    if (raw.length < 64) return null
    return MIXIN.map((at) => raw[at]).join('').slice(0, 32)
  }
  // Its `w_rid` signature: the parameters as its own script writes them (sorted, its `wts` second, characters
  // `!'()*` left out, percent-encoded), the query and the mixin key's md5.
  const wbiSign = (params, key) => {
    const said = { ...params, wts: Math.round(Date.now() / 1000) }
    const clean = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, '')
    const query = Object.keys(said)
      .sort()
      .map((name) => `${clean(name)}=${clean(said[name])}`)
      .join('&')
    said.w_rid = MD5.sum(query + key)
    return said
  }
  // The page's own nav (who is signed in, and its wbi pictures), kept a while; a refused signed call asks for it
  // again (the site's key changes).
  let wbi = { key: null, at: 0, nav: null }
  const nav = async (again = false) => {
    if (!again && wbi.nav && Date.now() - wbi.at < 10 * 60_000) return wbi.nav
    const answer = await api('/x/web-interface/nav')
    wbi = { key: mixinKey(answer), at: Date.now(), nav: answer }
    return answer
  }
  // The page's own mixin key, fetched (again when a signed call was refused: its key changes).
  const ensureKey = async (again = false) => {
    await nav(again)
    return wbi.key ?? ''
  }
  // A wbi-signed call, its key fetched first; a refused one (`-403`, `-352`) signed again once.
  const wbiApi = async (path, params) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const key = await ensureKey(attempt > 0)
      if (!key) break
      const answer = await api(path, wbiSign(params ?? {}, key))
      if (![-403, -352, -412, -799].includes(Number(answer?.code))) return answer
      if (attempt === 1) return answer
      await sleep(300)
    }
    return api(path, params)
  }

  // --- The app's shapes: what each answer is cut down to ------------------------------------------------------
  const userOf = (owner) =>
    owner && (owner.mid || owner.name)
      ? { mid: number(owner.mid), name: cut(owner.name ?? owner.uname ?? '', 80), avatar: picture(owner.face ?? owner.upic ?? owner.avatar) }
      : null
  // A video, as the app's cards show it: the feed's, a search's, a favourite folder's, a history's, an UP's.
  const videoOf = (item) => {
    if (!item || typeof item !== 'object') return null
    const bvid = String(item.bvid ?? item.bv_id ?? '')
    const aid = number(item.aid ?? item.id ?? item.avid)
    if (!/^BV[0-9A-Za-z]{8,12}$/.test(bvid) && !aid) return null
    return {
      kind: 'video',
      bvid: /^BV[0-9A-Za-z]{8,12}$/.test(bvid) ? bvid : '',
      aid,
      cid: number(item.cid),
      title: cut(item.title ?? item.archive_title ?? '', 160),
      cover: picture(item.pic ?? item.cover ?? item.first_frame),
      duration: seconds(item.duration ?? item.length),
      owner: userOf(item.owner ?? item.upper ?? { mid: item.mid, name: item.author, face: item.upic }),
      views: number(item.stat?.view ?? item.play ?? item.cnt_info?.play ?? item.view),
      likes: number(item.stat?.like ?? item.like),
      pubdate: number(item.pubdate ?? item.created ?? item.ctime),
      live: false,
    }
  }
  // A bangumi's or a film's season, as its index and a search show it.
  const mediaOf = (item) => {
    if (!item || typeof item !== 'object') return null
    const seasonId = number(item.season_id ?? item.seasonId)
    if (!seasonId && !item.title) return null
    const ep = item.first_ep ?? item.eps?.[0] ?? null
    return {
      kind: 'media',
      seasonId,
      mediaId: number(item.media_id),
      epId: number(ep?.ep_id ?? item.ep_id),
      title: cut(item.title ?? '', 160),
      cover: picture(item.cover ?? item.ss_horizontal_cover ?? ep?.cover),
      score: cut(item.score ?? item.rating ?? '', 20),
      indexShow: cut(item.index_show ?? item.desc ?? '', 40),
      badge: cut(item.badge ?? '', 20),
      seasonType: number(item.season_type),
      url: cut(String(item.link ?? item.url ?? ''), 200),
      desc: cut(item.subTitle ?? item.sub_title ?? '', 200),
      // Bilibili's own word for its following ("1770.1万追番"), for the app's banner.
      followers: cut(String(item.order ?? item.follow ?? ''), 40),
    }
  }
  // A live room, as the app's list shows it.
  const roomOf = (item) => {
    if (!item || typeof item !== 'object') return null
    const roomId = number(item.roomid ?? item.room_id)
    if (!roomId) return null
    return {
      kind: 'live',
      roomId,
      shortId: number(item.short_id),
      uid: number(item.uid),
      title: cut(item.title ?? '', 160),
      cover: picture(item.user_cover ?? item.cover ?? item.keyframe ?? item.system_cover),
      uname: cut(item.uname ?? item.owner?.name ?? item.name ?? '', 80),
      face: picture(item.uface ?? item.face ?? item.owner?.face),
      area: cut(item.cate_name ?? item.area_name ?? item.area_v2_name ?? '', 40),
      online: number(item.online ?? item.watched_show?.num ?? item.popularity),
      live: Number(item.live_status ?? 1) === 1,
    }
  }
  // A bangumi's or a film's episodes (its season's answer says them). Its own `duration` is in milliseconds;
  // its `long_title` is the episode's name (its `title` is the number, "1").
  const episodeOf = (item) => {
    const said = number(item.duration)
    return {
      epId: number(item.ep_id ?? item.id),
      cid: number(item.cid),
      bvid: /^BV[0-9A-Za-z]{8,12}$/.test(String(item.bvid ?? '')) ? item.bvid : '',
      title: cut(item.long_title || item.title || item.index_title || '', 160),
      indexTitle: cut(item.index_title ?? item.title ?? '', 40),
      cover: picture(item.cover),
      duration: said > 100_000 ? Math.round(said / 1000) : said,
      badge: cut(item.badge ?? item.badge_info?.text ?? item.badges?.[0]?.text ?? '', 20),
    }
  }

  // --- The account: whether it's signed in, and its name and picture ------------------------------------------
  const account = { signedIn: false, uid: 0, name: '', avatar: null, following: 0, follower: 0, told: null }
  const readAccount = async (say = true) => {
    const answer = await nav()
    const who = data(answer)
    const next = who?.isLogin
      ? {
          signedIn: true,
          uid: number(who.mid),
          name: cut(who.uname ?? '', 80),
          avatar: picture(who.face),
          // How many the account follows and how many follow it (its nav's own counts).
          following: number(who.following),
          follower: number(who.follower),
        }
      : { signedIn: false, uid: 0, name: '', avatar: null, following: 0, follower: 0 }
    Object.assign(account, next)
    if (say) {
      const text = JSON.stringify(next)
      if (text !== account.told) {
        account.told = text
        post({ account: next })
      }
    }
    return next
  }

  // --- UP 主的空间: space.bilibili.com's own hidden frame ------------------------------------------------
  // The site serves the space's own interfaces (its videos, its profile) only to a document of that origin: a
  // page of www's is refused (412). So a frame of the space's own (hidden) reads them, told what to read over
  // `postMessage`; its script says `{ westplaySpaceReady: true }` once it's there, and answers
  // `{ westplaySpaceAnswer: { id, … } }`.
  let spaceFrame = null
  let spaceReady = false
  let spaceNextId = 0
  const spacePending = new Map()
  const onSpaceMessage = (event) => {
    // Its own frame's, only (the page's other frames are the site's own, not this).
    if (spaceFrame && event.source !== spaceFrame.contentWindow) return
    const said = event.data
    if (!said || typeof said !== 'object') return
    if (said.westplaySpaceReady) {
      spaceReady = true
      return
    }
    const answer = said.westplaySpaceAnswer
    if (!answer || typeof answer !== 'object') return
    const waiting = spacePending.get(answer.id)
    if (!waiting) return
    spacePending.delete(answer.id)
    waiting(answer)
  }
  window.addEventListener('message', onSpaceMessage)
  const ensureSpaceFrame = () => {
    if (spaceFrame && spaceFrame.isConnected) return
    spaceReady = false
    const frame = document.createElement('iframe')
    frame.src = 'https://space.bilibili.com/'
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;'
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    ;(document.documentElement ?? document.body).appendChild(frame)
    spaceFrame = frame
  }
  const askSpaceFrame = async (mid, page) => {
    ensureSpaceFrame()
    const started = Date.now()
    while (!spaceReady && Date.now() - started < 8000) await sleep(200)
    if (!spaceReady) return null
    const id = ++spaceNextId
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        spacePending.delete(id)
        resolve(null)
      }, 12000)
      spacePending.set(id, (answer) => {
        clearTimeout(timer)
        resolve(answer)
      })
      spaceFrame.contentWindow?.postMessage(
        { westplaySpace: { id, mid, page, origin: location.origin } },
        'https://space.bilibili.com',
      )
    })
  }

  // The space's own frame: its script, reading what the top page asks of the site's interfaces (this origin's
  // own), and answering.
  function spaceFrameStart() {
    const DM = {
      dm_img_list: '[]',
      dm_img_str: btoa(String((() => {
        try {
          const gl = document.createElement('canvas').getContext('webgl')
          return gl?.getParameter(gl.VERSION) ?? 'WebGL 1.0 (OpenGL ES 2.0 Chromium)'
        } catch {
          return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)'
        }
      })())).replace(/=+$/, ''),
      dm_cover_img_str: btoa(String((() => {
        try {
          const gl = document.createElement('canvas').getContext('webgl')
          const extension = gl?.getExtension('WEBGL_debug_renderer_info')
          return (extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) || 'ANGLE (Intel, Intel(R) UHD Graphics, D3D11)'
        } catch {
          return 'ANGLE (Intel, Intel(R) UHD Graphics, D3D11)'
        }
      })())).replace(/=+$/, ''),
      dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
    }
    const read = async (request) => {
      const mid = number(request.mid)
      const page = Math.max(1, Math.trunc(number(request.page) || 1))
      if (!mid) return { failed: { action: 'space', code: -400, message: 'no mid' } }
      let key = await ensureKey()
      const search = () => api('/x/space/wbi/arc/search', wbiSign({ mid, ps: PAGE_SIZE, pn: page, order: 'pubdate', ...DM }, key))
      let info = await api('/x/space/wbi/acc/info', wbiSign({ mid, platform: 'web', web_location: 1550101, ...DM }, key))
      let videos = await search()
      if ([-403, -352, -412].includes(Number(videos?.code))) {
        await sleep(600)
        key = await ensureKey(true)
        info = await api('/x/space/wbi/acc/info', wbiSign({ mid, platform: 'web', web_location: 1550101, ...DM }, key))
        videos = await search()
      }
      if (Number(info?.code) !== 0) return { failed: { action: 'space', code: Number(info?.code ?? 0), message: String(info?.message ?? '') } }
      if (Number(videos?.code) !== 0) {
        return { failed: { action: 'space', code: Number(videos.code ?? 0), message: String(videos.message ?? '') } }
      }
      const who = data(info) ?? {}
      const list = data(videos)?.list ?? {}
      const fans = data(await api('/x/relation/stat', { vmid: mid }))?.follower
      return {
        space: {
          mid,
          name: cut(who.name ?? '', 80),
          avatar: picture(who.face),
          sign: cut(who.sign ?? '', 300),
          level: number(who.level),
          fans: number(fans),
          videos: number(list.page?.count),
          items: (list.vlist ?? []).map(videoOf).filter(Boolean),
          hasMore: number(list.page?.count ?? 0) > page * PAGE_SIZE,
        },
      }
    }
    window.addEventListener('message', async (event) => {
      const request = event.data?.westplaySpace
      if (!request || typeof request !== 'object') return
      let answer
      try {
        answer = await read(request)
      } catch (error) {
        answer = { failed: { action: 'space', code: 0, message: String(error?.message ?? error) } }
      }
      // Back to the page that asked (its own origin, when it said it), never a page of anyone's.
      parent.postMessage({ westplaySpaceAnswer: { id: request.id, ...answer } }, request.origin || '*')
    })
    // Its page's own origin: this frame's ancestor (the hidden page's), which is where answers go.
    const topOrigin = (() => {
      try {
        return location.ancestorOrigins?.[0] || '*'
      } catch {
        return '*'
      }
    })()
    parent.postMessage({ westplaySpaceReady: true }, topOrigin)
  }

  // The space's page is the frame's own work (below); the top page's is the player's and the app's.
  if (isSpaceFrame) {
    spaceFrameStart()
    return
  }


  // The page's own player object, where the page has one: the bpx player (`window.player`, a video's or a
  // bangumi's page) and the live player (`window.livePlayer`, a live room's).
  const player = () => {
    try {
      return window.player ?? null
    } catch {
      return null
    }
  }
  const livePlayer = () => {
    try {
      return window.livePlayer ?? null
    } catch {
      return null
    }
  }
  const isLivePage = () => /(^|\.)live\.bilibili\.com$/.test(location.hostname)
  // The video element the player plays now: its own player's (`player.mediaElement()`, `livePlayer.getVideoEl()`),
  // or the largest one on the page with a source (a player may make new ones); a tournament live's player sits in
  // one of the page's own frames (`/blanc/<room>`), of the same origin, so its element is found there too.
  const videoNow = () => {
    const own = isLivePage() ? livePlayer()?.getVideoEl?.() : player()?.mediaElement?.()
    if (own && own.tagName === 'VIDEO') return own
    const candidate = (document) => {
      const all = [...document.querySelectorAll(isLivePage() ? '#live-player video, #live-player-ctnr video' : S.video)]
      const playing = all.filter((video) => video.currentSrc || video.src || video.srcObject)
      const list = playing.length ? playing : all
      let best = null
      let bestArea = -1
      for (const video of list) {
        const box = video.getBoundingClientRect()
        const area = Math.max(0, box.width) * Math.max(0, box.height)
        if (area > bestArea) {
          best = video
          bestArea = area
        }
      }
      return best
    }
    const top = candidate(document)
    if (top) return top
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const inside = frame.contentDocument && candidate(frame.contentDocument)
        if (inside) {
          // The site's own frame (a tournament live's player): the watch state shows it whole.
          frame.classList.add('westplay-frame')
          return inside
        }
      } catch {
        // Another origin's frame (not the site's own): nothing of it is read.
      }
    }
    return null
  }
  // What plays, as the page's own player does it: a video's or a bangumi's player (the bpx one), or a live room's.
  // Their own methods, where a page has them, and its video element's otherwise.
  const control = () => {
    const video = videoNow()
    if (isLivePage() || (!player() && !video)) {
      const live = livePlayer()
      const info = live?.getPlayerInfo?.() ?? null
      return {
        live: true,
        play: () => (live?.play?.() ?? video?.play?.()),
        pause: () => (live?.pause?.() ?? video?.pause?.()),
        seek: () => {},
        setVolume: (value) => (live?.volume ? live.volume(value) : video && (video.volume = value)),
        setMuted: (muted) => (live?.mute ? live.mute(muted) : video && (video.muted = muted)),
        setRate: () => {},
        time: () => 0,
        duration: () => 0,
        paused: () => (typeof info?.playingStatus === 'number' ? info.playingStatus !== 1 : video ? Boolean(video.paused) : true),
        volume: () => (info?.volume?.value != null ? info.volume.value / 100 : (video?.volume ?? 1)),
        muted: () => (typeof info?.playingStatus === 'number' ? !(video?.volume > 0) : Boolean(video?.muted)),
        rate: () => 1,
        qualities: () =>
          (info?.qualityCandidates ?? [])
            .map((entry) => ({ qn: number(entry.qn), label: cut(entry.desc ?? '', 20) }))
            .filter((entry) => entry.qn),
        quality: () => number(info?.quality),
        requestQuality: (qn) => live?.switchQuality?.(qn) ?? live?.switchQualityAsync?.(qn),
      }
    }
    const bpx = player()
    return {
      live: false,
      play: () => (bpx?.play ? bpx.play() : video?.play?.()),
      pause: () => (bpx?.pause ? bpx.pause() : video?.pause?.()),
      seek: (seconds) => (bpx?.seek ? bpx.seek(seconds) : video && (video.currentTime = seconds)),
      setVolume: (value) => (bpx?.setVolume ? bpx.setVolume(value) : video && (video.volume = value)),
      setMuted: (muted) => {
        if (bpx?.setMuted) bpx.setMuted(muted)
        else if (video) video.muted = muted
      },
      setRate: (rate) => {
        if (bpx?.setPlaybackRate) bpx.setPlaybackRate(rate)
        else if (video) video.playbackRate = rate
      },
      time: () => (bpx?.getCurrentTime ? bpx.getCurrentTime() : Number(video?.currentTime ?? 0)),
      duration: () => (bpx?.getDuration ? bpx.getDuration() : Number(video?.duration ?? 0)),
      paused: () => (bpx?.isPaused ? bpx.isPaused() : Boolean(video?.paused)),
      volume: () => (bpx?.getVolume ? bpx.getVolume() : (video && !video.muted ? video.volume : 0)),
      muted: () => (bpx?.getMuted ? bpx.getMuted() : Boolean(video?.muted)),
      rate: () => (bpx?.getPlaybackRate ? bpx.getPlaybackRate() : Number(video?.playbackRate ?? 1)),
      qualities: () => {
        const levels = bpx?.getSupportedQualityList?.() ?? []
        return (Array.isArray(levels) ? levels : [])
          .map((qn) => ({ qn: number(qn), label: qualityName(number(qn)) }))
          .filter((entry) => entry.qn)
      },
      quality: () => {
        const said = bpx?.getQuality?.() ?? null
        return number(typeof said === 'object' && said !== null ? (said.realQ ?? said.quality) : said)
      },
      requestQuality: (qn) => bpx?.requestQuality?.(qn),
    }
  }
  // The watch state: the player over the whole page, the site's chrome away. It survives a page's navigation
  // (sessionStorage), and the host shows the WebView where the app wants the picture.
  const watch = { on: false, crop: store.get(CROP) === '1' }
  const applyWatch = () => {
    const html = document.documentElement
    html.classList.toggle('westplay-watch', watch.on)
    html.classList.toggle('westplay-crop', watch.crop)
  }
  const setWatch = (on) => {
    watch.on = Boolean(on)
    store.set(WATCH, watch.on ? '1' : null)
    applyWatch()
  }
  // The site's own chrome is put away while the page plays (its player's own controls too: the app's are the
  // player's), its subtitles are put away (this script draws the one chosen), and the player is stretched over the
  // page: a tournament live's own frame (`/blanc/<room>`) is stretched with it.
  const style = document.createElement('style')
  style.textContent = `
    html.westplay-watch, html.westplay-watch body { overflow: hidden !important; background: #000 !important; }
    html.westplay-watch body * { visibility: hidden !important; }
    html.westplay-watch video { visibility: visible !important; position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important; object-fit: contain !important; background: #000 !important;
      z-index: 2147483647 !important; }
    html.westplay-watch.westplay-crop video { object-fit: cover !important; }
    html.westplay-watch ${S.player.split(',').map((each) => each.trim()).join(', html.westplay-watch ')}, html.westplay-watch #live-player-ctnr {
      visibility: visible !important; position: fixed !important; inset: 0 !important; margin: 0 !important;
      transform: none !important; contain: none !important; filter: none !important; z-index: 2147483646 !important; }
    html.westplay-watch iframe.westplay-frame {
      visibility: visible !important; position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important; border: 0 !important; z-index: 2147483646 !important; }
    html.westplay-watch .westplay-subtitle { visibility: visible !important; position: fixed !important;
      left: 50% !important; bottom: 7vh !important; transform: translateX(-50%) !important; max-width: 90vw !important;
      padding: 4px 14px !important; border-radius: 6px !important; background: rgba(0,0,0,.62) !important;
      color: #fff !important; font: 600 30px/1.4 "Microsoft YaHei", sans-serif !important; text-align: center !important;
      white-space: pre-wrap !important; z-index: 2147483647 !important; pointer-events: none !important; }
    ${S.chrome.split(',').map((each) => `html.westplay-watch ${each.trim()}`).join(', ')} { display: none !important; }
  `
  document.addEventListener('DOMContentLoaded', () => document.head.prepend(style), { once: true })
  if (document.readyState !== 'loading') document.head.prepend(style)

  // The page's own data of what it plays (`__INITIAL_STATE__`, every Bilibili page's own), read when it has it.
  const initial = () => {
    try {
      return window.__INITIAL_STATE__ ?? null
    } catch {
      return null
    }
  }
  // What the page plays now: the video its address names (a BV…/av…), a bangumi's episode or season, a live room;
  // with its title, its UP, its picture and its own data when the page carries it. The page's own player knows the
  // ids best (its `getManifest`), and a live room's own state (`__NEPTUNE_IS_MY_WAIFU__`: its title, its anchor,
  // its picture and its category), so the address's ids stand in only where they don't.
  const mediaOfPage = () => {
    const state = initial()
    const url = new URL(location.href)
    const manifest = (() => {
      try {
        return player()?.getManifest?.() ?? null
      } catch {
        return null
      }
    })()
    const video = /\/video\/(BV[0-9A-Za-z]+|\d+)/.exec(url.pathname)
    if (video) {
      const data = state?.videoData ?? null
      const bvid = /^BV/.test(video[1]) ? video[1] : String(manifest?.bvid ?? data?.bvid ?? '')
      const page = Math.max(1, Number(new URLSearchParams(url.search).get('p') ?? 1) || 1)
      return {
        kind: 'video',
        bvid: /^BV[0-9A-Za-z]{8,12}$/.test(bvid) ? bvid : '',
        aid: number(manifest?.aid ?? data?.aid ?? (!/^BV/.test(video[1]) ? video[1] : 0)),
        cid: number(manifest?.cid ?? data?.cid),
        epId: 0,
        seasonId: 0,
        roomId: 0,
        title: cut(data?.title || text(document.querySelector(S.title)) || meta('og:title') || document.title, 160),
        owner: userOf(data?.owner) ?? userOf({ name: text(document.querySelector(S.owner)), face: document.querySelector(S.ownerFace)?.getAttribute('src') }),
        cover: picture(data?.pic ?? meta('og:image')),
        live: false,
        page,
        pages: Math.max(1, number(data?.videos) || (Array.isArray(data?.pages) ? data.pages.length : 1)),
      }
    }
    const ep = /\/bangumi\/play\/(ep\d+|ss\d+)/.exec(url.pathname)
    if (ep) {
      const epInfo = state?.epInfo ?? null
      const mediaInfo = state?.mediaInfo ?? null
      const isEp = ep[1].startsWith('ep')
      const epTitle = text(document.querySelector('.bpx-player-top-title'))
      const title = epInfo ? `${mediaInfo?.title ?? ''} ${epInfo.title ?? ''}`.trim() : epTitle || meta('og:title') || document.title
      return {
        kind: 'bangumi',
        bvid: /^BV[0-9A-Za-z]{8,12}$/.test(String(manifest?.bvid ?? epInfo?.bvid ?? '')) ? (manifest?.bvid ?? epInfo.bvid) : '',
        aid: number(manifest?.aid ?? epInfo?.aid),
        cid: number(manifest?.cid ?? epInfo?.cid),
        epId: number(manifest?.episodeId ?? (isEp ? ep[1].slice(2) : 0)),
        seasonId: number(manifest?.seasonId ?? mediaInfo?.season_id ?? (isEp ? 0 : ep[1].slice(2))),
        roomId: 0,
        title: cut(title, 160),
        owner: null,
        cover: picture(epInfo?.cover ?? mediaInfo?.cover ?? meta('og:image')),
        live: false,
        page: 0,
        pages: 0,
      }
    }
    if (/(^|\.)live\.bilibili\.com$/.test(location.hostname)) {
      const room = /^\/(\d+)/.exec(url.pathname)?.[1] ?? ''
      const neptune = (() => {
        try {
          return window.__NEPTUNE_IS_MY_WAIFU__ ?? null
        } catch {
          return null
        }
      })()
      const info = neptune?.roomInfoRes?.data?.room_info ?? neptune?.roomInitRes?.data ?? null
      const anchor = neptune?.roomInfoRes?.data?.anchor_info?.base_info ?? null
      return {
        kind: 'live',
        bvid: '',
        aid: 0,
        cid: 0,
        epId: 0,
        seasonId: 0,
        roomId: number(room) || number(info?.room_id),
        title: cut(text(document.querySelector('.room-title, .bili-live-title, h1')) || info?.title || meta('og:title') || document.title, 160),
        owner: userOf({ name: anchor?.uname || info?.uname || text(document.querySelector(S.owner)), face: anchor?.face || info?.face || document.querySelector(S.ownerFace)?.getAttribute('src') }),
        cover: picture(info?.user_cover ?? info?.cover ?? info?.keyframe ?? meta('og:image')),
        live: true,
        page: 0,
        pages: 0,
      }
    }
    return null
  }

  // --- The player's own commands: play, pause, seek, volume, rate, quality, subtitles -------------------------
  const playerState = {
    rate: Number(store.get(RATE) ?? 1) || 1,
    volume: store.get(VOLUME) == null ? null : Number(store.get(VOLUME)),
    quality: Number(store.get(QUALITY) ?? 0) || 0,
    caption: store.get(CAPTION),
    captions: [],
    captionAt: 0,
    captionLines: [],
    captionVideo: null,
  }
  // Bilibili's own names for its qualities (its qn numbers), for a player that doesn't say.
  const qualityName = (qn) => ({ 6: '240P', 16: '360P', 32: '480P', 64: '720P', 74: '720P60', 80: '1080P', 112: '1080P+',
    116: '1080P60', 120: '4K', 125: 'HDR', 126: 'Dolby Vision', 127: '8K' })[qn] ?? `${qn}`
  // The qualities the page's own player says it has, and the one it plays at (a live room's own candidates).
  const qualitiesOf = () => {
    try {
      return control().qualities()
    } catch {
      return []
    }
  }
  const currentQuality = () => {
    try {
      return control().quality() || playerState.quality || 0
    } catch {
      return playerState.quality || 0
    }
  }
  // The quality asked for: the page's own player's way (`requestQuality`, a live room's `switchQuality`), or its
  // own quality menu's item where it has no method to call.
  const setQuality = (qn) => {
    playerState.quality = qn
    store.set(QUALITY, qn)
    try {
      control().requestQuality(qn)
    } catch {
      // Its player's own method refused: its own control's item.
    }
    const item = document.querySelector(`.bpx-player-ctrl-quality-item[data-value="${qn}"], .bpx-player-ctrl-quality-menu-item[data-value="${qn}"]`)
    item?.click()
  }
  // The sound's own way: its volume (0 to 1) and speed, as the page's player sets them; the page's own player starts
  // a video **muted** (the browser lets that play without a press), so it is heard only once it is unmuted: the
  // first time a video plays, and again when the app asks for a volume. Its loudness is the element's own until then.
  let unmuted = false
  const applyPlayback = () => {
    try {
      const said = control()
      if (playerState.volume != null && Number.isFinite(playerState.volume)) {
        said.setVolume(Math.min(1, Math.max(0, playerState.volume)))
        said.setMuted(playerState.volume === 0)
        unmuted = playerState.volume > 0
      } else if (!unmuted) {
        const level = Math.min(1, Math.max(0.2, Number(said.volume()) || 1))
        said.setVolume(level)
        said.setMuted(false)
        unmuted = true
      }
      if (Number.isFinite(playerState.rate) && said.rate() !== playerState.rate) said.setRate(playerState.rate)
    } catch {
      // Its player refused (not there yet): applied on the next pass.
    }
  }
  // Where the video played, and whether it played: kept in the page's own session as it goes, and read at the
  // start. A page loaded anew (WestPlay loading it again after its process failed, `resilience` in the host) keeps
  // the watch state already (`WATCH`); its place in the video is kept here, and put back once it has data.
  const PLACE = 'westplay.bilibili.place'
  const resumePlace = () => {
    try {
      const saved = JSON.parse(store.get(PLACE) ?? 'null')
      store.set(PLACE, null)
      return saved && Date.now() - Number(saved.savedAt ?? 0) < 60000 ? saved : null
    } catch {
      return null
    }
  }
  const savePlace = () => {
    try {
      const said = control()
      const at = Number(said.time?.()) || 0
      if (!(at > 0)) return
      store.set(PLACE, JSON.stringify({ at, playing: !said.paused?.(), savedAt: Date.now() }))
    } catch {
      // Its player isn't there: nothing to keep.
    }
  }
  setInterval(() => {
    try {
      if (!control().paused?.()) savePlace()
    } catch {
      // Not there yet.
    }
  }, 2000)
  addEventListener('pagehide', savePlace)
  addEventListener('beforeunload', savePlace)
  let place = resumePlace()
  const resumeIfWanted = () => {
    if (!store.get(WATCH) || pausedByApp) return
    // The video's place and play state from the page that went: back there once it has data (a pause kept too).
    const saved = place
    place = null
    // The page's own player may start itself (autoplay, muted): a paused one is started, once it has data.
    try {
      const said = control()
      if (said.paused() && (!saved || saved.playing)) said.play()
    } catch {
      // Its player refused (not there yet).
    }
    if (saved && Number(saved.at) > 3) {
      setTimeout(() => {
        try {
          control().seek(Math.max(0, Number(saved.at) || 0))
        } catch {
          // Its player refused: the video plays from where it is.
        }
      }, 1500)
    }
  }

  // Whether the app itself paused what plays (a page loading again isn't to start it), and a play asked again
  // while the page's own player hasn't started (see `reportState`).
  let pausedByApp = false
  const kick = { key: '', at: 0, tries: 0 }
  // --- Subtitles: the page's own list (`/x/player/v2`), drawn over the video ----------------------------------
  let subtitleLayer = null
  const subtitleDiv = () => {
    if (subtitleLayer && subtitleLayer.isConnected) return subtitleLayer
    subtitleLayer = document.createElement('div')
    subtitleLayer.className = 'westplay-subtitle'
    subtitleLayer.style.display = 'none'
    document.body?.appendChild(subtitleLayer)
    return subtitleLayer
  }
  // The page's own subtitle list for what it plays (its video's aid and cid), read once per video.
  const loadCaptions = async (playing) => {
    if (!playing || (!playing.bvid && !playing.aid) || !playing.cid) return []
    const key = `${playing.bvid}:${playing.cid}`
    if (playerState.captionVideo === key && Date.now() - playerState.captionAt < 60_000) return playerState.captions
    playerState.captionVideo = key
    playerState.captionAt = Date.now()
    const answer = await api('/x/player/v2', { ...(playing.bvid ? { bvid: playing.bvid } : { aid: playing.aid }), cid: playing.cid })
    const list = data(answer)?.subtitle?.subtitles ?? []
    playerState.captions = list
      .map((entry) => ({ id: cut(String(entry.id_str ?? entry.id ?? ''), 40), lan: cut(entry.lan ?? '', 20), name: cut(entry.lan_doc ?? entry.lan ?? '', 60), url: picture(entry.subtitle_url) }))
      .filter((entry) => entry.id || entry.url)
    // The one chosen is still there, or the first one (its name kept for the app).
    if (playerState.caption && !playerState.captions.some((entry) => entry.id === playerState.caption)) {
      playerState.caption = null
      store.set(CAPTION, null)
    }
    playerState.captionLines = []
    if (playerState.caption) loadSubtitleLines()
    return playerState.captions
  }
  // A subtitle's own lines, from its JSON (`body: [{from, to, content}]`).
  const loadSubtitleLines = async () => {
    const entry = playerState.captions.find((each) => each.id === playerState.caption)
    if (!entry?.url) return
    try {
      const answer = await fetch(entry.url, { credentials: 'include' })
      const json = await answer.json()
      playerState.captionLines = (json?.body ?? [])
        .map((line) => ({ from: Number(line.from), to: Number(line.to), content: cut(line.content ?? '', 300) }))
        .filter((line) => Number.isFinite(line.from) && Number.isFinite(line.to) && line.content)
    } catch {
      playerState.captionLines = []
    }
  }
  // The line said at `time` (seconds), or none.
  const saidAt = (time) => {
    const lines = playerState.captionLines
    let found = ''
    for (const line of lines) {
      if (line.from > time) break
      if (time <= line.to) found = line.content
    }
    return found
  }
  const drawSubtitle = (time) => {
    const layer = subtitleDiv()
    const line = playerState.captionLines.length ? saidAt(time) : ''
    layer.textContent = line
    layer.style.display = line ? '' : 'none'
  }

  // --- Navigating to what plays: the site's own pages, its own player ----------------------------------------
  // A video's page (`BV…`; `p`: which of its parts), a bangumi's episode (`ep…`) or season (`ss…`), a live room.
  const playTarget = (command) => {
    const value = String(command.value ?? '')
    const kind = command.kind ?? (/^(ep|ss)\d{1,12}$/.test(value) ? 'bangumi' : 'video')
    if (kind === 'live' && /^\d{1,12}$/.test(value)) return `https://live.bilibili.com/${value}`
    if (kind === 'bangumi') {
      const watch = String(value).replace(/^\/+/, '')
      if (/^ep\d{1,12}$/.test(watch)) return `https://www.bilibili.com/bangumi/play/${watch}`
      if (/^ss\d{1,12}$/.test(watch)) return `https://www.bilibili.com/bangumi/play/${watch}`
      if (/^\d{1,12}$/.test(watch)) return `https://www.bilibili.com/bangumi/play/ss${watch}`
      return null
    }
    const bvid = /^BV[0-9A-Za-z]{8,12}$/.test(value) ? value : null
    const aid = /^\d{1,15}$/.test(value) ? value : null
    if (!bvid && !aid) return null
    const page = Math.max(1, Number(command.page ?? 1) || 1)
    return bvid
      ? `https://www.bilibili.com/video/${bvid}/?p=${page}&autoplay=1`
      : `https://www.bilibili.com/video/av${aid}/?p=${page}&autoplay=1`
  }
  const navigate = (url) => {
    if (!url) return
    store.set(WATCH, '1')
    location.href = url
  }
  // The site's own pages: a video's (`BV…`/`av…`, a part of it), a bangumi's episode or season.
  const videoPageUrl = (id, page = 1) => {
    const said = String(id ?? '')
    const bvid = /^BV[0-9A-Za-z]{8,12}$/.test(said) ? said : null
    const aid = /^\d{1,15}$/.test(said) ? said : null
    if (!bvid && !aid) return null
    const part = Math.max(1, Math.trunc(Number(page) || 1))
    return bvid
      ? `https://www.bilibili.com/video/${bvid}/?p=${part}&autoplay=1`
      : `https://www.bilibili.com/video/av${aid}/?p=${part}&autoplay=1`
  }
  const bangumiPageUrl = (id) => {
    const said = String(id ?? '').replace(/^\/+/, '')
    if (/^(ep|ss)\d{1,12}$/.test(said)) return `https://www.bilibili.com/bangumi/play/${said}`
    if (/^\d{1,12}$/.test(said)) return `https://www.bilibili.com/bangumi/play/ss${said}`
    return null
  }
  // Nothing to play next (or before): said so, for the app to say why (its own dashboard's buttons).
  const nothingToPlay = (action) =>
    post({ failed: { action, code: -400, message: action === 'prev' ? 'nothing to play before' : 'nothing to play next' } })
  // What a play's next (or previous) is: a bangumi's next episode (its season's own list, from the site's
  // interface), a multi-part video's part after (or before) this one, or a video's first related one. A live room
  // has nothing after it. The page it goes to is the site's own, its own player then plays it (as a play does).
  const stepMedia = async (direction) => {
    const action = direction === 'prev' ? 'prev' : 'next'
    const media = mediaOfPage()
    if (!media || media.kind === 'live') {
      nothingToPlay(action)
      return
    }
    if (media.kind === 'bangumi') {
      await stepEpisode(media, direction, action)
      return
    }
    await stepVideo(media, direction, action)
  }
  const stepEpisode = async (media, direction, action) => {
    const season = number(media.seasonId)
    const episode = number(media.epId)
    if (!season && !episode) {
      nothingToPlay(action)
      return
    }
    const answer = await api('/pgc/view/web/season', season ? { season_id: season } : { ep_id: episode })
    if (failed(action, answer)) return
    const found = answer?.result ?? data(answer)?.result ?? data(answer)
    if (!found) {
      nothingToPlay(action)
      return
    }
    const ids = []
    const add = (list) => {
      for (const entry of list ?? []) {
        const id = number(entry?.ep_id)
        if (id && !ids.includes(id)) ids.push(id)
      }
    }
    add(found.episodes)
    for (const section of found.section ?? []) add(section?.episodes)
    if (!ids.length) {
      nothingToPlay(action)
      return
    }
    // Its own list's order; a page without a known episode starts at its first (`next`) or has none before it.
    const at = episode ? ids.indexOf(episode) : -1
    const index = direction === 'prev' ? at - 1 : at < 0 ? 0 : at + 1
    const target = ids[index]
    if (!target) {
      nothingToPlay(action)
      return
    }
    navigate(bangumiPageUrl(`ep${target}`))
  }
  const stepVideo = async (media, direction, action) => {
    const id = media.bvid || (media.aid ? `av${media.aid}` : '')
    if (!id) {
      nothingToPlay(action)
      return
    }
    // A video of more than one part: the part after (or before) the one playing.
    const pages = number(media.pages)
    const page = number(media.page) || 1
    if (pages > 1) {
      const target = direction === 'prev' ? page - 1 : page + 1
      if (target >= 1 && target <= pages) {
        navigate(videoPageUrl(id, target))
        return
      }
    }
    if (direction === 'prev') {
      nothingToPlay(action)
      return
    }
    // A video on its own: the first of its own related ones (the app's cards' next), never itself.
    const answer = await api('/x/web-interface/archive/related', media.bvid ? { bvid: media.bvid } : { aid: media.aid })
    if (failed(action, answer)) return
    const list = Array.isArray(data(answer)) ? data(answer) : (data(answer)?.list ?? [])
    const next = list
      .map(videoOf)
      .filter(Boolean)
      .find((entry) => (entry.bvid || `av${entry.aid}`) !== id && (entry.bvid || entry.aid))
    if (!next) {
      nothingToPlay(action)
      return
    }
    navigate(videoPageUrl(next.bvid || `av${next.aid}`, 1))
  }

  // A play that failed, as the page's own player says it (its error wall, or its whole error page), with everything
  // the host's log needs to say why: the address and title, the wall's own words, the video's state and error, and
  // the local network permission Bilibili's player asks for. Its `code` is the site's, where it gives one.
  let playFailedFor = ''
  let playLastTime = 0
  let playErrorSince = 0
  // The page's error nodes actually on the screen now (the site keeps hidden ones about): their own words, and the
  // code it gives where it gives one.
  const errorWall = () => {
    const seen = new Set()
    const texts = []
    let code = 0
    for (const node of document.querySelectorAll(
      '[class*="error-sign-active"], .bpx-player-error, [class*="player-error"], .error-container, [class*="error-container"], [class*="error-wrap"]',
    )) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden' || !node.getClientRects().length) continue
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text || seen.has(text)) continue
      seen.add(text)
      texts.push(text)
      if (!code) {
        const found =
          /(?:错误码|错误代码|code)[^\d]{0,4}(\d{2,7})/i.exec(text) ||
          /(\d{2,7})/.exec(document.querySelector('.bpx-player-error-sign-code')?.textContent ?? '')
        if (found) code = number(found[1])
      }
    }
    return { text: cut(texts.join(' | '), 240), code: code || -1 }
  }
  // Bilibili's whole error page (its title's "出错啦"), its own limit (版权/地区/大会员…), its player's error wall, or
  // none of these (`null`). The detail is what the app is told and the log says.
  const errorPage = async () => {
    const wall = errorWall()
    const title = cut(document.title, 120)
    const titleError = /出错啦/.test(document.title)
    const body = cut((document.body?.innerText || '').replace(/\s+/g, ' ').trim(), 200)
    const restricted = /版权|地区|区域|大会员|仅限|专享|付费|试看|不可观看/.exec(`${title} ${wall.text} ${body.slice(0, 160)}`)
    if (!wall.text && !titleError && !restricted) return null
    const video = videoNow()
    let permission = 'unknown'
    try {
      permission = (await navigator.permissions.query({ name: 'local-network-access' })).state
    } catch {
      // A browser without it: nothing said.
    }
    const detail = [
      `url=${cut(location.href, 200)}`,
      `title=${title}`,
      `wall=${wall.text || body}`,
      `video=${
        video
          ? `ready${video.readyState}/network${video.networkState}/time${Math.round((video.currentTime || 0) * 10) / 10}/paused${video.paused}/error${video.error ? `${video.error.code}:${video.error.message}` : 'none'}`
          : 'none'
      }`,
      `permission=${permission}`,
    ].join(' ')
    return {
      code: restricted ? -2 : wall.code,
      restricted: Boolean(restricted),
      message: cut(restricted ? `restricted: ${detail}` : detail, 400),
    }
  }
  // One more load of a page that came up as Bilibili's own error page (once per play: kept in the page's own
  // storage across the load itself), asked again as the site's own refresh does; `false` once it was asked.
  const playRetry = (key) => {
    if (store.get(`westplay.bilibili.retried.${key}`) === '1') return false
    store.set(`westplay.bilibili.retried.${key}`, '1')
    setTimeout(() => {
      if (!/(^|\.)bilibili\.com$/.test(location.hostname)) return
      const url = location.href.split('#')[0]
      location.href = `${url}${url.includes('?') ? '&' : '?'}spm_id_from=333.1007.0.0`
    }, 800)
    return true
  }

  // --- Data: the app's pages and lists, read from the site's own interface ------------------------------------
  // The home feed's seasons, for the app's banner: Bilibili's own hot ones (its index, 番剧 and 电影), their own
  // score and badge and following, kept a while (a page of the feed asks for them again and again; a `fresh` home
  // reads them anew).
  let banner = { at: 0, items: [] }
  const homeBannerMedia = async (fresh = false) => {
    if (!fresh && banner.items.length && Date.now() - banner.at < 10 * 60_000) return banner.items
    const found = []
    for (const seasonType of [1, 2]) {
      const answer = await api('/pgc/season/index/result', {
        season_type: seasonType,
        order: 3,
        sort: 0,
        st: 1,
        page: 1,
        pagesize: 6,
        type: 1,
      })
      if (Number(answer?.code ?? 0) !== 0) continue
      for (const entry of (data(answer)?.list ?? []).slice(0, seasonType === 1 ? 4 : 3)) {
        const item = mediaOf(entry)
        if (item?.cover && item.title) found.push(item)
      }
    }
    banner = { at: Date.now(), items: found }
    return banner.items
  }
  // The home feed: its recommended items (`wbi/index/top/feed/rcmd`), cut to the app's cards, its own repeats
  // (the same video twice) left out, and the ads and login cards dropped. Its own stream is paged by `fresh_idx`
  // (1, 2, 3… each a batch of new ones, measured: no repeat between the batches); `fresh` starts it again at
  // 1 with its repeats forgotten. `more`: its answer has cards still (the stream ends only when it stops). The
  // seasons Bilibili's own index recommends come beside them (its feed itself carries no season: measured), for the
  // app's banner to turn over several of them.
  let homeSeen = new Set()
  const homeKey = (item) =>
    item.kind === 'video' ? item.bvid || `av${item.aid}` : item.kind === 'media' ? `ss${item.seasonId}` : `${item.roomId}`
  const readHome = async (page = 1, fresh = false) => {
    const pn = Math.max(1, Math.min(1000, Math.trunc(Number(page) || 1)))
    if (fresh || pn === 1) homeSeen = new Set()
    const answer = await wbiApi('/x/web-interface/wbi/index/top/feed/rcmd', {
      ps: PAGE_SIZE,
      fresh_type: 3,
      feed_version: 'V8',
      web_location: 1430650,
      homepage_ver: 1,
      fresh_idx: fresh ? 1 : pn,
      fresh_idx_1h: fresh ? 1 : pn,
    })
    if (failed('home', answer)) return
    const raw = data(answer)?.item ?? []
    const items = []
    for (const entry of raw) {
      const kind = String(entry?.goto ?? '')
      const item = kind === 'av' ? videoOf(entry) : kind === 'live' ? roomOf(entry?.live_room ?? entry) : kind === 'ogv' || kind === 'bangumi' ? mediaOf(entry?.ogv_info ?? entry) : null
      if (!item) continue
      const key = homeKey(item)
      if (homeSeen.has(key)) continue
      homeSeen.add(key)
      items.push(item)
    }
    // Its seasons (the banner's candidates): only one each, and only ones the feed didn't already have.
    for (const item of await homeBannerMedia(fresh)) {
      const key = homeKey(item)
      if (homeSeen.has(key)) continue
      homeSeen.add(key)
      items.push(item)
    }
    post({ home: { items, page: fresh ? 1 : pn, more: Number(answer?.code ?? 0) === 0 && raw.length > 0 } })
  }
  // The account's own relations, a page at a time (signed in only): whom it follows and who follows it, each
  // with their own id, name, picture and signature (`/x/relation/followings`, `/x/relation/fans`).
  const readRelations = async (kind, page = 1) => {
    const me = account.signedIn ? account : await readAccount(false)
    if (!me.signedIn) {
      post({ failed: { action: 'relations', code: -101, message: 'not signed in' } })
      return
    }
    const pn = Math.max(1, Math.min(1000, Math.trunc(Number(page) || 1)))
    const relationKind = kind === 'followers' ? 'followers' : 'following'
    const answer = await api(relationKind === 'followers' ? '/x/relation/fans' : '/x/relation/followings', {
      vmid: me.uid,
      pn,
      ps: PAGE_SIZE,
      order: 'desc',
    })
    if (failed('relations', answer)) return
    const found = data(answer) ?? {}
    const items = (found.list ?? [])
      .map((entry) => ({
        uid: number(entry.mid ?? entry.uid),
        name: cut(entry.uname ?? entry.name ?? '', 80),
        avatar: picture(entry.face ?? entry.avatar),
        sign: cut(entry.sign ?? '', 300),
      }))
      .filter((entry) => entry.uid)
    post({ relations: { relationKind, page: pn, items, more: items.length >= PAGE_SIZE } })
  }
  // Bilibili's popular videos, its rankings (a rid: 0 all, or a region's tid), and its "入站必刷".
  const readPopular = async () => {
    const answer = await api('/x/web-interface/popular', { ps: PAGE_SIZE, pn: 1 })
    if (failed('popular', answer)) return
    post({ popular: { items: (data(answer)?.list ?? []).map(videoOf).filter(Boolean) } })
  }
  const readRanking = async (rid = 0) => {
    const answer = await api('/x/web-interface/ranking/v2', { rid, type: 'all' })
    if (failed('ranking', answer)) return
    post({
      ranking: {
        rid,
        note: cut(data(answer)?.note ?? '', 120),
        items: (data(answer)?.list ?? []).map(videoOf).filter(Boolean),
      },
    })
  }
  // A search, its own kind: videos, UPs, bangumi, films or live rooms.
  const readSearch = async (query, kind = 'video', page = 1) => {
    const said = String(query ?? '').trim().slice(0, 60)
    if (!said) return
    const types = { video: 'video', user: 'bili_user', bangumi: 'media_bangumi', movie: 'media_ft', live: 'live' }
    const searchType = types[kind] ?? 'video'
    const answer = await wbiApi('/x/web-interface/wbi/search/type', {
      search_type: searchType,
      keyword: said,
      page: Math.max(1, Math.trunc(page)),
      page_size: PAGE_SIZE,
    })
    if (failed('search', answer)) return
    const found = data(answer) ?? {}
    let items = []
    let users = []
    if (searchType === 'video') {
      items = (found.result ?? []).filter((entry) => entry?.type === 'video').map((entry) => videoOf({ ...entry, title: String(entry.title ?? '').replace(/<[^>]+>/g, '') })).filter(Boolean)
    } else if (searchType === 'bili_user') {
      users = (found.result ?? [])
        .filter((entry) => entry?.type === 'bili_user')
        .map((entry) => ({ mid: number(entry.mid), name: cut(entry.uname ?? '', 80), avatar: picture(entry.upic), sign: cut(entry.usign ?? '', 160), fans: number(entry.fans), videos: number(entry.videos) }))
        .filter((entry) => entry.mid)
    } else if (searchType === 'live') {
      const rooms = found.result?.live_room ?? []
      items = (Array.isArray(rooms) ? rooms : []).map(roomOf).filter(Boolean)
    } else {
      items = (found.result ?? []).map(mediaOf).filter(Boolean)
    }
    post({ search: { query: said, kind: searchType === 'bili_user' ? 'user' : kind, page: number(found.page), total: number(found.numResults), items, users } })
  }
  // The bangumi/film index (a season type: 1 番剧, 2 电影, 3 纪录片, 4 国创, 5 电视剧, 7 综艺).
  const readBangumi = async (seasonType = 1, page = 1) => {
    const answer = await api('/pgc/season/index/result', {
      season_type: Math.max(1, Math.trunc(seasonType)),
      order: 3,
      sort: 0,
      st: 1,
      page: Math.max(1, Math.trunc(page)),
      pagesize: PAGE_SIZE,
      type: 1,
    })
    if (failed('bangumi', answer)) return
    const found = data(answer) ?? {}
    post({ bangumi: { seasonType, page: number(found.page) || page, total: number(found.total), items: (found.list ?? []).map(mediaOf).filter(Boolean) } })
  }
  // A season's own page: its episodes (each to play), its rating and its description. Bilibili's answer carries
  // it at its own top level (`answer.result`), not under a `data` like most of its interfaces.
  const readSeason = async (seasonId) => {
    const answer = await api('/pgc/view/web/season', { season_id: seasonId })
    if (failed('season', answer)) return
    const found = answer?.result ?? data(answer)?.result ?? data(answer)
    if (!found) {
      post({ failed: { action: 'season', code: -404, message: 'this season has nothing to show' } })
      return
    }
    const episodes = (found.episodes ?? []).map(episodeOf)
    const sections = (found.section ?? []).map((section) => ({
      title: cut(section.title ?? '', 80),
      episodes: (section.episodes ?? []).map(episodeOf),
    }))
    post({
      season: {
        seasonId: number(found.season_id ?? seasonId),
        title: cut(found.title ?? '', 160),
        cover: picture(found.cover),
        evaluate: cut(found.evaluate ?? '', 500),
        score: cut(String(found.rating?.score ?? found.rating ?? ''), 20),
        badge: cut(found.badge ?? found.new_ep?.desc ?? '', 80),
        episodes,
        sections,
      },
    })
  }
  // The live rooms Bilibili shows (its live home): the rooms and its own recommendations.
  const readLive = async () => {
    const answer = await api('/xlive/web-interface/v1/index/getList', { platform: 'web' }, 'https://api.live.bilibili.com')
    if (failed('live', answer)) return
    const found = data(answer) ?? {}
    const items = []
    const seen = new Set()
    for (const entry of [...(found.room_list ?? []), ...(found.recommend_room_list ?? [])]) {
      const room = roomOf(entry)
      if (!room || seen.has(room.roomId)) continue
      seen.add(room.roomId)
      items.push(room)
    }
    post({ live: { items } })
  }
  // The signed-in account's history, cursor after cursor.
  const readHistory = async (max = 0, viewAt = 0) => {
    const answer = await api('/x/web-interface/history/cursor', { max, view_at: viewAt, business: '' })
    if (failed('history', answer)) return
    const found = data(answer) ?? {}
    const items = (found.list ?? [])
      .map((entry) => ({
        bvid: /^BV[0-9A-Za-z]{8,12}$/.test(String(entry.history?.bvid ?? entry.bvid ?? '')) ? (entry.history?.bvid ?? entry.bvid) : '',
        aid: number(entry.history?.aid ?? entry.aid),
        title: cut(entry.title ?? '', 160),
        cover: picture(entry.cover),
        owner: userOf({ mid: entry.author_mid, name: entry.author_name }),
        duration: number(entry.duration),
        progress: number(entry.progress),
        viewedAt: number(entry.view_at),
        live: Boolean(entry.live_status),
      }))
      .filter((entry) => entry.bvid || entry.aid)
    post({ history: { items, max: number(found.cursor?.max), viewAt: number(found.cursor?.view_at) } })
  }
  // The account's own favourite folders.
  const readFavorites = async () => {
    const me = await readAccount(false)
    if (!me.signedIn) {
      post({ failed: { action: 'favorites', code: -101, message: 'not signed in' } })
      return
    }
    const answer = await api('/x/v3/fav/folder/created/list-all', { up_mid: me.uid })
    if (failed('favorites', answer)) return
    const folders = (data(answer)?.list ?? [])
      .map((entry) => ({ id: number(entry.id), title: cut(entry.title ?? '', 80), count: number(entry.media_count), favState: number(entry.fav_state) }))
      .filter((entry) => entry.id)
    post({ favorites: { folders } })
  }
  // A favourite folder's videos, a page at a time.
  const readFavoriteItems = async (mediaId, page = 1) => {
    const answer = await api('/x/v3/fav/resource/list', {
      media_id: mediaId,
      pn: Math.max(1, Math.trunc(page)),
      ps: PAGE_SIZE,
      platform: 'web',
    })
    if (failed('favoriteItems', answer)) return
    const found = data(answer) ?? {}
    const items = (found.medias ?? [])
      .filter((entry) => Number(entry.type) !== 12)
      .map((entry) =>
        videoOf({
          ...entry,
          pic: entry.cover,
          duration: entry.duration,
          owner: entry.upper,
          stat: entry.cnt_info && { view: entry.cnt_info.play, like: entry.cnt_info.thumb_up },
        }),
      )
      .filter(Boolean)
    post({
      favoriteItems: {
        mediaId,
        title: cut(found.info?.title ?? '', 80),
        items,
        hasMore: Boolean(found.has_more),
      },
    })
  }
  // The account's following feed: its dynamics (their videos, mainly).
  const readDynamic = async (offset = '') => {
    const answer = await api('/x/polymer/web-dynamic/v1/feed/all', { type: 'video', page: 1, offset })
    if (failed('dynamic', answer)) return
    const found = data(answer) ?? {}
    const items = (found.items ?? [])
      .map((entry) => {
        const archive = entry?.modules?.module_dynamic?.major?.archive ?? null
        const author = entry?.modules?.module_author ?? null
        const video = archive
          ? videoOf({
              bvid: archive.bvid,
              title: archive.title,
              cover: archive.cover,
              duration: seconds(archive.duration_text ?? archive.duration),
              owner: { mid: author?.mid, name: author?.name, face: author?.face },
              stat: archive.stat && { view: archive.stat.play, like: archive.stat.like },
              pubdate: author?.pub_ts,
            })
          : null
        if (!video) return null
        return { ...video, dynamicId: cut(String(entry.id_str ?? ''), 40), said: cut(entry?.modules?.module_dynamic?.desc?.text ?? '', 200) }
      })
      .filter(Boolean)
    post({ dynamic: { items, offset: cut(found.offset ?? '', 100) } })
  }
  // An UP's space: who they are, and their videos. The site serves those interfaces only to a document of
  // space.bilibili.com's own, so a hidden frame of that origin reads them (it was opened at the panel's first
  // read, and is told what to read over `postMessage`); signed out the site refuses them, and the app says why.
  const readSpace = async (mid, page = 1) => {
    const id = number(mid)
    if (!id) return
    const answer = await askSpaceFrame(id, Math.max(1, Math.trunc(page)))
    if (!answer) {
      post({ failed: { action: 'space', code: -1, message: "the space's page didn't answer" } })
      return
    }
    if (answer.failed) {
      post({ failed: answer.failed })
      return
    }
    post({ space: answer.space })
  }
  // A video's own page: its parts (P1, P2…), its UP, its counts and what the account did with it.
  const readDetail = async (bvid) => {
    const answer = await api('/x/web-interface/view', { bvid })
    if (failed('detail', answer)) return
    const found = data(answer) ?? {}
    const me = account.signedIn ? account : await readAccount(false)
    const pages = (found.pages ?? []).map((part) => ({ cid: number(part.cid), page: number(part.page), title: cut(part.part ?? '', 160), duration: seconds(part.duration) }))
    const [relation, coins, favoured] = me.signedIn
      ? await Promise.all([
          api('/x/web-interface/archive/relation', { bvid }),
          api('/x/web-interface/archive/coins', { bvid }),
          api('/x/v2/fav/video/favoured', { aid: number(found.aid) }),
        ])
      : [null, null, null]
    post({
      detail: {
        bvid: cut(found.bvid ?? bvid, 20),
        aid: number(found.aid),
        cid: number(found.cid),
        title: cut(found.title ?? '', 160),
        cover: picture(found.pic),
        desc: cut(found.desc ?? '', 500),
        duration: seconds(found.duration),
        pubdate: number(found.pubdate),
        owner: userOf(found.owner),
        pages,
        stat: {
          views: number(found.stat?.view),
          likes: number(found.stat?.like),
          coins: number(found.stat?.coin),
          favorites: number(found.stat?.favorite),
          danmaku: number(found.stat?.danmaku),
        },
        like: relation ? Boolean(data(relation)?.like) : null,
        coin: coins ? number(data(coins)?.multiply) : null,
        favorite: favoured ? Boolean(data(favoured)?.favoured) : null,
      },
    })
  }

  // --- Likes, coins and favourites: the site's own interfaces, the page's own CSRF token ---------------------
  const csrf = () => {
    const found = /(?:^|;\s*)bili_jct=([^;]+)/.exec(document.cookie)
    return found ? decodeURIComponent(found[1]) : ''
  }
  // A video liked (`on`) or un-liked, as its own like button does (like=1, or 2 to take it back). Where the site's
  // interface is refused by its risk control (`-352`/`-412`/`-799`) while the page's own button is there, the
  // button itself is pressed (it carries the page's own token), if its own state isn't the one asked for.
  const clickLike = (on) => {
    const button = document.querySelector('.video-like, .toolbar-left .like, .like.is-active')
    if (!button) return false
    const isOn = button.classList.contains('on') || button.classList.contains('is-active') || button.getAttribute('aria-pressed') === 'true'
    if (isOn !== Boolean(on)) button.click()
    return true
  }
  const setLike = async (bvid, on) => {
    if (!csrf()) {
      post({ like: { bvid, on, ok: false, reason: 'login' } })
      return
    }
    const answer = await api('/x/web-interface/archive/like', { bvid, like: on ? 1 : 2, csrf: csrf() }, undefined, { post: true })
    const code = Number(answer?.code ?? 0)
    if (code === 0) {
      post({ like: { bvid, on, ok: true, reason: '' } })
      return
    }
    if ([-352, -412, -799].includes(code) && clickLike(on)) {
      post({ like: { bvid, on, ok: true, reason: '' } })
      return
    }
    post({ like: { bvid, on, ok: false, reason: cut(answer?.message ?? `code ${code}`, 80) } })
  }
  // A video given `count` coins (1 or 2), as its own coin button does; the like it may add is the app's own
  // choice (`select_like`).
  const setCoin = async (bvid, count, like = false) => {
    if (!csrf()) {
      post({ coin: { bvid, count, ok: false, reason: 'login' } })
      return
    }
    const answer = await api('/x/web-interface/coin/add', { bvid, multiply: Math.min(2, Math.max(1, Math.trunc(count))), select_like: like ? 1 : 0, csrf: csrf() }, undefined, { post: true })
    const code = Number(answer?.code ?? 0)
    post({ coin: { bvid, count, ok: code === 0, reason: code === 0 ? '' : cut(answer?.message ?? `code ${code}`, 80) } })
  }
  // A video put in a favourite folder (`on`), or taken out of the ones it's in: the site's own folder list, or
  // the app's chosen folder (`mediaId`).
  const setFavorite = async (bvid, on, mediaId = 0) => {
    if (!csrf()) {
      post({ favorite: { bvid, on, ok: false, reason: 'login' } })
      return
    }
    let target = number(mediaId)
    if (on && !target) {
      const me = await readAccount(false)
      const folders = data(await api('/x/v3/fav/folder/created/list-all', { up_mid: me.uid }))?.list ?? []
      target = number(folders.find((folder) => Number(folder.attr) & 1)?.id ?? folders[0]?.id)
      if (!target) {
        post({ favorite: { bvid, on, ok: false, reason: 'no folders' } })
        return
      }
    }
    const detail = await api('/x/web-interface/view', { bvid })
    const aid = number(data(detail)?.aid)
    if (!aid) {
      post({ favorite: { bvid, on, ok: false, reason: 'no video' } })
      return
    }
    const params = { rid: aid, type: 2, add_media_ids: on ? target : '', del_media_ids: on ? '' : target, csrf: csrf() }
    const answer = await api('/x/v3/fav/resource/deal', params, undefined, { post: true })
    const code = Number(answer?.code ?? 0)
    post({ favorite: { bvid, on, ok: code === 0, reason: code === 0 ? '' : cut(answer?.message ?? `code ${code}`, 80) } })
  }

  // --- The truck's own speakers (cab_sound.js): the sound of the video that plays ----------------------------
  const cab = window.westplayCabSound?.(
    () => videoNow(),
    (message) => post(message),
  )

  // --- Playback state, said to the host as it changes --------------------------------------------------------
  const state = { last: '', lastAt: 0 }
  const reportState = async () => {
    const video = videoNow()
    const media = mediaOfPage()
    const said = (() => {
      try {
        return control()
      } catch {
        return null
      }
    })()
    const playing = Boolean(video && said && !said.paused() && video.readyState >= 2)
    // Its picture the app's own: no video yet on a page that is still loading, nothing to tell.
    if (!video && !media) return
    // A play that failed, as the page's own player says it, or an error wall standing over a picture that really
    // plays. Told once per play (the app's own `failed`, "play"), with everything the log needs to say why; a play
    // that moves has the wall put out of the way instead (the app's own picture is the video's).
    if (media) {
      const key = `${media.kind}:${media.bvid || media.epId || media.roomId || 0}:${media.page || 0}`
      const error = await errorPage()
      const moving = Boolean(
        video && !video.paused && !video.error && video.readyState >= 3 && video.currentTime > playLastTime + 0.2,
      )
      if (video) playLastTime = video.currentTime
      if (error && !moving) {
        // A page that has only just loaded may show its error page for a moment: given three seconds, a whole error
        // page one more load (as Bilibili's refresh does), then said to the app with its details.
        if (!playErrorSince) playErrorSince = Date.now()
        if (Date.now() - playErrorSince >= 3000) {
          if (!error.restricted && playRetry(key)) {
            // Its one more load (scheduled): the page that comes up says again.
          } else {
            const said = `${key}:${error.message}`
            if (playFailedFor !== said) {
              playFailedFor = said
              post({ failed: { action: 'play', code: error.code, message: error.message } })
            }
          }
        }
      } else {
        playErrorSince = 0
        if (error && moving) {
          for (const node of document.querySelectorAll(
            '[class*="error-sign-active"], .bpx-player-error, [class*="player-error"], .error-container, [class*="error-container"]',
          )) {
            node.style.setProperty('display', 'none', 'important')
          }
        }
        playFailedFor = ''
        store.set(`westplay.bilibili.retried.${key}`, null)
      }
    }
    if (media && video) {
      applyPlayback()
      if (pausedByApp) {
        // The app paused it (a dashboard button, perhaps before this page's player was there): held paused, however
        // the page's own player starts itself.
        try {
          const wanted = control()
          if (!wanted.paused()) wanted.pause()
        } catch {
          // Its player not there yet: the next pass.
        }
      } else {
        resumeIfWanted()
        // A hidden page's own player sometimes stays paused (its autoplay rules, its own state after a navigation):
        // asked to play again, a few times, until it does — a play only, never a navigation.
        const key = `${media.kind}:${media.bvid || media.epId || media.roomId || 0}:${media.page || 0}`
        if (kick.key !== key) {
          kick.key = key
          kick.tries = 0
          kick.at = 0
        }
        if (playing) {
          kick.tries = 0
        } else if (kick.tries < 8 && Date.now() - kick.at >= 400) {
          kick.at = Date.now()
          kick.tries += 1
          try {
            control().play()
          } catch {
            // Its player not there yet: the next pass.
          }
          applyPlayback()
        }
      }
    }
    // The page's own subtitles, read once for the video that plays (its list is the page's).
    if (playing && media && (media.bvid || media.aid) && media.cid) {
      await loadCaptions(media)
    } else if (media && media.kind === 'live') {
      playerState.captions = []
    }
    const at = video?.currentTime ?? 0
    if (playerState.caption && video && !video.paused) drawSubtitle(at)
    else if (subtitleLayer) subtitleLayer.style.display = 'none'
    const qn = currentQuality()
    const seconds = (value) => {
      const number = Number(value)
      return Number.isFinite(number) && number > 0 && number < 1_000_000 ? Math.round(number * 10) / 10 : 0
    }
    const report = {
      signedIn: account.signedIn,
      playing,
      // Its page's own video has data to paint (the host shows the picture only from then on: never a black frame).
      ready: Boolean(video && video.readyState >= 2 && !video.error),
      // Its sound as the page's own player has it (the page starts muted: the app's volume unmutes it).
      volume: said ? Math.round(Math.max(0, Math.min(1, said.volume())) * 100) / 100 : 0,
      rate: said ? said.rate() : playerState.rate,
      time: seconds(said?.time?.() ?? at),
      duration: seconds(said?.duration?.() ?? video?.duration),
      // Its own shape (width over height): the app's picture sits in it, whole, whatever it is (a 竖屏 clip too).
      aspect: video?.videoWidth && video?.videoHeight ? Math.round((video.videoWidth / video.videoHeight) * 1000) / 1000 : null,
      media,
      qualities: qualitiesOf(),
      quality: qn,
      qualityLabel: qualityName(qn),
      captions: playerState.captions.map(({ id, name }) => ({ id, name })),
      caption: playerState.caption,
      // How loud the truck's speakers hear it, and how much the limiter takes off (the cab's own measurement).
      cabLevel: cab?.level?.() ?? null,
    }
    const compared = JSON.stringify({ ...report, time: undefined, cabLevel: undefined })
    const now = Date.now()
    if (compared !== state.last || (playing && now - state.lastAt >= 900) || (!playing && now - state.lastAt >= 2500)) {
      state.last = compared
      state.lastAt = now
      post({ state: report })
    }
  }

  // --- The host's commands, in order -------------------------------------------------------------------------
  // Commands that came before the page could carry them out (its player not there yet), in order.
  const waiting = []
  const ready = () => Boolean(document.body)
  const run = (command) => {
    if (!command || typeof command !== 'object') return
    const action = command.action
    // The cab's own (cab_sound.js).
    switch (action) {
      case 'speakers':
        cab?.speakers(command.speakers)
        return
      case 'head':
        cab?.head(command)
        return
      case 'outside':
        cab?.outside(command.on, command.distance)
        return
      case 'menu':
        cab?.menu(command.up)
        return
      case 'equalizer':
        cab?.equalizer(command)
        return
      case 'spectrum':
        cab?.spectrum(command.on)
        return
      default:
        break
    }
    const video = videoNow()
    switch (action) {
      // The app's own data, read from the site's interface.
      case 'home':
        readHome(number(command.page) || 1, Boolean(command.fresh))
        return
      case 'popular':
        readPopular()
        return
      case 'relations':
        readRelations(command.kind === 'followers' ? 'followers' : 'following', command.page)
        return
      case 'ranking':
        readRanking(number(command.rid))
        return
      case 'search':
        readSearch(command.value ?? command.query, command.kind ?? 'video', command.page)
        return
      case 'bangumi':
        readBangumi(number(command.seasonType) || 1, command.page)
        return
      case 'season':
        readSeason(number(command.value ?? command.seasonId))
        return
      case 'live':
        readLive()
        return
      case 'history':
        readHistory(number(command.max), number(command.viewAt))
        return
      case 'favorites':
        readFavorites()
        return
      case 'favoriteItems':
        readFavoriteItems(number(command.value ?? command.mediaId), command.page)
        return
      case 'dynamic':
        readDynamic(String(command.offset ?? ''))
        return
      case 'space':
        readSpace(command.value ?? command.mid, command.page)
        return
      case 'detail':
        readDetail(String(command.value ?? command.bvid ?? ''))
        return
      case 'refresh':
        readAccount()
        reportState()
        return
      case 'like':
        setLike(String(command.value ?? command.bvid ?? ''), Boolean(command.on))
        return
      case 'coin':
        setCoin(String(command.value ?? command.bvid ?? ''), number(command.count) || 1, Boolean(command.like))
        return
      case 'favorite':
        setFavorite(String(command.value ?? command.bvid ?? ''), Boolean(command.add ?? command.on), number(command.mediaId))
        return
      // Playing: the site's own page for what's asked (its own player then plays it).
      case 'play':
        pausedByApp = false
        navigate(playTarget(command))
        return
      case 'pause':
        pausedByApp = true
        try {
          control().pause()
        } catch {
          video?.pause()
        }
        return
      case 'resume':
        pausedByApp = false
        try {
          control().play()
        } catch {
          video?.play?.().catch(() => {})
        }
        return
      // The next (or previous) of what plays: its season's next episode, its next part, or its related one.
      case 'next':
        stepMedia('next')
        return
      case 'prev':
        stepMedia('prev')
        return
      case 'seek': {
        const seconds = Number(command.value ?? command.seconds)
        if (Number.isFinite(seconds)) control().seek(Math.max(0, seconds))
        return
      }
      case 'volume': {
        const value = Math.max(0, Math.min(1, Number(command.value)))
        if (!Number.isFinite(value)) return
        playerState.volume = value
        store.set(VOLUME, value)
        try {
          const said = control()
          said.setVolume(value)
          said.setMuted(value === 0)
        } catch {
          if (video) {
            video.volume = value
            video.muted = value === 0
          }
        }
        return
      }
      case 'rate': {
        const value = Number(command.value ?? command.rate)
        if (!Number.isFinite(value) || value <= 0) return
        // The page's own player takes 0.25 to 2 (a live room's nothing).
        playerState.rate = Math.min(2, Math.max(0.25, value))
        store.set(RATE, playerState.rate)
        try {
          control().setRate(playerState.rate)
        } catch {
          if (video) video.playbackRate = playerState.rate
        }
        return
      }
      case 'quality':
        setQuality(number(command.value ?? command.qn))
        return
      case 'caption': {
        const track = command.track ?? command.value ?? null
        playerState.caption = track ? String(track) : null
        store.set(CAPTION, playerState.caption)
        playerState.captionLines = []
        if (playerState.caption) loadSubtitleLines()
        return
      }
      // Where the picture goes, and whether it fills it (the host's own: the WebView under the cabin page).
      case 'show':
        setWatch(true)
        watch.crop = Boolean(command.crop)
        store.set(CROP, watch.crop ? '1' : null)
        applyWatch()
        resumeIfWanted()
        return
      case 'hide':
        setWatch(false)
        return
      case 'crop':
        watch.crop = Boolean(command.on)
        store.set(CROP, watch.crop ? '1' : null)
        applyWatch()
        return
      // The page the app no longer needs: its own home (the next play navigates anyway).
      case 'close':
        setWatch(false)
        return
      default:
        return
    }
  }

  // --- Opened: the page's own state, and its news as it changes ----------------------------------------------
  const open = async () => {
    // The watch state a play left for this page (a navigation), and the player over the page.
    if (store.get(WATCH)) {
      watch.on = true
      applyWatch()
    }
    await readAccount()
    playerState.rate = Number(store.get(RATE) ?? 1) || 1
    if (store.get(VOLUME) != null) playerState.volume = Number(store.get(VOLUME))
    if (store.get(QUALITY) != null) playerState.quality = Number(store.get(QUALITY))
    if (store.get(CAPTION) != null) playerState.caption = store.get(CAPTION)
    post({ ready: true })
    // The page's news: the state each pass, the site's own player found as it appears.
    setInterval(async () => {
      for (const command of waiting.splice(0)) run(command)
      try {
        cab?.tick?.()
      } catch {
        // Its sound's own, not the app's.
      }
      await reportState().catch(() => {})
    }, 250)
    // The account's own, again every half minute (a sign-out in the site's own page, a session run out).
    setInterval(() => readAccount().catch(() => {}), 30_000)
    // The device's own volume keys or media keys, where the page hears them: its player's.
    for (const event of ['play', 'pause', 'ratechange', 'volumechange', 'timeupdate']) {
      document.addEventListener(
        event,
        () => {
          if (!unmuted) applyPlayback()
        },
        true,
      )
    }
    // A page hidden again (the app put it away) can have been paused by its own player: asked to play again.
    document.addEventListener('visibilitychange', () => {
      if (!pausedByApp) resumeIfWanted()
    })
  }
  window.chrome?.webview?.addEventListener('message', (event) => {
    const command = event?.data
    if (!command || typeof command !== 'object') return
    if (!ready() && command.action !== 'show' && command.action !== 'close') waiting.push(command)
    else run(command)
  })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => open(), { once: true })
  else open()
})()
