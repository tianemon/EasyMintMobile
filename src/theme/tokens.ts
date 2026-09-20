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
  // ── 品牌与语义色（PC 深色段下 accent 变灰白，用户气泡随之变深灰）──
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
  thinkingBody: '#171717', // --thinking-body（比 card-agent 深一档）
  cmdBox: '#202020', // --color-cmd-box（比 thinking-body 亮一档）
  codeBlockBg: '#1d1d23', // --color-code-block-bg
  codeBlockHeader: '#18181d', // --color-code-block-header
  codeSurface: '#1b1b1c', // --color-monaco-bg
  toolTitle: '#b0b0b0', // --color-tool-title

  // ── 状态点 ──────────────────────────────────
  dotGray: '#444444', // --color-dot-gray

  // ── 气泡（PC 深色下用户气泡是深灰，不是品牌绿）──────
  userBubbleBg: '#2a2a2a', // --msg-user-bg
  userBubbleText: '#d4d4d4', // --msg-user-text = var(--color-text-primary)

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
