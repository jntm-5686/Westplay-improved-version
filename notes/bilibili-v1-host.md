# 哔哩哔哩车机版 V1：host 协议（host ↔ 车机 UI）

> **本文件写于 UI 实现之前。最终协议以 `crates/host/src/bilibili.rs`/`bilibili.js` 为准，并已由
> `notes/bilibili-v1-protocol.md` 的「§12 §7 修正」一节逐条修正**（UI 的 `ui/src/cabin/apps/bilibili/bilibili.ts`
> 按最终协议实现，`tsc`/vitest 已通过）。`state`/`like`/`coin`/`favorite`/`failed` 等字段清单见该节。

这份文件是 **host 侧已完成实现**（`crates/host/src/bilibili.rs` 与注入页 `crates/host/src/bilibili.js`）的协议说明，
供 `ui/src/cabin/apps/bilibili/` 的 UI 对齐。侦察组的 `notes/bilibili-v1-protocol.md` 是接口/选择器层面的实测记录；
本文件是消息协议与 UI 需要知道的约定。两者冲突时以实测为准，但改动请同步到 host（Rust 结构体与 JS 同时改）。

## 1. 基本约定

- App id：`bilibili`；所有 host → 车机的消息是 `{"type":"bilibili","kind":…}`。
- 车机 → host 的命令是 `{"type":"bilibili","kind":"command","command":{"action":…}}`。
- host 只在 UI 第一次发命令时启动隐藏页（`start`），空闲 30 分钟无播放自动关闭（再次用会重新启动，登录 cookies 保留）。
- 登录由伴生程序（账号页）或车机页命令 `signIn` 打开 **独立桌面登录窗口**（Bilibili 自己的 passport 扫码页）；
  车机页拿到 `state.signingIn` / `account` 即可显示状态。host 看不到账号密码，也不保存。

## 2. 车机 → host 命令（`command.action`）

| action | 字段 | 说明 |
| --- | --- | --- |
| `start` | — | 启动隐藏页并读登录态 |
| `signIn` / `signOut` | — | 打开扫码登录窗口 / 清 cookies 重新加载 |
| `home` | `page`（可选，默认 1）、`fresh`（可选，true 重新拉第一页） | 首页推荐 → `kind:"home"`（带 `page`/`more`） |
| `popular` | — | 热门 → `kind:"popular"` |
| `ranking` | `rid`（0=全站，或分区 tid） | 排行榜 → `kind:"ranking"` |
| `relations` | `kind`（`followers`/`following`）、`page` | 粉丝/关注列表（需登录）→ `kind:"relations"`；未登录 `failed -101` |
| `search` | `value`（≤60 字）、`kind`（`video`/`user`/`bangumi`/`movie`/`live`）、`page` | 搜索 → `kind:"search"` |
| `bangumi` | `seasonType`（1 番剧 2 电影 3 纪录片 4 国创 5 电视剧 7 综艺）、`page` | 番剧/影视索引 → `kind:"bangumi"` |
| `season` | `value`（`ss…` 或 season id） | 番剧/影视详情 + 剧集 → `kind:"season"` |
| `live` | — | 直播首页/推荐 → `kind:"live"` |
| `history` | `max`、`viewAt`（首页传 0/0） | 观看历史（需登录）→ `kind:"history"` |
| `favorites` | — | 我的收藏夹（需登录）→ `kind:"favorites"` |
| `favoriteItems` | `value`（收藏夹 id）、`page` | 收藏夹内容 → `kind:"favoriteItems"` |
| `dynamic` | `offset`（首页空串） | 关注动态（需登录）→ `kind:"dynamic"` |
| `space` | `value`（UP 主 mid）、`page` | UP 主空间（需登录）→ `kind:"space"` |
| `detail` | `value`（`BV…` 或 `av…`） | 视频详情/分P/互动态 → `kind:"detail"` |
| `play` | `value`、`kind`（`video`/`bangumi`/`live`）、`page` | 播放：`video` 用 `BV…`/`av…`（`page` 分P），`bangumi` 用 `ep…`/`ss…`，`live` 用房间号 |
| `pause` / `resume` | — | 暂停 / 继续（会记住，页面重载后仍按这个意图；页面加载中幂等） |
| `next` / `prev` | — | 播下一个/上一个：番剧下一集、多P下一P、普通视频 related 第一条；没有则 `failed`，播放保持 |
| `seek` | `value` 秒 | 跳转 |
| `volume` | `value` 0–1 | 音量（0 即静音） |
| `rate` | `value` 0.25–3 | 倍速 |
| `quality` | `value` qn（80=1080P，64=720P…） | 清晰度（页面 `window.player.setQuality`，无则点清晰度菜单） |
| `caption` | `track`（字幕 id；`null` 关闭） | 字幕开关（页面自绘字幕，显示在 video 上） |
| `like` | `value`（bvid）、`on` | 点赞/取消赞 → `kind:"like"` |
| `coin` | `value`、`count`（1/2）、`like`（是否同时点赞） | 投币 → `kind:"coin"` |
| `favorite` | `value`、`add`、`mediaId`（不传用默认收藏夹） | 收藏/取消收藏 → `kind:"favorite"` |
| `show` | `x,y,width,height,crop` | **播放画面矩形**：host 把隐藏页的 video 区域显示在车机页下方这块（crop=true 铺满裁切，false 完整显示留黑边） |
| `crop` | `on` | 只改画面铺满/完整 |
| `hide` | — | 隐藏画面（继续播放、继续出声） |
| `close` | — | 关掉隐藏页（下次用再启动） |
| `refresh` | — | 重读登录态和状态 |

host 会过滤非法 id/越界值（不认识的 action 被丢弃），UI 不必自己防御格式。

## 3. host → 车机消息（`kind`）

### `state`（播放状态 + 登录态；`state:null` 表示 Bilibili 未运行）

```jsonc
{
  "type": "bilibili", "kind": "state",
  "state": {
    "signedIn": true, "signingIn": false,     // signingIn: 登录窗口开着 / 正在确认
    "playing": true, "volume": 0.8, "rate": 1.0,
    "time": 12.5, "duration": 213,            // 秒
    "media": {                                // 当前播放（null: 无）
      "kind": "video",                        // video | bangumi | live
      "bvid": "BV…", "aid": 0, "cid": 0, "epId": 0, "seasonId": 0, "roomId": 0,
      "title": "…", "owner": {"mid":0,"name":"…","avatar":"https://…"}, "cover": "https://…",
      "live": false, "page": 1, "pages": 1
    },
    "qualities": [{"qn":80,"label":"1080P"}],
    "quality": 80, "qualityLabel": "1080P",
    "captions": [{"id":"…","name":"中文（简体）"}], "caption": "…",   // caption: 当前字幕 id（null: 关）
    "cabLevel": [0.5,0.5,0]                   // 车内左右耳响度 + limiter 衰减（可能 null）
  }
}
```

### 列表类消息

- `account`：`{"account":{"signedIn":true,"uid":…,"name":"…","avatar":"https://…"}}`
- `home` / `popular` / `live`：`{"items":[…]}`；`live` 的 items 全是 `kind:"live"`。
- `ranking`：`{"rid":0,"note":"…","items":[…]}`。
- `search`：`{"query":"…","searchKind":"video|user|bangumi|movie|live","page":1,"total":1000,"items":[…],"users":[…]}`，`users` 为 UP 主卡片。
- `bangumi`：`{"seasonType":1,"page":1,"total":…,"items":[…]}`。
- `season`：`{"seasonId":…,"title":"…","cover":…,"evaluate":"…","score":"9.7","badge":"…","episodes":[Episode],"sections":[{"title","episodes":[…]}]}`。
- `favorites`：`{"folders":[{"id":…,"title":"…","count":9,"favState":0}]}`。
- `favoriteItems`：`{"mediaId":…,"title":"…","items":[…],"hasMore":true}`。
- `history`：`{"items":[{"bvid","aid","title","cover","owner","duration","progress","viewedAt","live"}],"max":…,"viewAt":…}`（`max/viewAt` 是下一页游标）。
- `dynamic`：`{"items":[Video+{"dynamicId","said"}],"offset":"…"}`。
- `space`：`{"mid":…,"name":"…","avatar":…,"sign":"…","level":6,"fans":…,"videos":…,"items":[…],"hasMore":…}`。
- `detail`：`{"bvid","aid","cid","title","cover","desc","duration","pubdate","owner","pages":[{"cid","page","title","duration"}],"stat":{"views","likes","coins","favorites","danmaku"},"like":true|false|null,"coin":0|1|2|null,"favorite":true|false|null}`（登录后才带互动态）。
- `like` / `coin` / `favorite`：`{"bvid","on"|"count","ok":true,"reason":""}`（`reason` 是 B 站原话，如 `login`）。
- `failed`：`{"action":"history","code":-101,"message":"账号未登录"}`（`-101` 未登录，`-352/-412` 风控，其他为 B 站错误）。UI 用它给空列表一个原因。
- `signIn`：`{"open":true|false}`（登录窗口开关，也可只看 state.signingIn）。

### items 联合类型（带 `kind`）

```jsonc
{"kind":"video","bvid":"BV…","aid":0,"cid":0,"title":"…","cover":"https://…","duration":213,
 "owner":{"mid":0,"name":"…","avatar":"https://…"},"views":100,"likes":1,"pubdate":1700000000}
{"kind":"media","seasonId":47836,"mediaId":0,"epId":826497,"title":"…","cover":"https://…",
 "score":"9.7","indexShow":"全8话","badge":"大会员","seasonType":1,"url":"https://…/ss47836"}
{"kind":"live","roomId":6,"shortId":6,"uid":0,"title":"…","cover":"https://…","uname":"…",
 "face":"https://…","area":"英雄联盟","online":10000,"live":true}
```

## 4. 播放画面（和 YouTube App 一样的方式）

隐藏 WebView 里是 Bilibili 自己的播放器页（`video`/`bangumi/play`/`live`），host 用 CSS 把播放器铺满整页、
隐藏站点其它元素，再由 UI 用 `show{x,y,width,height,crop}` 指定车机屏幕上的矩形，host 把 WebView 显示在
车机页下面这块（`hide` 只隐藏画面，声音继续）。UI 的车机端播放器控件照旧发 `pause/resume/seek/volume/rate`。
番剧/电影/直播走 `play.kind`；`media.kind` 会告诉 UI 当前是什么类型（直播不显示进度条，用 `live`）。

## 5. 点赞/投币/收藏

UI 在 `detail` 的 `like/coin/favorite` 上显示状态，按下后发命令，再按 `like`/`coin`/`favorite` 消息的
`ok/reason` 更新（失败不改 UI 状态）。收藏的文件夹从 `favorites` 取，`favorite` 可带 `mediaId`；不带时用默认收藏夹。

## 6. 伴生程序「账号」页

host 已加（`app/src/main.rs`、`crates/host/src/lib.rs`）：
- Tauri 命令：`bilibili_sign_in`、`bilibili_sign_out`、`bilibili_check`；
- `Status` 字段：`bilibiliSignedIn: boolean | null`、`bilibiliSigningIn: boolean`。

companion UI 的入口已由并行改动补齐（`ui/src/companion/{accounts.ts,useHostStatus.ts,preview.ts,pages/Accounts.tsx,Companion.tsx,room/screen.tsx}`）：
「Bilibili」卡片、扫码登录/退出、`GLOW.bilibili`、preview mock 都在；`tsc -b` 与 vitest 通过。风格与网易云卡片一致：
未登录显示「扫码登录」，登录中显示「请在哔哩哔哩窗口里扫码」，已登录显示「退出登录」。


## 7. 空间音效

和其它播放器一样：`cab_sound.js` 已在页面脚本前注入，host 每 50 ms 下发 speakers/head/outside/menu/equalizer/spectrum，
页面的音源是 Bilibili 播放器的 `<video>`。UI 不需要做任何事；`state.cabLevel` 可用于调试/显示。

## 8. 已知未做 / 风险

- 评论、弹幕：不做（按需求）。
- `space`（UP 主视频列表）与 `dynamic`、`history`、`favorites` 需要登录；未登录时 B 站拒（-101 / -352 / 412），
  UI 会收到 `failed`，请提示「登录后可见」而不是空列表。
- 清晰度/字幕依赖 Bilibili 播放器自身能力：`window.player.setQuality` 不存在时退化为点清晰度菜单；
  字幕用 `/x/player/v2` 列表 + 页面自绘（B 站播放器自己的字幕面板被隐藏），未登录时多数视频字幕为空。
- `search` 的 `page_size`/翻页字段随 B 站调整；失败会以 `failed` 返回。
- 登录窗口内的扫码/跨窗口 cookie 共享需真机实测（见交付报告）；WebView2 profile 独立（`webview2-bilibili`）。
- 本文件未覆盖的 UI 需要（例如投币动画、收藏夹选择弹窗）直接提字段需求，host 侧加消息即可。
