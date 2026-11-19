# WestPlay 2.4.1 · estella 修改版（r1）

基于 [WestPlay 2.4.1](https://github.com/enes-less/WestPlay)（GPL-3.0-or-later）修改。
本文件列明相对上游 2.4.1 的全部改动，满足 GPL-3.0-or-later 第 5 条"标明修改"的要求。

修改日期：2026-11-17
构建标识：r1（安装包 `Westplay_2.4.1_r1_by_estella_x64-setup.exe`）

---

## 一、相对上游的核心改动

### 1. 「WestPlay 显示在：车机屏 / 平板」运行时可切换

上游 2.4.1 在**客车**上做了自动接管：平板进入视野后 WestPlay 自动移到平板，客车自己的屏幕改回游戏导航。本版**取消自动接管**，改为完全由玩家开关决定（owner 2026-11-17：「我还是喜欢开关式的，可以自由切车机或者平板」）：

| 设置 | 行为 |
|---|---|
| 卡车屏幕（默认） | 画面只画在车机屏上，平板保持黑屏；**任何情况都不会自动切到平板**（客车也一样） |
| WestPlay 平板 | 平板优先：车机屏让给游戏导航，画面只画在平板上；**卡车上也生效** |

切换立即生效，不需重开游戏、不需换车。

实现：

- `crates/host/src/settings.rs`：`ScreenSettings::on`（`ScreenOn { TruckScreen, Tablet }`，默认 `TruckScreen`），老设置文件自动取默认值。
- `crates/shared/src/lib.rs`：`HostBlock::screen_on_tablet`；`BRIDGE_VERSION` 由 29 提升到 **30**（主程序与插件必须同版本，因其布局变了）。
- `crates/host/src/lib.rs`：启动时与每次设置变更时写入该标志。
- `crates/plugin/src/screens.rs`：`shows_here` 改为只认开关——

  ```rust
  fn shows_here(tablet: bool, supported: bool, blank: bool, on_tablet: bool) -> bool {
      if tablet { supported && !blank && on_tablet } else { supported && !on_tablet }
  }
  ```

  上游的"平板进入视野即接管"（`bus` / `tablet_took` / `own_seen` 三个条件）一并去掉；`blank`（个别车型平板必须保持黑屏）仍保留。选「平板」时车机屏停止绘制（写入全透明纹理，露出游戏原生导航），平板开始绘制。
- 界面：伴生程序 Truck Screen 页新增「WestPlay on」二选一（`ui/src/companion/pages/ScreenPage.tsx`），42 个语言文件补了文案。

### 2. 内嵌第三方/自制车机适配补丁

把三套已验证的补丁**原样**打进 WestPlay 自己生成的 mod，玩家不再手动安装额外 `.scs`：

- 欧卡：YTHQ 卡车平板补丁（206 个文件）
- 美卡：YTHQ 卡车平板补丁（76 个文件）
- 美卡：Ford F-150 (2023) / Bronco (2024) 中控屏补丁（2 个 UI 脚本）

实现（`crates/setup/src/game_mod.rs`）：

- `ADDONS`：内嵌 `crates/setup/assets/patches.zip`（286 个文件）；
- `addons(kind)`：按游戏取出对应分组，剔除补丁自带的 `manifest.sii`/`description.txt`/`readme.txt`；
- `build(..., kind)`：结尾并入，**同名路径以补丁优先**（先前生成的文件被移除）；
- `addons_digest()` + `FORMAT` 常量：补丁或其转换方式变化时，已安装用户的 mod 自动重建；
- `clear_backdrop()`：把福特脚本的不透明黑底（`FF000000`）改为透明（`00000000`），WestPlay 不绘制时显示原车 SYNC 4；
- `lift_parking()`：倒车影像元素（`park*`）层级 +100，显示在 WestPlay 画面之上；
- `inset_overlay()`：把 YTHQ 平板上 WestPlay 的画面按比例内缩（横向 `0.95`、纵向 `1.0`），使其正好铺满模型屏幕面。数值依据：平板模型的屏幕面 UV 为 `0..1`（282 个模型全部如此，见下），脚本覆盖层原本横向超出 5.6%。

`app/src/setup.rs`：`addons_file`/`addons_current`/`write_addons`，指纹写在 mod 旁（`westplay.addons`、`westplay_ats.addons`），过期即重建。

### 3. 赞助页改为爱发电（Afdian）

原版的赞助页与社交栏的 Patreon 按钮都指向创作者自己的收款页（Kreosus / Patreon）。本版统一改为**爱发电**：

- 赞助页：标题/说明/按钮文案与页面说明改为「爱发电」，按钮跳转 `https://ifdian.net/a/jntm5686`
- 社交栏：Patreon 按钮换成**爱发电**（Simple Icons 的 AFDIAN 徽标，品牌色 `#946CE6`），同一链接
- 42 个语言文件的 `support.*` 文案把 `Kreosus` 换成 `爱发电`
- 涉及文件：`app/src/main.rs`（`SUPPORT_PAGE`、`Social::Afdian`）、`ui/src/companion/pages/Support.tsx`、`ui/src/companion/Companion.tsx`、`ui/src/companion/useHostStatus.ts`、`ui/src/companion/companion.css`、`ui/src/companion/preview.ts`、各语言 `words/*.ts`

### 5. 地图新增：休息状态药丸 + 2D/3D 视角开关

地图顶部中间新增药丸状态栏，每 10 秒轮换显示：

| 项目 | 内容 | 数据来源 |
|---|---|---|
| 一 | 距离下一次**强制休息**还有多久（`时:分`） | 游戏 SDK `mandatory.break`（分钟） |
| 二 | 距离**最近的休息站**（公制 km / 英制 mi，随配置） | 地图地点数据（`parking` 休息区 + `service` 服务站）与车辆坐标实时计算 |

性能：

- 距离只在它显示的那 10 秒里、**每秒最多计算一次**，单次一遍遍历、不排序、不分配；
- 组件只订阅 `mandatoryBreak` 与单位设置，telemetry 每帧变化不触发重渲染；
- 不显示时完全空闲。

地图右上角新增竖形开关：上 **3D**（默认驾驶视角，俯仰 52°），下 **2D**（俯视，俯仰 0°，仍随车头朝向）。旋钮滑动有过渡动画，相机俯仰由原有阻尼平滑过渡，**不产生额外帧**。

实现：

- `crates/shared/src/lib.rs`：`Telemetry` 新增 `next_rest_stop`、`mandatory_break`（`-1` 表示游戏未提供）；`BRIDGE_VERSION` 30 → **31**。
- `crates/plugin/src/telemetry.rs`：订阅 `rest.stop`、`mandatory.break` 两个通道并写入快照。
- `ui/src/shared/host.ts`：Telemetry 镜像补两个字段。
- `ui/src/cabin/dashboard/restStatus.ts`：`nearestRestStop()`（一遍遍历求最近）与 `breakClock()`（分钟 → `时:分`），含单测。
- `ui/src/cabin/dashboard/RestPill.tsx`：轮播药丸。
- `ui/src/cabin/dashboard/ViewSwitch.tsx`：2D/3D 开关。
- `ui/src/cabin/maps/liveMap.ts`：`flat` 视图状态、`useMapFlat`、`setLiveMapFlat()`、俯仰阻尼 `PITCH_TAU_MS`。
- `ui/src/cabin/dashboard/map.css`：两处样式与动画。

### 6. 默认搜索引擎改为 Bing

`ui/src/cabin/apps/safari/address.ts`：`DEFAULT_ENGINE` 由 `google` 改为 `bing`。用户仍可在车机 Safari 设置里改回。

### 4. 构建修正

- `ui/package.json`：补 `@maplibre/maplibre-gl-style-spec`（`ui/src/cabin/maps/style.test.ts` 引用它，但它只是 maplibre-gl 的传递依赖；用 npm 的扁平安装能解析，pnpm 会失败）。
- `crates/setup/Cargo.toml`：`zip` 依赖（读取内嵌补丁包）。
- `windows-sys` 等依赖版本以上游 `Cargo.lock` 为准。

---

## 二、验证工具

`crates/mapdata/examples/pmg_uv.rs`：批量读取 `.pmg` 模型，打印每块网格的 UV 范围，用来确认"屏幕面"是否仍为 `0..1`。

```powershell
cargo run -p westplay-mapdata --example pmg_uv -- <模型目录或文件>
```

2.4.1 版验证结果：欧卡 204 个、美卡 78 个平板模型，屏幕面全部为 `0..1`，因此单一内缩系数对所有车型成立。

---

## 三、构建方法

需要 Windows、Rust（stable + MSVC 工具链）、Node.js 24。

```powershell
cd ui
pnpm install
pnpm build

cd ..
cargo build --release

cd app
node ..\node_modules\@tauri-apps\cli\tauri.js build --config ..\tools\tauri.install.conf.json
```

产物：`target\release\bundle\nsis\WestPlay_2.4.1_x64-setup.exe`

> 上游 `package.json` 的 `predev`/`prebuild` 调用了 `tools/dev/sweep.ps1`，该脚本不在公开发行包里，因此直接调用 `tauri` CLI，而不是 `npm run build`。

## 四、更新内嵌补丁

1. 替换 `crates/setup/assets/patches.zip`（保持 `ets2-ythq/`、`ats-ythq/`、`ats-ford/` 三组目录结构）；
2. 若同时改了 `game_mod.rs` 里的转换逻辑，提升 `addons_digest()` 中的 `FORMAT` 常量，否则已安装用户的 mod 不会重建；
3. 重新构建。

## 五、已知限制

- 福特中控屏为 16:9 布局（`scania-2025`）铺在 16:10 屏幕上，四周可能有细黑边。
- 补丁针对截稿时的 YTHQ 与游戏版本制作；若 YTHQ 大幅改动平板模型，可能错位（`pmg_uv` 可先检查）。
- 安装包未做代码签名，Windows 会提示未知发布者。

## 六、许可

本修改版沿袭上游 **GPL-3.0-or-later**。再分发时须同时提供本源码（含改动），并保留上游的 `LICENSE`、`THIRD_PARTY_NOTICES.md`、`THIRD_PARTY_LICENSES.md`。

### 7. 中文输入法（拼音）

游戏自带的输入法在 WestPlay 的搜索框里打不了中文，本版自带一个：

- 车机键盘语言为中文时（设置里可关「拼音输入法」），搜索框打字会出候选；
- 候选来自**离线** Google 拼音词库（pinyin-ime，MIT，49,506 条单字/词组，已打包进程序，不联网）；
- 候选条在**键盘上方**浮出（不影响键盘尺寸），每项一张卡片，带序号，可鼠标点选；
- 支持整词（eijing → 北京）与首字母（j → 北京）；
- 地球键在中文键盘下于**中/英**之间切换。

实现：keyboard/imeCandidates.ts（词库 → 候选）、keyboard/ImeBar.tsx（候选条）、keyboard/store.ts（当前输入文本）、各语言 settings.pinyinInput。

### 8. 性能模式与帧率

设置 › 外观新增两项：

- **性能模式**：关闭全部玻璃模糊（ackdrop-filter，WebView2 里最大的开销）、关闭动画/过渡、关闭地图 3D 建筑，并跳过应用切换的 View Transitions 截图；深浅主题各自适配。
- **帧率**：横向滑块在 60 / 30 之间切换，地图按 rameCap.ts 均匀取帧（60Hz 下 30 帧即两帧一绘）。

实现：state/store.ts（performanceMode、rameRate）、shell/shell.css（性能模式样式）、state/launch.ts（跳过截图过渡）、maps/frameCap.ts（帧率上限）、pps/settings/*（滑块与开关）。

### 9. 图标主题：原版 / 液态玻璃

设置 › 外观新增「图标主题」滑块：

- **原版**（默认）：WestPlay 自绘的 SVG 图标，与上游一致；
- **液态玻璃**：换成 Icons8 的 Liquid Glass 图标（ui/public/icons/westplay/glass-*.png，13 个角色里已备 12 个，播客暂用原版），设置里的小图标同时变为黑白玻璃块。

实现：shared/icons.ts（ppIcon(role, look, theme)）、cabin/state/hooks.ts（useAppIcon 带上主题；日历的动态日期在玻璃主题下让位）、cabin/state/store.ts（iconTheme，持久化）、cabin/apps/settings/*（开关与黑白方块样式）、THIRD_PARTY_NOTICES.md（Icons8 署名）。

### 10. 2D/3D 视角的完善

- **2D 不再渲染 3D**：切到 2D 时隐藏立体建筑层（BUILDING_LAYER），只留平面建筑层（BUILDING_FLAT_LAYER）；uildingsShown() 增加 !useMapFlat.flat 判断，切换时立即调用 showBuildings()。
- **北朝上模式可切 2D/3D**：原实现里 
orthUp 固定 pitch: 0，现在跟随玩家选择（2D 平面 / 3D 倾斜，朝向仍固定北）。
- **未居中（浏览地图）时也能切**：setLiveMapFlat() 在 live 存在时直接 easeTo({ pitch })，不依赖跟随相机；带 PITCH_TAU_MS 缓动。

### 11. 后台媒体保活

- 同一时间只挂载一个应用窗口（CabinApp.tsx 的路由渲染），**离开应用即卸载**，不存在多个应用堆在后台吃性能；非媒体应用无需额外计时，关闭是立即的。
- **媒体应用例外**：state/background.ts 的 isMediaApp / useMediaPlaying 读取各播放器状态（Apple Music、Spotify、YouTube、YouTube Music、本地 Player）。离开正在播放的媒体应用时，其窗口被保留在隐藏层（.screen-slot.kept：isibility: hidden、opacity: 0、pointer-events: none），声音继续。
- 停止播放后保留 **15 秒**（BACKGROUND_LEAVE_MS = 15_000）再卸载；期间恢复播放则取消卸载。回到该应用或打开别的应用都会清掉保活实例。
