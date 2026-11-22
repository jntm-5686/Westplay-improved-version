/**
 * The Bilibili app's own words, in the cabin's language: Chinese for Chinese, English for the rest (until they join
 * the cab's translations in state/strings). Kept apart from the hook that reads the cabin's language, so the words can
 * be had without a page (the tests and the store's toasts). The rail's five names are the app's own; everything the app
 * shows of Bilibili itself (titles, UP主 names, banners, live rooms, the account) comes from the host's page.
 */
export interface BilibiliWords {
  brand: string
  /** The rail's tabs, in its own order. */
  tabs: { home: string; bangumi: string; cinema: string; live: string; mine: string }
  back: string
  close: string
  searchHint: string
  clear: string

  /** The account, on 我的 and in the player. */
  account: {
    /** Who it is, and that it's nobody yet. */
    signedIn: string
    signedOut: string
    signingIn: string
    unknown: string
    signIn: string
    signOut: string
    /** Signed out: where signing in happens (the companion's account page, by QR code). */
    signInTitle: string
    signInHint: string
    signInFoot: string
    /** Signed out, what the account's own pages need a sign-in for. */
    needed: string
  }
  /** A plain browser, no host: what's on screen is made up. */
  preview: string
  /** The app's own version line (我的's foot), as NetEase's settings page has one. */
  aboutApp: string

  /** What every page says while it waits, when nothing came, and the way to ask again. */
  loading: string
  retry: string
  failed: string
  failedHint: string
  empty: string
  emptyHint: string

  /** Home */
  home: {
    categories: { recommended: string; bangumi: string; cinema: string; live: string; hot: string; following: string }
    banner: string
    /** The banner's button. */
    watch: string
    sections: { recommended: string; hot: string; live: string; bangumi: string; cinema: string }
    all: string
    /** A video card's words. */
    views: (count: number) => string
    danmaku: (count: number) => string
    /** A card's build: "1.2万播放 · 320弹幕". */
    stats: (views: string, danmaku: string) => string
    /** A live card: on air, offline, and how many watch. */
    liveNow: string
    liveOff: string
    online: (count: number) => string
    /** A season's card: "更新至第 12 话", "全 24 话", and its episodes' count. */
    updateTo: (episode: string) => string
    episodes: (count: number) => string
    rating: (score: number) => string
    /** The bar at the foot, nothing playing yet. */
    nothingPlaying: string
    nothingPlayingHint: string
    /** The feed's own buttons and its foot: refresh, more coming, and nothing more. */
    refresh: string
    loadingMore: string
    noMore: string
  }

  /** Search */
  search: {
    title: string
    forQuery: (query: string) => string
    history: string
    historyHint: string
    historyEmpty: string
    clear: string
    idle: string
    idleHint: string
    searching: string
    empty: string
    emptyHint: string
    failed: string
    /** The result filters, each with how many it found. */
    filters: { video: string; bangumi: string; user: string }
    found: (videos: number, seasons: number, users: number) => string
    /** A UP主's row. */
    fans: (count: number) => string
  }

  /** 番剧 and 影视 */
  bangumi: {
    /** The lists' heads. */
    anime: string
    cinema: string
    animeHint: string
    cinemaHint: string
    /** A season's page. */
    playAll: string
    play: string
    trailers: string
    description: string
    episodes: string
    episodesHint: string
    episode: (number: number) => string
    /** A film (one episode). */
    film: string
    followers: (count: number) => string
    rating: (score: number) => string
    /** "更新至第 12 话" as a season's head says it. */
    updateTo: (episode: string) => string
    empty: string
    emptyHint: string
  }

  /** 直播 */
  live: {
    title: string
    hint: string
    liveNow: string
    offline: string
    online: (count: number) => string
    area: string
    /** The room's page. */
    room: string
    enter: string
    playing: string
    empty: string
    emptyHint: string
  }

  /** 我的 and its pages. */
  mine: {
    title: string
    history: string
    historyHint: string
    favorites: string
    favoritesHint: string
    dynamic: string
    dynamicHint: string
    space: string
    spaceHint: string
    /** 我的粉丝 and 我关注的人, with their counts. */
    followers: string
    followersHint: string
    following: string
    followingHint: string
    /** "近期观看" on 我的. */
    recent: string
    /** The dashboard's cards for a signed-out account. */
    signInFirst: string
  }
  /** 我的粉丝 / 我关注的人's own page. */
  relations: {
    followers: string
    following: string
    hint: string
    empty: string
    emptyHint: string
    failed: string
    noMore: string
  }
  /** A video's own page (the description it opens on, before the player). */
  videoDetail: {
    play: string
    /** The numbers under its title. */
    views: (count: number) => string
    likes: (count: number) => string
    coins: (count: number) => string
    favorites: (count: number) => string
    description: string
    noDescription: string
    loading: string
    failed: string
    /** Its actions' names (its receipts are the player's). */
    like: string
    liked: string
    coin: string
    favorite: string
    favorited: string
    /** The UP主's line: "UP主" and the way to their page. */
    by: string
  }
  /** The app's own settings page. */
  settings: {
    title: string
    hint: string
    /** 外观: the three choices, each with what it means. */
    appearance: string
    themes: { auto: string; dark: string; light: string }
    themeHints: { auto: string; dark: string; light: string }
    /** "当前主题：跟随系统". */
    current: (theme: string) => string
    /** 关于: the app's line. */
    about: string
    /** 账号: the way out. */
    account: string
  }
  history: {
    title: string
    hint: string
    empty: string
    emptyHint: string
    failed: string
    /** When it was watched, and how far in ("看到 12:34"). */
    watchedAt: (at: string) => string
    watchedTo: (position: string) => string
  }
  favorites: {
    title: string
    hint: string
    folders: string
    videos: string
    count: (count: number) => string
    empty: string
    emptyHint: string
    failed: string
    /** A folder picked, its videos still coming. */
    folderEmpty: string
  }
  dynamic: {
    title: string
    hint: string
    empty: string
    emptyHint: string
    failed: string
  }
  space: {
    title: string
    videos: string
    fans: (count: number) => string
    following: (count: number) => string
    sign: string
    empty: string
    emptyHint: string
    failed: string
    follow: string
  }

  /** The player (影院沉浸式). */
  player: {
    /** The way back, and what it shows. */
    collapse: string
    nowPlaying: string
    live: string
    /** The title's, the UP主's and the statistics' words. */
    views: (count: number) => string
    /** The controls. */
    play: string
    pause: string
    volume: string
    mute: string
    unmute: string
    quality: string
    fullscreen: string
    exitFullscreen: string
    /** Its speed (倍速). */
    rate: string
    episodes: string
    /** The menus' close and their chosen mark. */
    menu: string
    /** The actions under the title. */
    like: string
    liked: string
    coin: string
    coins: (count: number) => string
    favorite: string
    favorited: string
    /** The player's toasts. */
    likedToast: string
    unlikedToast: string
    likeFailed: string
    coinToast: (count: number) => string
    coinFailed: string
    favoriteToast: string
    unfavoriteToast: string
    favoriteFailed: string
    signInNeeded: string
    noVideo: string
    noVideoHint: string
    /** An episode's name in the player's 选集. */
    episode: (number: number) => string
    /** The quality's and the rate's own words. */
    auto: string
    normal: string
    /** While a live stream is on. */
    liveHint: string
    /** The volume's and the progress's labels for a screen reader. */
    progress: string
    /** "12:34 / 45:00". */
    time: (at: string, total: string) => string
  }
}

function compact(count: number, locale: string, zh: boolean): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: zh ? 0 : 1,
    minimumFractionDigits: 0,
  }).format(count)
}

/** The app's words in the cabin's language `locale` (`zh-CN` and its variants: Chinese; else English). */
export function bilibiliWords(locale: string): BilibiliWords {
  const zh = locale.toLocaleLowerCase().startsWith('zh')
  const plays = (count: number) =>
    zh ? `${compact(count, locale, true)}播放` : `${compact(count, locale, false)} views`
  const danmaku = (count: number) =>
    zh ? `${compact(count, locale, true)}弹幕` : `${compact(count, locale, false)} comments`
  const fans = (count: number) =>
    zh ? `${compact(count, locale, true)}粉丝` : `${compact(count, locale, false)} followers`
  const online = (count: number) =>
    zh ? `${compact(count, locale, true)}人气` : `${compact(count, locale, false)} watching`
  const episodes = (count: number) => (zh ? `全 ${count} 话` : `${count} episodes`)
  const rating = (score: number) => (zh ? `${score.toFixed(1)} 分` : `${score.toFixed(1)}/10`)
  const episode = (number: number) => (zh ? `第 ${number} 话` : `Episode ${number}`)
  const updateTo = (name: string) => (zh ? `更新至${name}` : `New: ${name}`)
  if (zh) {
    return {
      brand: '哔哩哔哩',
      tabs: { home: '首页', bangumi: '番剧', cinema: '影视', live: '直播', mine: '我的' },
      back: '返回',
      close: '关闭',
      searchHint: '搜索视频、番剧或 UP 主',
      clear: '清除',
      account: {
        signedIn: '已登录',
        signedOut: '未登录',
        signingIn: '等待扫码…',
        unknown: '检查账号中…',
        signIn: '在伴生程序扫码登录',
        signOut: '退出登录',
        signInTitle: '登录 B 站账号',
        signInHint: '请在伴生程序的「账号」页扫描二维码登录 B 站；登录后车机自动刷新。',
        signInFoot: '登录后可看自己的历史、收藏夹、关注动态与 UP 主主页。',
        needed: '此页面需要先登录 B 站账号。',
      },
      preview: '浏览器预览：以下为演示数据，非真实 B 站内容',
      aboutApp: '哔哩哔哩车机版 V1 · WestPlay',
      loading: '正在读取…',
      retry: '重试',
      failed: '没能读出来',
      failedHint: 'B 站页面没有回应。稍后再试一次。',
      empty: '这里什么都没有',
      emptyHint: '换个页面看看。',
      home: {
        categories: {
          recommended: '推荐',
          bangumi: '番剧',
          cinema: '影视',
          live: '直播',
          hot: '热门',
          following: '追番',
        },
        banner: '追番更新',
        watch: '立即观看',
        sections: {
          recommended: '推荐视频',
          hot: '热门视频',
          live: '正在直播',
          bangumi: '番剧更新',
          cinema: '影视上新',
        },
        all: '查看全部',
        views: plays,
        danmaku,
        stats: (views, comments) => `${views} · ${comments}`,
        liveNow: '直播中',
        liveOff: '未开播',
        online,
        updateTo,
        episodes,
        rating,
        nothingPlaying: '还没有正在看的视频',
        nothingPlayingHint: '在首页或搜索结果里点开一个视频，它就会出现在这里。',
        refresh: '刷新',
        loadingMore: '正在加载…',
        noMore: '没有更多了',
      },
      search: {
        title: '搜索',
        forQuery: (query) => `“${query}” 的搜索结果`,
        history: '搜索历史',
        historyHint: '最近 3 条',
        historyEmpty: '还没有搜索记录',
        clear: '清空',
        idle: '搜点什么',
        idleHint: '在上方搜索框输入视频、番剧或 UP 主名字。',
        searching: '正在搜索…',
        empty: '没有找到',
        emptyHint: '换个关键词试试。',
        failed: '搜索没有回应',
        filters: { video: '视频', bangumi: '番剧/影视', user: 'UP 主' },
        found: (videos, seasons, users) => `找到 ${videos} 个视频、${seasons} 部番剧、${users} 位 UP 主`,
        fans,
      },
      bangumi: {
        anime: '番剧',
        cinema: '影视',
        animeHint: '连载中的动画与续作',
        cinemaHint: '电影、剧集与纪录片',
        playAll: '播放全部',
        play: '播放',
        trailers: '预告',
        description: '简介',
        episodes: '选集',
        episodesHint: '点一集开始看',
        episode,
        film: '正片',
        followers: (count) =>
          zh ? `${compact(count, locale, true)}人追番` : `${compact(count, locale, false)} followers`,
        rating,
        updateTo,
        empty: '还没有番剧',
        emptyHint: 'B 站没有给出这个列表。稍后再试一次。',
      },
      live: {
        title: '直播',
        hint: 'B 站正在直播的直播间',
        liveNow: '直播中',
        offline: '未开播',
        online,
        area: '分区',
        room: '直播间',
        enter: '进入直播间',
        playing: '直播画面',
        empty: '没有正在直播的',
        emptyHint: '稍后再来看看。',
      },
      mine: {
        title: '我的',
        history: '历史记录',
        historyHint: '最近看过的视频',
        favorites: '收藏夹',
        favoritesHint: '收藏的视频与文件夹',
        dynamic: '关注动态',
        dynamicHint: '关注的 UP 主更新',
        space: '我的主页',
        spaceHint: '投稿的视频与资料',
        followers: '我的粉丝',
        followersHint: '关注我的人',
        following: '我关注的人',
        followingHint: '我关注的 UP 主',
        recent: '最近观看',
        signInFirst: '登录后查看',
      },
      relations: {
        followers: '我的粉丝',
        following: '我关注的人',
        hint: '点一个人，进他的主页',
        empty: '这里还没有人',
        emptyHint: '登录 B 站后，关注关系会出现在这里。',
        failed: '没有读出来',
        noMore: '没有更多了',
      },
      videoDetail: {
        play: '播放',
        views: (count) => (zh ? `${compact(count, locale, true)}播放` : `${compact(count, locale, false)} views`),
        likes: (count) => (zh ? `${compact(count, locale, true)}点赞` : `${compact(count, locale, false)} likes`),
        coins: (count) => (zh ? `${compact(count, locale, true)}投币` : `${compact(count, locale, false)} coins`),
        favorites: (count) => (zh ? `${compact(count, locale, true)}收藏` : `${compact(count, locale, false)} saves`),
        description: '简介',
        noDescription: '这个视频还没有简介。',
        loading: '正在读取视频…',
        failed: '视频信息没有读出来',
        like: '点赞',
        liked: '已点赞',
        coin: '投币',
        favorite: '收藏',
        favorited: '已收藏',
        by: 'UP 主',
      },
      settings: {
        title: '设置',
        hint: '哔哩哔哩车机版的外观与账号',
        appearance: '外观',
        themes: { auto: '跟随系统', dark: '深色', light: '浅色' },
        themeHints: {
          auto: '随车机的浅色/深色自动切换',
          dark: '这个 App 始终用深色',
          light: '这个 App 始终用浅色',
        },
        current: (theme) => `当前主题：${theme}`,
        about: '关于',
        account: '账号',
      },
      history: {
        title: '历史记录',
        hint: '点一条接着看',
        empty: '还没有观看记录',
        emptyHint: '看过的视频会出现在这里。',
        failed: '历史记录没有读出来',
        watchedAt: (at) => `看过 · ${at}`,
        watchedTo: (position) => `看到 ${position}`,
      },
      favorites: {
        title: '收藏夹',
        hint: '收藏的视频都在这里',
        folders: '收藏夹',
        videos: '视频',
        count: (count) => `${count} 个视频`,
        empty: '收藏夹是空的',
        emptyHint: '在 B 站收藏的视频会出现在这里。',
        failed: '收藏夹没有读出来',
        folderEmpty: '这个收藏夹还没有视频',
      },
      dynamic: {
        title: '关注动态',
        hint: '关注的 UP 主最近的更新',
        empty: '还没有关注动态',
        emptyHint: '在 B 站关注 UP 主后，他们的更新会出现在这里。',
        failed: '关注动态没有读出来',
      },
      space: {
        title: 'UP 主主页',
        videos: '投稿视频',
        fans,
        following: (count) => (zh ? `关注 ${count}` : `following ${count}`),
        sign: '签名',
        empty: '还没有投稿',
        emptyHint: '这位 UP 主还没有视频。',
        failed: 'UP 主主页没有读出来',
        follow: '关注',
      },
      player: {
        collapse: '收起播放页',
        nowPlaying: '正在播放',
        live: '直播中',
        views: plays,
        play: '播放',
        pause: '暂停',
        volume: '音量',
        mute: '静音',
        unmute: '取消静音',
        quality: '画质',
        fullscreen: '全屏',
        exitFullscreen: '退出全屏',
        rate: '倍速',
        episodes: '选集',
        menu: '选项',
        like: '点赞',
        liked: '已点赞',
        coin: '投币',
        coins: (count) => `${count} 枚硬币`,
        favorite: '收藏',
        favorited: '已收藏',
        likedToast: '已点赞',
        unlikedToast: '已取消点赞',
        likeFailed: '点赞没有成功，稍后再试',
        coinToast: (count) => `已投 ${count} 枚硬币`,
        coinFailed: '投币没有成功，稍后再试',
        favoriteToast: '已收藏',
        unfavoriteToast: '已取消收藏',
        favoriteFailed: '收藏没有成功，稍后再试',
        signInNeeded: '请先在伴生程序登录 B 站账号',
        noVideo: '没有正在播放的视频',
        noVideoHint: '在首页、搜索或番剧页点开一个视频。',
        episode,
        auto: '自动',
        normal: '1.0×',
        liveHint: '直播不能快进或倍速',
        progress: '播放进度',
        time: (at, total) => `${at} / ${total}`,
      },
    }
  }
  return {
    brand: 'Bilibili',
    tabs: { home: 'Home', bangumi: 'Anime', cinema: 'Films', live: 'Live', mine: 'Me' },
    back: 'Back',
    close: 'Close',
    searchHint: 'Search videos, series or creators',
    clear: 'Clear',
    account: {
      signedIn: 'Signed in',
      signedOut: 'Signed out',
      signingIn: 'Waiting for the QR code…',
      unknown: 'Checking the account…',
      signIn: 'Sign in on the companion',
      signOut: 'Sign out',
      signInTitle: 'Sign in to Bilibili',
      signInHint: 'Scan the QR code on the companion’s Accounts page to sign in. The cab updates itself after.',
      signInFoot: 'Signed in, this screen shows your history, favorites, feed and creator pages.',
      needed: 'Sign in to Bilibili to see this page.',
    },
    preview: 'Browser preview: made-up demo data, not real Bilibili content',
    aboutApp: 'Bilibili in the cab · V1 · WestPlay',
    loading: 'Loading…',
    retry: 'Try again',
    failed: 'Nothing came back',
    failedHint: 'Bilibili’s page didn’t answer. Try again in a moment.',
    empty: 'Nothing here',
    emptyHint: 'Try another page.',
    home: {
      categories: {
        recommended: 'Recommended',
        bangumi: 'Anime',
        cinema: 'Films',
        live: 'Live',
        hot: 'Trending',
        following: 'Following',
      },
      banner: 'New episode',
      watch: 'Watch now',
      sections: {
        recommended: 'Recommended',
        hot: 'Trending',
        live: 'Live now',
        bangumi: 'New anime',
        cinema: 'New films',
      },
      all: 'See all',
      views: plays,
      danmaku,
      stats: (views, comments) => `${views} · ${comments}`,
      liveNow: 'Live',
      liveOff: 'Offline',
      online,
      updateTo,
      episodes,
      rating,
      nothingPlaying: 'Nothing to watch yet',
      nothingPlayingHint: 'Open a video from Home or a search and it stays here.',
      refresh: 'Refresh',
      loadingMore: 'Loading…',
      noMore: 'No more',
    },
    search: {
      title: 'Search',
      forQuery: (query) => `Results for “${query}”`,
      history: 'Recent searches',
      historyHint: 'The last three',
      historyEmpty: 'Nothing searched yet',
      clear: 'Clear',
      idle: 'Search Bilibili',
      idleHint: 'Type a video, a series or a creator in the search box above.',
      searching: 'Searching…',
      empty: 'Nothing found',
      emptyHint: 'Try another word.',
      failed: 'The search didn’t answer',
      filters: { video: 'Videos', bangumi: 'Anime & films', user: 'Creators' },
      found: (videos, seasons, users) => `${videos} videos, ${seasons} series and ${users} creators`,
      fans,
    },
    bangumi: {
      anime: 'Anime',
      cinema: 'Films',
      animeHint: 'Ongoing series and new seasons',
      cinemaHint: 'Films, series and documentaries',
      playAll: 'Play all',
      play: 'Play',
      trailers: 'Trailers',
      description: 'About',
      episodes: 'Episodes',
      episodesHint: 'Pick one to start',
      episode,
      film: 'Feature',
      followers: fans,
      rating,
      updateTo,
      empty: 'No series yet',
      emptyHint: 'Bilibili didn’t give this list. Try again in a moment.',
    },
    live: {
      title: 'Live',
      hint: 'Bilibili live rooms on air',
      liveNow: 'Live',
      offline: 'Offline',
      online,
      area: 'Category',
      room: 'Live room',
      enter: 'Enter the room',
      playing: 'Live picture',
      empty: 'Nothing on air',
      emptyHint: 'Come back in a moment.',
    },
    mine: {
      title: 'Me',
      history: 'History',
      historyHint: 'What you watched lately',
      favorites: 'Favorites',
      favoritesHint: 'Saved videos and folders',
      dynamic: 'Feed',
      dynamicHint: 'New from creators you follow',
      space: 'My page',
      spaceHint: 'Your videos and profile',
      followers: 'My followers',
      followersHint: 'People who follow you',
      following: 'Following',
      followingHint: 'Creators you follow',
      recent: 'Recently watched',
      signInFirst: 'Sign in to see this',
    },
    relations: {
      followers: 'My followers',
      following: 'Following',
      hint: 'Pick a person to open their page',
      empty: 'No one here yet',
      emptyHint: 'Sign in to Bilibili and your relations show up here.',
      failed: 'That didn’t come back',
      noMore: 'No more',
    },
    videoDetail: {
      play: 'Play',
      views: (count) => `${compact(count, locale, false)} views`,
      likes: (count) => `${compact(count, locale, false)} likes`,
      coins: (count) => `${compact(count, locale, false)} coins`,
      favorites: (count) => `${compact(count, locale, false)} saves`,
      description: 'About',
      noDescription: 'This video has no description.',
      loading: 'Loading the video…',
      failed: 'The video didn’t come back',
      like: 'Like',
      liked: 'Liked',
      coin: 'Coin',
      favorite: 'Save',
      favorited: 'Saved',
      by: 'Creator',
    },
    settings: {
      title: 'Settings',
      hint: 'Bilibili in the cab: its look and its account',
      appearance: 'Appearance',
      themes: { auto: 'Follow the system', dark: 'Dark', light: 'Light' },
      themeHints: {
        auto: 'Follows the cab’s light or dark appearance',
        dark: 'This app stays dark',
        light: 'This app stays light',
      },
      current: (theme) => `Now showing: ${theme}`,
      about: 'About',
      account: 'Account',
    },
    history: {
      title: 'History',
      hint: 'Pick one to carry on',
      empty: 'Nothing watched yet',
      emptyHint: 'Videos you watch show up here.',
      failed: 'The history didn’t come back',
      watchedAt: (at) => `Watched · ${at}`,
      watchedTo: (position) => `At ${position}`,
    },
    favorites: {
      title: 'Favorites',
      hint: 'Everything you saved',
      folders: 'Folders',
      videos: 'Videos',
      count: (count) => `${count} videos`,
      empty: 'No favorites yet',
      emptyHint: 'Videos you save on Bilibili show up here.',
      failed: 'The favorites didn’t come back',
      folderEmpty: 'This folder has no videos yet',
    },
    dynamic: {
      title: 'Feed',
      hint: 'What the creators you follow posted',
      empty: 'No posts yet',
      emptyHint: 'Posts from creators you follow show up here.',
      failed: 'The feed didn’t come back',
    },
    space: {
      title: 'Creator',
      videos: 'Videos',
      fans,
      following: (count) => `following ${count}`,
      sign: 'Bio',
      empty: 'No videos yet',
      emptyHint: 'This creator hasn’t posted anything.',
      failed: 'The creator’s page didn’t come back',
      follow: 'Follow',
    },
    player: {
      collapse: 'Close the player',
      nowPlaying: 'Now playing',
      live: 'Live',
      views: plays,
      play: 'Play',
      pause: 'Pause',
      volume: 'Volume',
      mute: 'Mute',
      unmute: 'Unmute',
      quality: 'Quality',
      fullscreen: 'Full screen',
      exitFullscreen: 'Exit full screen',
      rate: 'Playback speed',
      episodes: 'Episodes',
      menu: 'Options',
      like: 'Like',
      liked: 'Liked',
      coin: 'Coin',
      coins: (count) => `${count} coins`,
      favorite: 'Save',
      favorited: 'Saved',
      likedToast: 'Liked',
      unlikedToast: 'Like removed',
      likeFailed: 'The like didn’t go through. Try again in a moment.',
      coinToast: (count) => `Put in ${count} coin${count === 1 ? '' : 's'}`,
      coinFailed: 'The coin didn’t go through. Try again in a moment.',
      favoriteToast: 'Saved to favorites',
      unfavoriteToast: 'Removed from favorites',
      favoriteFailed: 'The save didn’t go through. Try again in a moment.',
      signInNeeded: 'Sign in to Bilibili on the companion first',
      noVideo: 'Nothing playing',
      noVideoHint: 'Open a video from Home, a search or a series.',
      episode,
      auto: 'Auto',
      normal: '1.0×',
      liveHint: 'Live streams can’t be scrubbed or sped up',
      progress: 'Playback progress',
      time: (at, total) => `${at} / ${total}`,
    },
  }
}
