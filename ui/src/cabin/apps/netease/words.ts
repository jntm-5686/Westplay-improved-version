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
  /** Home's day's own songs (每日歌曲推荐). */
  daily: string
  dailyHint: string
  dailyFailed: string
  dailyEmpty: string
  dailyEmptyHint: string
  /** The day's songs shown longer: the word under the first few. */
  showAll: (count: number) => string
  showLess: string
  /** Home's shelves. */
  radar: string
  radarHint: string
  /** 私人漫游: NetEase's phone app has it, the web player its page here runs doesn't. */
  roam: string
  roamBadge: string
  roamNote: string
  personal: string
  personalHint: string
  recommendedHot: string
  recommendedHotHint: string
  /** Home's own recommended playlists (the shelves' cards, under the radar row). */
  recommendedPlaylists: string
  recommendedPlaylistsHint: string
  homeFailed: string
  /** A playlist and its numbers. */
  playlist: string
  playAll: string
  plays: (count: number) => string
  songs: (count: number) => string
  /** My Music's own playlists. */
  myPlaylistsHint: string
  createdPlaylists: string
  collectedPlaylists: string
  by: (name: string) => string
  libraryFailed: string
  libraryEmpty: string
  libraryEmptyHint: string
  /** Pages that are still coming, or couldn't. */
  loading: string
  failed: string
  retry: string
  emptyLists: string
  emptyListsHint: string
  /** A playlist with no songs in it at all. */
  emptyPlaylist: string
  emptyPlaylistHint: string
  /** Search (the page's own). */
  searchHint: string
  searchNote: string
  searchHot: string
  searchHotHint: string
  searchIdle: string
  searchIdleHint: string
  searching: string
  searchFailed: string
  searchEmpty: string
  searchEmptyHint: string
  searchPlaylists: string
  searchSongs: string
  searchArtists: string
  /** What a search found, by its page's own categories (its own count of each). */
  searchFound: (songs: number, artists: number, playlists: number) => string
  /** An artist's page (a search's artist pressed). */
  artist: string
  artistHint: string
  artistFailed: string
  artistEmpty: string
  artistEmptyHint: string
  /** Your music. */
  recent: string
  recentSource: string
  recentHint: string
  recentHost: string
  recentEmpty: string
  recentEmptyHint: string
  recentFailed: string
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
  /** The heart (喜欢): the playing song in the account's 我喜欢的音乐. */
  like: string
  unlike: string
  likeFailed: string
  likeSignIn: string
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
  /** A song pressed: the hidden page is asked to play it by id. */
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
  const by = (name: string) => (zh ? `by ${name}` : `by ${name}`)
  if (zh) {
    return {
      brand: '网易云音乐',
      home: '首页',
      mine: '我的音乐',
      search: '搜索',
      now: '正在播放',
      back: '返回',
      recommended: '今日推荐',
      recommendedHint: '账号自己的推荐，就从今天的歌开始。',
      refresh: '换一批',
      daily: '每日推荐',
      dailyHint: '根据你的口味生成，每天更新',
      dailyFailed: '今天的推荐没有读到',
      dailyEmpty: '今天还没有推荐',
      dailyEmptyHint: '网易云的页面今天没有给这个账号推荐歌曲，稍后点「换一批」再试。',
      showAll: (count) => `显示全部 ${count} 首`,
      showLess: '收起',
      radar: '私人雷达',
      radarHint: '根据你的口味持续更新',
      roam: '私人漫游',
      roamBadge: '手机 App',
      roamNote: '网易云网页版没有私人漫游，这个入口在它的手机 App 里。',
      personal: '个性化歌单',
      personalHint: '按你的口味挑出来的歌单',
      recommendedHot: '热门推荐',
      recommendedHotHint: '大家都在听的歌单',
      recommendedPlaylists: '推荐歌单',
      recommendedPlaylistsHint: '按你的口味和热度挑出来的歌单',
      homeFailed: '首页没有全部读到。点「换一批」再试一次。',
      playlist: '歌单',
      playAll: '播放全部',
      plays,
      songs,
      myPlaylistsHint: '账号里的全部歌单，按网易云自己的分组。',
      createdPlaylists: '创建的歌单',
      collectedPlaylists: '收藏的歌单',
      by,
      libraryFailed: '歌单没有读到',
      libraryEmpty: '还没有读到歌单',
      libraryEmptyHint: '网易云的「我的音乐」页没有读到这个账号的歌单，稍后点「重试」。',
      loading: LOADING.zh,
      failed: '歌单没有打开',
      retry: '重试',
      emptyLists: '还没有推荐歌单',
      emptyListsHint: '网易云的页面还没有把首页的歌单读出来，稍后点「换一批」再试。',
      emptyPlaylist: '这个歌单是空的',
      emptyPlaylistHint: '网易云的页面没有读到它下面的歌曲。',
      searchHint: '搜索歌曲、艺人或歌单',
      searchNote: '结果来自网易云的搜索页，按它的分类。',
      searchHot: '试试这些歌单',
      searchHotHint: '点一个名字，就能搜到歌',
      searchIdle: '搜点什么',
      searchIdleHint: '在顶上的搜索框里输入歌曲、艺人或歌单的名字。',
      searching: '正在搜索…',
      searchFailed: '搜索没有结果回来',
      searchEmpty: '没有找到',
      searchEmptyHint: '换一个词试试。',
      searchPlaylists: '歌单',
      searchSongs: '歌曲',
      searchArtists: '艺人',
      searchFound: (songs, artists, playlists) =>
        `找到 ${songs} 首歌、${artists} 位艺人、${playlists} 个歌单`,
      artist: '艺人',
      artistHint: '热门歌曲',
      artistFailed: '这个艺人的页面没有读到',
      artistEmpty: '没有读到这个艺人的歌',
      artistEmptyHint: '网易云的页面没有读到这个艺人的歌曲，稍后点「重试」。',
      recent: '最近播放',
      recentSource: '最近一周的听歌排行',
      recentHint: '网易云网页版没有单独的「最近播放」页，这里读的是它账号的「听歌排行」（最近一周）。',
      recentHost: '最近一周在网易云听过的歌。',
      recentEmpty: '这一周还没有听过歌',
      recentEmptyHint: '网易云的这个账号最近一周没有播放记录。',
      recentFailed: '最近播放没有读到',
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
      like: '喜欢',
      unlike: '取消喜欢',
      likeFailed: '红心没有同步到网易云，稍后再试。',
      likeSignIn: '登录网易云后才能点红心。',
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
    recommended: 'For you',
    recommendedHint: 'The account’s own picks, starting with today’s songs.',
    refresh: 'Refresh',
    daily: 'Daily picks',
    dailyHint: 'Made for you, new every day',
    dailyFailed: 'Today’s picks didn’t come',
    dailyEmpty: 'No picks today',
    dailyEmptyHint: 'NetEase’s page made none for this account today. Try Refresh in a moment.',
    showAll: (count) => `Show all ${count}`,
    showLess: 'Show less',
    radar: 'Private Radar',
    radarHint: 'Kept in step with your taste',
    roam: 'Private Roam',
    roamBadge: 'Phone app',
    roamNote: 'The web player has no Private Roam: it lives in NetEase’s phone app.',
    personal: 'Made for you',
    personalHint: 'Playlists picked by your taste',
    recommendedHot: 'Popular playlists',
    recommendedHotHint: 'What everyone is playing',
    recommendedPlaylists: 'Recommended playlists',
    recommendedPlaylistsHint: 'Picked by your taste and by what’s popular',
    homeFailed: 'Home didn’t all come. Try Refresh again.',
    playlist: 'Playlist',
    playAll: 'Play all',
    plays,
    songs,
    myPlaylistsHint: 'Every playlist of the account, in NetEase’s own groups.',
    createdPlaylists: 'Created by you',
    collectedPlaylists: 'Collected',
    by,
    libraryFailed: 'The playlists didn’t come',
    libraryEmpty: 'No playlists read yet',
    libraryEmptyHint: 'NetEase’s My Music page read none for this account. Try again in a moment.',
    loading: LOADING.en,
    failed: 'The playlist didn’t open',
    retry: 'Try again',
    emptyLists: 'No playlists yet',
    emptyListsHint: 'NetEase’s page hasn’t read Home’s playlists yet. Try Refresh in a moment.',
    emptyPlaylist: 'This playlist is empty',
    emptyPlaylistHint: 'NetEase’s page didn’t read any songs from it.',
    searchHint: 'Search songs, artists or playlists',
    searchNote: 'Searches NetEase’s own search page, in its own categories.',
    searchHot: 'Try these playlists',
    searchHotHint: 'Pick a name to search for',
    searchIdle: 'Search NetEase',
    searchIdleHint: 'Type a song, artist or playlist in the search bar above.',
    searching: 'Searching…',
    searchFailed: 'The search didn’t answer',
    searchEmpty: 'Nothing found',
    searchEmptyHint: 'Try another word.',
    searchPlaylists: 'Playlists',
    searchSongs: 'Songs',
    searchArtists: 'Artists',
    searchFound: (songs, artists, playlists) =>
      `Found ${songs} songs, ${artists} artists and ${playlists} playlists`,
    artist: 'Artist',
    artistHint: 'Popular songs',
    artistFailed: 'This artist’s page didn’t come',
    artistEmpty: 'No songs read for this artist',
    artistEmptyHint: 'NetEase’s page didn’t read this artist’s songs. Try again in a moment.',
    recent: 'Recently played',
    recentSource: 'This week’s listening chart',
    recentHint: 'The web player has no recent-play page of its own: this reads the account’s listening chart for the week.',
    recentHost: 'Songs this account listened to this week.',
    recentEmpty: 'Nothing played this week',
    recentEmptyHint: 'This account has no plays in NetEase’s last week.',
    recentFailed: 'The recent songs didn’t come',
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
    like: 'Like',
    unlike: 'Remove from liked songs',
    likeFailed: 'The heart didn’t sync with NetEase. Try again in a moment.',
    likeSignIn: 'Sign in to NetEase to use the heart.',
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
