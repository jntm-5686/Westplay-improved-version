# WestPlay 2.4.1 estella r7（测试版，尚未打包）

日期：2026-11-17。本次只做「可测试状态」：构建 + 安装到本机，不生成安装包/源码包。

## 一、修的问题：ATS 两辆福特老爷车的 YTHQ 平板画面上下颠倒、只显示中间一条

车型：工坊 mod《YTHQ GPS For Ford》(3838495473) 里的 Ford Mustang '67 与 Ford Victoria '06
（SDK 车型 id：`vehicle.ford.mustang_67` / `vehicle.ford.victoria_06`）。现象：「180° 颠倒 + 比例不对」。

查到的证据（从 universal.scs 里抽出的明文，`3nK` 打散文本）：

1. 平板配件 def（两台车各一份）：
   - `interior_model: "/vehicle/car/upgrade/interior_decors/set_dashbrd/ythq_tablet_small_mustang_67.pmd"`
   - `ui_path: "/ui/dashboard/ythq_ford_mustang_67_gps.sii"`
   - `ui_drawable_texture_path: "/vehicle/truck/share/gps.tobj"`、`ui_drawable_size: (1024, 1024)`
2. 模型 pmd 的材质表第 3 项是 `/automat/5d/5d8cd8f82a29c50f.mat`；内置补丁 `ats-ythq` 里这个材质被指到
   `/material/ui/westplay/screen_tablet.tobj`，即平板的屏幕面画的就是 WestPlay 的整幅画面（1280 x 727）。
3. 屏幕面（模型第 3 块、24 个顶点）的 UV 是 `x 0.0001..0.9999`、`y 0.1922..0.8078`：只采到整幅画面
   中间 61.6% 的一条带，而且 v 方向与 WestPlay 贴图的存储方向相反 → 画面只剩中间一条、并且上下颠倒。
4. 对照：patches.zip 里 `ats-ythq` 已修好的卡车平板模型，同一块的 UV 是 `0..1 x 0..1`（作者做了
   u 归一化、v 归一化后再翻向）。插件日志 `plugin.log` 的 `screen texture loaded: tablet` 也证明贴图
   确实被写入、画面确实显示在这两辆车的平板上。

原因：这两辆车的平板模型沿用 YTHQ 自己仪表贴图的 UV 带；内置 `ats-ythq` 已把屏幕面材质换成 WestPlay
的 `screen_tablet`，于是只采中间一条、且方向相反。

## 二、修复

1. patches.zip 新增内置补丁组 `ats-ythq-ford`，只放两条路径：
   - `vehicle/car/upgrade/interior_decors/set_dashbrd/ythq_tablet_small_mustang_67.pmg`
   - `vehicle/car/upgrade/interior_decors/set_dashbrd/ythq_tablet_small_victoria_06.pmg`
   只改屏幕面 24 个 UV 对（u 归一化、v 归一化并翻向，与 `ats-ythq` 的卡车平板模型同一变换）；
   几何、材质、索引、其余碎块与原模型逐字节相同（每个模型只有 158 个字节不同，全在那 24 对 UV 里）。
   生成工具的 UV 值与 `ats-ythq` 已修好模型逐顶点一致（误差 < 2e-5）。
2. `crates/setup/src/game_mod.rs`：`addons(Kind::Ats)` 的清单加上 `"ats-ythq-ford"`；`addons_digest` 的
   FORMAT 7 → 8。补丁包内容变化 + FORMAT 变化使摘要变化 → 两个游戏各重建一次 mod。
3. 没有改插件：**没有做「按车型把帧缓冲旋转 180°」**。现在的现象是「上下颠倒 + 纵向只剩 61.6%」；
   如果旋转 180° 会同时把画面左右镜像（文字全反），也消不掉裁剪。模型 UV 修法一次解决朝向和比例，
   并且与既有的 `ats-ythq` 卡车平板模型完全同一做法。

## 三、作用面 / 隔离

- 新增补丁只含上面两条模型路径；除此之外 patches.zip 原有 286 项逐字节不变（已比对）。
- ETS2：`addons(Kind::Ets2)` 不变（仍只有 `ets2-ythq`），ETS2 的 mod 不会含 `vehicle/car/` 路径。
- 其它 ATS 卡车、F-150 2023 / Bronco 2024 的 `ats-ford`、YTHQ 卡车平板的 `ats-ythq`：都不改。
- 通用 UI、光标映射、性能模式、拼音输入法、休息药丸、液态玻璃图标、爱发电、倒车影像提层等既有定制：
  源码零改动（插件/UI 源码没有动）。
- `addons_digest` 变化只触发一次重建；重建后 `westplay.addons` / `westplay_ats.addons` 与 mod 同步，
  再次启动不再重建（已实测）。
- 单元测试里加了隔离断言：ETS2 addons 不含 `vehicle/car/` 与 Ford 脚本；ATS addons 不含 ETS2 的
  bridge 脚本与巴士路径；ATS 里 `vehicle/car/` 恰好只有这两项。

## 四、测试结果

- `cargo test -p westplay-setup -p westplay-plugin`：
  - westplay-plugin：49 passed / 4 ignored
  - westplay-setup：89 passed / 8 ignored
- `tsc -b`：通过（exit 0）
- `vitest run`：77 个测试文件、539 个测试全部通过
- 构建：`ui` 的 `build:release` 通过；`tauri build --no-bundle` 通过
- 已安装：`%LOCALAPPDATA%\WestPlay`（westplay.exe/dll/maps/probe + ui）、两个游戏
  `bin\win_x64\plugins\westplay.dll`
- 重建后的 `F:\文档\WestPlay\westplay_ats.scs`：209 项（原 207），两条新 pmg 与生成的补丁文件
  SHA256 一致；摘要文件 `westplay_ats.addons` = 2212460269096082270

## 五、已知 / 待用户实测

- 这两辆车的游戏日志仍会刷：
  `[visual_interior] Error creating custom UI handle, model doesn't use drawable texture!` 与
  `[visual_interior] Failed to load UI addon from accessory: .../ythq_ford_tablet.sii`。
  这是 ATS YTHQ「换屏幕面材质」方案的固有现象：屏幕面材质被换成了 WestPlay 的贴图，游戏就生成不了那个
  本来也用不到的「自定义 UI」；画面本身由材质直接显示，不受影响。要静默只能覆盖工坊那两个配件 def 去掉
  `ui_path`（有让配件模型不生成的风险，本次未做，等实测确认后再定）。
- 平板物理屏约 1.353:1，WestPlay 平板页是 1.425:1；满幅映射后画面约横向压缩 4%，与既有 `ats-ythq`
  卡车平板的表现一致。如果实测觉得偏窄，可以把采样 u 收 2% 左右（ETS2 bridge 的「裁边保比例」做法）。
- 安装包与源码包尚未生成（用户实测通过后再做 r7 打包）。
