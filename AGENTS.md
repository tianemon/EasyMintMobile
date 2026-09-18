# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 项目约定

本仓库是 EasyMint 手机端（局域网终端 App），2026-09-18 从 EasyMint 桌面端主仓库迁出为独立仓库。桌面端在 `~/dev/project/EasyMint`，两端通过加密 WebSocket 通信，改动远程协议时需两边同步。

- **检查**：`npm run check`（`tsc --noEmit` + `expo-doctor`）
- **打包**：`npm run apk` → 输出 `apk/EasyMint-{yyyyMMddHHmmss}.apk`（脚本 `scripts/build-apk.mjs`，内部先 `expo prebuild` 再 Gradle）。构建成功后**自动清理旧包，默认只保留最新一个**（新包落盘后才清，构建失败不动已有产物）；要留上一版做对比时传参覆盖：`node scripts/prune-apks.mjs 3`
- **`android/` 与 `ios/` 是 `expo prebuild` 的产物**（打包脚本每次重建），不入库、不要手改；原生配置写 `app.json`
- **设计 token 单一来源**：`src/theme/tokens.ts`，值镜像桌面端 `app/renderer/src/index.css` 的亮色段。`App.tsx` 与 `src/` 下除 tokens.ts 外不得出现裸色值（hex）
- **圆角只有两档**：`radius.lg`(8) 与 `radius.full`（全站统一，不要再引入中间档）
- **品牌图标**：`assets/brand/appicon.png` / `appicon-light.png` 复制自桌面端 `assets/`，桌面端换图标时需同步
- **数据边界**：除系统安全存储中的配对凭证外，App 不把任何业务数据写入文件/数据库/缓存

# 远程协议

命令名与桌面端 `app/shared/remote-protocol.ts` 保持一致（`src/protocol/types.ts` 是镜像）。事件由桌面端按白名单转发，载荷无 schema——两端字段对不上时编译期发现不了，改字段务必两边核对。
