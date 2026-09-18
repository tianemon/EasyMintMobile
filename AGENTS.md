# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 项目约定

本仓库是 EasyMint 手机端（局域网终端 App），2026-09-18 从 EasyMint 桌面端主仓库迁出为独立仓库。桌面端在 `~/dev/project/EasyMint`，两端通过加密 WebSocket 通信，改动远程协议时需两边同步。

- **检查**：`npm run check`（`tsc --noEmit` + `expo-doctor`）
- **打包**：`npm run apk` → 输出 `apk/EasyMint-{yyyyMMddHHmmss}.apk`（脚本 `scripts/build-apk.mjs`）。构建成功后**自动清理旧包，默认只保留最新一个**（新包落盘后才清，构建失败不动已有产物）；要留上一版做对比时传参覆盖：`node scripts/prune-apks.mjs 3`
- **只构建 arm64-v8a**（默认）：手机都是 arm64；x86/x86_64 只给模拟器、armeabi-v7a 是 32 位老设备——一起编会让原生编译量翻四倍、包体多出 66MB。需要全架构包时 `APK_ARCH=armeabi-v7a,arm64-v8a,x86,x86_64 npm run apk`
- **`app.json`/`package.json` 未变时跳过 `expo prebuild`**（脚本自动判断，存在 `android/.prebuild-inputs` 哈希标记）：prebuild 会重建整个 android/ 使 Gradle 增量失效，是重复构建慢的主因；改配置或依赖后会自动重建
- **`android/` 与 `ios/` 是 `expo prebuild` 的产物**（打包脚本每次重建），不入库、不要手改；原生配置写 `app.json`
- **批量打包后停掉构建守护进程**：Gradle/Kotlin 守护进程会常驻到 3 小时才自动退出。`ps` 里它的 RSS 只有几十 MB，但实际压着 JVM 堆与压缩/换出页——实测连打 5 个包后系统仅剩 74MB 空闲内存，跑 `cd android && ./gradlew --stop` 后回升到 1751MB。长时间不再打包时执行一次
- **设计 token 单一来源**：`src/theme/tokens.ts`，值镜像桌面端 `app/renderer/src/index.css` 的亮色段。`App.tsx` 与 `src/` 下除 tokens.ts 外不得出现裸色值（hex）
- **圆角只有两档**：`radius.lg`(8) 与 `radius.full`（全站统一，不要再引入中间档）
- **品牌图标**：`assets/brand/appicon.png` / `appicon-light.png` 复制自桌面端 `assets/`，桌面端换图标时需同步
- **数据边界**：除系统安全存储中的配对凭证外，App 不把任何业务数据写入文件/数据库/缓存

## 布局陷阱（都已实际踩过，改布局前先读）

这两条同源：**Yoga 的弹性项会参与“容器该多宽/多高”的计算，一旦用错就把容器算畸形。**

### 一、行内 ScrollView 必须钳死 flexGrow

RN 的 `ScrollView` 默认带 `flexGrow: 1, flexShrink: 1`（`ScrollView.js` 的 `baseVertical`/`baseHorizontal`）。行内凡出现 ScrollView（思考块展开区、代码块横向滚动区），嵌在「列表 → 行 → 气泡」的层叠里就会被当成弹性项伸展，把整行撑到畸形高度。

**症状**：长会话出现一片盖住消息、翻不回去的空白；单行实测高度 267030px（比整个列表的内容高还大）。

**做法**：行内所有 ScrollView 显式 `flexGrow: 0, flexShrink: 0`（`ThinkingBlock.body` / `CodeBlock.scroll`），消息行与气泡同样显式声明（`MessageList.styles.row` / `bubble`）。

### 二、气泡内禁用 `flex: 1`（用 flexGrow + flexBasis auto）

气泡是**按内容撑开**的（`alignSelf: 'flex-start'`），而 `flex: 1` = `flexBasis: 0`——这一项对气泡宽度**贡献为 0**，气泡被压到最小宽度。

**症状**：工具卡的图标、标题文字、状态对勾全挤在一起（命令执行气泡最明显）。

**做法**：写 `flexGrow: 1, flexShrink: 1`（flexBasis 默认 auto，自然宽度仍计入气泡），或像 `SystemCard` 那样用 `marginLeft: 'auto'` 把右侧元素顶开。**不要用 `flex: 1`**。已修：`ToolCard.toolTitleRow/toolTitle`、`MarkdownView.listItemBody/tableCell`。

> 全屏/定宽容器（`MessageList.wrap`、`Header`、弹层遮罩）里用 `flex: 1` 是正常的——那里容器宽度是确定的。

### 三、`inverted` 中的内层滚动必须隔离父列表

`inverted` 在 Android 上是给列表与每个 cell 各加一次 `transform: scale(-1)`（`VirtualizedList.js` 的 `verticallyInverted`）。两次翻转在 **cell 内部互相抵消**——所以列表内容渲染正常、思考块（cell 内的嵌套滚动区）自己的滚动方向也正常，看起来没事。

但**链式滚动会跨过这条坐标系边界**：嵌套滚动区滚到边后，把未消费的位移按自己（已抵消回世界方向）的坐标系交给父级列表，而列表按自己**翻转后**的坐标系去应用 → **整页朝反方向滚**。

**症状**：手指在思考块里继续上滑（已到内容底部），整个屏幕反而**往下滚、翻出历史消息**（用户实测）。只在 `inverted` 下存在。

普通列表依赖 `scrollToEnd`，而长会话中未测量的变高消息只能按平均行高估算，实测会停在历史中间。

**做法**：消息流保留 `inverted`（最新在前，打开天然位于最新消息）；手指进入思考块时关闭父列表 `scrollEnabled`，内层同时设置 `nestedScrollEnabled={false}`，手势结束或组件卸载时恢复父列表。这样剩余位移不会跨坐标系交给父列表。

### 四、流式思考的框内跟随必须让位给手指

流式内容的自动跟随要能被手指打断：思考块原来无条件
`onContentSizeChange → scrollToEnd`，流式期间每帧都执行，手指往上拖会被下一帧顶回去。

**做法**：`onTouchStart` 立即停止跟随；只有用户重新滚回底部后才恢复（`ThinkingBlock` 的 `followTail`）。消息列表本身由 inverted 的 offset=0 锚定最新消息，不再运行程序性 `scrollToEnd`。

# 远程协议

命令名与桌面端 `app/shared/remote-protocol.ts` 保持一致（`src/protocol/types.ts` 是镜像）。事件由桌面端按白名单转发，载荷无 schema——两端字段对不上时编译期发现不了，改字段务必两边核对。
