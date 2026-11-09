import liquidPreset from '../../modules/mint-lens/android/src/main/assets/em-liquid-app.json';
import type { ViewStyle } from 'react-native';

/**
 * 移动端设计 token —— 亮色段镜像桌面端 `app/renderer/src/index.css` 的 `:root`，
 * 深色段镜像同文件的 `[data-theme="dark"]`（约第 347 行起）。PC 侧改配色时**两个文件都要同步**。
 *
 * 主题切换：取值一律经 `useTheme()` / `useThemedStyles()`（见 theme-context.tsx），
 * 不要在模块级静态取色——那是 App 启动时算一次的常量，切主题不会生效。
 *
 * 命名约定：`colors` / `fontSize` 的键名镜像 PC 的 CSS 变量语义
 * （`body/detail/caption/code` 为阅读区字号，`xxs/xs/sm/base/lg` 为 UI 字号）。
 */
export const lightColors = {
  // ── 品牌与语义色 ──────────────────────────────
  accent: '#16a34a', // --color-accent
  accentHover: '#15803d', // --color-accent-hover
  success: '#17a34a', // --color-success
  successBg: '#f0fdf4', // --color-success-bg
  successSoft: 'rgba(23,163,74,0.1)', // --color-success-soft（PC 用 color-mix 12%/10%，此处取 10%）
  warning: '#d97706', // --color-warning
  danger: '#dc2626', // --color-danger
  dangerBg: '#fef2f2', // --color-danger-bg
  info: '#0891b2', // --color-info
  infoSoft: 'rgba(8,145,178,0.1)', // --color-info-soft
  /** 委派通知状态三色（对标 macOS 红绿灯） */
  done: '#28c840', // --color-done
  interrupt: '#febc2e', // --color-interrupt
  fail: '#ff5f57', // --color-fail
  permissionOn: '#ed7482', // --color-permission-on（权限「完全访问」轨道玫红；PC 深色段未覆盖，两套同值）
  /** diff 行底色（PC `--color-diff-add` / `--color-diff-del`；亮色是实色） */
  diffAdd: '#d6f0de',
  diffRemove: '#fbdddd',

  // ── 文字 ────────────────────────────────────
  textPrimary: '#1a1a1a', // --color-text-primary
  textSecondary: '#555555', // --color-text-secondary
  textMuted: '#999999', // --color-text-muted
  textInverse: '#ffffff', // --color-text-inverse

  // ── 面与线 ──────────────────────────────────
  surface: '#e0e0de', // --color-canvas（= --color-surface）
  surfaceAlt: '#ededeb', // --color-sidebar（= --color-surface-alt）
  surfaceHover: '#e5e5e1', // --color-sidebar-hover
  content: '#f4f4f2', // --color-content（页面底）
  card: '#fdfdfd', // --color-card
  cardAgent: '#f3f6f3', // --color-card-agent（assistant 气泡）
  elevated: '#ffffff', // --color-elevated
  inputField: '#f5f5f2', // --color-input-field
  border: '#e0e0db', // --color-border
  borderLight: '#e6e6e0', // --color-border-light
  divider: '#e5e5e0', // --color-divider
  black: '#000000', // 阴影/文字阴影基色

  // ── 内容区（代码 / 思考 / 命令 / 工具）────────────
  // 手机阅读区：让环境色自然透过，避免桌面米色/实灰色块打断背景。
  chatPanel: 'rgba(255,255,255,0.28)',
  chatInset: 'rgba(24,46,37,0.055)',
  chatCode: 'rgba(255,255,255,0.48)',
  chatDivider: 'rgba(43,68,55,0.14)',
  thinkingBody: '#e9ece9', // --thinking-body
  cmdBox: '#f3f3f1', // --color-cmd-box
  codeBlockBg: '#faf7f1', // --color-code-block-bg
  codeBlockHeader: '#f0ebe3', // --color-code-block-header
  codeSurface: '#fafaf8', // --color-monaco-bg（工具输出底）
  toolTitle: '#8a8a8a', // --color-tool-title

  // ── 状态点 ──────────────────────────────────
  dotGray: '#c8ccd4', // --color-dot-gray（未连接灰）

  // ── 气泡 ────────────────────────────────────
  userBubbleBg: '#16a34a', // --msg-user-bg = --color-accent
  userBubbleText: '#ffffff', // --msg-user-text = --color-text-inverse

  // ── 手机端自有色：PC index.css 无对应 token ──────────
  systemLabel: '#777b77', // 系统卡图标/标签
  logText: '#777777', // 后台命令输出
  projectChevron: '#58655c', // 标题栏项目切换箭头
  chipBg: '#edf0ea',
  chipSelectedBg: '#cfe2cc',
  chipSelectedBorder: '#75a071',
  askBg: '#fff5d8',
  askText: '#4f4221',
  inputBorder: '#d8dcd4',
  /** 环境层：玻璃要透出「有东西」的背景，纯色底会让材质退化成半透明块 */
  ambientBase: '#edf2ec',
  ambientGreen: '#cfe8d8',
  ambientBlue: '#dbe6f8',
  ambientCool: '#dce9f5',
  /** 玻璃层：liquid 更透、frosted 更实；rim/sheen 是 1px 光学边框与左上高光 */
  glassFill: 'rgba(255,255,255,0.28)',
  /** 液态玻璃底色：照模板 --ios-glass-fill(#e4eaf252) 取冷调，不用纯白——纯白在亮底上就是一块白板 */
  liquidFill: 'rgba(228,234,242,0.20)',
  liquidClearFill: 'rgba(0,0,0,' + liquidPreset.parameters.tintLight + ')',
  glassFillStrong: 'rgba(255,255,255,0.66)',
  glassRim: 'rgba(255,255,255,0.78)',
  glassSheen: 'rgba(255,255,255,0.40)',
  glassShadow: 'rgba(14,38,26,0.20)',
  /** 玻璃上的按压层：薄白光，避免灰底把玻璃压脏 */
  glassPress: 'rgba(255,255,255,0.50)',
  composerActive: 'rgba(65,174,145,0.18)',
  contextRingTrack: 'rgba(185,193,191,0.62)',
  contextRingProgress: '#16a34a',
  /** 外观分段滑块的轨道与滑块（桌面端无此组件；结构取自 EasyEdit，色值按本app中性灰校准） */
  segmentBg: '#ededeb',
  segmentThumb: '#ffffff',
  floatingActionIcon: '#247549',
  frostedSheetFill: 'rgba(248,250,248,0.78)',
  frostedSelection: 'rgba(255,255,255,0.62)',
  sheetBg: '#f9faf6', // 会话操作底部弹层
  sheetText: '#28322b',
  overlay: 'rgba(24,31,25,0.38)', // 弹层遮罩
  selectedRowBg: '#e3efdf',
  selectedRowBorder: '#84aa7e',
  scanFrameBorder: '#dcebd9',
  scanOverlayText: '#ffffff', // 扫码页文字：压在**相机画面**上（不是 App 面），两套主题同值
  shortcutText: '#6c766f',
  shortcutAction: '#47724c',
  sectionLabel: '#59655c',
};

/** 主题配色表：键集与亮色一致（缺键编译报错）。 */
export type ThemeColors = { [K in keyof typeof lightColors]: string };

/**
 * 深色配色。带 PC 变量名的逐字取 `[data-theme="dark"]` 的值；
 * 手机端自有色（下面那组）PC 没有对应 token，按同一套层级配的（外深内浅、正文对比对齐 #d4d4d4 系）。
 */
export const darkColors: ThemeColors = {
  // ── 品牌与语义色（PC 深色段下 accent 变灰白，但用户气泡不跟随 accent，见下方气泡段）──
  accent: '#d4d4d4', // --color-accent
  accentHover: '#e5e5e5', // --color-accent-hover
  success: '#22c55e', // --color-success
  successBg: '#12361c', // --color-success-bg
  successSoft: '#122616', // --color-success-soft
  warning: '#f59e0b', // --color-warning
  danger: '#ef4444', // --color-danger
  dangerBg: '#361212', // --color-danger-bg
  info: '#22d3ee', // --color-info
  infoSoft: '#122226', // --color-info-soft
  done: '#24ad3a', // --color-done（深色下调暗一档）
  interrupt: '#e0a725', // --color-interrupt
  fail: '#ff5f57', // --color-fail
  permissionOn: '#ed7482', // PC 深色段未覆盖，与亮色同值
  // PC 深色段用 color-mix(success/danger 12%, transparent)：RN 无 color-mix，按同比例折成 rgba
  diffAdd: 'rgba(34,197,94,0.12)',
  diffRemove: 'rgba(239,68,68,0.12)',

  // ── 文字 ────────────────────────────────────
  textPrimary: '#d4d4d4', // --color-text-primary
  textSecondary: '#909090', // --color-text-secondary
  textMuted: '#6e6e6e', // --color-text-muted
  textInverse: '#1b1b1b', // --color-text-inverse

  // ── 面与线（外深内浅四级嵌套）──────────────────
  surface: '#181818', // --color-canvas
  surfaceAlt: '#1c1c1c', // --color-sidebar
  surfaceHover: '#262626', // --color-sidebar-hover
  content: '#141414', // --color-content（页面底）
  card: '#222222', // --color-card
  cardAgent: '#1c1c1c', // --color-card-agent
  elevated: '#1c1c1c', // --color-elevated（与输入卡片同档）
  inputField: '#212121', // --color-input-field
  border: '#414141', // --color-border
  borderLight: '#363636', // --color-border-light
  divider: '#2c2c2c', // --color-divider
  black: '#000000', // 阴影基色

  // ── 内容区 ───────────────────────────────────
  chatPanel: 'rgba(255,255,255,0.045)',
  chatInset: 'rgba(0,0,0,0.14)',
  chatCode: 'rgba(7,15,20,0.32)',
  chatDivider: 'rgba(223,234,239,0.10)',
  thinkingBody: '#171717', // --thinking-body（比 card-agent 深一档）
  cmdBox: '#202020', // --color-cmd-box（比 thinking-body 亮一档）
  codeBlockBg: '#1d1d23', // --color-code-block-bg
  codeBlockHeader: '#18181d', // --color-code-block-header
  codeSurface: '#1b1b1c', // --color-monaco-bg
  toolTitle: '#b0b0b0', // --color-tool-title

  // ── 状态点 ──────────────────────────────────
  dotGray: '#444444', // --color-dot-gray

  // ── 气泡：PC 深色段固定蓝 #183e76，不跟随变灰的 accent ──
  // 来源：桌面端 app/renderer/src/index.css:505-506（[data-theme="dark"]，提交 ce1aa477 / 2026-10-25）
  userBubbleBg: '#183e76', // --msg-user-bg
  userBubbleText: '#f6fafe', // --msg-user-text

  // ── 手机端自有色：PC 无对应 token，按深色层级自配 ──────
  systemLabel: '#8d948d', // 系统卡图标/标签：亮色 #777b77 → 深底上提亮，保持中性
  logText: '#8a8a8a', // 后台命令输出：亮色 #777777 → 提亮到可读
  projectChevron: '#9aa59c', // 标题栏项目切换箭头：亮色 #58655c → 提亮，压在 surface 上可辨
  chipBg: '#262a27', // 芯片底：亮色 #edf0ea → 比 card(#222) 亮一档
  chipSelectedBg: '#2c3a2e', // 选中芯片底：保留亮色的绿调倾向
  chipSelectedBorder: '#5f8a63', // 选中芯片描边：绿调提亮到可辨
  askBg: '#2a2415', // 提问卡底：亮色暖黄 #fff5d8 → 暖黄暗调
  askText: '#e3d6b4', // 提问卡文字：亮色 #4f4221 → 暖白，与暖底配套
  inputBorder: '#3a403a', // 输入框描边：亮色 #d8dcd4 → 比 border(#414141) 略柔和
  ambientBase: '#0b1310',
  // 深色下环境层必须真的「有颜色」：原来这几档太暗，整屏采样只有 ~(20,30,30)，
  // 玻璃采到的是一片黑，材质再精细也看不出来（实测截图见 .workbuddy/memory）
  ambientGreen: '#17553d',
  ambientBlue: '#1b3557',
  ambientCool: '#19334b',
  glassFill: 'rgba(255,255,255,0.10)',
  liquidFill: 'rgba(255,255,255,0.04)',
  liquidClearFill: 'rgba(0,0,0,' + liquidPreset.parameters.tintDark + ')',
  // 深色玻璃用「薄白」而不是「深灰」：深灰叠加在暗背景上会把面板压成一块黑板，
  // 实测面板内外只差 10 个灰阶，完全没有材质感
  glassFillStrong: 'rgba(255,255,255,0.06)',
  glassRim: 'rgba(255,255,255,0.22)',
  glassSheen: 'rgba(255,255,255,0.22)',
  glassShadow: 'rgba(0,0,0,0.55)',
  glassPress: 'rgba(255,255,255,0.07)',
  composerActive: 'rgba(65,174,145,0.18)',
  contextRingTrack: 'rgba(185,193,191,0.62)',
  contextRingProgress: '#16a34a',
  segmentBg: '#1f1f1f',
  segmentThumb: '#333333',
  floatingActionIcon: '#b1d7bf',
  frostedSheetFill: 'rgba(26,29,28,0.83)',
  frostedSelection: 'rgba(255,255,255,0.10)',
  sheetBg: '#1c1c1c', // 会话操作弹层：与 elevated 同档（弹层靠描边+阴影分层）
  sheetText: '#d4d4d4', // 弹层标题文字：与 textPrimary 同值
  overlay: 'rgba(0,0,0,0.6)', // 遮罩：亮色是浅绿灰半透明，深色改为纯黑加压
  selectedRowBg: '#243024', // 选中行底：保留绿调倾向
  selectedRowBorder: '#5f8a63', // 选中行描边：同 chipSelectedBorder
  // 扫码页两色不随主题变：取景框与标题压在相机画面上，背景不是 App 的面（深浅色下都得看得清）
  scanFrameBorder: '#dcebd9',
  scanOverlayText: '#ffffff',
  shortcutText: '#9aa59c', // 快捷键说明文字
  shortcutAction: '#7fae84', // 快捷键动作文字（绿调提亮）
  sectionLabel: '#9aa59c', // 设置区标题：亮色 #59655c → 提亮
};

/** 字号（px）。阅读区档（body/detail/caption/code）与 UI 档（xxs~lg）并存，镜像 PC 两套语义。 */
export const fontSize = {
  xxs: 10, // --text-2xs / --text-meta
  ui11: 11, // --text-11
  code: 11, // --text-code
  caption: 12, // --text-caption
  xs: 12, // --text-xs
  sm: 13, // --text-sm
  detail: 13, // --text-detail
  body: 14, // --text-body
  base: 15, // --text-base
  md: 16,
  title: 17,
  lg: 18, // --text-lg
  xl: 20,
  xxl: 22,
  display: 42, // 品牌字标 / 配对码
} as const;

/** 间距（px），镜像 PC 的 --s1…--s16。 */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s6: 24,
  s8: 32,
  s12: 48,
  s16: 64,
} as const;

/**
 * 聊天区统一左右内边距（= s4）。
 *
 * **消息列、状态行、后台任务条、提问卡、输入卡都用这一个值**，左边界才会是一条线。
 *
 * 注意这不是照搬桌面端：桌面端 `.statusbar` / `.input-card` / 各提示条共用
 * `--chat-content-inset`（= s16 + 75px，卡片居中后的左沿），**消息列另有自己的列内边距**
 * （有 avatar 槽，`calc(s8 + s4)`）——两者在宽屏上本来就不齐，是刻意的。
 * 手机端没有头像槽、卡片也不居中，少一层结构，同屏只该有一条左边线：
 * 曾经各写各的（消息 14 / 状态行 20 / 后台条 16 / 提问卡 10 / 输入卡 16），
 * 五条边界并排就是「对不齐」的来源。新增贴在聊天页底部/顶部的块请复用这个常量。
 */
export const chatInset = space.s4;

/** 圆角：全站只有两档——常规面用 lg，圆形/胶囊用 full。 */
export const radius = {
  lg: 8,
  full: 9999,
} as const;

/** 阴影分组：镜像 PC 的 --shadow-xs/sm/md/lg（RN 的 shadowRadius 对应 CSS blur-radius）。 */
export type ThemeShadow = {
  sm: ViewStyle;
  md: ViewStyle;
  lg: ViewStyle;
};

/** 亮色阴影：PC 亮色段是 5% 淡影。 */
export const lightShadow: ThemeShadow = {
  sm: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/**
 * 深色阴影：几何与亮色一致，压重到 PC 深色段（--shadow-sm/md/lg 是 0.5/0.6/0.7）的量级——
 * 深底上淡影等于没有，浮层分层要靠它。PC 深色那层 `inset 0 1px 0` 顶部内高光 RN 表达不了，略去。
 */
export const darkShadow: ThemeShadow = {
  sm: { ...lightShadow.sm, shadowOpacity: 0.5, elevation: 3 },
  md: { ...lightShadow.md, shadowOpacity: 0.6, elevation: 6 },
  lg: { ...lightShadow.lg, shadowOpacity: 0.7, elevation: 10 },
};
