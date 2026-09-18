import type { ViewStyle } from 'react-native';

/**
 * 移动端设计 token —— 与桌面端 `app/renderer/src/index.css` 的亮色段一一对应。
 *
 * 手机端固定亮色（见 `mobile/app.json` 的 `userInterfaceStyle: "light"`），因此只维护一套值，
 * 不做主题切换。PC 侧改 token 时需同步本文件。
 *
 * 命名约定：`colors` / `fontSize` 的键名镜像 PC 的 CSS 变量语义
 * （`body/detail/caption/code` 为阅读区字号，`xxs/xs/sm/base/lg` 为 UI 字号）。
 */
export const colors = {
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
  permissionOn: '#ed7482', // --color-permission-on（权限「完全访问」轨道玫红）

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

  // ── 以下为移动端自有色：PC index.css 无对应 token ──────
  // 值沿用拆分前实现，勿自行调整；PC 侧改配色时无需同步。
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
  shortcutText: '#6c766f',
  shortcutAction: '#47724c',
  sectionLabel: '#59655c',
} as const;

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
  chevron: 30, // 列表行指示箭头（当前是文字符号，换成 SVG 图标后移除）
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

/** 阴影：镜像 PC 的 --shadow-xs/sm/md/lg（RN 的 shadowRadius 对应 CSS blur-radius）。 */
export const shadow = {
  sm: {
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  lg: {
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;
