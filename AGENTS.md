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
- **设计 token 单一来源**：`src/theme/tokens.ts`，亮/深两套配色都镜像桌面端 `app/renderer/src/index.css`（亮色段取自 `:root`，深色段取自 `[data-theme="dark"]`）。`App.tsx` 与 `src/` 下除 tokens.ts 外不得出现裸色值（hex）
- **圆角只有两档**：`radius.lg`(8) 与 `radius.full`（全站统一，不要再引入中间档）
- **原生控件默认色**：`TextInput` 必须显式给 `placeholderTextColor`（用主题的 `textMuted`）与文字 `color`——不给会落到系统主题色，深色系统下是白字白底（见 `Composer`、`commonStyles.answerInput`）
- **品牌图标**：`assets/brand/appicon.png` / `appicon-light.png` 复制自桌面端 `assets/`，桌面端换图标时需同步
- **数据边界**：除系统安全存储中的配对凭证与外观偏好外，App 不把任何业务数据写入文件/数据库/缓存

## 主题（亮色 / 深色）

外观默认**跟随系统**，也可在「连接设置 → 外观」里手动指定亮色/深色（三档语义与桌面端 `theme-store` 一致）。

- **配色表**：`tokens.ts` 的 `lightColors` / `darkColors`（同类型 `ThemeColors`，缺键编译报错）。深色值逐 token 取自 PC 深色段，**PC 改配色时两个文件都要同步**；约 19 个 PC 没有的手机端自有 token（芯片、提问卡、弹层、遮罩、快捷键文字等）按 PC 深色同一套层级自配，改它们时保持「外深内浅 + 正文对比对齐 #d4d4d4 系」。
- **取色必须走主题**：组件内 `const { colors, shadow } = useTheme()`、样式表用 `useThemedStyles(makeStyles)`（`makeStyles = (colors: ThemeColors) => StyleSheet.create({...})`，放模块级保证引用稳定）。**禁止模块级静态取色**（`StyleSheet.create` 在模块加载时就把颜色定死了，切主题不会生效）——`icons.tsx` 的默认色因此存的是**键名**，渲染时才解析。
- **样式表缓存**：`useThemedStyles` 按 (factory, 配色表) 在模块级 WeakMap 里缓存，列表里成百上千个实例共享同一份，不是每个实例各建一次。
- **不是组件的地方（纯渲染函数）**：样式由调用方传参进去——见 `markdown/MarkdownView.tsx`、`markdown/inline.tsx` 的 `MarkdownStyles` / `InlineStyles` 形态。
- **偏好存储**：`src/theme/theme-preference.ts`，键 `easymint.theme-mode.v1`，存在系统安全存储里。它是**设备设置**，不是业务数据（见上条数据边界）。
- **跟随系统要真生效**：`app.json` 的 `userInterfaceStyle` 必须是 `automatic` 且装了 `expo-system-ui`（Android 靠它，否则不生效）；启动图配了 `dark.backgroundColor`，避免深色下白闪。
- **冷启动不闪主题**：`App.tsx` 在 `themeReady`（偏好读完）前不渲染任何主题化界面，闪屏也等到那一刻才隐——改启动流程时别把这个门控拆了。
- **两套同值的例外**：`fail`、`permissionOn`、`black`、`scanFrameBorder`、`scanOverlayText`——前者是 PC 深色段本就没改，后两者压在**相机画面**上（不是 App 的面），必须两套都看得清。
- **深色阴影**：`darkShadow` 同几何、不透明度压到 0.5/0.6/0.7（PC 深色段量级）。PC 那层 `inset 0 1px 0` 顶部内高光 RN 表达不了，略去——深色下浮层分层靠阴影 + 描边。

## 会话级状态：每会话一份，按事件自己的会话 id 落格（改这里之前先读）

与桌面端 chat-store（`messagesBySession`）同构：`src/session/runtime.ts` 定义 `SessionRuntime`（消息/运行态/状态文案/提问卡/后台清单/上下文占用/输入卡设置），App 持一份 `Record<sessionId, SessionRuntime>`，**显示哪份由当前会话决定**。

- **写入只给「事件自己的会话 id」，不做「按当前会话过滤」**。过滤依赖可变的「当前会话」，而事件回调、异步快照、用户动作时序交错——任何一条路径的时序差都会把状态写进别的会话（切换会话时**发送按钮仍显示「打断」、状态行还留着上一个会话的动作文案**，就是这么来的）。按 id 落格后这类串扰在结构上不可能发生。
- 未创建的新会话用 `DRAFT_SESSION_ID` 占位：`session.send` 返回真实 id 后 `migrateRuntime` 迁过去。**新建会话也要重置草稿格**（否则会把上一次的运行态/提问卡带进来）。
- **换会话不再需要作废流式消息 id**：`streamMessageIds` 按会话分开记（旧版是一个 ref，切会话不复位会导致内容落错会话）。
- **待应用的流式帧带投递时的会话 id**，队列刷新时只落进它自己的格。
- **后台任务清单是全量的**（PC 按订阅过滤后下发），用 `syncBackground` 按会话分组写回——只看当前会话会把别的会话的后台命令串进来。
- 列表刷新类事件（`project:open-windows-changed` / `session:list-changed`）会调 `setPage`，所以**页面判断仍要走 `viewRef`**（`useLayoutEffect` 同步更新）：用闭包里的 page 会在「state 已切页、回调还是旧闭包」的窗口里把用户从聊天页拽回列表页。
- 桌面端对手机打开过的会话是**只增不减地订阅**的（`sessionSubscriptions` 只在设备断连时清，协议里没有退订命令），且**列表类事件按项目订阅放行**（手机在首页拉一次会话列表就拿到项目订阅）。因此：
  - **高频大载荷（`agent:stream`、`agent:shell-output`）在 PC 侧只按会话订阅放行**（见桌面端 `remote-terminal-service.ts` 的 `payloadHeavy`，已带回归用例）；它们**不再按项目订阅放行**——否则 PC 一边输出就会把整条流（每帧全量累计正文）灌给没打开该会话的手机，手机逐帧解密+解析（纯 JS AES-GCM），JS 线程被吃死：**启动转圈加载不出来、聊天页能上下滑动但点不动**。
  - 手机侧再加一道保险：**正文帧/工具帧/后台输出这些重活只给当前显示的会话做**（隐藏会话切回时 openSession 会重取快照，不丢内容）。两道都要留着，一道防源头、一道防客户端。
- 异步快照要定序：`openSession` 用 `openSeq` 序号丢弃过期快照（旧快照回来晚会把当前会话盖成上一个的）。

## 输入卡与提问卡（与 PC 同口径）

- **发送键 / 打断键**：`run` 中**有内容（正文或附件）就是发送**（走 `session.steer` 插话），只有「运行中且输入为空」才显示打断键（PC ChatInput 的判定就是这个）。改这里别把 busy 当成无条件显示打断。
- **提问卡**（`AskCard` ↔ PC `AskUserCard`）：单题导航（‹ n/N ›）、单选点选即自动下一题、多选勾选不跳题、主按钮随位置变（有草稿「发送」/ 非末题「下一题」/ 末题「完成」）、✕ = 全部跳过（`answers: null` = 取消）、`depends_on` 级联显隐。**答案状态全在组件内**（不写进 `SessionRuntime`），否则流式帧一刷新就会把用户正在填的答案带偏；提交只递交 `[{questionId, values}]`。
- PC 的卡片是毛玻璃（backdrop-blur），RN 无等价物 → 用卡片面 + 描边 + 阴影近似（同一套分层语言）。

## 命令显示（对着 PC 的四个面，改前先对照）

后台命令在两端各有一套展示，手机端逐个面对应 PC：

| 面 | PC | 手机端 |
|---|---|---|
| 输入卡胶囊 | `ShellBar`（绿底胶囊 + 清单 + 行内停止 + 点行看输出） | `BackgroundPills` 的 Shell 胶囊 |
| 输出查看 | `ShellProcessView` + `OutputWindow`（80vw×80vh、ANSI 彩色、贴底跟随、截断提示） | `screens/ShellOutputSheet.tsx` |
| 对话流工具块 | `ChatBlocks` 的 bash 分支（标题只放动作词 + description；命令进深色块） | `ToolCard`（`isCommandTool` 分支） |
| 系统卡正文 | `ChatPanel` 结果型（⏺ 行拆色、限高 6 行、日志路径可点） | `SystemCard`（结果型分支） |

几条必须同时守住的约定：

- **ANSI 只在输出查看页解析**（`session/ansi.ts`，颜色表与 PC `lib/ansi-colors.ts` 逐字同源）：PC 在工具块/系统卡正文里也是纯文本，别多解析一处、也别只改一边的配色。
- **本机日志路径不发给手机**：PC 的 `shell-count` 已剥离 `logPath`，`shell.readLog` 也只接受 `shellId`（路径由 PC 侧从 registry 取）。手机无法「在文件夹中显示」，系统卡里的 `完整输出:` 行降级为等宽可复制文本。
- **限高与 PC 同口径**：结果卡 `6lh`、摘要卡 `16lh`、bash 展开区 `--text-detail * 9.75 + 28px`（约 6 行）。
- **展开区的内层滚动一律接 `onInnerScrollGesture`**（ToolCard / SystemCard / ThinkingBlock 同款）：inverted 列表里内层滚到底会把剩余位移跨坐标系交给父列表（见布局陷阱三）。
- **实时输出有两条去处**：会话运行态的 `backgroundShells[].output`（滚动 12k，供快照/对账）与输出查看页的追加式内容（`subscribeShellChunks`，只给打开的那个页）；两者不要混用（一个是滚动缓冲、一个是追加流）。

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

## 渲染陷阱（都已实际踩过）

### 一、SVG 动效在同一个 `<Svg>` 里做几何变换，不要缩放包住它的 View

PC 的动效都是把 CSS transform 直接加在 `<circle>` / `<path>` 上（`transform-box: view-box`）。手机端早期图省事，用 `Animated.View` 包住各自一个 `<Svg>` 再缩放：缩的是**已光栅化的图层**，细描边（2 用户单位，14px 图标上约 1.2px）降到 45% 时会被降采样吃掉——表现为**线条随着聚拢消失**，而实心圆点墨量够、看着没事。

**做法**：几何、位移、缩放全写在 SVG 的用户坐标（viewBox 24）里，与 PC 的 CSS 值逐字相同（见 `ModelGlyph`）。两个必须记住的点：

- **动效只能挂在 `<G>` 上**：react-native-svg 只给 `G` 重写了 `setNativeProps`（把 `x/y/scale/originX/originY` 折算成 matrix），挂在 `Circle`/`Path` 上这些变换属性不会变成矩阵，动效会**静默不生效**。
- **代价是 JS 驱动**：SVG 属性不是 style，走不了 `useNativeDriver`。换来的是位移与缩放共用同一个 `Animated.Value`——同一时钟，不会出现「点到了线没到」。改这里别为了“原生驱动”又回到 View 缩放的老路。

# 远程协议

命令名与桌面端 `app/shared/remote-protocol.ts` 保持一致（`src/protocol/types.ts` 是镜像）。事件由桌面端按白名单转发，载荷无 schema——两端字段对不上时编译期发现不了，改字段务必两边核对。
