# 网易云音乐 v3 协议（后端 ↔ UI 交接文档）

> 归属：`crates/host/src/netease.js`、`crates/host/src/netease.rs`、`crates/host/src/lib.rs`（网易云段）、
> `ui/src/cabin/apps/netease/netease.ts`、`ui/src/cabin/apps/netease/preview.ts`、本文件。
> UI 文件（pages.tsx / NeteaseApp.tsx / NowPlaying.tsx / parts.tsx / words.ts / glyphs.tsx / netease.css）不在此文档的修改范围。
>
> 本文档写于 r13 重构（v3）。所有数据接口都在本机已登录的真实隐藏页上用 CDP 实测过（`Runtime.evaluate` + 同源
> `fetch`），实测证据见「§7 接口实测记录」。播放链路同样是本机实测（§8）。

---

## 1. 结构

- 隐藏 WebView2 加载 `https://music.163.com/`（shell），内容在同源 iframe `#g_iframe`。
- 注入 `cab_sound.js` + `netease.js`（`Netease::start` 的 startup script）。
- **数据一律走同源 `fetch('/api/…')`（页面自己的 cookie / 登录态）拿 JSON**；v3 起**不再导航内容 frame 读 DOM**
  （导航会重建播放器、丢队列，实测这是"放三首就断"的根因）。唯一读 DOM 的地方是 shell 的播放条（当前曲目/时间/按钮），
  以及内容 frame 里"当前歌所在行"（仅在补救第 2 级用，不导航）。
- 页面 → host：`chrome.webview.postMessage({kind…})` 由 `netease.rs` 的 `read_message` 解析；host → 播放器页：
  `post_json(command)`。
- host → cabin 页：`{"type":"netease","kind":…}` 明文 JSON；cabin → host：`{"type":"netease","kind":"command","command":{…}}`。
- cabin 页的类型与解析在 `ui/src/cabin/apps/netease/netease.ts`；纯浏览器预览在 `preview.ts`。

---

## 2. 命令：cabin 页 → host

```json
{ "type": "netease", "kind": "command", "command": { "action": "…", "value": … } }
```

| action | value | 含义 | 回哪种 kind |
|---|---|---|---|
| `start` | — | 启动隐藏页（app 打开时） | `state` |
| `signIn` | — | 打开网易云扫码登录窗（companion 的窗口） | `state`(signingIn) |
| `signOut` | — | 清 cookie 重新加载 | `state` |
| `play` | 省略 | 继续播放（页面自称暂停时才按播放键；带恢复阶梯） | `state` |
| `play` | 歌曲 id（数字）；可选 `list` | 播这首歌：`list` 是它所属的列表（歌单/榜单 id、`daily`、`recent`、`search`、`artist:<id>`，即页面自己已读到的那个列表）时用**页面自己的队列**（`player.addTo`）播放，几乎无缝；`list` 缺省或未知时用页面自己的播放器 `nm.x.ceo2i('play',18,id)`。两种都有观察与补救阶梯 | `state` |
| `pause` | — | 暂停（页面自称在播时才按） | `state` |
| `next` / `prev` | — | 页面播放条的下一首/上一首（同样带阶梯） | `state` |
| `seek` | 秒（float） | 拖页面进度条 | `state` |
| `volume` | 0–1（float） | 页面 audio 元素音量（跨曲保持） | `state` |
| `setLike` | 歌曲 id；另有 `liked: bool` | 加入/移出「我喜欢的音乐」（`/api/playlist/manipulate/tracks` + csrf） | `like` |
| `openPlaylist` | 歌单 id | 同源接口读歌单详情+歌曲 | `playlist` |
| `openRanking` | 榜单 id（就是歌单 id） | 同源接口读榜单详情+歌曲 | `playlist`（`id` 为榜单 id） |
| `openArtist` | 艺人 id | 艺人详情+歌曲 | `artist` |
| `home` | — | 首页（私人雷达/每日推荐/个性化/推荐歌单） | `home`（先卡片后 daily） |
| `library` | — | 我的歌单（创建/收藏） | `library` |
| `search` | 关键词 ≤60 字 | 搜索（单曲/歌手/歌单） | `search` |
| `recent` | — | 最近播放（听歌排行本周） | `recent` |
| `rankings` | — | 网易云官方榜单列表 | `rankings` |
| `profile` | — | 当前登录账号资料 | `profile` |
| `refresh` | — | 重读 state 与推荐列表 | `state` |

- host 只放行合法 id（`is_id`：1–20 位数字；`openPlaylist` 的 `daily` 是特例）、`seek/volume` 必须是有限数、
  `search` 非空且 ≤60 字；不合法的命令直接丢弃（不下发给页面）。
- 旧（v1/v2）命令名全部保留，语义不变。

---

## 3. 消息：host → cabin 页

统一信封 `{"type":"netease","kind":…}`。除 `timing`（只进 host 日志）外都会转发给 cabin 页。

### 3.1 `state`（约每秒推一次；变化即推；页面上事件时立即推）

```json
{
  "type": "netease", "kind": "state",
  "state": {
    "signedIn": true,
    "signingIn": false,
    "playing": true,
    "mode": "list",
    "volume": 0.8,
    "track": {
      "id": "168091", "title": "蓝莲花", "artist": "许巍", "album": "时光.漫步",
      "cover": "https://p2.music.126.net/xxx.jpg?param=300y300",
      "duration": 271, "position": 63, "playable": true
    },
    "liked": true,
    "lists": [ { "id": "3136952023", "name": "私人雷达", "cover": "https://…", "playCount": 0 } ],
    "account": { "name": "dReLuNEstella", "avatar": "https://p1.music.126.net/…?param=140y140" },
    "audio": { "elements": 1, "playing": true, "paused": false, "at": 63 }
  }
}
```

- `state` 整体可能为 `null`（网易云没在跑）。`signedIn` 为 `null` 时页面还不知道（不推送）。
- `mode`：播放条自己的模式，`list`（列表循环）/ `shuffle`（随机）/ `one`（单曲循环）；播放条上没有模式按钮时为
  `null`（v1/v2 字段只增不改，旧页面不推它）。**r10.3 的 UI 漏读了它**：按钮切了页面、状态却没有回到 UI，看起来
  "点不动"；r10.4 修（`readPlayer` 读 `mode`，UI 本地先乐观切换、再由页面的状态确认）。
- `track.id` 永远是字符串（数字 id 也序列化成字符串）。
- `album` 由同源接口补（播放条本身没有专辑名）：页面从已知歌曲缓存/`/api/v3/song/detail` 取。
- `liked`：当前曲是否在「我喜欢的音乐」里（`null`：未登录/尚未读到）。
- `lists`：v1 兼容字段（推荐歌单，供旧 UI 兜底）。
- `audio`：诊断字段（声元数量/是否在播/暂停/秒数），供 host 日志与"静默在播"检测。

### 3.2 `playlist`（`openPlaylist` / `openRanking` 的回答）

```json
{
  "type": "netease", "kind": "playlist",
  "id": "3778678",
  "name": "热歌榜",
  "cover": "https://p1.music.126.net/…jpg",
  "playCount": 14253657088,
  "trackCount": 200,
  "updateFrequency": "每天更新",
  "creator": "",
  "description": "",
  "songs": [
    { "id": "3460493895", "title": "冬天又来临", "artist": "罗言", "album": "冬天又来临", "duration": 200, "playable": true }
  ]
}
```

- `cover/playCount/trackCount/updateFrequency/creator/description` 是 v3 新增可选字段：为空时**不出现**（旧 UI 不受影响）。
- `songs` 上限 500 首（host 侧 `Songs::MOST`），按歌单原始顺序；每首保证有数字 id、非空标题。
- 榜单详情也走这个 kind（`id` 就是榜单 id），UI 可直接放 `playlists[rankingId]`。
- `duration` 秒（整数，四舍五入）；`playable` 依据账号自身版权（`st >= 0`，无 `st` 时按 `fee < 4` 判断，`noCopyrightRcmd` 为不可播）。

### 3.3 `home`

```json
{
  "type": "netease", "kind": "home",
  "daily": { "songs": [ { "id": "3409943113", "title": "Less than a Lover", "artist": "Dia", "album": "…", "duration": 146, "playable": true } ] },
  "radar": { "id": "3136952023", "name": "私人雷达", "cover": "https://…", "playCount": 0 },
  "personal": [ { "id": "14060074166", "name": "霸道总裁夜晚飙车进行曲", "cover": "https://…", "playCount": 704 } ],
  "recommended": [ { "id": "8501280190", "name": "国产说唱 | 你的中文说唱旋律精选", "cover": "https://…", "playCount": 331046112 } ]
}
```

- 分两条发：先发 `daily: null`（卡片立刻可画），再发 `daily: { songs }`（当天个性化推荐 33 首，实时）。
- `radar`：`/api/v1/discovery/recommend/resource` 里 id=3136952023 的私人雷达卡片（名字用接口的"私人雷达"）。
- `personal`：同一接口里其余个性化歌单（≤12）。
- `recommended`：`/api/personalized/playlist`（≤12，实时）。

### 3.4 `library`

```json
{
  "type": "netease", "kind": "library",
  "groups": [
    { "title": "创建的歌单", "count": 5,
      "playlists": [ { "id": "2772893759", "name": "dReLuNEstella喜欢的音乐", "cover": "https://…", "playCount": 10292, "songCount": 2747, "by": "" } ] },
    { "title": "收藏的歌单", "count": 19,
      "playlists": [ { "id": "14049111724", "name": "欧美优质hiphop…", "cover": "https://…", "playCount": 488559, "songCount": 129, "by": "微雨染尘埃" } ] }
  ]
}
```

- 分组由 `creator.userId === 自己 uid` 判定（创建/收藏）；`by` 是收藏歌单的作者昵称。
- 含「我喜欢的音乐」（specialType 5），UI 可当普通歌单打开。

### 3.5 `search`

```json
{
  "type": "netease", "kind": "search",
  "query": "许巍",
  "songs": [ { "id": "168141", "title": "故乡", "artist": "许巍", "album": "那一年", "duration": 314, "playable": true } ],
  "artists": [ { "id": "5770", "name": "许巍", "cover": "https://p1.music.126.net/…jpg" } ],
  "playlists": [ { "id": "8866695219", "name": "听·许巍热门精选|蓝莲花", "cover": "https://…", "playCount": 3557871 } ],
  "songsTotal": 296, "artistsTotal": 14, "playlistsTotal": 285
}
```

- 三个分类并发请求（`type=1|100|1000`），只答最后一次搜索（旧答案丢弃）。
- 歌曲版权用 `/api/v3/song/detail` 批量补（搜索接口本身没有 `st`）。

### 3.6 `artist`

```json
{
  "type": "netease", "kind": "artist",
  "id": "5770", "name": "许巍", "alias": "",
  "cover": "https://p1.music.126.net/…jpg",
  "description": "内地摇滚音乐界的重要人物。…",
  "songs": [ { "id": "168091", "title": "蓝莲花", "artist": "许巍", "album": "时光.漫步", "duration": 271, "playable": true } ]
}
```

- 头部来自 `/api/v1/artist/{id}`（`name/alias/picUrl/briefDesc`），歌曲来自 `/api/v1/artist/songs?id=&limit=50&offset=0`
  （实测必须带 `offset`，否则 400 参数错误）；该接口为空时退回 `/api/v1/artist/{id}` 的 `hotSongs`。
- `alias` 用 `" / "` 连接（有别名时）。
- `description` 是 v3 新增可选字段（空则 `""`）。

### 3.7 `recent`

```json
{
  "type": "netease", "kind": "recent",
  "songs": [ { "id": "21568449", "title": "Listen To Your Heart", "artist": "Roxette", "album": "Look Sharp!", "duration": 328, "playable": true, "playCount": 3 } ]
}
```

- 网易云网页版没有「最近播放」页，接口 `/api/v1/play/record?type=1&uid=` 给的是「听歌排行（本周）」：取 `weekData`（实测 67 条），
  按原始顺序（播放次数降序）。`playCount` 是 v3 新增可选字段（本周播放次数），为 0 时不出现。
- 未登录返回空数组。

### 3.8 `rankings`（v3 新增）

```json
{
  "type": "netease", "kind": "rankings",
  "rankings": [
    { "id": "19723756", "name": "飙升榜", "cover": "https://p2.music.126.net/…jpg", "updateFrequency": "刚刚更新",
      "trackCount": 100, "playCount": 6529254400, "official": true },
    { "id": "71384707", "name": "网易云古典榜", "cover": "https://…", "updateFrequency": "刚刚更新",
      "trackCount": 100, "playCount": 76434272, "official": false }
  ]
}
```

- 来自 `/api/toplist`（实测 65 个榜单，含 `updateFrequency`）；`official = ToplistType != null`（飙升/新歌/原创/热歌及其合作榜）。
- 顺序即接口顺序（官方榜在前）。
- UI 打开某个榜用命令 `openRanking{value:id}`，回答是 `playlist` kind（见 3.2），`id` 相同。

### 3.9 `profile`（v3 新增）

```json
{
  "type": "netease", "kind": "profile",
  "profile": {
    "uid": "1835963976", "name": "dReLuNEstella",
    "avatar": "https://p1.music.126.net/…jpg?param=140y140",
    "signature": "皮粥",
    "level": 8, "listenSongs": 6682, "follows": 46, "fans": 7,
    "playlistCount": 5, "createDays": 2764, "vipType": 11,
    "background": "https://p1.music.126.net/…jpg"
  }
}
```

- `/api/v1/user/detail/{uid}`（**路径参数形式**；`?uid=` 查询形式实测 404）+ `/api/user/level?uid=`。
- `fans` = 接口的 `followeds`；`level` 取 user detail 的 `level`（与 `/api/user/level.data.level` 一致）。
- `uid` 是**字符串**。

### 3.10 `like`

```json
{ "type": "netease", "kind": "like", "id": "168091", "liked": true, "ok": true, "reason": "" }
```

- `ok=false` 时 `reason` 是页面的话：`account`（未登录/找不到喜欢的歌单）、`csrf`（拿不到 csrf）、`http`、或接口的 code/message。
- 写成功后**回读**「我喜欢的音乐」的 trackIds 确认，才 `ok=true`。

### 3.11 `lyric`（r10.5 新增：播放页歌词）

```json
{
  "type": "netease", "kind": "lyric",
  "id": "26896129",
  "instrumental": false,
  "lines": [
    { "t": 16.922, "text": "We were both young when I first saw you", "tr": "第一次见到你的时候我们都很年轻" },
    { "t": 20.569, "text": "I close my eyes and the flashback starts" }
  ]
}
```

- 页面在**切歌时**（track id 变化）用同源 `/api/song/lyric?id=<songId>&lv=-1&kv=-1&tv=-1` 取一次，读成行后
  `post({lyric:{id,instrumental,lines}})`；同一 id 不重复请求（页面内缓存 40 首，回放过的歌立刻答）。
- `t`：这一行开始唱的时刻（秒，毫秒精度）；`text`：原文；`tr`：网易云自己的翻译（`tlyric`），按同一时刻对齐，
  没有对应时**不出现**。翻译**总是随消息下发**，是否显示由 UI 按语言决定（见 §6「多语言规则」）。
- LRC 解析在隐藏页里做：`[mm:ss.xx]` 行 → 行；`[mm:ss.xx]` 多次出现的一行展开成多行；空行（换段）丢弃；
  文件开头的「作词 : …」「作曲 : …」等 credit 行丢弃；纯音乐的提示行（含「纯音乐」）丢弃。
- `instrumental: true`：纯音乐（接口的 `pureMusic`/`nolyric`，或整首只有 credit 和「纯音乐，请欣赏」）——
  `lines` 为空，UI 显示「纯音乐」而不是空白。
- `lines: []` 且 `instrumental: false`：字被接口标为 `uncollected`（没收集到歌词）——UI 显示「暂无歌词」。
- host 侧清洗（`netease.rs` 的 `Lyric::checked`）：id 必须是网易云的数字 id，行数 ≤2000，每行文本/翻译 ≤300 字，
  时间必须是 0–86400 的有限数，按时间排序；不合法的行丢弃。`state.track.id` 不等于 `lyric.id` 时 UI 丢弃这条
  （切歌瞬间的迟到答案不会盖到下一首上）。
- host 会把**最后一条 `lyric`** 缓存：cabin 页重新加载时，如果当前播放的还是那首歌，host 重新下发它
  （隐藏页只在切歌时取歌词，否则 UI 重新加载后会一直空白）。

### 3.12 `timing`（只进 host 日志，不转发给 UI）

```json
{ "timing": { "action": "play", "sounding": 842, "steps": "command@0ms …", "rescue": null, "reloading": null } }
```

`action`: `play|resume|next|previous|heal`；`sounding`: 从命令到出声的毫秒（`null`=窗口内没出声）；
`rescue`: 最终用到第几级补救（`null`=正常，1/2/3）；`reloading`: 是否重载了页面。协议字段与 v2 兼容（未加必填字段）。
`steps` 里按时间记下每一步（`before {…}`、`track <id>`、`rescue1 …`、`sounding <ms>`），host 只记日志。

### 3.13 `ready`

`{"ready":true}`：页面（重新）加载完成。host 收到后重发 cab 配置并让页面 `refresh`。

### 3.14 页面播放器 API（实测，2026-11-19）

- `window.nm.x.ceo2i(action, type, id)`：页面自己的播放调用（`bLk6u`）。`type` 是资源类型：
  `13`=歌单（会加载整单为队列）、`18`=单曲（**追加**到当前页面队列）、`19`=专辑、`24`=每日推荐、`2`=歌手热歌。
  `action` 为 `play` / `addto`。
- `window.player.addTo(tracks, clear, play)` / `getPlaying()` / `pause()`：页面 shell 自己的播放器对象
  （`pt_frame_index` 里定义，`addTo` 接收**页面自己的 track 对象数组**）。`addTo(tracks, true, true)` = 清空队列、
  设为 tracks、立即播第一首；播放条与播放状态**同步**更新。
- `window.player.getPlaying()` = `{track, playing}`（正在播的页面 track 对象/是否在播）。
- 队列元素字段（页面自己的 `l2G.yj6i` 输出）：`id, name, title, duration(ms), album{id,name,picUrl}, artists[{id,name}],
  alias, privilege{st,fee,payed,pl,dl,flag,toast}, status, commentThreadId …`。`privilege` 缺省时页面按 `status>=0`
  判可播，所以脚本构造的最小对象也能进队列（本项目只把 UI 标记为可播的歌放进队列）。

---

## 4. TS 协议层（`ui/src/cabin/apps/netease/netease.ts`）

### 4.1 类型

- `NeteaseList` / `NeteaseSong` / `NeteaseTrack` / `NeteaseAccount` / `NeteaseHome` / `NeteaseLibraryGroup` /
  `NeteaseLibraryPlaylist` / `NeteaseArtist` / `NeteaseSearch` / `NeteaseArtistPage` / `NeteasePlayerState` / `Asking` /
  `IDLE_ASKING` / `PlaylistPage` / `PlaylistMeta` / `Tab` / `View` / `Style` / `Account` —— 沿用 v2。
- **v3 新增**：
  - `NeteaseRanking` = `{ id, name, cover: string|null, updateFrequency, trackCount, playCount, official: boolean }`
  - `NeteaseProfile` = `{ uid: string, name, avatar: string|null, signature, level, listenSongs, follows, fans, playlistCount, createDays, vipType, background: string|null }`
  - `NeteaseSong` 新增可选 `album?: string`、`playCount?: number`。
  - `View` 新增 `{ id: number; kind: 'ranking'; rankingId: string }`。
  - `PlaylistPage` 新增可选 `meta?: PlaylistMeta | null`（`openRanking` 的回答一定带）。
  - `NeteaseCommand` 新增 `{action:'rankings'}`、`{action:'profile'}`、`{action:'openRanking', value:string}`。
- store 新增字段：`rankings: NeteaseRanking[]|null`、`rankingsAsking: Asking`、`profile: NeteaseProfile|null`、`profileAsking: Asking`。
- **r10.4 新增**：`PlayMode`（`'list'|'shuffle'|'one'`）、`NeteaseFrom` = `{ kind: 'playlist'|'ranking'|'daily'|'recent'|'search'|'artist', name: string }`；
  store 新增 `from: NeteaseFrom|null`（当前播放来源，UI 不展示，排查/接入用）。`NeteasePlayerState` 的 `mode?` 现在真的被读了。
- **r10.5 新增（歌词）**：
  - `NeteaseLyricLine` = `{ t: number, text: string, tr?: string }`（`t` 秒；`tr` 是翻译，没有就不出现）。
  - `NeteaseLyric` = `{ id: string, instrumental: boolean, lines: NeteaseLyricLine[] }`。
  - store 新增 `lyric: NeteaseLyric | null`（只保留**当前播放那首**的歌词；`receiveState` 切歌时清空）。
  - `ui/.../lyrics.ts`（新文件，纯函数）：`lyricLineAt(lines, position)`（当前行，提前 0.2s 点亮）、
    `lyricWindow(lines, at, count=3)`（未展开时围绕当前行的 3 行）、`showsTranslation(locale)`（只有 `zh*` 为 true）。

### 4.2 函数（UI 直接用）

**请求/导航**
- `requestHome(again?)`、`requestLibrary(again?)`、`requestRecent(again?)`、`searchFor(query)`、`requestSearch?`（用 `searchFor`）
- `requestRankings(again?)`、`requestProfile(again?)`
- `openTab(tab)`、`openPlaylist(id)`、`openArtist(id)`、`openRecent()`、`openRanking(id)`、`goBack()`
- `retryPlaylist(id)`、`retryArtist(id)`、`retryRanking(id)`
- `setQuery(q)`、`setSearchTab(tab)`、`openSearch()`

**读 store（hook）**
- `useNetease(selector)`、`useNow(running)`
- `usePlaylistMeta(id)`、`useRankingMeta(id)`、`useArtistMeta(id)`
- `findPlaylistMeta(sources, id)`、`findRankingMeta(rankings, id)`
- `useIsPlaying(song)`、`useNeteaseSource()`

**播放/喜欢**
- `playPause()`、`playSong(playlistId, song)`（带 `list` 上下文）、`playFound(song)`（自动找它所属的列表）、
  `playDaily()`（`list: 'daily'`）、`playPlaylist(id)`、`skip(±1)`、`seek(seconds)`、`setVolume(share, done?)`、
  `setLiked(liked)`、`refresh()`
- `cycleMode(): PlayMode`：切到下一个模式（列表循环→随机→单曲循环→列表循环），本地立即生效并返回新模式（Toast 用），
  同时下发 `cycleMode` 让页面自己的播放条跟上；页面回推的 `state.mode` 再确认（1.5s 内的旧状态不会把按钮拨回去）。
- `nextPlayMode(mode)`：导出的纯函数，与页面自己的顺序一致。
- `skip(direction): NeteaseSong|null`：**确定性上一首/下一首**（见 §4.4）：知道当前列表与当前歌时直接算出目标歌并
  `play {value, list}`（页面用自己的 `player.addTo` 当队列），把目标歌返回（播放条立即显示它）；没有列表时才退回页面
  自己的 `next/prev`，返回 `null`。
- `contextOfSong(songId)`：导出，返回这首歌已知的列表 key（`playlist/ranking id`、`daily`、`recent`、`search`、
  `artist:<id>`），没有则 `null`。UI 一般不用它（`playFound` 已内部使用），排查时可用。

**消息入口（测试/host 通信用）**
- `receiveMessage(message)`、`receiveState`、`receiveHome`、`receiveLibrary`、`receiveSearch`、`receiveRecent`、
  `receiveArtist`、`receivePlaylist`、`receiveLike`、`receiveRankings`、`receiveProfile`、`receiveLyric(lyric)`

**应用接入**
- `useNeteaseBridge()`、`neteasePlayer`、`pauseNeteaseWithGame()`、`showToast(text)`、`setStyle(style)`、`accountOf(state)`、
  `positionOf(track, playing, at, now?)`、`songKey(song)`

### 4.3 预览（纯浏览器）

`preview.ts` 提供 `createPreview()`：`read()/songs()/home()/library()/recent()/search()/artist()/rankings()/ranking(id)/profile()/lyric(track)`
及播放控制。无 host 时 `requestHome/requestLibrary/requestRecent/requestRankings/requestProfile/openRanking` 都从预览答，
所以整个 UI 在浏览器里可渲染、可点、可播。`lyric(track)` 按歌（id 尾号）生成假歌词：多数歌是中文原创词，少数是
「英文原文 + 中文翻译」（演示中文界面下的翻译），还有纯音乐（`instrumental: true`）和没收到歌词的（`lines: []`）。

### 4.4 队列与上一首/下一首（r10.4）

- **队列**：UI 自己记 `{ list, ids }`（模块内，不进 store），`ids` 是那个列表里**可播**的歌、按列表原序。`playSong` /
  `playFound` / `playPlaylist` / `playDaily`（以及 Play all 等歌曲还没到时的那次）都会把队列设成来源列表；`playFound`
  找不到列表时清空队列。`useNetease().from` 同时给出 `{kind, name}`（歌单/榜单用自己的名字，`daily/recent/search/artist`
  用应用的词）。
- **上一首/下一首**：`skip(±1)` 先取「当前歌在这个列表里的下标」——队列还在就用它，否则用 `contextOfSong` 现找（页面自己
  切走了也找得回来）；找不到列表才退回页面的 `next/prev`。找到时：
  - `list`（列表循环）与 `one`（单曲循环）：`ids[(at+direction+len)%len]`——**末尾回到开头**，开头上一首去末尾；
    单曲循环只让「一首歌自己放完」重复，手动切歌仍是列表的下一首。
  - `shuffle`（随机）：在 `ids` 里随机，排除当前歌（列表只有一首时只能它自己）。
  - 不可播的歌永远不会成为目标（页面没有它的声音）。
- 目标歌以 `{action:'play', value:<id>, list:<list>}` 下发：页面 `startQueue(context, at)` 用自己的 `player.addTo`
  把整个列表当队列、从目标歌开始，所以切歌是页面自己的（实测 100–175ms 出声），顺序仍是列表的。
- 队列与页面自己的队列**不需要一致**：页面按 UI 给的目标歌重设自己的队列即可；页面自己的 `next/prev` 只在没有列表时用。
- 页面自己的模式（`state.mode`）决定「一首歌自己放完之后」的行为（列表/随机/单曲），UI 的手动切歌只按上面的规则走。

---

## 5. 文件与职责

| 文件 | 职责 |
|---|---|
| `crates/host/src/netease.js` | 页面内脚本：同源 API 取数、播放+1.2/2.5/4s 补救阶梯、静默检测、红心、state 每秒推送 |
| `crates/host/src/netease.rs` | Command/Message/State/Report 类型、页面消息清洗、cabin 消息 JSON、host 侧校验、单测 |
| `crates/host/src/lib.rs`（网易云段） | 转发 Report 到 cabin 页、日志、空闲关闭、启动 |
| `ui/.../netease.ts` | 协议类型/解析/命令/store/请求函数（本文档 §4） |
| `ui/.../lyrics.ts` | 歌词的纯函数：当前行、未展开的 3 行、语言是否显示翻译 |
| `ui/.../preview.ts` | 浏览器预演数据（含假歌词） |
| `notes/netease-v3-protocol.md` | 本文档 |

---

## 6. 兼容性

- 旧 kind（`state/playlist/home/library/search/artist/recent/like`）字段只增不改；新增字段为空时省略或给安全默认值。
- 旧命令（`play/pause/next/prev/seek/volume/setLike/openPlaylist/openArtist/home/library/search/recent/refresh/start/signIn/signOut`）全部保留。
- `play` 新增可选 `list` 字段：旧 UI 不带它也能播（退回页面自己的单曲播放，慢一点但可用）；host 对 `list` 做白名单校验。
- `state.state` 仍可为 `null`；`state.signedIn` 仍可为 `null`（未知）。
- `timing` 只进日志，不改变协议。
- **r10.5**：新增 kind `lyric`（旧 UI 忽略未知 kind，不受影响）；没有新增命令（歌词由隐藏页在切歌时自己推）。

### 6.0 多语言规则（歌词翻译，r10.5）

- 车机语言是**中文**（`useLanguage()` 以 `zh` 开头）时：外语歌显示**原文 + 翻译**（`tr`，歌曲自带才显示）；
  没有翻译就只显示原文。
- 车机语言是**其他语言**时：任何歌都**不显示翻译**，只显示原文（`tr` 仍在消息里，UI 不渲染）。
- 实现：host 总是解析并对齐翻译一起下发；`lyrics.ts` 的 `showsTranslation(locale)`（只有 `zh*` 为 true）由
  `NowPlaying.tsx` 读 `useLanguage()` 决定渲染。以后加别的语言只改这一个函数。

### 6.1 已知未做（可选，UI 的 notes/netease-v3-ui-needs.md §4）

1. `state` 没有"正在缓冲/播放确认"轻量字段：`timing.sounding` 只进 host 日志；UI 用本地乐观 + 2.4s 兜底。
   （若要，可加 `state.buffering`/`state.settling`，不改现有字段。）
2. `home.daily` 只有 `songs`，无每日推荐封面/日期。
3. `NeteaseSong` 不带单曲封面（列表/最近/搜索）；点歌瞬间的封面由 UI 绘制的临时图顶着，真封面随
   `state.track.cover` 到达（队列播放时通常 <200ms）。

---

## 7. 接口实测记录（本机已登录隐藏页，2026-11-19；歌词一项 2026-11-20，uid=1835963976）

探针：CDP `Runtime.evaluate` 在 `https://music.163.com/` 页面里同源 `fetch(credentials:'same-origin')`。
返回条数为实测值（会随账号数据变化，这里记的是方法有效性与字段形状）。

| 用途 | 请求 | 实测结果 | 关键字段 |
|---|---|---|---|
| 每日推荐歌曲 | `GET /api/v1/discovery/recommend/songs` | `code=200`，`data.dailySongs` **33 首**（`recommend` 也是同一批） | `data.dailySongs[].id/name/ar[].name/al.name/al.picUrl/dt/fee/privilege.st` |
| 同样的旧路径 | `GET /api/discover/recommend/songs` | `code=404`（不存在，别用） | — |
| 私人雷达/个性化 | `GET /api/v1/discovery/recommend/resource` | `code=200`，`recommend` **18 条**，第一条 `id=3136952023 name=私人雷达` | `id/name/picUrl/playcount/trackCount/alg` |
| 推荐歌单 | `GET /api/personalized/playlist?limit=12` | `code=200`，`result` **12 条**（`type=0`） | `id/name/picUrl/playCount` |
| 我的歌单 | `GET /api/user/playlist?uid=<uid>&limit=100&offset=0` | `code=200`，`playlist` **24 条**；**必须带 limit+offset**（不带实测 `code=400 请求参数错误`） | `id/name/specialType/trackCount/playCount/coverImgUrl/creator.userId/creator.nickname`；喜欢的音乐 `specialType=5` |
| 账号资料 | `GET /api/v1/user/detail/<uid>` | `code=200`（**路径参数**；`?uid=` 形式 404「接口未找到！」） | `profile.nickname/avatarUrl/signature/follows/followeds/playlistCount/vipType/backgroundUrl/userId`、`level`、`listenSongs`、`createDays` |
| 账号等级 | `GET /api/user/level?uid=<uid>` | `code=200` | `data.level`（与 detail 的 level 一致）、`nowPlayCount/nextPlayCount` |
| 最近播放（听歌排行） | `GET /api/v1/play/record?type=1&uid=<uid>&limit=100` | `code=200`，`weekData` **67 条** | `playCount/score/song.id/song.name/song.ar[].name/song.al.name/song.al.picUrl/song.dt/song.privilege.st` |
| 榜单列表 | `GET /api/toplist` | `code=200`，`list` **65 条** | `id/name/coverImgUrl/updateFrequency/trackCount/playCount/ToplistType` |
| 榜单列表（另一路） | `GET /api/toplist/detail` | `code=200`，`list` **65 条**（每条多 3 首 `tracks` 预览） | 同上；详情不必用它 |
| 歌单/榜单详情 | `GET /api/v1/playlist/detail?id=<id>` | `code=200`；热歌榜（3778678）`trackCount=200`、`trackIds=200`、`tracks` 只给前 10 | `playlist.id/name/trackCount/trackIds[].id/tracks[0..9]/coverImgUrl/specialType/updateFrequency` |
| 歌曲详情（批量，含版权） | `POST /api/v3/song/detail`，body `c=[{"id":…}]`（≤200/批） | `code=200`，`songs`+`privileges` 同长 | `songs[].id/name/ar[].name/al.name/al.picUrl/dt/fee`、`privileges[].st`、`songs[].st` |
| 搜索-单曲 | `GET /api/search/get?s=<词>&type=1&limit=60&offset=0` | `code=200`，`result.songs` | `songs[].id/name/artists[].name/album.name/duration(ms)/fee`；`result.songCount` |
| 搜索-歌单 | `GET /api/search/get?s=<词>&type=1000&limit=30&offset=0` | `code=200`，`result.playlists` | `id/name/coverImgUrl/playCount`；`result.playlistCount` |
| 搜索-歌手 | `GET /api/search/get?s=<词>&type=100&limit=30&offset=0` | `code=200`，`result.artists` | `id/name/picUrl/img1v1Url`；`result.artistCount` |
| 艺人详情 | `GET /api/v1/artist/<id>` | `code=200`，`hotSongs` **50 首**（含 `st`） | `artist.name/alias/picUrl/briefDesc/musicSize/albumSize`、`hotSongs[]` |
| 艺人歌曲 | `GET /api/v1/artist/songs?id=<id>&limit=50&offset=0` | `code=200`，`songs` **50 首**；**不带 offset 实测 `code=400 参数错误`** | `songs[].id/name/al.name/ar[].name/dt/fee` |
| 红心（加入） | `POST /api/playlist/manipulate/tracks` body `op=add&pid=<喜欢歌单id>&trackIds=[<id>]&csrf_token=<__csrf cookie>` | `code=200`，`count` 2747→**2748**，回读 `trackIds` 含该曲 | — |
| 红心（取消） | 同上 `op=del` | `code=200`，回读 2747，`trackIds` 不含该曲 | — |
| 搜索结果补版权 | `POST /api/v3/song/detail`（同上） | 搜索接口无 `st`，靠它补 | — |
| **歌词（有翻译的外语歌）** | `GET /api/song/lyric?id=26896129&lv=-1&kv=-1&tv=-1` | `code=200`，`lrc.lyric` 2404 字（英文原文），`tlyric.lyric` 1290 字（中文翻译），两边时间戳逐行对齐（如 `[00:16.922]`） | `lrc.lyric` / `tlyric.lyric`；无 `pureMusic/nolyric/uncollected` |
| **歌词（纯音乐）** | `GET /api/song/lyric?id=478507889&…`（卡农 经典钢琴版） | `code=200`，`pureMusic=true`，`lrc.lyric="[00:00.00] 作曲 : dylanf\n[00:01.00] 编曲 : dylanf\n[00:05.00]纯音乐，请欣赏\n"`，**没有 `tlyric` 字段** | `pureMusic`；另测 `20110049`（River Flows In You）：`[00:00.00] 作曲 : Yiruma` + `[00:05.00]纯音乐，请欣赏` |
| **歌词（没收集到）** | `GET /api/song/lyric?id=3433373114&…` | `code=200`，`uncollected=true`，`lrc.lyric=""` | `uncollected` |
| **歌词（中文歌）** | `GET /api/song/lyric?id=168091&…`（蓝莲花） | `code=200`，`lrc.lyric` 24 行，`tlyric.lyric=""`（有对象、空内容） | `lrc.lyric` / `tlyric.lyric` |

其它实测（同一页面）：

- `.m-tophead a.name` 的 `href` 是 `/user/home?id=<uid>`：uid 从这里读（登录态由 `.m-tophead [data-action="logout"]` /
  `a.name` 判定）；`__csrf` 在 `document.cookie`。
- 封面统一 `http→https`，`?param=300y300`（列表/当前曲）或 `?param=140y140`（头像）。
- 接口返回的 id 有的是 number，页面协议统一转 string。

---

## 8. 播放链路（v3）

核心指标：**切歌到出声的延迟**。实测结论：用页面自己的队列（`player.addTo`）后，同一列表内切歌 **100–175ms**
出声、中位数 ~152ms；连按 next 101–202ms；全部不触发补救。设计要点：

1. **不导航**：数据全走同源 `fetch`，内容 frame 永远不导航；只有第 3 级补救才重载隐藏页本身（并立刻恢复当前曲）。
2. **用页面自己的队列/播放上下文（关键）**：`window.player.addTo(tracks, clear, play)` 是页面自己的列表页
   「播放全部/点歌」用的调用（源码 `bcn0K` → `top.player.addTo(k4C, xp7u, gt6u)`）。
   - 队列元素是**页面自己的 track 对象**（`l2G.yj6i` 的字段：`id/name/duration/album{album.name,picUrl}/artists/
     privilege/status/...`）。`netease.js` 在每次读列表（playlist/ranking/daily/recent/search/artist）时缓存这些
     对象（`pageTracks`）以及列表本身（`contexts`）。
   - `play {value, list}`：找到 `list`（或最近一个包含该曲的列表），把列表旋转成「目标歌在第一位」后
     `player.addTo(tracks, true, true)` —— 页面自己的播放器立即切到该曲，**队列就是该列表**，之后页面自己的
     next/prev 在列表内走、页面自己的预载生效。
   - `list` 未知时退回 `nm.x.ceo2i('play', 18, id)`（页面自己的单曲播放：注意它把单曲**追加**进页面队列，
     所以 v3 有列表时总是重设队列）。
3. **命令即观察**：每次 `play`/`play(list)`/`next`/`prev` 从发出的那一刻开始观察（每 50ms）。
4. **阶梯**（相对命令发出时刻，队列内更短，因为切换是页面自己的）：
   - **0.7s（队列内）/ 1.2s（单曲）** 音频时间没动 → 第 1 级：队列内重设队列从同一首开始 / 单曲 `ceo2i` 重发；
     next/prev 若歌曲都没换就再按一次该键（按键丢失），换了歌则用 `ceo2i` 播当前曲。
   - **1.5s / 2.4s** 仍没动 → 第 2 级：当前歌曲行的播放键（内容 frame 恰好显示时）或页面播放按钮。
   - **3.2s / 4.0s** 仍没动 → 第 3 级：重载隐藏页（sessionStorage 记下当前曲），脚本回来后自动续播。
   - 出声判据：audio 元素 `currentTime` 前进 >0.05s + 播放条曲目 id 匹配 + 元素时长与目标曲时长差 ≤2s。
5. **静默在播检测**：每 500ms 一次；`playing=true` 但（有 audio 元素时）`currentTime` 2s 不动，或（元素不可见
   时）播放条时钟 2s 不动 → **立即**进同一阶梯（`action='heal'`，第一级在 0ms 发出）；冷却 8s 防轰炸。
6. **切歌流畅**：命令立即下发，不做导航/换页等待；有列表上下文时以页面队列为准，正常切歌 100–300ms 出声。

### 8.1 页面播放器 API（实测）

- `window.nm.x.ceo2i` 存在（`function(U0a,w2W,E0q)`，内部 `bLk6u({action, type, id})`）。`ceo2i('play', 18, <songId>)` 实测能开始播放。
- 页面播放按钮 `#g_player .ply`：播放时 class 含 `pas`；下一首 `.m-playbar .nxt`、上一首 `.m-playbar .prv`；进度条
  `.m-pbar .barbg`、时间 `.m-pbar .time`（"00:05 / 04:30"）、曲名 `.m-playbar .words .name`（`title` 属性为完整名，`href` 带 id）。
- 播放器的 audio 元素可能不在 DOM 里：注入脚本在页面加载前 hook `HTMLMediaElement.prototype.play/setMediaKeys` 和
  `playing/loadedmetadata` 事件，把它抓住（v3 继续这么做）。

### 8.2 页面播放器状态读取

- `signedIn`：`.m-tophead [data-action="logout"]` / `a.name` → true；`.m-tophead a[data-action="login"]` → false；
  页面加载 20s 仍无账号信息 → false（避免永远"未知"）。
- 曲目：播放条 DOM（id 来自曲名链接、时长/进度来自时间条与进度条宽度），专辑名/封面用同源接口补。
- 「我喜欢的音乐」：`/api/user/playlist` 找 `specialType=5` → `/api/v1/playlist/detail` 取 `trackIds`（缓存 60s，红心后强制重读）。

### 8.3 实测数据（本机真实页面、真实登录账号，2026-11-19）

测量方式：把仓库里**最终版 `netease.js` 原样注入正在运行的隐藏页**（只做三处测试替身：`post` 收集到
`window.__captured` 而不是发给 host、host 命令的监听器保存为 `window.__wpHandler` 以便测试按 host 的格式调用、
不复用 cab 音频实例），其余代码零改动；`timing` 消息就是线上会发的同一条。

**同一榜单（飙升榜 100 首）内连切 10 首（每次点不同歌曲）**：

| # | 歌曲 | 出声耗时（timing.sounding） | 补救 | 页面状态看到新歌 |
|---|---|---|---|---|
| 1 | 冬天又来临 | 154 ms | 无 | 15 ms |
| 2 | 你猜 | 106 ms | 无 | 17 ms |
| 3 | 围城 | 152 ms | 无 | 18 ms |
| 4 | 1000 winters | 175 ms | 无 | 17 ms |
| 5 | 回到你身边 (不插电) | 153 ms | 无 | 19 ms |
| 6 | 围城 | 151 ms | 无 | 21 ms |
| 7 | NEON | 113 ms | 无 | 159 ms |
| 8 | 慌啥子嘛 | 152 ms | 无 | 17 ms |
| 9 | IF YOU | 151 ms | 无 | 18 ms |
| 10 | Kiss My Soul | 100 ms | 无 | 16 ms |

- 中位数 **~152 ms**（100/106/113/151/151/152/152/153/154/175），最大 **175 ms**，全部**没有触发任何补救**
  （`rescue: null`）。
- 页面自带队列内连按「下一首」5 次：**108 / 202 / 101 / 153 / 111 ms**（中位数 111 ms，全部无补救）。
- 单曲直播（`ceo2i('play',18,id)`，不带列表上下文）：约 **112–158 ms**（同一台机器、同一时段）。
- 修好之前（r12 的 10s 观察 + 三级补救）同一操作的出声耗时约 **0.2–0.5s 且 next 常需 1.2s 级补救**；
  连切时第 1 次出声 205ms、第 2 次 215ms、next 触发 1 级补救共 1403ms。v3 用页面队列后不再出现补救。
- 一次 10 连切后页面元素：仍在 2 个 audio 元素（页面的播放器复用/预留），无泄漏式增长。
- 队列/预载证据：`window.player.addTo(tracks, true, true)` 后播放条**同步**变成目标歌（0 ms），音频出声 100–175ms；
  在队列内按 next，页面自己换到列表下一首并预载（101–202ms），无需再向接口取列表。
- 未用队列的直插（页面自己播放器 `ceo2i('play',18,id)`）会**把单曲追加**到页面队列（`bcn0K` 里 type=18 时
  `clear=false`），所以 v3 有列表时一律用 `addTo` 重设队列，避免旧队列残留。

**静默在播（paused=false 但 currentTime 不走 / 播放条时钟停住）**：

- 用测试钩子把声音元素的 `currentTime` 读数定死（页面仍说 playing、元素仍 !paused）：约 **2.0s 后**被
  `heal` 捕获（轮询 500ms、判定窗口 2000ms），**3.1s 内**发出 `timing: {action:'heal', rescue:1}`（第一级即
  `ceo2i` 重发），随后声音恢复（`audio.playing=true` 且时钟前进），恢复后的下一次 next 仍 **152ms** 出声。
- 轮询间隔 500ms、判定窗口 2000ms、两次 heal 之间冷却 8000ms；正常播放/换曲不会被误判（`moved` 判定要求
  currentTime 前进 >0.05s）。

**补救阶梯（v3 最终）**：

| 场景 | 第 1 级 | 第 2 级 | 第 3 级（重载页面） |
|---|---|---|---|
| 页面自己的队列内（`list` 已知） | 0.7 s：重设队列（`addTo`）从同一首开始 | 1.5 s：当前歌曲行播放键 / 页面播放键 | 3.2 s |
| 单曲直播（`list` 未知） | 1.2 s：`ceo2i('play',18,id)` 重发 | 2.4 s：当前歌曲行 / 播放键 | 4.0 s |
| `next`/`prev`（队列内，知道目标 id） | 0.7 s：没换歌就再按一次该键（按键丢失）；已换歌就用 `ceo2i` 播当前曲 | 1.5 s | 3.2 s |
| 静默在播 `heal` | 检测到后**立即**（0ms）`ceo2i` 重发 | 2.4 s | 4.0 s |

- 出声判据：声音元素自己的 `currentTime` 前进 >0.05s，且（带 id 时）播放条曲目 id 是目标、元素时长与目标歌曲
  时长差 ≤2s（防止上一首残留元素造成误判）；带队列的 next 还要求播放条曲目 = 队列里的下一首。
- 正常切歌**不会**触发第 3 级（10 连切 + 5 连 next 实测 0 次）；4 秒级重载只在阶梯走完仍无声时才发生。
- UI 状态即时性：`addTo` 后页面播放条**同步**更新，脚本立刻 `tell(true)`，实测界面（state 消息）看到新歌
  **15–21 ms**（一次 159ms 是页面自身延迟；中位数 ~18ms），远快于每秒心跳。

---

### 8.4 歌词实测（2026-11-20）

测量方式：本机 `%LOCALAPPDATA%\WestPlay\westplay.exe` 带 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=0`
启动，cabin 页发 `{type:'netease',kind:'command',command:{action:'start'}}` 让隐藏页起来（端口从
`%LOCALAPPDATA%\app.westplay\webview2-netease\EBWebView\DevToolsActivePort` 读，**没连 9223/9226**），
然后在 `https://music.163.com/` 页面里用 CDP `Runtime.evaluate` 跑**仓库里最终版 `netease.js` 的歌词段原样**
（只把 `api`/`post` 换成收集器；账号 `dReLuNEstella` 已登录）：

| 歌曲 | 结果 |
|---|---|
| Love Story（Taylor Swift，`26896129`） | `instrumental:false`，**51 行**；第 1 行 `t=16.922 "We were both young when I first saw you"` + `tr:"第一次见到你的时候我们都很年轻"`；原/译时间戳逐行对齐 |
| 卡农 经典钢琴版（`478507889`） | `instrumental:true`，**0 行**（文件只有 `作曲 : dylanf` + `纯音乐，请欣赏`，都被丢掉） |
| River Flows In You（`20110049`） | `instrumental:true`，0 行（`pureMusic=true`） |
| 走向晴光（`3433373114`，`uncollected`） | `instrumental:false`，0 行（UI 显示「暂无歌词」） |
| 蓝莲花（许巍，`168091`） | `instrumental:false`，24 行，`tr` 全部没有（中文歌无翻译） |
| 同一首再播一次 | 从页面内缓存答，**不再请求**接口（1 条消息，0 次 fetch） |

- 结论：`/api/song/lyric?id=<songId>&lv=-1&kv=-1&tv=-1` 在真实隐藏页（登录态）可用，字段与 §3.11 一致；
  纯音乐/无歌词/翻译三种情况都按预期分流。

---

## 9. 给 UI 分身的交接要点

1. 只 import `./netease` 和 `./preview` 里的导出；协议类型以 `netease.ts` 为准，本文档 §4 是索引。
2. 首页：`requestHome()` 后读 `useNetease(s => s.home)`（`daily` 先 null 后到；`homeAsking` 变 failed 时显示重试）；
   `home.radar`、`home.personal`、`home.recommended` 都是 `NeteaseList`。
3. 我的：`requestLibrary()` → `library`（分组），`requestRecent()` → `recent`，`requestProfile()` → `profile`；
   头像/昵称也可先用 `state.account`（每秒都在）。
4. 榜单：`requestRankings()` → `rankings`（`official` 分组官方/特色）；点卡片 `openRanking(id)`（push `{kind:'ranking'}` 视图）；
   详情页读 `playlists[rankingId]`（`songs/waiting/failed/meta`），Play all 用 `playPlaylist(rankingId)`，
   点歌 `playSong(rankingId, song)`；失败重试用 `retryRanking(rankingId)`；头部用 `useRankingMeta(rankingId)`。
5. 播放：任意歌曲点击用 `playFound(song)`（不需要知道歌单）或 `playSong(playlistId, song)`；前者会自动带上它所属的
   列表上下文，让页面用队列播放（实测切歌 100–175ms 出声）。播放状态一律读 `state`；`addTo` 后页面状态同步，脚本
   立刻推一条 state（实测 15–21ms），每秒心跳只是兜底。进度条用 `positionOf(track, playing, trackAt, useNow(playing))`。
   上一首/下一首一律用 `skip(±1)`（§4.4）：它按当前列表的序算目标歌并返回，播放条可立刻 `expectSong(它)`；不要自己
   再发 `next/prev`（那只是没有列表时的兜底）。播放模式用 `cycleMode()`（返回新模式，Toast 用它），按钮用 `ModeButton`。
6. 红心：`setLiked(!liked)`，等 `like` 消息（`state.liked` 只在页面确认后变）；失败看 `likeFailure.reason`。
7. 预览：`preview.ts` 已含榜单/资料/每日推荐假数据，浏览器里整个 UI 应能渲染与点播。
8. 不要改 `netease.ts` / `preview.ts` / `crates/*`：缺字段/缺函数在 notes 里留需求，由后端分身补。
9. 歌词（r10.5）：**不需要请求**——隐藏页在切歌时自己推 `kind:'lyric'`。读 `useNetease(s => s.lyric)`（只保留当前
   播放那首的；切歌时 store 清空，迟到的旧歌答案会被丢弃）。当前行用 `lyricLineAt(lines, position)`（提前 0.2s 点亮），
   未展开的 3 行用 `lyricWindow(lines, at, 3)`；`showsTranslation(useLanguage())` 决定渲染 `tr`（只有中文界面为 true）。
   `instrumental` → 显示「纯音乐」；`lines` 为空且非纯音乐 → 「暂无歌词」；`lyric === null` → 轻量骨架（等隐藏页那一秒）。
   点某一行 → `seek(line.t)`；面板展开/收起纯前端状态（现在播放页里），不经过 host。
