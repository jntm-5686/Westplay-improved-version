# 哔哩哔哩车机版 v1 协议（后端 ↔ UI 交接文档）

> 归属：`crates/host/src/bilibili.rs`、`crates/host/src/bilibili.js`、`crates/host/src/lib.rs`（B 站段）、
> `app/src/setup.rs`（账号页）、`crates/host/src/signin.rs`（`signin::BILIBILI`）、本文件。
> UI 侧类型/组件不在本文范围。
>
> 本文所有「实测」都来自本机 **headless Edge 157（Chromium 157）** + CDP 在真实 `bilibili.com` 页面上做的
> 同源/CORS `fetch` 与 DOM/播放器读取，**未登录**（本机没有账号）。实测时间 2026-11-21 19:12–19:40（+08:00），
> 证据片段见 §10。**未实测**的部分（登录成功后的返回、历史、关注动态、大会员番剧正片等）明确标注，按公开协议
> 与页面自身 JS 推断，落地时以真机登录后再验。
>
> 设计目标：**网页是唯一事实源**。数据只用页面同源 `fetch` 拿 JSON，播放只让页面自己的播放器播（不取 playurl、
> 不自己接 `<video>`），车机 UI 自绘。消息风格照 `netease.rs` 的 `{type,kind}` 信封。

---

## 0. 结论速览（先看这个）

| 问题 | 结论 |
|---|---|
| 一个隐藏页够不够 | **不够**。`www.bilibili.com` 能覆盖首页/搜索/视频/番剧/直播首页；**UP 主空间接口只认 `space.bilibili.com` 的页面上下文**（从 www 调 `/x/space/wbi/arc/search` 固定 412），要一个隐藏 iframe。直播播放页是独立站点 `live.bilibili.com`，房间数据/播放地址都内嵌在它的页面里。 |
| wbi 签名 | 标准 mixinKeyEncTab 算法**仍成立**（2026-11 实测：我们算的 `w_rid` 与页面自己请求的 **逐字节相同**）。**Web Crypto 没有 MD5**，必须自带 ~2KB 纯 JS MD5；SHA-256 用不上。 |
| 哪些接口必须 wbi | `x/space/wbi/*`（arc/search、acc/info）、`x/player/wbi/playurl`（实测不签也通，但按签名发更稳）、`xlive` 的 danmu 等。首页 `wbi/index/top/feed/rcmd`、`wbi/search/type` 实测**不签名也返回 0**。 |
| 哪些接口必须 `dm_img_*` | `space` 系（arc/search、acc/info、acc/relation）**必须** 4 个 `dm_img_*` 参数，否则 412。其中 `dm_img_str`/`dm_cover_img_str` = `btoa(WebGL 版本串/渲染器串)` 去掉 `=` 填充；数值段 `dm_img_inter` 可自造（实测 `{"ds":[],"wh":[4229,4249,33],"of":[319,638,319]}` style 任意值都过），4 个都在就行。 |
| 播放 | 三个页面都**自播**，视频页/番剧页自动 `<video>` 播放但 **`muted=true`**（Chromium 自动播放策略），host 必须调页面播放器 `setMuted(false)`+`setVolume()` 才出声，之后 cab_sound 的 Web Audio 抓得到（实测 analyser max≈205 非零）。`window.player` 存在（2026 仍可用），方法齐全。 |
| 直播 | 房间页自动播（muted），`window.livePlayer` 是入口；房间信息/播放地址在 `window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes/roomInfoRes`，**不用调接口**。 |
| 点赞/投币/收藏 | 接口存在、参数可确认（未登录统一 `-101 账号未登录`）。**推荐登录后「点页面按钮」**（视频页 `.video-like/.video-coin/.video-fav`，番剧页 `.toolbar-left .like/.coin/.favorite`），风控/验证码由页面自己扛；接口仅作兜底。 |
| 历史/关注动态 | 需要登录（未登录 `-101`），接口路径已确认，字段按公开协议给了。 |
| 画面怎么显示 | 照 YouTube：`Command::Show{x,y,width,height,crop}` → `view.place/fit` + `view.show(true)`，页面 CSS 把播放器铺满视口（`position:fixed;inset:0;100vw/100vh`，其余 `visibility:hidden`）。视频/番剧/直播都适用。 |

---

## 1. 结构

```
隐藏 WebView（WebView2，OffscreenWebView，profile 用 bilibili 自己的一份，扫码登录共用这份）
└─ 顶层页：https://www.bilibili.com/  （数据 + 视频/番剧播放 + 显示画面）
   ├─ 注入：cab_sound.js + bilibili.js（add_startup_script，每个 document 都跑，含 iframe）
   ├─ 隐藏 iframe: https://space.bilibili.com/   （只给 UP 主空间用；页面里它的脚本自己 fetch 自己 origin 的接口）
   └─ 顶层导航到 https://live.bilibili.com/<room> 播直播（同一 WebView，播完再回 www）
```

- 页面 → host：`window.chrome?.webview?.postMessage({ ... })`（`bilibili.rs` 的 `read_message` 解析）；
  host → 页面：`view.post_json(...)`（WebView2 `PostWebMessageAsJson` 只到**顶层** window，所以顶层 `bilibili.js`
  负责把 `cab`/`space` 命令用 `postMessage` 转发给 iframe，iframe 脚本再 `postMessage` 回顶层）。
- host → cabin 页：`{"type":"bilibili","kind":…}` 明文 JSON；cabin → host：
  `{"type":"bilibili","kind":"command","command":{action…}}`。
- 页面加载完成发 `{"ready":true}`；host 收到后重发「上次的 cab 状态」和 `refresh`（照 `netease.rs`）。
- **iframe 的启动脚本必须按 hostname 自守**：只有 `space.bilibili.com` 的 document 才处理 space 命令，
  其他 origin 直接 `return`。

> iframe 可行性实测：www 页里 `iframe src=space.bilibili.com/216844` 能正常加载（CDP frame tree 有该 frame、
> 其默认 context origin=space.bilibili.com），iframe 内 fetch 自己 origin 的接口 code 0；iframe → 顶层
> `postMessage` 实测顶层能收到。**「AddScriptToExecuteOnDocumentCreated 是否真的注入 iframe」在 CDP 里没验成
> （CDP 的 addScriptToEvaluateOnNewDocument 只对主 frame 生效了），WebView2 官方文档说覆盖所有 frame，落地时先写
> 一个 `if (location.hostname==='space.bilibili.com') postMessage(...)` 自检**（见 §9 待验证）。

---

## 2. 登录（扫码）方案

### 2.1 流程（实测 + 页面自身 JS 佐证）

1. 伴生程序「账号」页点 B 站 → `Command::SignIn` → host 用 `signin.rs` 的 `SignInWindow::open(environment, &signin::BILIBILI)`
   打开 **`https://passport.bilibili.com/login`**（默认就是「扫码登录」tab，页面自己画二维码，**不需要点 tab**）。
2. 二维码是 passport 页自己调接口拿的（实测从 passport 页内 `fetch` 成功）：
   - `GET https://passport.bilibili.com/x/passport-login/web/qrcode/generate`
     → `{"code":0,"data":{"url":"https://account.bilibili.com/h5/account-h5/auth/scan-web?navhide=1&callback=close&qrcode_key=<KEY>&from=","qrcode_key":"<KEY>"}}`
   - 轮询 `GET https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=<KEY>&source=main-fe-header`
     （`source` 可省；实测不带 key 时返回 `data.code:86038 二维码已失效`，带新鲜 key 返回 `86101 未扫码`）
     - `data.code`：`86101` 未扫码 / `86038` 已失效 / `86090` 已扫码待确认 / `0` 成功。
     - 成功时：HTTP 响应头 `Set-Cookie` 下发登录凭据，`data.url` 是**跳转地址**（页面自己的 JS：
       `this.loginSucUrl = t.url || t.redirectUrl || "https://www.bilibili.com"`，`loginSuccess` 之后
       `window.location.replace(loginSucUrl)`）；无 `gourl` 时即 `https://www.bilibili.com/`。
       passport 页支持 `?gourl=`/`?goUrl=` 参数，**我们不需要传**（回首页即可）。
3. 扫码确认后，passport 页自己跳 `https://www.bilibili.com/`；cookie 落在 `.bilibili.com`（同一 WebView2 profile
   共享），隐藏页刷新/导航后 `nav.data.isLogin=true`。
4. host 把隐藏页 `view.navigate(HOME)`，并 `Confirming::start()`；等页面 `state.signedIn=true` 后 `Confirming(false)`
   ——完全照 `netease.rs` 的登录确认流程。

### 2.2 窗口里「怎样算登录成功」（给 `signin::BILIBILI.page_says` 用）

注入脚本（每个 document 都会跑，passport 页跳 www 后也跑）任选其一，**推荐 1+2 双保险**：

```js
// （1）cookie：DedeUserID 不是 HttpOnly，passport 自己的 JS 也在读它（rx.get("DedeUserID")）→ 可读
const signed = () => /(?:^|;\s*)DedeUserID=(\d+)/.test(document.cookie)
// （2）接口：passport 页 → api.bilibili.com 带 credentials 的 nav（CORS 实测可行）
const isLogin = async () => {
  try { return (await (await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' })).json()).data?.isLogin === true } catch { return false }
}
// 每 500ms 看一次；true 就 post({signedIn:true})，之后停
```

- `SESSDATA` 是 **HttpOnly**（JS 读不到，也不该读）；`DedeUserID`、`bili_jct`、`bili_jct` 的 md5（`DedeUserID__ckMd5`）、
  `sid` 可读。登录后 cookies 实测应有：`SESSDATA`、`bili_jct`、`DedeUserID`、`DedeUserID__ckMd5`、`sid`（未登录时
  只有 `buvid3/buvid4/buvid_fp/b_nut/_uuid/bili_ticket/bili_ticket_expires/b_lsid` 这些游客 cookie，已实测）。
- 也可以用 `signin::Site::home` 的地址判断（登录成功会回 `https://www.bilibili.com/…`），但 passport 页在扫码成功
  后可能短暂停留，建议以 `page_says` 为主。
- 登出：`view.delete_cookies()` + `view.navigate(HOME)`（照 NetEase）；B 站没有“退出登录”页面。
- **注意**：隐藏页与登录窗共享同一 `ICoreWebView2Environment`（`view.environment()`），登录即隐藏页登录；
  别给登录窗单独 profile。

### 2.3 登录后页面上的可见信号（DOM 兜底，选择器可能改版）

- 未登录：`.bili-header .right-entry .header-avatar-unlogin-wrap`（视频页/番剧页/直播页都实测有这个），
  里面 `.header-avatar-unlogin-entry`（登录按钮）。
- 已登录（**未实测**，按 bilibili 现有前端）：`.bili-header .header-avatar-wrap` 内 `.bili-avatar`。
- **不要只靠 DOM**：`nav.data.isLogin` + `mid/uname/face` 才是事实源（未登录实测 `nav.code=-101` 但
  `data.wbi_img` 照给）。

---

## 3. wbi 签名 与 dm_img 指纹（bilibili.js 必备）

### 3.1 wbi（2026-11 实测成立，逐字节对照过）

```js
// 1. 取 key：GET https://api.bilibili.com/x/web-interface/nav → data.wbi_img.img_url / sub_url
//    取文件名（去目录、去扩展名）：img_key = 7cd084941338484aae1ad9425b84077c，sub_key = 4932caff0ff746eab6f01bf08b70ac45
//    （key 会随登录/时间变；未登录也给。缓存 10–30 分钟或按需刷新。）
const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
  37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52] // 64 项，2026 未变
const mixinKey = (img, sub) => {
  const raw = img + sub
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i] ?? '').join('').slice(0, 32)
}
// 2. 参数：全部按 key 字典序；值去掉 !'()* 四个字符；encodeURIComponent；追加 wts（秒）
// 3. w_rid = md5(query + mixinKey)   ← 纯 JS MD5（Web Crypto 无 MD5）
```

- 页面示例（`x/space/wbi/arc/search`，我们算出的 `w_rid` 与页面实际请求完全一致，mixinKey=`ea1db124af3c7062474693fa704f4ff8`）：
  `...&dm_img_inter=%7B%22ds%22:[],…%7D&w_rid=49c67d6e6ce9355b1f891aa7151805e3&wts=1795260083`
- **Web Crypto 结论**：`crypto.subtle` 只有 SHA-1/256/384/512，**没有 MD5**，所以 wbi **不能只靠 Web Crypto**；
  在 `bilibili.js` 里带一份标准 MD5（约 2 KB）即可（本机已验证 `md5("abc")=900150983cd24fb0d6963f7d28e17f72`）。
- `wbid`/`w_webid` 这类参数：本机实测的首页/搜索/播放/空间接口**都没有要求**；只有 `live` 的弹幕
  (`getDanmuInfo`) 等才带 wbi。v1 不做弹幕，可不管。
- 哪些接口要签：**统一都签**最省心（多算一次 md5 而已）；实测不签也通的：`index/top/feed/rcmd`、
  `search/type`、`player/wbi/playurl`。

### 3.2 dm_img_* 四个参数（space 系必须）

页面真实请求（实测抓包，`space.bilibili.com` 页面自己发的）：

```
x-bili-locale-json={"c_locale":{"language":"zh","script":"Hans"},"always_translate":false}
x-bili-device-req-json={"platform":"web","device":"pc","spmid":"333.1387","mobi_app":"web_cn"}
dm_img_list=[]
dm_img_str=V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ        ← btoa("WebGL 1.0 (OpenGL ES 2.0 Chromium)") 去掉 '='
dm_cover_img_str=QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2Ug…          ← btoa(WEBGL_debug_renderer_info 的 UNMASKED_RENDERER_WEBGL) 去掉 '='
dm_img_inter={"ds":[],"wh":[4227,4249,33],"of":[319,638,319]}        ← 数值可自造（实测任意数都过），必须存在
```

生成（bilibili.js 里现算，别硬编码——换显卡就变）：

```js
const gl = document.createElement('canvas').getContext('webgl')
const dbg = gl.getExtension('WEBGL_debug_renderer_info')
const b64 = (s) => btoa(s).replace(/=+$/, '')
const dm = {
  dm_img_list: '[]',
  dm_img_str: b64(gl.getParameter(gl.VERSION)),
  dm_cover_img_str: b64(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
  dm_img_inter: JSON.stringify({ ds: [], wh: [4227, 4249, 33], of: [319, 638, 319] }),
}
```

实测：四个都在、字符串格式对 → code 0；去掉任一 / 把字符串换成 `ZmFrZQ` → **412**。`dm_img_inter` 自造值 → code 0。

### 3.3 跨域请求的 Referer（实测：会影响部分接口）

- 页面内 `fetch('https://api.bilibili.com/...')` 默认 Referer 只发 origin（`strict-origin-when-cross-origin`），
  实测 space 页抓到的请求带的是**完整页面 URL**。对 `space`/`dynamic`/`live` 系列建议：
  `fetch(url, { credentials:'include', referrer: location.href, referrerPolicy: 'unsafe-url' })`。
- 实测 `api.bilibili.com` 对这些页面带 cookie 的跨域 GET 是 CORS 开放的（`www`/`space`/`passport` 页都能读响应），
  不需要 `--disable-web-security`（这跟 NetEase 的音频跨域是两回事）。

---

## 4. 数据接口清单（页面内 fetch 实测）

> 通用：全部 `fetch(path, {credentials:'include'})`（CORS 页直接带 cookie）；返回统一信封
> `{code, message, ttl, data|result}`，`code:0` 为成功，`-101` 未登录，`-352`/`412`/`-799` 是风控/限频。
> 封面/头像 URL 常是 `//i0.hdslb.com/...` 或 `http://`，展示前补 `https:` 并统一尺寸（`@480w.webp` 或原图均可）。
> `http://` 图片在 WebView 里会被混合内容拦，**必须把协议换成 https**。

### 4.1 基础 / 首页 / 搜索 / 榜单

| 用途 | 方法 路径（host 用 `api.bilibili.com`） | 参数 | wbi | cookie | 状态 |
|---|---|---|---|---|---|
| 登录态 + wbi key | GET `/x/web-interface/nav` | — | 否 | 有则带 | ✅ code -101（未登录），`data.isLogin`、`data.wbi_img.img_url/sub_url`、`data.uname/face/mid`（登录后） |
| 首页推荐 | GET `/x/web-interface/wbi/index/top/feed/rcmd` | `ps=12&fresh_type=3&feed_version=V8&fresh_idx=1&fresh_idx_1h=1&fetch_row=12&brush=0&homepage_ver=1&web_location=1430650`，翻页 `fresh_idx+1`、`last_yandex_time` | 实测不签也通 | 无 | ✅ 12 条/页 |
| 热搜 | GET `/x/web-interface/search/square?limit=10` | — | 否 | 无 | ✅ `data.trending.list[].keyword` |
| 搜索（视频） | GET `/x/web-interface/wbi/search/type` | `search_type=video&keyword=<urlencoded>&page=1` | 实测不签也通 | 无 | ✅ 1000 条封顶、50 页 |
| 搜索（番剧/影视） | 同上 | `search_type=media_bangumi`（番剧）/`media_ft`（影视） | 同上 | 无 | ✅ `season_id/media_id/index_show/styles` |
| 搜索（直播） | 同上 | `search_type=live` | 同上 | 无 | ✅ 注意结果不是平铺数组：`data.result.live_room[]`（`roomid/uid/uname/uface/title/cover/online/live_status/attentions/tags`）+ `data.result.live_user[]` |
| 搜索（用户） | 同上 | `search_type=bili_user` | 同上 | 无 | ✅ `mid/uname/uface/fans` |
| 排行榜 | GET `/x/web-interface/ranking/v2?rid=0&type=all` | `rid=0` 全站；分区 rid 见门户 | 否 | 无 | ✅ `data.list[]` 同视频对象 |
| 热门 | GET `/x/web-interface/popular?ps=20&pn=1` | — | 否 | 无 | ✅ |
| 在线人数 | GET `/x/web-interface/online` | — | 否 | 无 | ✅ `data.region_count` |

**首页推荐 `data.item[]` 关键字段（中文）**：

```
goto            // "av"=视频, "ad"=广告, "login_card"=未登录插卡, "live"=直播, "ogv"=番剧
bvid, cid, id   // 视频三件套（goto=av 时可用；id 是 aid）
title           // 标题（纯文本）
pic, pic_4_3    // 封面 URL（http，需要换 https）
duration        // 秒
pubdate         // 发布 unix 秒
owner{mid,name,face}   // UP 主
stat{view,like,danmaku} // 播放/点赞/弹幕
rcmd_reason{content}    // 推荐理由（如“71万点赞”）
track_id        // 曝光埋点，上报用；v1 可忽略
// 过滤：goto 只留 av/live/ogv；广告 "ad" 与 "login_card" 丢掉
```

**搜索 `data.result[]` 关键字段**：`type`(video/media_bangumi/live/bili_user)、`bvid`、`aid`、`title`
（**含 `<em class="keyword">` 高亮标签，必须剥 HTML**）、`author`、`mid`、`pic`（`//i0.hdslb.com/...`）、`play`、
`duration`（**字符串 "13:31"**，与首页的秒数不同！）、`pubdate`、`like`、`danmaku`、`description`；
番剧结果还有 `season_id/media_id/index_show/styles`；用户结果 `mid/uname/uface/fans`；
**直播结果不一样**：`data.result` 是对象 `{live_room:[], live_user:[]}`（直播间：`type:"live_room"`、`roomid`、`uid`、
`uname`、`uface`、`title`、`cover`（keyframe 截图）、`online`、`live_status`、`attentions`（粉丝）；用户：
`type:"live_user"`、`roomid`、`uid`、`uname`、`uface`、`live_status`）。

### 4.2 视频（UGC）

| 用途 | 方法 路径 | 参数 | wbi | cookie | 状态 |
|---|---|---|---|---|---|
| 视频详情 | GET `/x/web-interface/view` | `bvid=` 或 `aid=` | 否 | 无 | ✅ `data.title/pic/duration/desc/owner/stat/cid/pages[]`；登录后另有 `data.req_user`（见风险） |
| 分P列表 | GET `/x/player/pagelist` | `bvid=` | 否 | 无 | ✅ `data[]: cid/page/part/duration` |
| 播放地址（**不用**，仅诊断/兜底） | GET `/x/player/wbi/playurl` | `bvid=&cid=&qn=80&fnval=4048&fourk=1&fnver=0` | wbi | 无 | ✅ 未登录 `quality=64`（实际只给 360P~720P 的档；`dash` 有视频/音频轨，`durl:null`） |
| 播放器信息（字幕/互动） | GET `/x/player/v2` | `bvid=&cid=` | 否 | 无 | ✅ 未登录 `need_login_subtitle=true`、`subtitle.subtitles=[]`（**字幕要登录才给**） |
| 相关推荐 | GET `/x/web-interface/archive/related` | `bvid=` | 否 | 无 | ✅ `data[]` 同视频对象（`rcmd_reason` 可为空） |
| 标签 | GET `/x/tag/archive/tags` | `bvid=` | 否 | 无 | ✅ `data[].tag_name` |
| 点赞 | POST `/x/web-interface/archive/like` | body `aid=&like=1`（1 赞 2 取消）`&csrf=<bili_jct>` | 否 | **要** | 未登录 -101（路由存在，参数不报 -400） |
| 投币 | POST `/x/web-interface/coin/add` | body `aid=&multiply=1|2&select_like=0|1&csrf=<bili_jct>` | 否 | **要** | 未登录 -101 |
| 收藏 | POST `/x/v3/fav/resource/deal` | body `rid=<aid>&type=2&add_media_ids=<收藏夹id,逗号>&del_media_ids=&csrf=<bili_jct>&platform=web` | 否 | **要** | 未登录 -101 |

> 视频页实测：`window.__INITIAL_STATE__.videoData` 就是 `/x/web-interface/view` 的 data（bvid/aid/cid/title/pic/
> owner/stat/pages[]），**当前页视频直接用页面全局，不用再请求**；`window.player.getManifest()` 给
> `{aid,cid,bvid,seasonId,episodeId,kind,hasPrev,hasNext}`。

### 4.3 番剧 / 影视（PGC）

| 用途 | 方法 路径 | 参数 | 状态 |
|---|---|---|---|
| 番剧排行 | GET `/pgc/season/rank/web/list?day=3&season_type=1` | `season_type` 1 番剧 4 国创 2 电影 5 电视剧 3 纪录片 7 综艺 | ✅ `data.list[]: season_id/title/cover/rating/rank/badge/stat` |
| 番剧索引 | GET `/pgc/season/index/result?season_type=1&page=1&pagesize=20&st=1&sort=0&type=1` | **`st/sort/type` 必须带**（缺了会 -400）；`st=1` 完结/2 连载 | ✅ `data.total/list[]: season_id/title/cover/index_show/score/is_finish/link` |
| 番剧时间表 | GET `/pgc/web/timeline?types=1&before=6&after=6` | — | ✅ code 0（`data[].episodes[]`） |
| **番剧详情** | GET `/pgc/view/web/season` | `season_id=<ss>`（或 `ep_id=`，两者实测都行） | ✅ **数据在顶层 `result`**（信封是 `{code,message,result}`，**没有 `data` 字段**；读 `data` 会拿到 null）。无需登录、无需页面上下文，UA+Referer 的普通 GET 也通。`result.title/cover/evaluate/media_id/season_id/rating.score/new_ep{desc,title}/episodes[]/section[]` |
| 单集详情 | 无独立接口 | — | ❌ `/pgc/view/web/ep?ep_id=` 实测 **404**（不存在）；用 `season?ep_id=<ep_id>` 拿同一份 `result` 再从 `episodes[]` 里挑 |
| 番剧播放地址（兜底/诊断） | GET `/x/player/wbi/playurl` | `ep_id=&cid=&bvid=&qn=80&fnval=4048&fourk=1&fnver=0` | 未登录给低清/试看（详见风险） |

**`result.episodes[]` 关键字段**：`id`（=ep_id）、`ep_id`、`season_id`、`cid`、`aid`、`bvid`、`title`（"1278"）、
`long_title`（"精彩吠腾的调查"）、`show_title`（"第1278话 …"）、`cover`、`duration`（**毫秒**，如 1489000）、
`badge`（"会员"/"独家"/空=免费）、`badge_info.text`、`link`、`pub_time`、`rights{allow_dm,area_limit}`。
`section[]` 是 SP/预告等（`section_type` 2=SP，`title` 分组名）。

> **番剧页实测**：`window.player.getManifest()` → `{seasonId, episodeId, kind:1, seasonType:1, ...}`；
> 画质 `getSupportedQualityList()` = `[100,80,64,32,16]`，未登录 `realQ=16`（360P），菜单里 720P/1080P 标“登录即享”。
> 换集：host 直接导航 `https://www.bilibili.com/bangumi/play/ep<ep_id>`（整页加载，最稳）；
> `window.player.goto/prev/next` 存在但参数未公开（`episodeStore.goto(r,i,o)`），**不要依赖**。

### 4.4 直播

| 用途 | 方法 路径 | 参数 | 状态 |
|---|---|---|---|
| 直播首页 | GET `api.live.bilibili.com/xlive/web-interface/v1/index/getList?platform=web` | — | ✅ `data.room_list/recommend_room_list[]`（`roomid/title/uname/cover/online/area_name/uid`） |
| 分区列表 | GET `.../xlive/web-interface/v1/index/getWebAreaList?source_id=2` | — | ✅ `data.data[]: id/name/list[]{id,name,parent_name}`（v1 可只做「推荐」不做分区） |
| 房间短号→真号 | GET `.../room/v1/Room/room_init?id=<短号或真号>` | — | ✅ `data.room_id/short_id/uid/live_status/live_time`（未开播 `live_status=0/2`） |
| 房间详情（旧，**-352**） | GET `.../xlive/web-room/v1/index/getInfoByRoom?room_id=` | — | ❌ 实测 -352（页面自己也不用了） |
| 房间详情（新，只给游戏） | GET `.../xlive/open-platform/v1/gameInterface/getInfoByRoom?room_id=` | — | ⚠️ 只返回 `data.game_list`，**不是房间信息** |
| **播放地址** | GET `.../xlive/web-room/v2/index/getRoomPlayInfo` | `room_id=&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8&dolby=5` | ✅ `data.live_status`、`playurl_info.playurl.stream[].format[].codec[]`：`base_url+url_info[].host/extra`（http_stream flv / http_hls m3u8），`g_qn_desc` 画质表（10000 原画/400 蓝光/250 超清/150 高清/80 流畅） |
| 直播首页列表（跨域，注意 Referer） | GET `/xlive/web-interface/v1/second/getList?...` | `platform=web&parent_area_id=&area_id=0&sort_type=online&page=&page_size=` | ❌ 实测 -352（用上面的 index/getList 代替） |

> **v1 推荐**：直播**不用调这些接口**。host 导航隐藏页到 `https://live.bilibili.com/<room_id>`，页面内：
> `window.__NEPTUNE_IS_MY_WAIFU__.roomInitRes.data` = `{room_id, short_id, uid, live_status, live_time, playurl_info:{playurl:{stream[]…}}}`
> （**含播放地址**，页面自己播）；`roomInfoRes.data` = `{room_info{title,cover,online,area_name,parent_area_name,uid,tags},
> anchor_info{base_info{uname,face,uid}}, watched_show{num}}`；播放器 `window.livePlayer`（见 §5.3）。
> 直播首页/列表用上面的 `index/getList`（从 www 页面 fetch 实测 200）。

### 4.5 UP 主空间（**必须在 space.bilibili.com 的 document 里 fetch**）

| 用途 | 方法 路径 | 参数 | 状态 |
|---|---|---|---|
| 视频列表 | GET `api.bilibili.com/x/space/wbi/arc/search` | `pn=1&ps=30&tid=0&special_type=&order=pubdate&mid=<mid>&index=0&keyword=&order_avoided=true&platform=web&web_location=333.1387` + 上面 4 个 `dm_img_*` + `x-bili-locale-json` + `x-bili-device-req-json` | ✅ 在 space 页内 code 0（本机 862 条）；www 页 **412** |
| UP 资料 | GET `.../x/space/wbi/acc/info` | `mid=&platform=web&web_location=1550101&token=` + dm_* | ✅ space 页 code 0：`name/face/sign/level/mid`（旧接口 `/x/space/acc/info?mid=` 也会被 -799 限频） |
| 关注/粉丝数 | GET `.../x/relation/stat?vmid=<mid>` | — | ✅ 任意 origin：`following/follower`（无需 wbi） |
| 空间动态 | GET `.../x/polymer/web-dynamic/v1/feed/space` | `host_mid=&offset=&timezone_offset=-480&features=itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote` | ✅ 从 www 页可（13 条），**必须带 features**，否则可能给 0 条；`data.items[]/offset/has_more` |

`arc/search` 返回字段（中文）：

```
data.page.count          // 投稿总数
data.list.vlist[]        // 视频：bvid/aid/title/pic/length("09:40" 字符串)/play/created(unix)/author/mid/description
data.list.tlist[]        // 合集/系列（有则给）
```

> 风控：space 系列**又严又限频**（实测连续几次后 `-799 请求过于频繁` / `-352 风控校验失败` / `412` 页面）。
> 方案：只在打开 UP 主页/用户翻页时请求，**缓存**，失败退避几秒；不要轮询。

### 4.6 历史 / 收藏夹 / 关注动态 / 收藏操作

| 用途 | 方法 路径 | 参数 | 状态 |
|---|---|---|---|
| 历史 | GET `/x/web-interface/history/cursor` | `max=0&view_at=0&business=`（翻页用响应 `data.cursor.{max,view_at,business}`） | 未登录 -101（需登录）；返回 `data.list[]: title/cover/author_name/author_mid/view_at(秒)/progress(秒)/duration(秒)/videos/bvid(在 history.bvid)` + `data.cursor` |
| 我的收藏夹 | GET `/x/v3/fav/folder/created/list-all?up_mid=<mid>` | — | 未登录对**别人**可读（实测 8047632 拿到 4 个：`{id,fid,title,media_count}`）；对自己要登录；`data:null` = 对方隐私 |
| 收藏夹内容 | GET `/x/v3/fav/resource/list` | `media_id=&pn=1&ps=20&platform=web` | ✅ 公开可读：`data.info{title,cover,media_count,upper}`、`data.medias[]: id,type(2=视频),title,cover,duration(秒),bvid,intro,upper{mid,name},cnt_info{play,danmaku,collect},link` |
| 关注动态 | GET `/x/polymer/web-dynamic/v1/feed/all` | `type=all&page=1` | 未登录 -101（需登录） |
| 点赞/投币/收藏 | 见 §4.2 | 需 `bili_jct` 作 csrf | 需登录 |
| 关注 UP | POST `/x/relation/modify` | body `fid=<mid>&act=1&re_src=11&csrf=` | 需登录（未实测，按公开协议） |
| 追番 | POST `/pgc/web/follow/add` | body `season_id=&csrf=`（取消 `/pgc/web/follow/del`） | 需登录（未实测） |

**关注动态 `data.items[]` 关键字段**（space 动态实测结构，登录后的 `feed/all` 同构）：
`id_str`、`type`（`DYNAMIC_TYPE_AV` 视频 / `DYNAMIC_TYPE_DRAW` 图文 / `DYNAMIC_TYPE_FORWARD` 转发 / `DYNAMIC_TYPE_LIVE_RCMD` 直播）、
`modules.module_author{name,face,pub_ts,pub_time}`、`modules.module_dynamic.desc.text`、
`modules.module_dynamic.major.type`（`MAJOR_TYPE_ARCHIVE`/`MAJOR_TYPE_OPUS`/`MAJOR_TYPE_LIVE_RCMD`…）、
`major.archive{bvid,aid,title,cover,stat{play,danmaku},duration_text}`、`modules.module_stat{like,comment,forward}`。
（**登录后才实测**：`feed/all` 未登录被 -101 拦，无法验证登录态字段，落地时补。）

---

## 5. 播放器与页面桥（不取 playurl，让页面自己播）

### 5.1 视频页 `https://www.bilibili.com/video/<BV…>/`

- DOM（实测）：`<video>` 在 `div.bpx-player-video-area > div.bpx-player-video-perch > div.bpx-player-video-wrap > video`，
  `src` 是 **blob（MSE）**；页面自动播放（实测 `paused:false`）且 **`muted:true`**；`bwp-video` 不存在（0 个）。
- 页面全局：`window.player` **存在**（`typeof object`），不是 B站老 `window.player` 播放器对象，而是新版
  `BilibiliPlayer`（内部 `n.qualityStore/portStore/…`），**方法齐全**：
  - 播放：`play()`、`pause()`、`seek(seconds)`、`isPaused()`、`isEnded()`、`isSeeking()`
  - 时间/体积：`getCurrentTime()`、`getDuration()`、`getVolume()`、`setVolume(0..1)`、`getMuted()`、`setMuted(bool)`、`getPlaybackRate()`、`setPlaybackRate(0.25..2)`
  - 画质：`getQuality()`（返回 `{realQ:16,…}`，**真实在播的 qn 在 `realQ`**）、`getSupportedQualityList()`（如 `[80,64,32,16]`）、`requestQuality(qn)`（源码 `qualityStore.requestQuality(r,i)`；未登录切高清会弹登录）
  - 当前视频：`getManifest()` → `{aid,cid,bvid,seasonId,episodeId,kind,quality,hasPrev,hasNext}`
  - 字幕：`player.subtitle` 只有 `willShowBubble/downloadLog/setDebugMode`（**字幕轨不在播放器里**，走 `/x/player/v2` 的
    `data.subtitle.subtitles[]`，字段 `subtitle_url`（JSON 字幕文件）、`lan/lan_doc`；**未登录拿不到**，登录后实测待补；JSON 字幕自己做渲染）
  - 弹幕/互动/收藏面板：`player.danmaku{open,close,isOpen,send}`、`player.episode{…}`、`player.auxiliary{…}`（v1 不用）
  - 其它：`mediaElement()`（返回 `<video>`）、`reload()`、`setAutoplay(bool)`、`setLoop(bool)`
- `window.__INITIAL_STATE__` 有 `videoData`（同 view 接口 data）、`upData`、`related`、`tags`、`player`、`corePlayer` 等。
- DOM 选择器（实测，登录/点赞状态）：看 §6。

**播放流程（推荐）**：`Command::OpenVideo{bvid}` → `view.navigate("https://www.bilibili.com/video/<bvid>/")` →
等 `ready` → 等 `window.player` 与 `<video>` 出现（轮询 250ms）→ `player.setMuted(false)` + `player.setVolume(音量)` +
`player.play()`（页面自己已经自动播，`play()` 只是保险）→ 每 250ms/1s 上报 state（见 §7）。
切下一个视频 = 再导航一次（整页加载 1–3s，可接受；实测页面内部没有公开的「换视频」API）。

> 自动播放策略：页面自己**静音自播**（Chromium 允许 muted autoplay），host 的 `setMuted(false)` 在 WebView2 里
> 大概率允许（Chrome 对“已在播的 muted 元素解除静音”不拦；本机 headless + CDP `userGesture:true` 下已实测成功）。
> **兜底**：若 WebView2 拦，起 WebView 时加 `--autoplay-policy=no-user-gesture-required`（`OffscreenWebView::new_with_arguments`，
> 和 NetEase 用 `--disable-web-security` 同一个位置）。落地时先试不加，不行再加。

### 5.2 番剧页 `https://www.bilibili.com/bangumi/play/ss<season_id>` 或 `/ep<ep_id>`

- **同一套 bpx 播放器与同一批选择器**（实测 `<video>` 选择器完全一样、`window.player` 同 API）。
- 自动播放：实测**自动播且 `muted:true`**（和解禁后 `muted:false` 都抓到过；页面自身行为），host 同样
  `setMuted(false)+setVolume+play()`。
- 当前集：`player.getManifest().episodeId/seasonId`；标题在 `.bpx-player-top-title`（"第1话 云霄飞车杀人事件"）。
- 选集面板：`.bpx-player-ctrl-eplist`（点开是 `PlayerEpisodePanel_*` 的 **hash class**，随时会变），
  **不要读 DOM 当数据**：选集列表用 `/pgc/view/web/season` 的 `result.episodes[]` 自绘；
  点某一集 = host 导航 `/bangumi/play/ep<ep_id>`。
- 画质：`getSupportedQualityList()` 未登录 `[100,80,64,32,16]`；`realQ=16`（360P），720P/1080P 要登录，
  “智能修复/1080P高码率”要大会员；**大会员番剧未登录只能试看/低清**。
- 点赞/投币/收藏按钮选择器与视频页不同：`.toolbar-left` 下三个 `span.like / span.coin / span.favorite`（见 §6）。
- 番剧页 `window.__INITIAL_STATE__` 实测为 `null`（新版页面不挂），数据走 `/pgc/view/web/season`。

### 5.3 直播页 `https://live.bilibili.com/<room_id>`

- 结构：`div#live-player-ctnr > div#live-player.live-player-mounter > video#video-<数字>`；`src` 是 blob；
  自动播且 `muted:true`；`duration=Infinity`；页面无 bpx。
- 页面全局：
  - `window.__NEPTUNE_IS_MY_WAIFU__` = `{roomInitRes, roomInfoRes, userLabInfo, experimentalPlayerOptions}`：
    `roomInitRes.data` 含 `playurl_info`（播放地址，`stream[].format[].codec[]`），`roomInfoRes.data.room_info/anchor_info/watched_show`（见 §4.4）；
  - `window.livePlayer`（实测存在，v3.11.x）：
    `play()`、`pause()`、`mute(bool)`、`volume(0..1)`、`getVideoEl()`、`switchQuality(qn)`、`switchQualityAsync(qn)`、
    `getPlayerInfo()`（→`{playingStatus, liveStatus, quality:"250", qualityCandidates:[{qn:"10000",desc:"1080P 原画"},…], volume:{value:60}, playurl, …}`）、
    `reload()`、`sendDanmaku(text)`、`getAudioTracks()`、`destroy()`、`on/once`。
- **房间数据不用调接口**（见 §4.4）；播放 = 导航到房间页让页面自播。
- 画质：`livePlayer.getPlayerInfo().qualityCandidates`（实测当前 250 时 `[10000 原画, 250 超清]`）；
  切 `livePlayer.switchQuality(250)`/`switchQualityAsync(10000)`（未登录 10000 可能弹登录）。
- 特殊赛事页：如 `/7734200` 是「英雄联盟 S16」活动页，**播放器在 iframe** `https://live.bilibili.com/blanc/<room>?liteVersion=true`。
  普通房间没有 iframe。**维护风险**：CSS「隐藏一切只留播放器」时要把 iframe 留出来（见 §9）。
- 控制 UI：`#player-minimal-panel-vm .control-btn.pause/.resume/.reload`（鼠标移入才显示）；
  v1 不需要点它，直接调 `livePlayer`。

### 5.4 画面显示（照 YouTube 的「洞」）

- 页面 CSS（`bilibili.js` 注入）。本机实测：把播放器容器 `position:fixed;inset:0;width:100vw;height:100vh` 后，
  视频页/番剧页/直播页的播放器都能铺满视口（500×320 的 headless 视口里 `.bpx-player-container`、`#live-player`、
  `<video>` 均填满）。下面的 `body * {visibility:hidden}` + 只显示播放器是照 youtube.js 的成熟写法（YouTube 已验证，
  B 站这版**建议先按 visibility 写**，若播放器不显示就退回“逐个 display:none 站点外壳”的写法）：
  ```css
  html, body { background:#000 !important; overflow:hidden !important; }
  body * { visibility: hidden !important; }
  /* 视频/番剧：只留 bpx 播放器 */
  .bpx-player-container, .bpx-player-container * { visibility: visible !important; }
  .bpx-player-container { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2147483647 !important; background:#000 !important; }
  .bpx-player-video-wrap video, .bpx-player-video-area video { width: 100vw !important; height: 100vh !important; object-fit: contain !important; }
  /* 直播：只留 #live-player（含其 iframe 的容器） */
  #live-player, #live-player * { visibility: visible !important; }
  #live-player { position: fixed !important; inset: 0 !important; width:100vw !important; height:100vh !important; z-index: 2147483647 !important; }
  ```
  番剧页同样有效（实测 `#live-player`/`.bpx-player-container` 都填满视口）。`crop`（Dashboard 小窗）用
  `object-fit: cover`（照 youtube.js 的 `html.westplay-crop` 做法）。
- host 命令 `Show{x,y,width,height,crop}`：`view.place()` + `view.show(true)`；小窗（宽 < 页面宽/2）用 `view.fit()`
  缩放整页（照 youtube.rs 的 `Command::Show`）；`Hide` 只停止显示，播放继续。
- **视频/番剧播放时页面必须是 www 的那个页面**（导航到具体视频页），所以「洞」显示的就是播放器本身。

### 5.5 车内喇叭（cab_sound.js）

- 照 youtube.js 第 648 行附近：
  ```js
  // bilibili.js 顶层（www 页）：
  const cab = window.westplayCabSound(() => document.querySelector('.bpx-player-video-wrap video'), (message) => window.chrome?.webview?.postMessage({ spectrum: message }))
  // 直播页：
  const cabLive = window.westplayCabSound(() => document.querySelector('#live-player video'), (say) => window.chrome?.webview?.postMessage({ spectrum: say }))
  ```
  `cab_sound.js` 每 400ms `tick()` 会重新 `wire()`（换视频/换页后自动接新 `<video>`），host 只要保证
  `video` 播且**非静音**（muted=true 时 analyser 全 0，实测）。
- **实测**：页面自己**不建** `createMediaElementSource`（在 document-start 挂钩，页面一次都没调），所以我们
  `createMediaElementSource(video)` 可用；页面切视频会换 `src`（同一个 element，MSE 重新 load），不影响。
  万一页面以后也接了 Web Audio，`createMediaElementSource` 会抛 “already connected”，cab_sound 的 `wire()` 有 try/catch
  （会静默退化成本页声音），属于风险项（见 §9）。
- 音量：**只用 `player.setVolume`/`livePlayer.volume` 设页面音量**，cab_sound 只做空间化；不要同时改 `<video>.volume`
  （页面自己会覆盖）。

---

## 6. 页面 DOM 选择器（2026-11 实测；只当兜底，能走接口/播放器 API 就不点 DOM）

| 用途 | 选择器 | 备注 |
|---|---|---|
| 播放器 `<video>`（视频/番剧） | `.bpx-player-video-wrap video` | 只有 1 个；src 是 blob |
| 播放器容器 | `.bpx-player-container`、`.bpx-player-primary-area`、`.bpx-player-video-area` | 铺满用 |
| 页面标题（视频页） | `h1.video-title` | 优先用 `__INITIAL_STATE__.videoData.title` |
| 标题（番剧页） | `.bpx-player-top-title` | "第N话 xxx"；正式标题用 season 接口 |
| UP 主（视频页） | `a.up-name` | 优先接口 `videoData.owner` |
| UP 主（直播页） | `a.anchor-username` | 文本被截断（"宥宥y..."），用 `__NEPTUNE…roomInfoRes` |
| 点赞按钮（视频页） | `.video-like`（计数 `.video-like-info`） | 已赞时同元素 `on` 类（登录后）；**建议走接口** |
| 投币按钮（视频页） | `.video-coin`（计数 `.video-coin-info`） | |
| 收藏按钮（视频页） | `.video-fav`（计数 `.video-fav-info`） | |
| 点赞/投币/收藏（番剧页） | `.toolbar-left .like` / `.coin` / `.favorite` | 只读计数 OK，点它会弹登录/收藏面板 |
| 播放/暂停按钮 | `.bpx-player-ctrl-play` | 播放状态看 `player.isPaused()`，别读 class |
| 画质菜单 | `.bpx-player-ctrl-quality` + `.bpx-player-ctrl-quality-menu-item` | 菜单项文本带“登录即享/大会员”后缀；切画质优先 `player.requestQuality(qn)` |
| 倍速 | `.bpx-player-ctrl-playbackrate` / `.bpx-player-ctrl-playbackrate-result` | 优先 `player.setPlaybackRate` |
| 字幕 | `.bpx-player-ctrl-subtitle` | 未登录实测“暂无字幕/登录可享”；字幕数据走 `/x/player/v2` |
| 弹幕开关 | `.bpx-player-dm-switch` | v1 可强制关弹幕（`player.danmaku.close()`） |
| 登录状态（未登录） | `.bili-header .header-avatar-unlogin-wrap` | 已登录预计 `.header-avatar-wrap`（**未实测**）；事实源用 nav API |
| 直播 `<video>` | `#live-player video` | id 形如 `video-7583750957698022`，用 `#live-player video` 即可 |
| 直播控制条 | `#player-minimal-panel-vm .control-btn.pause/.resume/.reload` | 悬停才显示；v1 不用 |
| 番剧选集（**别用**） | `.bpx-player-ctrl-eplist`、`PlayerEpisodePanel_episodeRow__X_Ee2` | hash class 天天变；选集走 season 接口 |

---

## 7. 协议草案（host ↔ UI，`{type:"bilibili",kind:…}`）

### 7.1 命令：cabin 页 → host

```jsonc
{ "type": "bilibili", "kind": "command", "command": { "action": "…", "…": "…" } }
```

| action | 字段 | 含义 | 回 kind |
|---|---|---|---|
| `start` | — | 启动隐藏页（打开 B 站 App 时） | `state` |
| `signIn` | — | 打开 B 站扫码登录窗（伴生窗口） | `state`(signingIn) |
| `signOut` | — | 清 cookie、回首页、重新加载 | `state` |
| `openVideo` | `bvid`（必填，`BV…`）；`start`（可选，秒） | 导航到视频页并让页面自己播 | `state`(页面加载后) |
| `openBangumi` | `epId`（优先）或 `seasonId` | 导航 `/bangumi/play/ep…` 或 `/ss…` | `state` |
| `openLive` | `roomId`（数字，短号/真号都行） | 导航 `live.bilibili.com/<roomId>` | `state` |
| `play` | — | 页面播放器继续播（页面自称暂停时才按） | `state` |
| `pause` | — | 暂停（页面自称在播时才按） | `state` |
| `seek` | `seconds`（float，≥0） | 拖进度（直播忽略） | `state` |
| `volume` | `percent`（0–100，整数） | 页面音量（视频/番剧 `player.setVolume`，直播 `livePlayer.volume`） | `state` |
| `rate` | `rate`（0.25–2） | 倍速（直播忽略） | `state` |
| `quality` | `qn`（数字，`0`=自动） | 切画质（视频/番剧 `player.requestQuality(qn)`，直播 `livePlayer.switchQuality(qn)`） | `state` |
| `show` | `x,y,width,height`（帧像素），`crop`（bool） | 在车机 UI 的洞处显示画面（host 的 `Show`） | — |
| `hide` | — | 停止显示（播放继续，声音继续） | — |
| `home` | — | 首页推荐（`index/top/feed/rcmd`） | `home`（先 `homeShelf` 再 `homeFeed`） |
| `search` | `query`（≤60 字）、`page`（默认 1）、`type`（`video`/`bangumi`/`live`/`user`，默认 `video`） | 搜索 | `search` |
| `hotSearch` | — | 热搜词 | `hotSearch` |
| `ranking` | `rid`（默认 0） | 排行榜 | `ranking` |
| `bangumiRank` | `seasonType`（默认 1）、`day`（3） | 番剧排行 | `bangumiRank` |
| `bangumiIndex` | `seasonType`、`page`、`st`、`sort`、`type` | 番剧索引 | `bangumiIndex` |
| `openBangumiDetail` | `seasonId` | 番剧详情（含选集） | `bangumi` |
| `openVideoDetail` | `bvid` | 视频详情（详情/相关/标签） | `video` |
| `liveHome` | — | 直播推荐列表 | `liveHome` |
| `history` | `cursor`（可选，上一页的 `cursor` 原样带回） | 历史（**需登录**） | `history` |
| `favorites` | `mid`（可选；缺省=自己，需登录） | 收藏夹列表 | `favorites` |
| `favoriteList` | `mediaId`、`page`（默认 1） | 收藏夹内容 | `favoriteList` |
| `dynamicFeed` | `page`（默认 1） | 关注动态（**需登录**） | `dynamic` |
| `upProfile` | `mid` | UP 资料 | `up` |
| `upVideos` | `mid`、`page`（默认 1）、`order`（`pubdate`/`click`/`stow`） | UP 视频列表（走 space iframe） | `upVideos` |
| `upDynamic` | `mid`、`offset`（可选） | UP 空间动态 | `upDynamic` |
| `like` | `aid`、`on`（bool） | 点赞/取消（**建议改为点页面按钮**，见 §8） | `like` |
| `coin` | `aid`、`count`（1/2）、`alsoLike`（bool） | 投币 | `coin` |
| `favorite` | `aid`、`addMediaIds`（数组）、`removeMediaIds`（数组） | 收藏/取消 | `favorite` |
| `follow` | `mid`、`on`（bool） | 关注 UP（未实测） | `follow` |
| `followBangumi` | `seasonId`、`on`（bool） | 追番（未实测） | `followBangumi` |
| `cab` | 见 §7.3（host 内部本来就直接调 `Netease::cab` 那套，不经过 UI） | — | — |
| `refresh` | — | 重读状态 | `state` |
| `close` | — | 关掉隐藏页（App 退出） | — |

- host 只放行合法 id：`bvid` 用 `/^BV[0-9A-Za-z]{10}$/`，`aid/epId/seasonId/roomId/mid/mediaId` 1–20 位数字，
  `search.query` 非空 ≤60 字，`seek/rate/volume/qn` 有限数；不合法的丢弃不下发（照 `netease.rs`）。
- `page` 上限 50（B 站搜索 50 页封顶），`ps` host 侧定（首页 12、搜索 20、UP 30、收藏 20）。
- 直播页只有 `play/pause/volume/quality` 有意义；`seek/rate` host 直接忽略。

### 7.2 消息：host → cabin 页

统一信封 `{"type":"bilibili","kind":…}`。`state` 约每秒/变化即推；数据类是命令的回答。

```jsonc
// kind: "state" —— 播放器与账号状态（约 1s 一次 / 变化即推 / 页面 ready 后立即）
{
  "type": "bilibili", "kind": "state",
  "state": {
    "signedIn": true,                  // 是否登录（null=页面还没说）
    "signingIn": false,                // 登录窗开着且还没确认
    "account": { "mid": "216844", "name": "玩偶菌", "avatar": "https://i1.hdslb.com/…" }, // null=未登录
    "page": "video",                   // video | bangumi | live | home | search | up | ""
    "playing": false,
    "paused": true,
    "position": 42.3,                  // 秒（直播为 0）
    "duration": 590,                   // 秒（直播为 0/省略）
    "volume": 0.8,                     // 0..1（页面播放器音量）
    "muted": false,
    "rate": 1,                         // 倍速
    "quality": 16,                     // 当前 qn（realQ）
    "qualities": [ { "qn": 80, "label": "1080P 高清" }, { "qn": 64, "label": "720P 准高清" } ], // 可选
    "video": {                         // 视频/番剧时
      "bvid": "BV1d5W26QEmZ", "aid": "117597932619671", "cid": "43519444497",
      "title": "仅一集压抑极限！…", "cover": "https://i2.hdslb.com/…",
      "owner": { "mid": "216844", "name": "玩偶菌", "avatar": "https://…" },
      "pageNo": 1, "pages": 1           // 分P
    },
    "bangumi": {                       // 番剧时（替代 video 或并存）
      "seasonId": "33415", "epId": "323085", "cid": "184593713",
      "title": "名侦探柯南（中配）", "epTitle": "第1话 云霄飞车杀人事件", "cover": "https://…"
    },
    "live": {                          // 直播时
      "roomId": "1881597878", "shortId": "0",
      "title": "没见过的类型", "anchor": "宥宥yiio", "anchorMid": "3690980060432428",
      "cover": "https://…", "areaName": "萌宅coser", "online": 4275, "liveStatus": 1
    },
    "like": true,                      // 当前视频是否已赞（null=未知；登录后从页面按钮/接口读）
    "coin": 0,                         // 已投币数（0/1/2；null=未知）
    "favorite": false,                 // 是否已收藏（null=未知）
    "audio": { "elements": 1, "playing": true, "muted": false } // 诊断：声元数/在播/静音（cab_sound 抓不到声时用）
  }
}

// kind: "home" —— 首页推荐（item 字段见 §4.1；只给 UI 要的字段）
{
  "type": "bilibili", "kind": "home",
  "feed": [
    { "goto": "av", "bvid": "BV…", "aid": "…", "cid": "…", "title": "…", "cover": "https://…",
      "duration": 590, "pubdate": 1794402539, "play": 501440, "danmaku": 1454,
      "owner": { "mid": "…", "name": "…", "avatar": "…" }, "reason": "71万点赞" }
  ],
  "more": true                         // 还有下一页
}

// kind: "search"
{ "type": "bilibili", "kind": "search", "id": 7, "query": "原神", "type": "video", "page": 1,
  "pages": 50,
  "items": [ { "kind": "video", "bvid": "…", "aid": "…", "title": "…", "cover": "…", "duration": 811,
               "play": 13347, "danmaku": 169, "owner": { "mid": "…", "name": "…" } } ] }

// kind: "hotSearch" -> { "type":"bilibili","kind":"hotSearch","keywords":["…","…"] }
// kind: "ranking"    -> { "kind":"ranking","rid":0,"items":[ 视频对象(同上) ] }
// kind: "bangumiRank"-> { "kind":"bangumiRank","seasonType":1,"items":[ {seasonId,title,cover,rating,rank,badge,view} ] }
// kind: "bangumiIndex" -> { "kind":"bangumiIndex","seasonType":1,"page":1,"total":4280,"items":[ {seasonId,title,cover,indexShow,score,isFinish} ] }

// kind: "video" —— 视频详情（openVideoDetail 的回答；当前播放页也可从页面全局直接给）
{ "type": "bilibili", "kind": "video",
  "video": { "bvid": "…", "aid": "…", "cid": "…", "title": "…", "desc": "…", "cover": "…",
             "duration": 590, "pubdate": 1794402539, "owner": { "mid": "…", "name": "…", "avatar": "…" },
             "stat": { "view": 501440, "like": 6838, "coin": 518, "favorite": 4526, "danmaku": 1454, "reply": 5140 },
             "pages": [ { "cid": "…", "page": 1, "part": "…", "duration": 590 } ] },
  "related": [ 视频对象 ], "tags": ["新番", "二次元"] }

// kind: "bangumi" —— 番剧详情（openBangumiDetail 的回答，含选集）
{ "type": "bilibili", "kind": "bangumi",
  "season": { "seasonId": "33415", "mediaId": "28228813", "title": "名侦探柯南（中配）",
              "cover": "…", "evaluate": "…", "score": 8.8, "total": -1,
              "newEp": { "desc": "每周六19:30更新", "title": "1280" },
              "payment": { "tip": "大会员专享观看特权哦~" } },
  "episodes": [ { "epId": "323085", "cid": "184593713", "aid": "540491915", "bvid": "…",
                  "title": "第1话 云霄飞车杀人事件", "longTitle": "云霄飞车杀人事件", "cover": "…",
                  "duration": 1494, "badge": "", "link": "https://www.bilibili.com/bangumi/play/ep323085" } ],
  "sections": [ { "title": "SP", "episodes": [ … ] } ] }

// kind: "liveHome"
{ "type": "bilibili", "kind": "liveHome",
  "rooms": [ { "roomId": "32487749", "title": "…", "cover": "…", "anchor": "无限暖暖", "anchorMid": "…",
               "online": 10286028, "areaName": "…", "liveStatus": 1 } ] }

// kind: "history"（需登录；cursor 原样回传）
{ "type": "bilibili", "kind": "history", "items": [ { "bvid": "…", "title": "…", "cover": "…",
  "owner": { "mid": "…", "name": "…" }, "progress": 325, "duration": 590, "viewAt": 1795260000 } ],
  "cursor": { "max": "…", "viewAt": "…", "business": "archive" } }

// kind: "favorites" -> { "kind":"favorites","mid":"…","items":[ {"id":"…","title":"…","mediaCount":10,"cover":"…"} ],"isSelf":true }
// kind: "favoriteList" -> { "kind":"favoriteList","mediaId":"…","title":"…","cover":"…","items":[ 视频对象 ],"more":true }
// kind: "dynamic" -> { "kind":"dynamic","items":[ {"id":"…","type":"DYNAMIC_TYPE_AV","author":{"mid,name,avatar},"text":"…","pubTs":…,"majorType":"…","video":{ 视频对象 } } ],"more":true }
// kind: "up" -> { "kind":"up","mid":"…","name":"…","avatar":"…","sign":"…","level":6,"following":84,"follower":1378259 }
// kind: "upVideos" -> { "kind":"upVideos","mid":"…","page":1,"total":862,"items":[ 视频对象 ],"more":true }
// kind: "upDynamic" -> { "kind":"upDynamic","mid":"…","items":[ 动态对象 ],"more":true }

// kind: "like" / "coin" / "favorite" / "follow" / "followBangumi" —— 操作结果
{ "type": "bilibili", "kind": "like", "aid": "…", "on": true, "ok": true, "count": 6840, "reason": "" }
{ "type": "bilibili", "kind": "coin", "aid": "…", "ok": true, "count": 519, "reason": "" }
{ "type": "bilibili", "kind": "favorite", "aid": "…", "ok": true, "reason": "" }
// ok=false 时 reason 给中文/风控码（"-101 账号未登录" / "-352 风控" / "-111 csrf"），UI 显示提示

// kind: "signin" —— 登录窗开/关
{ "type": "bilibili", "kind": "signin", "open": true, "signedIn": false }
// kind: "error" —— 页面/接口错误（页面加载失败、需登录、风控）
{ "type": "bilibili", "kind": "error", "code": -101, "message": "账号未登录", "action": "history" }
```

### 7.3 cab（host 内部；照 `netease.rs` 的 `Cab` 枚举，不经过 UI）

page 侧收的 JSON（host `post_json`）：

```jsonc
{ "action": "speakers", "speakers": [ … ] }   // 车内喇叭（null=没有，按原声放）
{ "action": "head", "x": 0.0, "y": 0.0, "z": 0.0 }  // 司机头部（Head 的 flatten 字段，照 speakers.rs）
{ "action": "outside", "on": false, "distance": 0 }
{ "action": "menu", "up": false }
{ "action": "equalizer", "bass": 0, "mid": 0, "treble": 0 }
{ "action": "spectrum", "on": true }
```

指令（host → 顶层页 → iframe）：`{ action: "space", commandId, … }` 由顶层转发；iframe 回答用
`{ frame: "space", commandId, … }` 回顶层 → host（或 iframe 直接 `chrome.webview.postMessage`，见 §9 待验证）。

---

## 8. 风险清单 / 维护点（按严重度）

1. **风控（最高）**：B 站对「自动化/未登录/高频」很敏感。实测同一接口连续请求 → `-352 风控校验失败`、
   `412`（返回 HTML 拦截页）、`-799 请求过于频繁`；`space` 的最严。对策：所有请求走页面内（有真实 fingerprint/cookie）、
   统一带 `dm_img_*`、单飞不轮询、失败退避 3–10s、缓存 30–120s、不并发打同一接口。**点赞/投币/收藏建议直接点页面按钮**
   （页面自己带 token/风控参数）：视频页 `.video-like/.video-coin/.video-fav`，番剧页 `.toolbar-left .like/.coin/.favorite`；
   接口只做兜底（`-101` 就转成「请先登录」）。
2. **wbi/mixinKey 表会变**：本机 2026-11 实测算法不变（逐字节一致），但 B 站历史上改过表。把
   `MIXIN_KEY_ENC_TAB`、`nav` 取 key 的逻辑集中在一处；签名失败的典型症状是 `-403/-352/412`，日志里打
   `w_rid/wts/mixinKey` 前 8 位便于排查。
3. **`dm_img_*` 指纹**：字符串必须像真的（`btoa(WebGL 串)` 去 `=`），自造/过短 → 412；`dm_img_inter` 可自造。
   换显卡/换机器要重算（bilibili.js 现算即可）。数值 `wh/of` 建议照页面随机给（本机抓到的形如 `[4227,4249,33]`）。
4. **登录态与大会员/版权**：未登录实测只能 360P（视频 720P 也标“登录即享”）；番剧（柯南等）未登录只有低清/试看，
   大会员内容要 `vip.status`；影视区还有地区限制（`area_limit`）。协议里 **quality 要按 `qualities` 实际可用列表给 UI**，
   未登录隐藏高清选项；不要承诺 1080P。
5. **防盗链**：图片是 `http://` 或 `//`，必须换 `https`；`i0.hdslb.com` 以外还有 `archive.biliimg.com`（也 https 即可）。
   播放地址（playurl）有 `expires`/`sign`/`referer` 校验——**这也是我们不让 UI 直接用 playurl 的原因**，页面自己播最稳。
6. **页面改版**：
   - DOM 选择器集中到 `bilibili.js` 的 `S` 对象（照 netease.js 的写法），一处可修；
   - 番剧选集面板是 hash class（`PlayerEpisodePanel_*`），**别用**，用接口；
   - `window.player` 是页面内部对象，B 站哪天换实现就没了 → 契约点：**只依赖** `play/pause/seek/setMuted/setVolume/
     getCurrentTime/getDuration/isPaused/requestQuality` 这几个；再加一层 `<video>` 元素兜底（play/pause/currentTime 直接可用，
     实测 `video.play()/seek/volume` 也都能用）；
   - 直播特殊赛事页播放器在 iframe（`/blanc/…`），CSS 或控制要兼容（`#live-player` 在顶层，普通房间没事；
     特殊页要按 `document.querySelector('iframe[src*="/blanc/"]')` 单独处理）。
7. **自动播放策略**：页面静音自播，host 解除静音；WebView2 若拦（极少见），加 `--autoplay-policy=no-user-gesture-required`。
   另外**隐藏页被 `view.show(false)` 时不要暂停**（youtube 同样做法），只停止显示。
8. **`--disable-web-security` 不需要**：B 站数据全是 CORS 页面内 fetch；只有 cab_sound 抓音频需要页面内
   `createMediaElementSource`（同源 blob，不受跨域限制）。**不要**照 NetEase 开这个开关（安全面更大）。
9. **登录窗 wasm**：passport 登录成功后会跑 `bili-sc-sdk`（WASM 安全采集），窗口里可能闪一下/多停 1–2s；
   我们的 `page_says` 只看 cookie/nav，不受影响。登录窗建议 520×760（passport 页在这个尺寸下二维码完整）。
10. **限频数字**：搜索 `numPages` 最多 50；首页推荐每页 12；空间 30/页；收藏 20/页；历史 cursor 翻页。
    播放器 `setPlaybackRate` 实测 2 倍可用（B 站 UI 上限 2.0）。
11. **多用户/多窗口**：B 站 cookie 落在 `.bilibili.com`，与「Safari 网页」共用 WebView2 profile 时可能串号；
    B 站单独 profile（`user_data/bilibili`），登录窗用 `view.environment()`（同一 profile）。
12. **协议字段**：`state` 里所有 id 一律字符串；`duration` 秒；封面/头像 https；`duration` 在搜索结果是
    `"13:31"` 字符串、番剧 `episodes[].duration` 是毫秒——**host 规范化后再给 UI**（本文各接口表已注明）。

---

## 9. 待验证（真机/登录后必测）

1. `AddScriptToExecuteOnDocumentCreated` 是否在 **iframe**（space）里执行：**已在单个 CDP 会话里复核为「会」**
   （2026-11-21 19:40：`Page.addScriptToEvaluateOnNewDocument` 的脚本在 `space.bilibili.com/216844` iframe 里运行，
   并 `window.top.postMessage(...)` 到顶层，顶层 `message` 监听器收到 `{westplayFrame:"space.bilibili.com",…,
   via:"document-start-probe"}`）。**之前那次「没跑」是假阴性**：CDP 的脚本注册是**按 CDP 会话**的，我在另一个
   会话里注入、再另一个会话里建 iframe，脚本早已失效。WebView2 的 `AddScriptToExecuteOnDocumentCreated` 与
   CDP 的机制同源（文档：top-level document and all iframes），但真机仍建议留一句自检
   `if (location.hostname === 'space.bilibili.com') chrome.webview.postMessage({frameProbe:true})`。
   兜底：host 用 WebView2 的 frame 级 `ExecuteScript`（`webview.rs` 还没封装，需 `add_FrameCreated`）。
2. iframe 里能否直接用 `window.chrome.webview.postMessage`（还是必须 postMessage 回顶层转发）。
3. 登录成功后：`DedeUserID` 是否可读（已从 passport 自己 JS 佐证可读）、`nav.isLogin`、隐藏页 `signedIn` 确认；
   1080P/大会员画质；`req_user`（view）的点赞/投币/收藏状态字段；`/x/player/v2` 字幕（`subtitle.subtitles[].subtitle_url`）。
4. 点赞/投币/收藏 点按钮后的 DOM 状态（`.video-like.on`?）与接口返回；收藏面板选择夹子。
5. 关注动态 `feed/all`（登录后）的字段与 `offset` 翻页。
6. 直播 `livePlayer.switchQuality` 实际参数（qn 数字 vs 字符串）与未登录切原画是否弹登录。
7. WebView2 的自动播放策略（不加 flag 能否 `setMuted(false)`）、cab_sound 在真实 WebView2 的出声道。
8. 番剧页 `<video>` 在真实 WebView2 的 `object-fit: contain` 表现（CSS 已 headless 验证，真实窗口再确认）。

---

## 10. 实测记录（本机，2026-11-21 19:12–19:40 +08:00，headless Edge 157 / CDP，未登录）

| 时间 | 请求（同源 fetch，api.bilibili.com） | 结果（脱敏） |
|---|---|---|
| 19:13 | `GET /x/web-interface/nav` | 200 `code:-101` `data.isLogin:false`、`data.wbi_img.img_url=…/7cd084941338484aae1ad9425b84077c.png`、`sub_url=…/4932caff0ff746eab6f01bf08b70ac45.png` |
| 19:15 | `GET /x/web-interface/wbi/index/top/feed/rcmd?ps=12…`（带 wbi） | 200 `code:0` 12 条；首条 `goto:"av" bvid:BV1TxxC6vEo4 title:全球笑点下降2000倍而我不变 cid:43205266609 duration:968 owner{mid:5294454,name:逗比的雀巢} stat{view:13262792,like:753217,danmaku:24969} rcmd_reason.content:"71万点赞"` |
| 19:15 | 同上（**不带 wbi**） | 200 `code:0` 6 条（不强制） |
| 19:16 | `GET /x/web-interface/wbi/search/type?search_type=video&keyword=原神` | 200 `code:0` `numResults:1000 numPages:50`；首条 `bvid:BV1eoyhz6Eak title:满命雷神重振雄风 duration:"13:31"` |
| 19:16 | `GET /x/web-interface/ranking/v2?rid=0&type=all`、`/popular`、`/online` | 200 `code:0` |
| 19:16 | `GET /pgc/season/rank/web/list?day=3&season_type=1` | 200 `code:0` 首条 `season_id:33415 title:名侦探柯南（中配） rating:8.8分` |
| 19:16 | `GET /pgc/season/index/result?season_type=1&page=1&pagesize=5&st=1&sort=0&type=1` | 200 `code:0 total:4280`；✅ bili-host 的 -400 是**缺 `st/sort/type`** 或没走 api.bilibili.com |
| 19:17 | `GET /x/web-interface/view?bvid=BV1d5W26QEmZ` + `/x/player/pagelist` | 200 `code:0` `data.cid:43519444497 pages[0].duration:590` |
| 19:17 | `GET /x/player/wbi/playurl?bvid=…&cid=…&qn=80&fnval=4048&fourk=1`（带 wbi） | 200 `code:0` `quality:64 accept_quality:[80,64,32,16] dash.video 6 轨/audio 3 轨 durl:null`；**不带 wbi 也 code:0**（未登录只到 720P 档） |
| 19:17 | `GET /x/player/v2?bvid=…&cid=…` | 200 `code:0` `need_login_subtitle:true subtitle.subtitles:[]` |
| 19:18 | 视频页 `window.player`（headless 播《仅一集…》） | `<video>` 自动播 `paused:false muted:true`；`window.player.play/pause/seek` 均生效；`setPlaybackRate(2)` 后 `getPlaybackRate()=2`、`video.playbackRate=2`；`getSupportedQualityList=[80,64,32,16]`、`getQuality().realQ=16` |
| 19:18 | Web Audio 抓视频声 | 静音时 analyser 全 0；`player.setMuted(false)+setVolume(0.8)` 后 `max=205/nonZero=531`（**cab_sound 可抓**） |
| 19:18 | 质量菜单（未登录） | 720P/1080P 文本“登录即享”，480/360 可选，`自动(360P)` 激活 |
| 19:20 | 番剧页 `/bangumi/play/ss33415` | `<video>` 自动播 `muted:true`；`getManifest{seasonId:33415,episodeId:323085,kind:1}`；`getSupportedQualityList=[100,80,64,32,16]`；`realQ=16`；`setMuted(false)` 后 Web Audio `max=157/nonZero=177` |
| 19:21 | `GET /pgc/view/web/season?season_id=33415` | 200 `code:0`，**顶层只有 `code,message,result`（无 `data`）**：`result.title:名侦探柯南（中配） result.media_id:28228813 result.rating.score:8.8 result.episodes:1281`；19:40 复核：`result.episodes[0]={ep_id:323085,cid:184593713,title:"1",long_title:"云霄飞车杀人事件",duration:1494000(毫秒),badge:""}`；同参数 `?ep_id=323085` 也 200 同一份 result；普通 HTTP GET（仅 UA+Referer、无 cookie）同样返回 result → **不需要页面上下文/登录**；`/pgc/view/web/ep` 404 |
| 19:23 | 直播 `/live/bilibili/1881597878` | `<video id="video-7583750957698022">` 自动播 `muted:true`；`window.livePlayer` 存在（`play/pause/mute/volume/getVideoEl/switchQuality/getPlayerInfo/…`）；`getPlayerInfo().quality:"250" qualityCandidates:[{qn:"10000",desc:"1080P 原画"},{qn:"250",desc:"720P 超清"}]` |
| 19:24 | 直播页 `__NEPTUNE_IS_MY_WAIFU__` | `roomInitRes.data.playurl_info`（含 flv/hls 播放地址）、`roomInfoRes.data.room_info{title:没见过的类型,online:4275,area_name:萌宅coser}`、`anchor_info.base_info{uname:宥宥yiio}` |
| 19:24 | `GET api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=1881597878&…` | 200 `code:0 live_status:1`、`g_qn_desc[10000 原画, 400 蓝光, 250 超清, 150 高清]`、`http_stream flv + http_hls m3u8` base_url+host |
| 19:24 | 旧 `/xlive/web-room/v1/index/getInfoByRoom`、`/second/getList`、`/room/v1/Room/room_init` | 前两个 `-352`（页面自己已改用 `/xlive/open-platform/v1/gameInterface/getInfoByRoom`，只给 game_list）；`room_init` 200 `code:0` |
| 19:25 | `GET /x/web-interface/history/cursor`、`/x/polymer/web-dynamic/v1/feed/all`、点赞/投币/收藏 POST | 全部 `-101 账号未登录`（路由存在；`like` body `aid+like+csrf`、`coin` `aid+multiply+select_like+csrf`、`fav` `rid+type+add_media_ids+del_media_ids+csrf`） |
| 19:26 | `GET /x/v3/fav/folder/created/list-all?up_mid=8047632` | 200 `code:0 data.count:4`；`{id,fid,title,media_count}` |
| 19:26 | `GET /x/v3/fav/resource/list?media_id=4026748432&pn=1&ps=5&platform=web` | 200 `code:0` `data.info{title:B站 × WAIC AI会客厅,media_count:10}`、`data.medias[0]{id,type:2,title,cover,duration:16672,bvid:BV1nB3u6tERu,upper{mid,name},cnt_info{play:1239503}}` |
| 19:27 | space 页 `/space.bilibili.com/216844/upload/video` 的页面自己的请求（CDP 抓包） | `GET api.bilibili.com/x/space/wbi/arc/search?pn=1&ps=40&tid=0&special_type=&order=pubdate&mid=216844&index=0&keyword=&order_avoided=true&platform=web&web_location=333.1387&x-bili-locale-json=…&x-bili-device-req-json=…&dm_img_list=[]&dm_img_str=V2ViR0wgMS4w…&dm_cover_img_str=QU5HTEUg…&dm_img_inter={"ds":[],"wh":[4227,4249,33],"of":[319,638,319]}&w_rid=49c67d6e6ce9355b1f891aa7151805e3&wts=1795260083` → **200** |
| 19:28 | 我们复算 wbi | mixinKey=`ea1db124af3c7062474693fa704f4ff8`，`ourWrid=49c67d6e6ce9355b1f891aa7151805e3` **与页面完全一致**；自签的同一请求（新 wts）→ **200 code:0 data.page.count:862**，首条 `bvid:BV11csp6MEdd length:"09:40" play:278667 created:1794742333` |
| 19:30 | www 页内自签 `space/wbi/arc/search`（同参数 + Referer www） | **412**（HTML 拦截页）→ **space 接口必须在 space.bilibili.com 的 document 里调** |
| 19:31 | iframe（www 里嵌 space.bilibili.com/216844）内自签同一请求 | 200 `code:0 count:862`；iframe→顶层 `postMessage` 实测顶层收到 |
| 19:32 | `GET /x/polymer/web-dynamic/v1/feed/space?host_mid=216844&features=itemOpusStyle,…`（from www） | 200 `code:0` `items:13 has_more:true`（**不带 features 时给 0 条**）；`modules.module_author{name,pub_ts}`、`module_dynamic.major.type` |
| 19:33 | `GET /x/space/wbi/acc/info?mid=216844&platform=web&…+dm_*`（space 页内） | 200 `code:0` `name:玩偶菌 sign:… level:6`；`/x/relation/stat?vmid=216844` → `following:84 follower:1378259` |
| 19:34 | `GET /x/web-interface/search/square?limit=10` | 200 `code:0` 10 个热搜词 |
| 19:37 | passport 页 `/passport.bilibili.com/login`（未登录） | 默认扫码 tab，二维码 `div.login-scan__qrcode img`（data:image/png;base64…）；页面自身请求 `/x/passport-login/web/qrcode/generate` → `{"code":0,"data":{"url":"https://account.bilibili.com/h5/account-h5/auth/scan-web?…qrcode_key=70d2…","qrcode_key":"70d2…"}}` |
| 19:37 | passport 页内 `qrcode/poll` | 无 key → `data.code:86038 二维码已失效`；新 key → `data.code:86101 未扫码` |
| 19:38 | passport 页自身 JS（`index.dffca18c.js`/`942.*.js`） | `qrcode/generate`、`qrcode/poll` 路径；`loginSuccess` → `loginSucUrl = t.url \|\| t.redirectUrl \|\| "https://www.bilibili.com"`，之后 `location.replace(loginSucUrl)`；`handlerUrl()` 读 `route.query.gourl/goUrl` 或 `document.referrer` |
| 19:38 | 登录窗判定依据 | passport 页自身 JS 读 `DedeUserID`（`rx.get("DedeUserID")`）→ **非 HttpOnly 可读**；`nav` 跨域 fetch 从 passport 页可用 |
| 19:17 | wbi 基础 | 纯 JS `md5("abc")=900150983cd24fb0d6963f7d28e17f72` ✅；`mixinKeyEncTab` 64 项未变；**Web Crypto 无 MD5** |

---

## 11. 给 host 实现的落地清单（照抄顺序）

1. `crates/host/src/bilibili.js`：常量与选择器集中；`RT` 运行时；顶层/space-iframe 分支；
   `wbi.js` 部分（md5 + mixinTab + sign）；`dmImg()`；`api()`/`apiPost()`（带 `credentials/referrerPolicy`）；
   页面分支：`videoPage`（www `/video/`）、`bangumiPage`（www `/bangumi/play/`）、`livePage`（live host）、`home`（www 首页）；
   播放器适配：`playerOf()`（window.player / livePlayer / video 元素）、`play/pause/seek/volume/rate/quality`；
   `tell()` 250ms/1s 上报；`CAB` 消息分发（照 netease.js）；`S` 选择器对象；图片 `https` 化；标题剥 `<em>`。
2. `crates/host/src/bilibili.rs`：`HOME="https://www.bilibili.com/"`；`Command`（§7.1）；`Report`（§7.2）；
   `start` 用 `OffscreenWebView::new`（+ `cab_sound.js` + `bilibili.js`）；`command` 校验 id 后 `post_json`；
   `Show/Hide` 照 youtube.rs（`place/fit/show`）；`SignIn` 用 `SignInWindow::open(env, &signin::BILIBILI)`；
   `SignOut` delete_cookies + navigate；`take_reports` 解析 `ready/state/home/…`（照 netease.rs 的 `read_message`）；
   `cab()` 照 netease.rs（speakers/head/outside/menu/equalizer/spectrum）；`menu()`；`failed/close`。
3. `crates/host/src/signin.rs`：`pub const BILIBILI: Site = Site { sign_in: "https://passport.bilibili.com/login",
   title: "Sign in to Bilibili - WestPlay", home: "https://www.bilibili.com/", not_yet: None,
   page_says: Some(include_str!("bilibili_sign_in.js")) }`；`bilibili_sign_in.js` = §2.2 的检测脚本（每 500ms，
   成功后 `post({signedIn:true})` 并停）。
4. `lib.rs`：`mod bilibili;`、`Option<bilibili::Bilibili>`、账号请求 `SignIn/SignOut` 分支、`cab/menu/failed` 调用、
   `take_reports` 转发（照 youtube/netease 段）；UI `ui/src/shared/host.ts` 加 `bilibili` 类型。
5. `setup.rs` 账号页：照网易云段加「哔哩哔哩」一行（头像/名字/已登录/登录按钮/退出）。
6. 真机按 §9 验证 1–8，尤其 iframe 启动脚本与登录态。

---

*本文档只做侦察与协议设计，未改动 `crates/` 与 `ui/` 任何代码；临时脚本在 `tools/tmp/bili-recon/`。*

---

## 12. §7 修正：host 实际实现的协议（事实标准，2026-11-21 交付）

> 本节由 bili-host 追加。**代码以 `crates/host/src/bilibili.rs` / `bilibili.js` 为准**；UI 已按本协议实现
> （`ui/src/cabin/apps/bilibili/bilibili.ts`，`tsc` 与 vitest 通过）。§7 的草案（`openVideo`/`state.video`/`search.query`
> 等）**不采用**，请勿再按它写 UI。字段名均为 camelCase，id 除特别说明外是 **JSON 数字**（不是字符串）。

### 12.1 命令（`{"type":"bilibili","kind":"command","command":{…}}`）

| action | 字段 | 说明 |
|---|---|---|
| `start` / `signIn` / `signOut` | — | 启动/登录窗/清 cookie |
| `home` | `page`（可选，默认 1）、`fresh`（可选，`true` 重新拉第一页并忘掉去重） | 首页推荐 → `home`（带 `page`/`more`） |
| `popular` | — | 热门 → `popular` |
| `ranking` | `rid`（默认 0） | 排行榜 → `ranking` |
| `relations` | `kind`（`followers`/`following`）、`page`（可选，默认 1） | 粉丝/关注列表 → `relations`（需登录；未登录 `failed -101`） |
| `search` | `value`（≤60 字）、`kind`（`video`/`user`/`bangumi`/`movie`/`live`，默认 video）、`page` | → `search` |
| `bangumi` | `seasonType`（1/2/3/4/5/7）、`page` | 番剧/影视索引 → `bangumi` |
| `season` | `value`（`ss…` 或 season id） | 番剧详情 → `season`（见 §12.5 风险） |
| `live` | — | 直播首页 → `live` |
| `history` | `max`、`viewAt`（0/0 起） | → `history`（需登录） |
| `favorites` | — | 收藏夹列表 → `favorites`（需登录） |
| `favoriteItems` | `value`（mediaId）、`page` | → `favoriteItems` |
| `dynamic` | `offset`（首页空串） | 关注动态 → `dynamic`（需登录） |
| `space` | `value`（mid）、`page` | UP 主 → `space`（需登录；space iframe） |
| `detail` | `value`（`BV…`/`av…`） | 视频详情 → `detail` |
| `play` | `value`、`kind`（`video`/`bangumi`/`live`）、`page`（分P） | 导航到 B 站自己的播放页 |
| `pause` / `resume` | — | 播放器自己的暂停/继续；**页面加载中也会幂等生效**（见 §12.6） |
| `next` | — | 播下一个：番剧/影视 → season 选集里的下一集；多P视频 → 下一P；普通视频 → related 的第一个；直播/没有 → `failed`（`action:"next"`），播放保持 |
| `prev` | — | 播上一个：番剧/影视 → 上一集；多P视频 → 上一P；普通视频/直播/没有 → `failed`（`action:"prev"`），播放保持 |
| `seek` | `value`（秒） | |
| `volume` | `value`（0–1） | 会同时解除 B 站自动播放的静音 |
| `rate` | `value`（0.25–2） | |
| `quality` | `value`（qn，`0`=自动；80=1080P…） | `player.requestQuality` / 直播 `switchQuality` |
| `caption` | `track`（字幕 id 或 null） | 字幕由页面自绘（`/x/player/v2` 列表） |
| `like` | `value`（bvid）、`on` | → `like` |
| `coin` | `value`、`count`（1/2）、`like`（是否同时点赞） | → `coin` |
| `favorite` | `value`、`add`、`mediaId`（可选） | → `favorite`；不带 mediaId 用默认收藏夹 |
| `show` | `x,y,width,height,crop` | 显示隐藏页的画面（host 自己的 `Show`） |
| `crop` | `on` | 画面铺满/完整 |
| `hide` | — | 只隐藏画面，播放与声音继续 |
| `close` | — | 关隐藏页（下次命令再启动） |
| `refresh` | — | 重读登录态与状态 |

host 过滤非法 id/越界值（`bilibili.rs` 的 `Command::is_sound`），UI 不必防御。

### 12.2 消息（`{"type":"bilibili","kind":…}`）

- `state`：`{"state": null}` 或
  `{"signedIn":bool, "signingIn":bool, "playing":bool, "volume":0..1, "rate":number, "time":秒, "duration":秒,
    "media":null | {"kind":"video"|"bangumi"|"live", "bvid":string, "aid":number, "cid":number, "epId":number,
    "seasonId":number, "roomId":number, "title":string, "owner":{mid,name,avatar}|null, "cover":string|null,
    "live":bool, "page":number, "pages":number},
    "qualities":[{"qn":number,"label":string}], "quality":number, "qualityLabel":string,
    "captions":[{"id":string,"name":string}], "caption":string|null, "cabLevel":[l,r,db]|null}`
- `account`：`{"account":{"signedIn":bool,"uid":number,"name":string,"avatar":string|null,"following":number,"follower":number}}`
  （`following`/`follower`：关注数/粉丝数，来自 `nav`；未登录为 0）
- `home`：`{"items":[Item…],"page":number,"more":bool}`（`page` 从 1 起；推荐流按 `fresh_idx` 分页，同一流不重复；
  `more=false` 表示这一页没有卡片了）
- `relations`：`{"relationKind":"followers"|"following","page":number,"items":[{"uid":number,"name":string,
  "avatar":string|null,"sign":string}…],"more":bool}`（请求的 kind 原样回；`more` 按本页是否满 20 条判断）
- `popular` / `live`：`{"items":[Item…]}`；`ranking`：`{"rid":number,"note":string,"items":[视频Item…]}`
- `search`：`{"query":string,"searchKind":string,"page":number,"total":number,"items":[Item…],"users":[UserCard…]}`
- `bangumi`：`{"seasonType":number,"page":number,"total":number,"items":[media Item…]}`
- `season`：`{"seasonId":number,"title":string,"cover":string|null,"evaluate":string,"score":string,"badge":string,
  "episodes":[{"epId":number,"cid":number,"bvid":string,"title":string,"indexTitle":string,"cover":string|null,
  "duration":秒,"badge":string}],"sections":[{"title":string,"episodes":[…]}]}`
- `favorites`：`{"folders":[{"id":number,"title":string,"count":number,"favState":number}]}`
- `favoriteItems`：`{"mediaId":number,"title":string,"items":[Item…],"hasMore":bool}`
- `history`：`{"items":[{"bvid","aid","title","cover","owner","duration","progress","viewedAt","live"}…],"max":number,"viewAt":number}`
- `dynamic`：`{"items":[视频Item + {"dynamicId":string,"said":string}…],"offset":string}`
- `space`：`{"mid":number,"name":string,"avatar":string|null,"sign":string,"level":number,"fans":number,
  "videos":number,"items":[视频Item…],"hasMore":bool}`
- `detail`：`{"bvid","aid","cid","title","cover","desc","duration","pubdate","owner",
  "pages":[{"cid":number,"page":number,"title":string,"duration":number}],
  "stat":{"views","likes","coins","favorites","danmaku"},"like":bool|null,"coin":number|null,"favorite":bool|null}`
- `like`：`{"bvid":string,"on":bool,"ok":bool,"reason":string}`；`coin`：`{"bvid","count":number,"ok","reason"}`；
  `favorite`：`{"bvid","on":bool,"ok","reason"}`（`reason` 为 B 站原话/`login`，失败时 UI 不改状态）
- `failed`：`{"action":string,"code":number,"message":string}`（`-101` 未登录、`-352`/`412` 风控、其他 B 站错误；
  UI 用它解释空列表）
- `signIn`：`{"open":bool}`（登录窗开关，`state.signingIn` 同义）
- `showing`：`{"on":bool}` —— **画面层握手**：host 的 WebView 画面真正显示（`true`）或隐藏（`false`）时主动告诉
  车机页；只在变化时发。`true` 只会在页面 `state.ready=true`（video `readyState>=2`）**且** App 已发过 `show`
  之后发；`Hide`/`Play`/`Next`/`Prev`/reload/页面未 ready 时一律 `false`。（UI 用它决定自己的黑底占位什么时候
  可以撤，避免闪黑。）

**Item 联合**（带 `kind`）：`{"kind":"video",bvid,aid,cid,title,cover,duration,owner{mid,name,avatar},views,likes,pubdate}`
/ `{"kind":"media",seasonId,mediaId,epId,title,cover,score,indexShow,badge,seasonType,url}`
/ `{"kind":"live",roomId,shortId,uid,title,cover,uname,face,area,online,live}`。
`UserCard`：`{"mid",name,avatar,sign,fans,videos}`。

### 12.3 与 §7 草案的主要差异

1. 播放不是 `openVideo`/`openBangumi`/`openLive` 三个命令，而是一个 `play{value,kind,page}`。
2. `state` 用 `media` 联合（`time`、`playing`、`quality`…），不是 `position/paused/video/bangumi/live` 分对象。
3. `volume` 是 **0–1**（不是 `percent` 0–100）；`rate` 上限 **2**（B 站播放器）。
4. 搜索用 `value` + `kind`（不是 `query`+`type`）；答案字段 `searchKind`（不是 `type`）。
5. 视频详情 kind 是 `detail`（不是 `video`）；番剧详情 kind 是 `season`（不是 `bangumi`）；番剧索引 kind 是 `bangumi`。
6. 收藏夹内容 kind 是 `favoriteItems`（不是 `favoriteList`）；收藏动作 `favorite{value,add,mediaId}`（不是 addMediaIds 数组）。
7. 没有 `hotSearch`/`bangumiRank`/`upProfile`/`upVideos`/`upDynamic`/`follow`/`followBangumi`（未实现，UI 也没用）；
   UP 主只有 `space`（资料+第一页视频）。
8. 错误 kind 是 `failed`（不是 `error`）；登录窗 kind 是 `signIn`（不是 `signin`）。
9. id 在消息里是 **JSON 数字**（UI 自行 String() 化）；`bvid` 是字符串。
10. （2026-11-21 晚新增）`home` 带 `page`/`fresh` 并回 `page`/`more`；新增 `relations{kind,page}` →
    `relations{relationKind,page,items,more}`；`account` 增 `following`/`follower`。§7 草案没有这三项。

### 12.4 宿主侧已验证与待真机验证

已验证（headless Chrome + 真页面，2026-11-21）：wbi 签名与页面逐字节一致（标准样例 `w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4`）、
首页/热门/排行/搜索/番剧索引/直播首页真实返回、视频页 `window.player`（`getManifest/getQuality.realQ/
getSupportedQualityList/requestQuality/setMuted/setVolume/setPlaybackRate/seek/mediaElement`）、直播页
`window.livePlayer`（`getPlayerInfo` 的 qualityCandidates）、播放/暂停/seek/音量/静音解除/倍速/画质切换、
passport 登录页 QR（`.login-scan__qrcode img`，二维码 URL 在 title 属性里）。**待真机扫码**：登录成功后
cookie 生效与隐藏页刷新、大会员/版权内容清晰度、点赞/投币/收藏（页面按钮兜底）、字幕（登录后才给列表）。

首页推荐分页（2026-11-21 20:5x 真页面复测，`bilibili.js` 更新后）：同一会话 `home` → `home page:2` →
`home page:3` 各 17 条、**互相 0 重复**（`fresh_idx=1/2/3` 的流）；`home fresh:true` 重置到 page 1 并拿到 18 条
新的（service 侧换了批次）；`account`（未登录）带 `following:0,follower:0`；`relations` 未登录 → `failed
{action:"relations",code:-101}`。纯 HTTP（无 cookie）复测 `fresh_idx` 1/2/3 两次也是 20+20+20 零重叠。
**待真机登录**：`relations` 真实粉丝/关注列表（接口 `-101`/`-352` 需登录态）、以及 `account` 的
`following/follower` 真实数字。

`next` / `prev` 与暂停幂等（2026-11-21 21:5x 真页面复测，浏览器里跑实际 `bilibili.js`）：
- 视频页 pause→pause→resume→resume：`playing` false→false→true→true（每次都是幂等）；
- 普通单P视频 `prev` → `failed {action:"prev",code:-400,message:"nothing to play before"}`（播放保持）；
- 普通视频 `next` → 导航到 related 的第一条（`BV1GJ411x7h7` → `BV1NZ4y1j7nw`，标题变化，`state.media.bvid` 更新）；
- 番剧页 `next` → `ep323085` → `ep323086`（同一 season 33415，`state.media.epId` 更新，标题变「第2话…」）；
- **页面加载中发 pause**：导航后 2s 发 `pause`，10s 后 state 仍 `playing:false`（host Outbox 的 transport 意图 + 页面
  每 250ms 的暂停守卫共同保证）。

### 12.5 已知风险

- `space` 依赖「space.bilibili.com 的隐藏 iframe 里的注入脚本」能跑并 postMessage 回来；CDP 上未取证，
  WebView2 真机要自检（若失败，`space` 只会给 `failed`，不影响其它功能）。
- `season` 详情接口在无登录/无页面 fingerprint 时返回 `code:0 data:null`；host 目前以 `failed`（-404）报，
  真机登录后应再验（或改为从 `/bangumi/play/ss…` 页面内读）。
- 风控（-352/412/-799）随时可能出现：host 侧失败即 `failed`，未做轮询；点赞有页面按钮兜底，投币/收藏没有。
- `relations` 的两个接口（`/x/relation/followings`、`/x/relation/fans`）**未登录时**：followings 返回 `-101`、
  fans 返回 `-352`（本机实测）；登录后是否稳定需真机验证，host 失败即 `failed`（UI 显示原因）。
  分页 `more` 按「本页返回满 20 条」判断（接口不总给 total，`followings` 的 `data.list` 满页即还有下一页）。

### 12.6 暂停/继续的幂等（仪表盘按钮）

- host 侧：`Pause`/`Resume` 进 `Outbox` 的 `transport`（`Some(false)`/`Some(true)`），页面未 ready 时作为 held 命令
  按顺序保留；页面 ready 时下发；**之后每次页面重载（play/next 导航）都会重新下发最后一次意图**（不会重复下发
  play 命令本身，避免循环导航）。
- 页面侧：`pausedByApp` 记住 App 的意图；`reportState` 每 250ms 检查——若意图是暂停而播放器在播（例如页面刚加载
  自动播放），立即再 pause；若意图是播放而播放器暂停，则 resume。因此加载中按下的按钮即使被页面自己的自动播放
  覆盖，也会在 250ms 内回到用户要的状态。

### 12.7 自动播放与「闪黑」（host 内部行为，2026-11-21 22:2x）

- **自动播放**：WebView2 环境创建时本来就带 `--autoplay-policy=no-user-gesture-required`（`webview.rs` 的
  `create_environment(..., autoplay: true, ...)`，所有隐藏播放器都有；`Bilibili::start` 的 extra 参数里也显式再写
  了一份 `--disable-web-security --autoplay-policy=no-user-gesture-required`，重复同值无害）。页面侧还有三层保证：
  1. `reportState` 每 250ms 的 `resumeIfWanted()`（`player.play()`）；
  2. 「play 再催」ladder：同一 media 未播放时每 400ms 再 `play()` 一次，最多 8 次（只 play，不导航）；
  3. `visibilitychange` 时若 App 没要求暂停则 `resumeIfWanted()`；解除静音由 `applyPlayback()` 同时做。
  host 侧修了一个关键 bug：`Command::Play`/`Next`/`Prev` 现在会把 Outbox 的 `transport` 置为 `Some(true)`（之前
  暂停过再播新视频时，页面 ready 会收到旧 pause，导致「进入播放页不自动播、按一下播放/暂停才开始」）。
- **闪黑**：host 只有页面自己报 `state.ready=true`（页面 JS 的 `video.readyState >= 2 && !video.error`）后才
  `view.show(true)`；`Show` 先记下矩形、未 ready 时保持 `show(false)`；`Play`/`Next`/`Prev` 立即
  `show(false)`（并清 ready）直到新页面的 video ready；`Hide` 先 `show(false)` 再清位置；`reload` 同样先隐藏。
  这是为「页面首帧全黑」而设：CDP 真页面采样（watch 态、`--autoplay-policy`）显示 0.6s/1.2s/2.0s 三帧
  **100% 黑（mean 0.0, dark 1.0）**，video readyState≥2 在 3.3s、页面 `state.ready` 3.56s、开始播放 3.56s；
  ready 后截图 mean 54.2。即：页面自己在视频就绪前就是纯黑，host 若提前显示就是用户看到的闪黑。
- **握手**：画面层真实显隐变化时另发 `{kind:"showing",on:bool}`（去重），`true` 只在 `state.ready && 已 show`
  后发；`Hide`/`Play`/`Next`/`Prev`/reload/未 ready 时发 `false`。详见 §14.1。
- **番剧「出错啦」**：Chromium LNA（`local-network-access`）在隐藏 WebView2 里是 denied，B 站播放器据此把
  「网络状况异常/本地网络访问权限」错误墙盖在画面上；已用 `--disable-features=LocalNetworkAccessChecks` +
  页面 `navigator.permissions.query` 兜底 + `failed{action:"play"}` 上报修掉，详见 §14.2。

---

## 13. 复核补记（bili-recon，2026-11-21 19:40，纠正 §12.5 的两条）

1. **`season` 详情不是「无登录/无 fingerprint 就 null」——是字段路径错了**。`/pgc/view/web/season` 的信封是
   `{code, message, result}`，**顶层就是 `result`，根本没有 `data` 字段**（读 `data` 得到 `undefined`/null）。
   复核证据：普通 HTTP GET（仅 `User-Agent`+`Referer: https://www.bilibili.com/`，**无 cookie、无页面上下文**）→
   200 `code:0`，`result.title:"名侦探柯南（中配）"`、`result.media_id:28228813`、`result.rating.score:8.8`、
   `result.episodes.length:1281`，`result.episodes[0]={ep_id:323085,cid:184593713,title:"1",
   long_title:"云霄飞车杀人事件",duration:1494000,badge:""}`（duration 毫秒）。`?ep_id=323085` 同样 200 同一份 result；
   `/pgc/view/web/ep?ep_id=` 是 **404**（不存在）。
   → host 的 `season` 命令**不需要**「先导航到 /bangumi/play/ss… 再读页面」，直接读 `answer.result` 即可；
   UI 列表页点开详情也不会打断播放。
2. **iframe 注入脚本「CDP 上未取证」已取证**（见 §9 第 1 条）：单个 CDP 会话内，document-start 脚本在
   `space.bilibili.com` iframe 里运行并成功 `postMessage` 到顶层。之前失败是 CDP 会话级注册造成的假阴性。
   WebView2 真机仍按 §12.5 自检一次即可，风险等级下调。
3. 协议以 §12（bili-host 实现，lead 决定的事实标准）为准；本文件 §7 是最初草案，保留作对照。

---

## 14. 闪黑握手 showing 与番剧「出错啦」修复（bili-host，2026-11-21 22:4x）

### 14.1 showing 握手（补充 §12.2 / §12.7）

- host 新增消息 {type:"bilibili",kind:"showing",on:true|false}，**只在画面层真实显隐变化时**发：
  - 	rue：Show 已执行、**页面报 state.ready=true（video readyState>=2）且 App 要过画面**，host 真正
    iew.show(true) 之后；
  - alse：Hide、Play/Next/Prev（导航中隐藏）、eload、页面未 ready/ready 变 false 等所有回到隐藏的
    转换点；
  - 去重：内部 Showing(Option<bool>) 只记最后告诉 App 的值，相同不重发。
- 实现：ilibili.rs 的 pply_show() -> bool（may_show(ready, asked) 通过才 show）→ 	ell_showing() 推
  Report::Showing(on) → lib.rs 发 showing_message。单测 	ells_the_picture_layer_change_once、
  shows_the_picture_only_once_the_pages_video_is_ready。

### 14.2 番剧播放页「出错啦」：Chromium Local Network Access 权限（阻塞问题根因）

用户实测《MyGO!!!!!》第 1 话（赛季 season_id=73077，ep_id=1183102，第 1 话限免）播放页显示 B 站自己的
「出错啦」：标题/时长都在，画面是错误墙。**headless Chrome + 实际 ilibili.js 复现与定位**：

- 页面本身 200、无跳转；视频元素其实 eadyState=4、playing、时间在走；但 B 站播放器的错误组件
  px-player-error-sign 被激活，文案正是「网络状况异常，请刷新后重试 / 您的浏览器还未开启本地网络访问权限…」。
- 从页面实际加载的 55 个 JS 里定位到播放器 bundle player/main/widgets/npd.779.*.js 的错误组件逻辑：
  
avigator.permissions.query({name:"local-network-access"}) 的 state === "denied" **且**错误详情含
  "cn-sh-office"（B 站 PCDN 域名）时，显示**大错误墙**（而不是小错误条）。
- WebView2（隐藏页）里没人能点「允许本地网络访问」，Chromium 的 LNA 检查默认是 denied → 就会走这条大错误墙；
  普通 headless Chrome 是 "prompt"，所以看起来还正常（实测 permission: prompt、无墙）。
- 复现/验证（CDP，真实 ep 页）：注入 state:"denied" 的 permissions stub 可让播放器进入该逻辑；把
  local-network-access 的 query 改成 granted 后，同一页面 permission:"granted"、视频 ready4 播放中、
  **无 failed、无墙**。

**修复（两层，缺一不可）**
1. **浏览器层**：Bilibili 的 WebView2 启动参数加 --disable-features=LocalNetworkAccessChecks（隐藏页无法授权，
   LNA 检查对播放器的 PCDN 只会误伤）。webview.rs 的 create_environment 现在会把 extra 里的
   --disable-features= 与自身已有的 CalculateNativeWinOcclusion **合并成一个 switch**（Chromium 只认一个
   disable-features，后写的会覆盖前者），并有单测 keeps_a_pages_own_chromium_features_off_beside_ours；
   ilibili.rs 传入 --disable-web-security --disable-features=LocalNetworkAccessChecks。
2. **页面层兜底**：ilibili.js 在站点脚本之前把 
avigator.permissions.query({name:"local-network-access"})
   答为 granted（只改这一个 name，其它权限透传）。即使将来 Edge 改了 feature 名，播放器也不会再因
   denied 显示 LNA 错误墙。
3. **失败上报**：ilibili.js 检测播放器错误墙（px-player-error-sign-active 等）或整页 出错啦 标题，
   每次播放上报一次 {kind:"failed", action:"play", code, message}（code 取错误码区，缺省 -1；message 为
   B 站原文，截 160 字），车机页可提示并返回列表，而不是只留错误页。实测：人为激活错误墙后收到
   {"failed":{"action":"play","code":-1,"message":"网络状况异常，请刷新后重试 …"}}，正常播放时 **无 failed**。
- 注：大会员集仍按 B 站限制（未登录不给播），这属于内容授权，非本 bug；season 的每集 adge（"会员"/空）
  已透传（§12.1/§12.2）。

### 14.3 播放失败详情、重试与「假错误墙」（2026-11-21 23:0x，用户登录态仍报错后补）

用户登录后用 MyGO 第 1 话仍看到「出错啦! - bilibili.com」，日志只有标题。已补：

- **ailed {action:"play"} 带完整详情**（前 400 字，host 日志 [bilibili] play was refused: … 同步可见）：
  url=… title=… wall=<错误墙可见节点 innerText，最多 240 字> video=readyX/networkX/timeY/pausedZ/errorC:M permission=<local-network-access state>。
  错误墙选择器兜底：[class*="error-sign-active"]、.bpx-player-error、[class*="player-error"]、.error-container、
  [class*="error-container"]、[class*="error-wrap"]；只看真的可见（display/visibility/rect）。
  Rust 侧 Failed::sound 的 message 截断从 160 放宽到 400。
- **三分判定**：
  1. 文案含 **版权/地区/区域/大会员/仅限/专享/付费/试看/不可观看** → 记为 estricted:，**不重试**，直接上报（B 站限制）。
  2. **视频实际在播**（eadyState>=3、无 ideo.error、currentTime 前进 ≥0.2s）而错误墙还盖着 → 把错误墙
     DOM display:none，**不上报 failed**（属播放器 UI 误报，车机看的是真实 video）。
  3. 整页错误（title「出错啦」/错误墙）且视频没在动 → 等 3s，**第一次**用 ?spm_id_from=333.1007.0.0 再加载一次
     （同 B 站自己的刷新；每 media 只一次，记在 sessionStorage），仍失败才上报带详情。
- state.playing 现在要求 ideo && readyState>=2（整页错误页不再误报 playing）。

**实测（真实 ep 页，headless Chrome + 实际 bilibili.js，与 host 同参数）**
- 好的 MyGO 第 1 话 ep1183102：**不再出错**——ailed=[]、ideo.readyState=4、currentTime 已到 15s、
  state.playing=true、duration=1431s（未登录也播：限免集；大会员集仍限）。
- 坏 ep（ep999999999，B 站整页错误）：ailed=[{action:"play",code:-1,message:
  "url=…ep999999999?spm_id_from=333.1007.0.0 title=出错啦! - bilibili.com wall=返回上一页 换一张 video=none permission=granted"}]
  ——可见详情已能定位；且确认这是 **B 站整页错误页**（wall 是「返回上一页 换一张」），不是 LNA 墙。
- 用户如果仍复现：新日志会带 URL/title/wall/video/permission，能直接区分「LNA 墙 / 版权地区限制 / B 站整页错误（404/风控）」。
