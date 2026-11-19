# WestPlay 2.4.0 r3 · estella 修改版

基于 [WestPlay 2.4.0](https://github.com/enes-less/WestPlay)（GPL-3.0-or-later）修改。
本文件列明相对上游 2.4.0 的全部改动，以满足 GPL-3.0-or-later 第 5 条"标明修改"的要求。

修改日期：2026-11-16
构建标识：r3（安装包名 `Westplay_2.4.0_r3_by_estella_x64-setup.exe`）

---

## 一、功能改动

### 1. 车机屏 / 平板 实时切换

原先"WestPlay 显示在车机屏还是平板"是构建 mod 时决定的，改设置要重新生成 mod、重开游戏。

现在改为运行时切换：

- `crates/host/src/settings.rs`：新增 `ScreenSettings::on`（枚举 `ScreenOn { TruckScreen, Tablet }`，默认 `TruckScreen`），老设置文件读入时自动取默认值。
- `crates/shared/src/lib.rs`：`HostBlock` 新增 `screen_on_tablet` 字段，`BRIDGE_VERSION` 由 28 提升到 **29**（插件与主程序必须同版本）。
- `crates/host/src/lib.rs`：每帧把设置写入共享内存。
- `crates/plugin/src/screens.rs`：`shows_here` 增加 `on_tablet` 参数——
  - 选车机屏：车机屏绘制画面，平板保持空白；
  - 选平板：平板绘制画面，车机屏写入**全透明**，露出游戏原生导航。
- 界面：伴生程序 Truck Screen 页新增「WestPlay on」二选一（`ui/src/companion/pages/ScreenPage.tsx`），42 个语言文件补了文案。

### 2. 解除 DLC 客车的平板刷黑

`crates/setup/src/tablet.rs`：`apart_marks` 不再把 Coaches DLC 的 Scania Touring、MAN Lion's Coach 列入"平板保持黑屏"名单，使它们的平板可以被 WestPlay 使用（车机屏由上面的运行时逻辑让位）。

### 3. 内嵌第三方/自制车机适配补丁

把三套已验证的适配补丁**原样**打包进 WestPlay 自己生成的 mod，玩家不再需要手动安装额外 `.scs`：

- 欧卡：YTHQ 卡车平板补丁（206 个文件）
- 美卡：YTHQ 卡车平板补丁（76 个文件）
- 美卡：Ford F-150 (2023) / Bronco (2024) 中控屏补丁（2 个 UI 脚本）

实现：

- `crates/setup/assets/patches.zip`：三组补丁的原始文件（共 286 个）。
- `crates/setup/src/game_mod.rs`：
  - `ADDONS` 内嵌该 zip；`addons(kind)` 按游戏取出对应分组；
  - `build()` 末尾并入补丁文件，**同名路径以补丁优先**（移除先前生成的文件）；
  - `addons_digest()` 生成补丁指纹（含 `FORMAT` 常量），补丁或转换逻辑变化时触发 mod 重建；
  - `clear_backdrop()`：把福特脚本里不透明黑底（`FF000000`）改为透明（`00000000`），使 WestPlay 未绘制时显示原车 SYNC 4；
  - `lift_parking()`：把倒车影像元素（`park*`）的层级 +100，使其显示在 WestPlay 画面之上。
- `app/src/setup.rs`：新增 `addons_file` / `addons_current` / `write_addons`，把指纹写在 mod 旁（`westplay.addons`、`westplay_ats.addons`），过期即重建。

### 4. YTHQ 平板画面尺寸微调

YTHQ 补丁的覆盖层（`_nameless._.wpb`）原本画得比平板模型显示的纹理范围略大，在部分车型（实测 Volvo FH 2024）上底部/边缘会露出 YTHQ 原界面。

`game_mod.rs::inset_overlay()` 把该层按比例向其中心内缩：

```rust
const YTHQ_INSET_X: f64 = 0.95;   // 横向
const YTHQ_INSET_Y: f64 = 1.00;   // 纵向（1.0 = 不缩放）
```

只影响 YTHQ 平板上 WestPlay 的画面层，不涉及卡车/客车自带的屏幕。数值在 Volvo FH 2024 上调定；其他车型若略有偏差，可改成按车型分组。

### 5. 默认搜索引擎改为 Bing

`ui/src/cabin/apps/safari/address.ts`：`DEFAULT_ENGINE` 由 `google` 改为 `bing`。用户仍可在车机 Safari 设置里改回。

---

## 二、构建相关改动

- `ui/package.json`：补上缺失的 `@maplibre/maplibre-gl-style-spec`（原项目的测试文件引用了它但未声明，官方用 npm 扁平安装时能解析，用 pnpm 会失败）。
- `app/Cargo.toml` / `crates/setup/Cargo.toml`：新增 `zip` 依赖（读取内嵌补丁包）。
- 发行打包配置：`tools/tauri.install.conf.json`（关闭 `createUpdaterArtifacts`，因无签名私钥；其余与上游 `app/tauri.release.conf.json` 相同）。

源码中另有少量注释与测试的补充（如 `two_mappings_share_memory` 在 WestPlay 运行时会跳过）。

---

## 三、构建方法

需要 Windows、Rust（stable，含 MSVC 工具链）、Node.js 24。

```powershell
# 前端依赖
cd ui
pnpm install
pnpm build

# 主程序（含插件、地图、探针）
cd ..
cargo build --release

# 安装包（NSIS）
cd app
node ..\node_modules\@tauri-apps\cli\tauri.js build --config ..\tools\tauri.install.conf.json
```

产物：`target\release\bundle\nsis\WestPlay_2.4.0_x64-setup.exe`

> 上游 `package.json` 的 `predev`/`prebuild` 调用了 `tools/dev/sweep.ps1`，该脚本不在公开发行包里，因此直接调用 `tauri` CLI 而非 `npm run build`。

## 四、更新内嵌补丁

1. 替换 `crates/setup/assets/patches.zip`（保持 `ets2-ythq/`、`ats-ythq/`、`ats-ford/` 三组目录结构）；
2. 若同时修改了 `game_mod.rs` 里的转换逻辑，请提升 `addons_digest()` 中的 `FORMAT` 常量，否则已安装用户的 mod 不会重建；
3. 重新构建。

## 五、已知限制

- 福特中控屏的画面为 16:9 布局（`scania-2025`）铺在 16:10 的屏幕上，四周可能有细黑边。
- 补丁针对截稿时的 YTHQ 与游戏版本制作；若 YTHQ 大幅改动平板模型，可能出现错位（不会静默崩溃，但需重新制作补丁）。
- 安装包未做代码签名，Windows 会提示未知发布者。

## 六、许可

本修改版沿袭上游的 **GPL-3.0-or-later**。再分发时须同时提供本源码（含改动），并保留上游的 `LICENSE`、`THIRD_PARTY_NOTICES.md`、`THIRD_PARTY_LICENSES.md`。
