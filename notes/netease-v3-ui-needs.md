# 网易云 v3 车机 UI —— 依赖/协作说明（netease-v3-ui 分身）

> 归属：`ui/src/cabin/apps/netease/` 的**界面文件**（`NeteaseApp.tsx`、`pages.tsx`、`NowPlaying.tsx`、`parts.tsx`、`words.ts`、
> `glyphs.tsx`、`netease.css`，以及本分身新增的 `nav.ts`、`stack.ts`、`sections.ts`、`prefs.ts`、`playback.ts`、
> `ui.test.ts`、`playback.test.ts`）。
> **不归本分身**：`netease.ts`、`preview.ts`、`crates/**`、其它 App、图标、42 语言文件。协议与 store 的字段以
> `notes/netease-v3-protocol.md`（后端分身维护）为准。

## 1. 结论：后端需要补的东西 = 0（在写这份说明时已全部落地）

本 UI 需要的 v3 协议/类型/函数，后端分身在 `netease.ts`、`preview.ts`、`crates/host/src/netease*` 已全部实现，
`ui` 的 `tsc -b` 通过、`vitest`（4 个 netease 测试文件 / 50 个用例）全绿。下面第 2、3 节是**仍需保持**的接口
（后端若改名/删字段，UI 会坏），第 4 节是可选后续。

## 2. UI 从 `netease.ts` 读取的 store 字段

| 字段 | UI 用在哪 |
|---|---|
| `signedIn / signingIn / account` | 侧栏「我的」昵称+头像、未登录提示、个人资料页 |
| `playing / volume / track / trackAt / liked / liking / likeFailure` | 底部播放条、正在播放页、红心（沿用 v2，语义未变） |
| `home` + `homeAsking`（`daily/radar/personal/recommended`） | 首页：每日推荐大卡+歌曲、私人雷达/私人漫游、推荐歌单横滑架 |
| `library` + `libraryAsking`（分组 `title/count/playlists`） | 「歌单」页（创建的歌单/收藏的歌单） |
| `recent` + `recentAsking`（`NeteaseSong`，含可选 `album/playCount`） | 「最近播放」页、歌单页入口 |
| `search` + `searchAsking`（`songs/artists/playlists` + 三个 Total） | 搜索页分区（艺人 > 歌曲 > 歌单） |
| `rankings` + `rankingsAsking`（`NeteaseRanking`） | 「榜单」页卡片（封面/名字/更新频率/曲数/官方） |
| `profile` + `profileAsking`（`NeteaseProfile`） | 「我的」个人资料页（头像/昵称/签名/等级/关注/粉丝/听歌/歌单/加入天数/VIP/背景图） |
| `playlists[id]`（`songs/waiting/failed/meta`） | 歌单详情页、榜单详情页（榜单 id 即歌单 id） |
| `style`、`query`、`lists`、`heard`、`toast` | 皮肤开关、搜索、首页热门词、加载/重试判断、toast |
| `artists[id]`（`NeteaseArtistPage`，含 `description`） | 艺人页 |

## 3. UI 从 `netease.ts` 调用的函数（签名需保持）

- 读：`requestHome(again?)`、`requestLibrary(again?)`、`requestRecent(again?)`、`requestRankings(again?)`、
  `requestProfile(again?)`、`searchFor(query)`、`setQuery(q)`、`setStyle(style)`、`showToast(text)`。
- 详情页「确保有数据/重试」：`retryPlaylist(id)`、`retryArtist(id)`、`retryRanking(id)`
  （UI 打开页面时即调用；不 push `views`，UI 用不到 `openPlaylist/openArtist/openRanking/openRecent`）。
- 播放：`playFound(song)`、`playSong(playlistId, song)`、`playPlaylist(id)`、`playDaily()`、`playPause()`、`skip(±1)`、
  `seek(s)`、`setVolume(share, done?)`、`setLiked(liked)`、`positionOf(track, playing, at, now?)`、`useNow(playing)`、
  `useIsPlaying(song)`。
- 元数据：`usePlaylistMeta(id)`、`useRankingMeta(id)`、`useArtistMeta(id)`、`accountOf(state)`、`songKey(song)`、
  `IDLE_ASKING`、`SEARCH_FIELD`、`useNetease`、`useNeteaseBridge`。
- 类型：`NeteaseList/Song/Track/Home/Library*/Artist/Search/Ranking/Profile/PlayerState/PlaylistPage/PlaylistMeta/
  ArtistPage/Asking/Style`。
- 命令（UI 直接发，用于设置页）：`{action:'signIn'}`、`{action:'signOut'}`（经 `netease(cmd)`）。

**UI 不再使用** `netease.ts` 的导航 API：`tab`、`views`、`openTab`、`goBack`、`openPlaylist`、`openArtist`、
`openRecent`、`openRanking`、`View`。导航已由 UI 自己的 `stack.ts` + `nav.ts` 承担（见第 5 节）。这些导出保留给
`netease.test.ts` 的既有用例即可，**不要为 UI 改动它们的语义**；后端若在 `openRanking()` 里继续 push `View` 也不影响 UI。

**消息 kind**：`state / home / library / search / recent / rankings / profile / playlist / artist / like` 均由
`netease.ts` 的 `receiveMessage` 解析后写 store，UI 不直接解析消息、不订阅 host 消息（只经 store）。`timing`
只进 host 日志，UI 不需要。

## 4. 可选后续（不阻塞；都属"锦上添花"）

1. **切歌确认/缓冲字段**：若 `state` 能带回"播放确认/缓冲中"的轻量布尔（或把 `timing` 的 `sounding` 阶段透出），
   播放条可把现在 2.4s 的乐观等待改成"真正确认才撤小圆点"。目前 UI 用 `playback.ts` 本地乐观 + 2.4s 超时兜底。
2. **每日推荐卡片封面**：`home.daily` 目前只有 `songs`，没有日期/封面；UI 用日期数字 + 品牌色渐变自绘大卡（不造假图）。
   若后端将来给 `daily.cover`（每日推荐歌单封面），大卡可直接用真图。
3. **榜单官方/特色分组**：`rankings` 已带 `official`，UI 现在只用它打「官方」标签；若产品要分组排列，后端不必改，UI 改即可。
4. **歌曲封面**：`NeteaseSong` 没有单曲封面（`playlist/recent/search` 均无）；点歌瞬间播放条用"按歌名/专辑名绘制的
   封面"顶一下，真实封面随 `state.track.cover` 到达（约 1s）。若后端愿意在 playlist/recent/search 的歌曲里带
   `cover`，乐观更新可立刻显示真封面（优先级低，现在体验可接受）。

## 5. UI 的导航实现（给 lead 集成时看）

- `stack.ts`：纯模型（无 React、无 host），tab × 页面栈 + tab 历史。`openPage(nav, page)` 先在**所有 tab** 的栈里找同一
  页面（`kind:id`）：已开则切到那个 tab 并把其上的页面收起（复用/回退，绝不再压一层）；已在栈顶则原样返回（不重建）。
  `back(nav)`：先弹当前 tab 的栈顶；栈空则回上一个 tab；都没有返回 `null`（返回键置灰）。`goToTab` 点当前 tab 时只把
  其栈清回 tab 首页（不会产生新实例）。
- `nav.ts`：zustand 包装（`useNav`、`openTab/open/goBack`）+ `useCanGoBack()`。
- 层级：tab 根页（首页/歌单/榜单/我的/正在播放/搜索）常驻挂载（保留滚动位置），栈内页（歌单/榜单/艺人/最近播放/设置）只
  挂当前 tab 的栈；播放条与 toast 在 tab 与页面层之外，**切页不会重建播放条**。
- 同一页面单实例的测试：`ui.test.ts`（跨 tab 复用、连点不叠、Back 逐级、tab 历史、搜索分区顺序）。

## 6. 播放的乐观反馈（用户 2026-11-19 追加要求）

`playback.ts`：点歌时先把该曲（标题/歌手/专辑名，封面用绘制版）放进 `useNetease` 的 `track` 并置 `playing:true`、
`liked:null`，歌曲行与播放条立刻切换；后端每秒推来的旧 `state`（还是上一首）会被"按回"新曲，直到它自己报出该曲
（或 2.4s 兜底放手）。Next/Prev 无法预知下一首，只弹 1.4s 的"切歌中小圆点"（`usePlayback.hoping` → `.ne-hop`），
不遮挡、不骨架屏。播放条与页面无关，切页/滚动不阻塞其渲染。测试：`playback.test.ts`（旧 state 不夺回、确认后放手、
不可播不乐观、连点覆盖、Next 标记）。

## 7. 验证状态（本分身交付时）

- `node node_modules/typescript/bin/tsc -b`：通过（0 error）。
- `node node_modules/vitest/vitest.mjs run src/cabin/apps/netease`：4 文件 / 50 用例全过（含后端 `netease.test.ts`、
  `netease.v3.test.ts`，未改动它们）。
- `prettier --check`（UI 自有文件）：通过；`oxlint src/.../netease`：0 error（2 个既有风格 warning：`parts.tsx` 导出
  `clock` 的 fast-refresh 提示、`useSilent` 的 set-state-in-effect，均为 r12 起就有的写法）。
- 浏览器预览自查（`preview.ts` 假数据，E2E 截图在 `../../notes/netease-v3-ui-preview/`）：首页（跟随/红 × 深/浅）、
  榜单列表/详情、歌单页、搜索（艺人置顶）、我的、设置、正在播放、7" 720×480 与窄屏；点歌后 60ms 内播放条标题切换且
  行高亮，切页后播放条 DOM 未被重建。
