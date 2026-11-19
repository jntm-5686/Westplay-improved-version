/**
 * The NetEase app's own words, in the cabin's language: Chinese for Chinese, English for the rest (until they
 * join the cab's translations in state/strings). Kept apart from the hook that reads the cabin's language, so
 * the words can be had without a page (the tests).
 */
export interface NeteaseWords {
  brand: string
  home: string
  mine: string
  search: string
  now: string
  back: string
  /** Home. */
  recommended: string
  recommendedHint: string
  refresh: string
  /** A playlist and its numbers. */
  playlist: string
  playAll: string
  plays: (count: number) => string
  songs: (count: number) => string
  /** Pages that are still coming, or couldn't. */
  loading: string
  failed: string
  retry: string
  emptyLists: string
  emptyListsHint: string
  /** A playlist with no songs in it at all. */
  emptyPlaylist: string
  emptyPlaylistHint: string
  /** Search (v1: what the app already holds). */
  searchHint: string
  searchNote: string
  searchHot: string
  searchEmpty: string
  searchEmptyHint: string
  searchPlaylists: string
  searchSongs: string
  /** Your music (v1: the account and this session's plays). */
  recent: string
  recentHint: string
  recentHost: string
  recentEmpty: string
  account: string
  signedIn: string
  signedOut: string
  signingIn: string
  unknownAccount: string
  signInHint: string
  signingInHint: string
  /** What plays. */
  nowPlaying: string
  nothingPlaying: string
  nothingPlayingHint: string
  album: string
  /** NetEase's rights don't let it play. */
  unplayable: string
  unplayableHint: string
  /** The player's controls. */
  play: string
  pause: string
  next: string
  previous: string
  volume: string
  mute: string
  unmute: string
  /** The style switch (the rail's foot). */
  style: string
  styleFollow: string
  styleRed: string
  /** A song pressed in a playlist: the hidden page is asked to play it by id. */
  queued: string
  /** The host hasn't answered at all. */
  notConnected: string
  notConnectedHint: string
  /** Shown on a plain browser's invented screen. */
  preview: string
}

const LOADING = { zh: '正在读取…', en: 'Loading…' }

/** 2184000: "218万" in Chinese, "2.2M" in English (Intl's compact form; Chinese rounds to whole 万). */
function compact(count: number, locale: string, zh: boolean): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: zh ? 0 : 1,
  }).format(count)
}

/** The app's words in the cabin's language `locale` (`zh-CN` and its variants: Chinese; else English). */
export function neteaseWords(locale: string): NeteaseWords {
  const zh = locale.toLocaleLowerCase().startsWith('zh')
  const plays = (count: number) =>
    zh ? `${compact(count, locale, true)}次播放` : `${compact(count, locale, false)} plays`
  const songs = (count: number) => (zh ? `${count} 首` : `${count} songs`)
  if (zh) {
    return {
      brand: '网易云音乐',
      home: '首页',
      mine: '我的音乐',
      search: '搜索',
      now: '正在播放',
      back: '返回',
      recommended: '推荐歌单',
      recommendedHint: '随时点开一张，路上不寂寞。',
      refresh: '换一批',
      playlist: '歌单',
      playAll: '播放全部',
      plays,
      songs,
      loading: LOADING.zh,
      failed: '歌单没有打开',
      retry: '重试',
      emptyLists: '还没有推荐歌单',
      emptyListsHint: '网易云的页面还没有把首页的歌单读出来，稍后点「换一批」再试。',
      emptyPlaylist: '这个歌单是空的',
      emptyPlaylistHint: '网易云的页面没有读到它下面的歌曲。',
      searchHint: '搜索歌单或歌曲',
      searchNote: 'v1 先在已读取的歌单里查找；完整在线搜索在后续版本。',
      searchHot: '大家都在听',
      searchEmpty: '没有找到',
      searchEmptyHint: '换一个词试试。',
      searchPlaylists: '歌单',
      searchSongs: '歌曲',
      recent: '最近播放',
      recentHint: '本次打开车机以来听过的歌。',
      recentHost: '点歌请到歌单里；这里只做记录。',
      recentEmpty: '还没有听过歌。',
      account: '账户',
      signedIn: '已登录',
      signedOut: '未登录',
      signingIn: '登录中…',
      unknownAccount: '连接中…',
      signInHint: '登录入口在电脑上的伴生程序里。',
      signingInHint: '已打开网易云的登录窗口，请在电脑上完成扫码。',
      nowPlaying: '正在播放',
      nothingPlaying: '还没有在播放',
      nothingPlayingHint: '从首页或歌单里点一首，或者打开电脑上的网易云。',
      album: '专辑',
      unplayable: '不可播',
      unplayableHint: '这首歌受版权或会员限制，网易云无法在车里播放。',
      play: '播放',
      pause: '暂停',
      next: '下一首',
      previous: '上一首',
      volume: '音量',
      mute: '静音',
      unmute: '取消静音',
      style: '界面风格',
      styleFollow: '跟随体系',
      styleRed: '网易云红',
      queued: '已请网易云播放这首歌',
      notConnected: '还没有连上主机',
      notConnectedHint: '主机没有回应。请确认它正在运行，然后重启这个页面。',
      preview: '预览数据',
    }
  }
  return {
    brand: 'NetEase Music',
    home: 'Home',
    mine: 'My Music',
    search: 'Search',
    now: 'Now Playing',
    back: 'Back',
    recommended: 'Recommended playlists',
    recommendedHint: 'Open one and keep the road company.',
    refresh: 'Refresh',
    playlist: 'Playlist',
    playAll: 'Play all',
    plays,
    songs,
    loading: LOADING.en,
    failed: 'The playlist didn’t open',
    retry: 'Try again',
    emptyLists: 'No playlists yet',
    emptyListsHint: 'NetEase’s page hasn’t read Home’s playlists yet. Try Refresh in a moment.',
    emptyPlaylist: 'This playlist is empty',
    emptyPlaylistHint: 'NetEase’s page didn’t read any songs from it.',
    searchHint: 'Playlists or songs',
    searchNote: 'v1 searches what the app already holds; full online search comes later.',
    searchHot: 'Popular searches',
    searchEmpty: 'Nothing found',
    searchEmptyHint: 'Try another word.',
    searchPlaylists: 'Playlists',
    searchSongs: 'Songs',
    recent: 'Recently played',
    recentHint: 'What played since this screen was opened.',
    recentHost: 'Pick songs in a playlist; this is only a record.',
    recentEmpty: 'Nothing has played yet.',
    account: 'Account',
    signedIn: 'Signed in',
    signedOut: 'Signed out',
    signingIn: 'Signing in…',
    unknownAccount: 'Connecting…',
    signInHint: 'Sign in from the companion app on your PC.',
    signingInHint: 'NetEase’s sign-in is open on your PC: finish it there.',
    nowPlaying: 'Now playing',
    nothingPlaying: 'Nothing is playing',
    nothingPlayingHint: 'Pick a song on Home or in a playlist, or start NetEase on your PC.',
    album: 'Album',
    unplayable: 'Unplayable',
    unplayableHint: 'Rights or membership keep this song from playing in the cab.',
    play: 'Play',
    pause: 'Pause',
    next: 'Next',
    previous: 'Previous',
    volume: 'Volume',
    mute: 'Mute',
    unmute: 'Unmute',
    style: 'Style',
    styleFollow: 'WestPlay',
    styleRed: 'NetEase red',
    queued: 'Asked NetEase to play this song',
    notConnected: 'Not connected yet',
    notConnectedHint: 'The host hasn’t answered. Check that it runs, then open this screen again.',
    preview: 'Preview data',
  }
}
