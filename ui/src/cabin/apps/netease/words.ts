/**
 * The NetEase app's own words, in the cabin's language: Chinese for Chinese, English for the rest (until they
 * join the cab's translations in state/strings). Kept apart from the hook that reads the cabin's language, so
 * the words can be had without a page (the tests).
 */
export interface NeteaseWords {
  brand: string
  /** The rail's tabs, in its own order, and 我的 at its foot. */
  home: string
  playlists: string
  rankings: string
  mine: string
  now: string
  search: string
  back: string

  /** What every page says while it waits, when nothing came, and the ways to ask again. */
  refresh: string
  retry: string
  loading: string
  failed: string
  notConnected: string
  notConnectedHint: string
  preview: string
  /** A song pressed: the hidden page is asked to play it by id. */
  queued: string
  /** A song or Next/Previous asked of the page and not answered yet: the small mark on the player bar. */
  hoping: string
  /** The play mode's names, as its player bar's button says them (its own words for them). */
  mode: string
  modeList: string
  modeShuffle: string
  modeOne: string

  /** Whose account it is. */
  account: string
  signedIn: string
  signedOut: string
  signingIn: string
  unknownAccount: string
  signInHint: string
  signingInHint: string
  signIn: string
  signOut: string
  signOutHint: string

  /** The skin (the settings page's 外观): WestPlay's own look, or NetEase's red; both follow the cab. */
  style: string
  styleFollow: string
  styleRed: string
  styleHint: string

  /** Home. */
  daily: string
  dailyHint: string
  /** The day's card: its kicker, its one line, and the day it was made for. */
  dailyKicker: string
  dailyTagline: string
  dailyDate: (day: Date) => string
  dailyFailed: string
  dailyEmpty: string
  dailyEmptyHint: string
  playAll: string
  showAll: (count: number) => string
  showLess: string
  /** 私人雷达, and 私人漫游 (which the web player has no entry for). */
  radar: string
  radarHint: string
  radarEmpty: string
  roam: string
  roamBadge: string
  roamNote: string
  /** Home's shelves. */
  personal: string
  personalHint: string
  recommendedHot: string
  recommendedHotHint: string
  recommendedPlaylists: string
  recommendedPlaylistsHint: string
  homeFailed: string
  emptyLists: string
  emptyListsHint: string

  /** A playlist and its numbers. */
  playlist: string
  plays: (count: number) => string
  songs: (count: number) => string
  by: (name: string) => string
  emptyPlaylist: string
  emptyPlaylistHint: string

  /** My playlists (歌单). */
  myPlaylists: string
  myPlaylistsHint: string
  createdPlaylists: string
  collectedPlaylists: string
  libraryFailed: string
  libraryEmpty: string
  libraryEmptyHint: string
  myPlaylistsCount: (count: number) => string

  /** The recent songs (听歌排行 this week: the web player keeps no 最近播放 page of its own). */
  recent: string
  recentSource: string
  recentHint: string
  recentHost: string
  recentEmpty: string
  recentEmptyHint: string
  recentFailed: string

  /** NetEase's own rankings (榜单). */
  rankingsHint: string
  rankingsFailed: string
  rankingsEmpty: string
  rankingsEmptyHint: string
  ranking: string
  official: string
  rankingTracks: (count: number) => string

  /** The account's own page (我的). */
  profile: string
  profileHint: string
  profileFailed: string
  profileUnread: string
  profileUnreadHint: string
  level: string
  levelValue: (level: number) => string
  follows: string
  fans: string
  listenSongs: string
  listenSongsCount: (count: number) => string
  playlistCount: (count: number) => string
  createDaysValue: (days: number) => string
  uid: string
  signatureEmpty: string
  vip: string

  /** The settings' page (from 我的). */
  settings: string
  settingsHint: string
  appearance: string
  appearanceHint: string
  motion: string
  motionFull: string
  motionCalm: string
  motionHint: string
  playHints: string
  playHintsHint: string
  toggleOn: string
  toggleOff: string
  sound: string
  soundHint: string
  quality: string
  qualityAccount: string
  loginInfo: string
  loginInfoHint: string
  about: string
  aboutApp: string
  aboutData: string
  aboutPlayer: string
  aboutPreview: string
  aboutNote: string

  /** Search (the bar at every page's top, and its page). */
  searchHint: string
  searchIdle: string
  searchIdleHint: string
  searchHot: string
  searchHotHint: string
  searching: string
  searchFailed: string
  searchEmpty: string
  searchEmptyHint: string
  searchSongs: string
  searchArtists: string
  searchPlaylists: string
  searchFound: (songs: number, artists: number, playlists: number) => string
  searchFor: (query: string) => string
  searchArtistFirst: string
  /** The still-empty Search page: what was searched before, then the playlists picked for the account. */
  searchHistory: string
  searchHistoryHint: string
  searchHistoryEmpty: string
  searchHistoryClear: string
  searchLike: string
  searchLikeHint: string
  /** An artist's page (a search's artist pressed). */
  artist: string
  artistHint: string
  artistFailed: string
  artistEmpty: string
  artistEmptyHint: string

  /** What plays. */
  nowPlaying: string
  nothingPlaying: string
  nothingPlayingHint: string
  album: string
  unplayable: string
  unplayableHint: string
  /** The heart (喜欢): the playing song in the account's 我喜欢的音乐. */
  like: string
  unlike: string
  likeFailed: string
  likeSignIn: string
  play: string
  pause: string
  next: string
  previous: string
  volume: string
  mute: string
  unmute: string
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
  const day = (date: Date) =>
    zh
      ? `${date.getMonth() + 1}月${date.getDate()}日 ${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)}`
      : new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
  if (zh) {
    return {
      brand: '网易云音乐',
      home: '首页',
      playlists: '歌单',
      rankings: '榜单',
      mine: '我的',
      now: '正在播放',
      search: '搜索',
      back: '返回',
      refresh: '刷新',
      retry: '重试',
      loading: LOADING.zh,
      failed: '没有读到',
      notConnected: '还没有连上主机',
      notConnectedHint: '主机没有回应。请确认它正在运行，然后重启这个页面。',
      preview: '预览数据',
      queued: '已请网易云播放这首歌',
      hoping: '正在切歌…',
  mode: '播放模式',
  modeList: '列表循环',
  modeShuffle: '随机播放',
  modeOne: '单曲循环',
      account: '账户',
      signedIn: '已登录',
      signedOut: '未登录',
      signingIn: '登录中…',
      unknownAccount: '连接中…',
      signInHint: '登录入口在电脑上的伴生程序里。',
      signingInHint: '已打开网易云的登录窗口，请在电脑上完成扫码。',
      signIn: '去登录',
      signOut: '退出登录',
      signOutHint: '退出后，网易云的页面会登出这个账号；想再听歌需要重新扫码。',
      style: '界面风格',
      styleFollow: '跟随',
      styleRed: '网易云红',
      styleHint: '两种风格都跟随车机的深浅色。',
      daily: '每日推荐',
      dailyHint: '根据你的口味生成，每天更新',
      dailyKicker: '今日推荐',
      dailyTagline: '根据你的口味，今天为你挑了这些歌。',
      dailyDate: day,
      dailyFailed: '今天的推荐没有读到',
      dailyEmpty: '今天还没有推荐',
      dailyEmptyHint: '网易云的页面今天没有给这个账号推荐歌曲，稍后点「刷新」再试。',
      playAll: '播放全部',
      showAll: (count) => `显示全部 ${count} 首`,
      showLess: '收起',
      radar: '私人雷达',
      radarHint: '根据你的口味持续更新',
      radarEmpty: '今天没有私人雷达',
      roam: '私人漫游',
      roamBadge: '手机 App',
      roamNote: '网易云网页版没有私人漫游，这个入口在它的手机 App 里。',
      personal: '个性化歌单',
      personalHint: '按你的口味挑出来的歌单',
      recommendedHot: '热门推荐',
      recommendedHotHint: '大家都在听的歌单',
      recommendedPlaylists: '推荐歌单',
      recommendedPlaylistsHint: '按你的口味和热度挑出来的歌单',
      homeFailed: '首页没有全部读到。点「刷新」再试一次。',
      emptyLists: '还没有推荐歌单',
      emptyListsHint: '网易云的页面还没有把首页的歌单读出来，稍后点「刷新」再试。',
      playlist: '歌单',
      plays,
      songs,
      by,
      emptyPlaylist: '这个歌单是空的',
      emptyPlaylistHint: '网易云的页面没有读到它下面的歌曲，稍后点「重试」。',
      myPlaylists: '我的歌单',
      myPlaylistsHint: '账号里的全部歌单，按网易云自己的分组。',
      createdPlaylists: '创建的歌单',
      collectedPlaylists: '收藏的歌单',
      libraryFailed: '歌单没有读到',
      libraryEmpty: '还没有读到歌单',
      libraryEmptyHint: '网易云的「我的音乐」页没有读到这个账号的歌单，稍后点「重试」。',
      myPlaylistsCount: (count) => `${count} 个歌单`,
      recent: '最近播放',
      recentSource: '最近一周的听歌排行',
      recentHint: '网易云网页版没有单独的「最近播放」页，这里读的是它账号的「听歌排行」（最近一周）。',
      recentHost: '最近一周在网易云听过的歌。',
      recentEmpty: '这一周还没有听过歌',
      recentEmptyHint: '网易云的这个账号最近一周没有播放记录。',
      recentFailed: '最近播放没有读到',
      rankingsHint: '网易云自己的榜单，点开就是它的歌单。',
      rankingsFailed: '榜单没有读到',
      rankingsEmpty: '还没有读到榜单',
      rankingsEmptyHint: '网易云的页面没有读到榜单列表，稍后点「重试」。',
      ranking: '榜单',
      official: '官方',
      rankingTracks: (count) => `${count} 首`,
      profile: '我的',
      profileHint: '账号、最近播放和设置都在这里。',
      profileFailed: '账号的资料没有读到',
      profileUnread: '还没有读到账号',
      profileUnreadHint: '登录之后，这里会显示你的昵称、头像和听歌数据。',
      level: '等级',
      levelValue: (level) => `Lv.${level}`,
      follows: '关注',
      fans: '粉丝',
      listenSongs: '累计听歌',
      listenSongsCount: (count) => (count > 0 ? `${compact(count, locale, true)} 首` : '—'),
      playlistCount: (count) => (count > 0 ? `${count} 个` : '—'),
      createDaysValue: (days) => `加入网易云 ${days} 天`,
      uid: 'ID',
      signatureEmpty: '还没有写个人简介',
      vip: '黑胶 VIP',
      settings: '设置',
      settingsHint: '播放偏好、界面和账号。',
      appearance: '外观',
      appearanceHint: '界面风格和动画。',
      motion: '界面动效',
      motionFull: '完整',
      motionCalm: '精简',
      motionHint: '精简会关掉页面切换和提示的动画。',
      playHints: '点歌提示',
      playHintsHint: '点歌后在底部显示一行提示。',
      toggleOn: '开',
      toggleOff: '关',
      sound: '播放',
      soundHint: '播放由电脑上的网易云网页完成，这里只显示它正在做的事。',
      quality: '音质',
      qualityAccount: '跟随网易云账号',
      loginInfo: '登录信息',
      loginInfoHint: '登录和退出都在电脑上的网易云页面里完成，车里只显示状态。',
      about: '关于',
      aboutApp: '网易云音乐车机版 V1.3 · WestPlay',
      aboutData: '内容来自电脑上隐藏运行的网易云网页版。',
      aboutPlayer: '播放、红心和歌单由网易云网页完成，车机界面只负责展示与控制。',
      aboutPreview: '当前在浏览器里预览：歌单、歌曲和账号都是编出来的，不是真实数据。',
      aboutNote: '没有广告、评论、直播和播客，只留下听歌要用的。',
      searchHint: '搜索歌曲、艺人或歌单',
      searchIdle: '搜点什么',
      searchIdleHint: '在顶上的搜索框里输入歌曲、艺人或歌单的名字。',
      searchHot: '试试这些歌单',
      searchHotHint: '点一个名字，就能搜到歌',
      searching: '正在搜索…',
      searchFailed: '搜索没有结果回来',
      searchEmpty: '没有找到',
      searchEmptyHint: '换一个词试试。',
      searchSongs: '歌曲',
      searchArtists: '艺人',
      searchPlaylists: '歌单',
      searchFound: (foundSongs, artists, playlists) =>
        `找到 ${foundSongs} 首歌、${artists} 位艺人、${playlists} 个歌单`,
      searchFor: (query) => `“${query}” 的结果`,
      searchArtistFirst: '有相符的艺人，先放在最上面',
      searchHistory: '搜索历史',
      searchHistoryHint: '最近搜过的三个',
      searchHistoryEmpty: '还没有搜过什么，搜一次就会留在这里。',
      searchHistoryClear: '清空',
      searchLike: '猜你喜欢',
      searchLikeHint: '按你的口味挑的歌单',
      artist: '艺人',
      artistHint: '热门歌曲',
      artistFailed: '这个艺人的页面没有读到',
      artistEmpty: '没有读到这个艺人的歌',
      artistEmptyHint: '网易云的页面没有读到这个艺人的歌曲，稍后点「重试」。',
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
    }
  }
  return {
    brand: 'NetEase Music',
    home: 'Home',
    playlists: 'Playlists',
    rankings: 'Charts',
    mine: 'Me',
    now: 'Now Playing',
    search: 'Search',
    back: 'Back',
    refresh: 'Refresh',
    retry: 'Try again',
    loading: LOADING.en,
    failed: 'Nothing read',
    notConnected: 'Not connected yet',
    notConnectedHint: 'The host hasn’t answered. Check that it runs, then open this screen again.',
    preview: 'Preview data',
    queued: 'Asked NetEase to play this song',
    hoping: 'Switching…',
  mode: 'Play mode',
  modeList: 'Repeat list',
  modeShuffle: 'Shuffle',
  modeOne: 'Repeat one',
    account: 'Account',
    signedIn: 'Signed in',
    signedOut: 'Signed out',
    signingIn: 'Signing in…',
    unknownAccount: 'Connecting…',
    signInHint: 'Sign in from the companion app on your PC.',
    signingInHint: 'NetEase’s sign-in is open on your PC: finish it there.',
    signIn: 'Sign in',
    signOut: 'Sign out',
    signOutHint: 'Signing out signs this account out of NetEase’s page too: sign in again to listen.',
    style: 'Style',
    styleFollow: 'WestPlay',
    styleRed: 'NetEase red',
    styleHint: 'Both follow the cab’s light or dark.',
    daily: 'Daily picks',
    dailyHint: 'Made for you, new every day',
    dailyKicker: 'Today’s picks',
    dailyTagline: 'Picked for your taste, for today.',
    dailyDate: day,
    dailyFailed: 'Today’s picks didn’t come',
    dailyEmpty: 'No picks today',
    dailyEmptyHint: 'NetEase’s page made none for this account today. Try Refresh in a moment.',
    playAll: 'Play all',
    showAll: (count) => `Show all ${count}`,
    showLess: 'Show less',
    radar: 'Private Radar',
    radarHint: 'Kept in step with your taste',
    radarEmpty: 'No radar today',
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
    emptyLists: 'No playlists yet',
    emptyListsHint: 'NetEase’s page hasn’t read Home’s playlists yet. Try Refresh in a moment.',
    playlist: 'Playlist',
    plays,
    songs,
    by,
    emptyPlaylist: 'This playlist is empty',
    emptyPlaylistHint: 'NetEase’s page didn’t read any songs from it. Try again in a moment.',
    myPlaylists: 'My playlists',
    myPlaylistsHint: 'Every playlist of the account, in NetEase’s own groups.',
    createdPlaylists: 'Created by you',
    collectedPlaylists: 'Collected',
    libraryFailed: 'The playlists didn’t come',
    libraryEmpty: 'No playlists read yet',
    libraryEmptyHint: 'NetEase’s My Music page read none for this account. Try again in a moment.',
    myPlaylistsCount: (count) => `${count} playlists`,
    recent: 'Recently played',
    recentSource: 'This week’s listening chart',
    recentHint:
      'The web player has no recent-play page of its own: this reads the account’s listening chart for the week.',
    recentHost: 'Songs this account listened to this week.',
    recentEmpty: 'Nothing played this week',
    recentEmptyHint: 'This account has no plays in NetEase’s last week.',
    recentFailed: 'The recent songs didn’t come',
    rankingsHint: 'NetEase’s own charts: open one for its playlist.',
    rankingsFailed: 'The charts didn’t come',
    rankingsEmpty: 'No charts read yet',
    rankingsEmptyHint: 'NetEase’s page read no charts. Try again in a moment.',
    ranking: 'Chart',
    official: 'Official',
    rankingTracks: (count) => `${count} songs`,
    profile: 'Me',
    profileHint: 'The account, the recent songs and the settings.',
    profileFailed: 'The account’s page didn’t come',
    profileUnread: 'No account read yet',
    profileUnreadHint: 'Once signed in, your name, picture and listening numbers show here.',
    level: 'Level',
    levelValue: (level) => `Lv.${level}`,
    follows: 'Following',
    fans: 'Followers',
    listenSongs: 'Songs heard',
    listenSongsCount: (count) =>
      count > 0
        ? `${new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(count)}`
        : '—',
    playlistCount: (count) => (count > 0 ? `${count}` : '—'),
    createDaysValue: (days) => `${days} days on NetEase`,
    uid: 'ID',
    signatureEmpty: 'No signature yet',
    vip: 'Vinyl VIP',
    settings: 'Settings',
    settingsHint: 'Playback, the look, and the account.',
    appearance: 'Appearance',
    appearanceHint: 'The style and the motion.',
    motion: 'Motion',
    motionFull: 'Full',
    motionCalm: 'Calm',
    motionHint: 'Calm turns off the page changes’ and the toast’s animation.',
    playHints: 'Play hints',
    playHintsHint: 'A line over the player once a song is asked for.',
    toggleOn: 'On',
    toggleOff: 'Off',
    sound: 'Playback',
    soundHint: 'NetEase’s web page on the PC plays: this screen shows and steers it.',
    quality: 'Quality',
    qualityAccount: 'Follows the NetEase account',
    loginInfo: 'Account',
    loginInfoHint: 'Signing in and out happen in NetEase’s page on the PC; the cab only shows it.',
    about: 'About',
    aboutApp: 'NetEase Music in the cab · V1.3 · WestPlay',
    aboutData: 'What’s shown is read live from the NetEase web player running hidden on the PC.',
    aboutPlayer: 'Playback, the heart and the playlists are NetEase’s page; this screen draws and steers them.',
    aboutPreview: 'Previewing in a browser: the playlists, songs and account are made up, not real.',
    aboutNote: 'No ads, comments, live streams or podcasts: only what listening needs.',
    searchHint: 'Search songs, artists or playlists',
    searchIdle: 'Search NetEase',
    searchIdleHint: 'Type a song, artist or playlist in the search bar above.',
    searchHot: 'Try these playlists',
    searchHotHint: 'Pick a name to search for',
    searching: 'Searching…',
    searchFailed: 'The search didn’t answer',
    searchEmpty: 'Nothing found',
    searchEmptyHint: 'Try another word.',
    searchSongs: 'Songs',
    searchArtists: 'Artists',
    searchPlaylists: 'Playlists',
    searchFound: (foundSongs, artists, playlists) =>
      `Found ${foundSongs} songs, ${artists} artists and ${playlists} playlists`,
    searchFor: (query) => `Results for “${query}”`,
    searchArtistFirst: 'Matching artists come first',
    searchHistory: 'Recent searches',
    searchHistoryHint: 'The last three',
    searchHistoryEmpty: 'Nothing searched yet: search once and it stays here.',
    searchHistoryClear: 'Clear',
    searchLike: 'For you',
    searchLikeHint: 'Playlists picked for your taste',
    artist: 'Artist',
    artistHint: 'Popular songs',
    artistFailed: 'This artist’s page didn’t come',
    artistEmpty: 'No songs read for this artist',
    artistEmptyHint: 'NetEase’s page didn’t read this artist’s songs. Try again in a moment.',
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
  }
}
