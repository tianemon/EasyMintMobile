import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { PermissionMode } from '../protocol/types';
import { colors } from '../theme/tokens';

/**
 * 内联 SVG 图标库 —— path 数据抄自 PC 端手抄的 Lucide 路径（ChatBlocks 的工具图标表与
 * brain/spinner/折叠箭头/成功失败符、ChatPanel 的系统卡三图标、DelegationProgress 的委派五态、
 * PinLayer 的钉住图标），不引图标库，保证两端描边风格与尺寸一致。
 *
 * PC 用 `stroke="currentColor"` 继承文字色；RN 无此机制，改为每个图标由 color prop 传入
 * （默认值取该图标在 PC 上的语义色），尺寸统一走 iconSize 五档。
 * react-native-svg 会把 `<Svg>` 根上的 stroke/strokeWidth/linecap 继承给子元素
 * （原生 mergeProperties），因此子形状只写几何数据。
 */

/** 图标尺寸五档，取值与 PC 内联 SVG 的 width/height 一致 */
export const iconSize = {
  /** 10：工具卡成功 / 失败状态符 */
  status: 10,
  /** 11：后台浮层行的转圈 */
  pill: 11,
  /** 12：系统卡 kind 图标、工具执行中转圈、列表行标记 */
  card: 12,
  /** 13：工具图标、思考块标识、委派状态 */
  tool: 13,
  /** 14：列表行与导航箭头 */
  nav: 14,
} as const;

type GlyphProps = {
  size: number;
  color: string;
  viewBox?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  children: ReactNode;
};

/** 统一外壳：fill=none + stroke 描边风格（与 PC 的 svg 属性逐项对应） */
function Glyph({ size, color, viewBox = '0 0 24 24', strokeWidth = 2, strokeOpacity, children }: GlyphProps) {
  return <Svg width={size} height={size} viewBox={viewBox} fill="none" stroke={color} strokeWidth={strokeWidth}
    strokeOpacity={strokeOpacity} strokeLinecap="round" strokeLinejoin="round">{children}</Svg>;
}

// ── 模型图标（PC ModelGlyph.tsx + index.css 的 model-glyph-* 的 1:1 复刻）────────

/**
 * 三个节点：**只有 a 实心**，b / c 是空心描边。
 * 这是与 PC 最容易被漏掉的一处差异（曾把三个都画成实心）。
 */
const GLYPH_NODES = [
  { cx: 5, cy: 12, filled: true },
  { cx: 19, cy: 5.5, filled: false },
  { cx: 19, cy: 18.5, filled: false },
] as const;
/** 三条连线，d 取 PC 原文 */
const GLYPH_EDGES = ['M7.4 10.9 16.6 6.6', 'M7.4 13.1 16.6 17.4', 'M19 8.1v7.8'] as const;
const GLYPH_NODE_R = 2.6;
const GLYPH_STROKE = 2;
/** 聚拢动画的三角形中心与收缩比（PC 的位移量就是由这两个数推出来的） */
const GLYPH_CENTER = { x: 14.33, y: 12 };
const GLYPH_GATHER = 0.45;
/** 单程时长；往返一个循环 2.4s，对齐 PC 的 `2.4s ease-in-out infinite` */
const GLYPH_HALF_CYCLE_MS = 1200;
/** 绘图用的 24 视图盒边长（外层容器是 size 见方，两者比就是缩放比） */
const GLYPH_VIEWBOX = 24;

/**
 * 模型图标（三点互联 + 连线）：输入卡的模型标签与状态行共用，与 PC 同一套几何。
 *
 * `animated` 只有状态行要（输入卡的标签保持静态，避免与状态行同时动）。
 * 动画在这边不能用 react-native-svg 的 props 走原生驱动（cx/cy 不是 style 属性，只能用 JS 驱动，
 * 而流式期间 JS 线程本来就满），所以拆成三个绝对定位的 Animated.View 各自平移 +
 * 一层连线整体缩放 —— 位移量与连线缩放都走 transform，能开 useNativeDriver，不占 JS 线程。
 */
export function ModelGlyph({ size = 15, color = colors.textMuted, animated = false }: { size?: number; color?: string; animated?: boolean }) {
  const nodes = GLYPH_NODES.map((node) => <Circle key={`${node.cx}-${node.cy}`} cx={node.cx} cy={node.cy} r={GLYPH_NODE_R}
    fill={node.filled ? color : 'none'} />);
  const edges = GLYPH_EDGES.map((d) => <Path key={d} d={d} />);
  const box = { width: size, height: size } as const;
  const svgProps = { viewBox: `0 0 ${GLYPH_VIEWBOX} ${GLYPH_VIEWBOX}`, fill: 'none', stroke: color, strokeWidth: GLYPH_STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

  if (!animated) return <Svg width={size} height={size} {...svgProps}>{nodes}{edges}</Svg>;
  return <AnimatedModelGlyph size={size} box={box} svgProps={svgProps} nodes={nodes} edges={edges} />;
}

type GlyphSvgProps = { viewBox: string; fill: string; stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round' };

function AnimatedModelGlyph({ size, box, svgProps, nodes, edges }: {
  size: number; box: { width: number; height: number }; svgProps: GlyphSvgProps; nodes: ReactNode; edges: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: GLYPH_HALF_CYCLE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration: GLYPH_HALF_CYCLE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [progress]);

  // 视图坐标 → 屏幕像素（Svg 画在 24 视图盒里，外层容器只有 size 见方）
  const k = size / GLYPH_VIEWBOX;
  return <View style={box}>
    {/* 连线层：以三角形中心为原点整体缩到 45%，端点自然跟着节点走（同 PC 的 .model-glyph-edge） */}
    <Animated.View style={[glyphLayer, box, {
      transformOrigin: `${GLYPH_CENTER.x * k}px ${GLYPH_CENTER.y * k}px`,
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, GLYPH_GATHER] }) }],
    }]}>
      <Svg width={size} height={size} {...svgProps}>{edges}</Svg>
    </Animated.View>
    {GLYPH_NODES.map((node, index) => (
      <Animated.View key={`${node.cx}-${node.cy}`} style={[glyphLayer, box, {
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, (GLYPH_CENTER.x - node.cx) * (1 - GLYPH_GATHER) * k] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, (GLYPH_CENTER.y - node.cy) * (1 - GLYPH_GATHER) * k] }) },
        ],
      }]}>
        <Svg width={size} height={size} {...svgProps}>{(nodes as ReactNode[])[index]}</Svg>
      </Animated.View>
    ))}
  </View>;
}

/** 动画分层容器：每层都是 size 见方的绝对定位层，各自做 transform（不吃 StyleSheet——本文件无样式表） */
const glyphLayer = { position: 'absolute', left: 0, top: 0 } as const;

// ── 形状数据（24 视图盒 / 16 视图盒，抄自 PC）────────────────

/** 大脑（Lucide brain）：思考块标识，与输入卡思考等级图标同源 */
const BRAIN: ReactNode = <>
  <Path d="M12 18V5" />
  <Path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
  <Path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
  <Path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
  <Path d="M18 18a4 4 0 0 0 2-7.464" />
  <Path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
  <Path d="M6 18a4 4 0 0 1-2-7.464" />
  <Path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
</>;

/** 机器人（Lucide bot）：委派 Agent / 系统卡 delegation / Agent 胶囊 */
const BOT: ReactNode = <>
  <Path d="M12 8V4H8" />
  <Rect width={16} height={12} x={4} y={8} rx={2} />
  <Path d="M2 14h2" />
  <Path d="M20 14h2" />
  <Path d="M15 13v2" />
  <Path d="M9 13v2" />
</>;

/** 终端（Lucide terminal-square）：bash/后台命令 / 系统卡 shell / Shell 胶囊 */
const TERMINAL: ReactNode = <>
  <Path d="m7 11 2-2-2-2" />
  <Path d="M11 13h4" />
  <Rect width={18} height={18} x={3} y={3} rx={2} ry={2} />
</>;

/** 圆圈感叹号（系统卡其余 kind） */
const ALERT: ReactNode = <>
  <Circle cx={8} cy={8} r={6.5} />
  <Path d="M8 7.5V11" />
  <Path d="M8 5h.01" />
</>;

/** 钉住（PC PinLayer 同一 path） */
const PIN: ReactNode = <>
  <Path d="M8 11.3V15" />
  <Path d="M6 7.2a1.33 1.33 0 0 1-.74 1.19l-1.19.6A1.33 1.33 0 0 0 3.33 10.16v.51a.67.67 0 0 0 .67.67h8a.67.67 0 0 0 .67-.67v-.51a1.33 1.33 0 0 0-.74-1.2l-1.19-.6a1.33 1.33 0 0 1-.74-1.2V4.67a.67.67 0 0 1 .67-.67 1.33 1.33 0 0 0 0-2.67H5.33a1.33 1.33 0 0 0 0 2.67.67.67 0 0 1 .67.67z" />
</>;

/** 已归档（PC 会话行的归档标记） */
const ARCHIVE: ReactNode = <>
  <Circle cx={8} cy={8} r={6} />
  <Path d="M8 4v5M8 8l2.5 2.5" />
</>;

/** 折叠箭头（PC 通用，10 视图盒）：收起指向右，展开 rotate-90 指向下 */
const CHEVRON = <Path d="M3.5 2l3 3-3 3" />;

type IconSpec = {
  defaultSize: number;
  defaultColor: string;
  viewBox?: string;
  strokeWidth?: number;
  node: ReactNode;
};

/** 非工具类图标的默认尺寸/颜色 + 形状（默认值 = 该图标在 PC 上的语义场景） */
const ICONS = {
  brain: { defaultSize: iconSize.tool, defaultColor: colors.toolTitle, node: BRAIN },
  check: { defaultSize: iconSize.status, defaultColor: colors.success, strokeWidth: 2.5, node: <Path d="M20 6 9 17l-5-5" /> },
  cross: {
    defaultSize: iconSize.status, defaultColor: colors.danger, strokeWidth: 2.5,
    node: <><Path d="M18 6 6 18" /><Path d="m6 6 12 12" /></>,
  },
  bot: { defaultSize: iconSize.tool, defaultColor: colors.toolTitle, node: BOT },
  terminal: { defaultSize: iconSize.tool, defaultColor: colors.toolTitle, node: TERMINAL },
  alert: { defaultSize: iconSize.card, defaultColor: colors.toolTitle, viewBox: '0 0 16 16', strokeWidth: 1.6, node: ALERT },
  pin: { defaultSize: iconSize.card, defaultColor: colors.textMuted, viewBox: '0 0 16 16', strokeWidth: 1.3, node: PIN },
  archive: { defaultSize: iconSize.card, defaultColor: colors.textMuted, viewBox: '0 0 16 16', strokeWidth: 1.3, node: ARCHIVE },
} satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICONS | 'spinner';

/** 通用图标入口：`<Icon name="brain" size={iconSize.tool} color={colors.textMuted} />` */
export function Icon({ name, size, color }: { name: IconName; size?: number; color?: string }) {
  if (name === 'spinner') return <SpinIcon size={size} color={color} />;
  const spec: IconSpec = ICONS[name];
  return <Glyph size={size ?? spec.defaultSize} color={color ?? spec.defaultColor} viewBox={spec.viewBox} strokeWidth={spec.strokeWidth}>{spec.node}</Glyph>;
}

/** 转圈（PC animate-spin 的 RN 版：外层 Animated 旋转） */
export function SpinIcon({ size = iconSize.card, color = colors.accent }: { size?: number; color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, {
      toValue: 1,
      duration: 900,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
    <Glyph size={size} color={color} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={6} opacity={0.25} />
      <Path d="M14 8a6 6 0 00-6-6" strokeLinecap="round" />
    </Glyph>
  </Animated.View>;
}

/** 折叠箭头：收起（右）/ 展开（下）/ 返回（左） */
export function ChevronIcon({ size = iconSize.status, color = colors.textMuted, direction = 'right' }: {
  size?: number;
  color?: string;
  direction?: 'right' | 'down' | 'left';
}) {
  const rotate = direction === 'left' ? '180deg' : direction === 'down' ? '90deg' : '0deg';
  return <View style={{ width: size, height: size, transform: [{ rotate }] }}>
    <Glyph size={size} color={color} viewBox="0 0 10 10" strokeWidth={1.6}>{CHEVRON}</Glyph>
  </View>;
}

/** 系统卡头部 kind 图标：委派=bot / 后台命令=终端 / 其余=圆圈感叹号 */
export function SystemKindIcon({ kind, size = iconSize.card, color = colors.toolTitle }: { kind: string; size?: number; color?: string }) {
  if (kind === 'delegation') return <Icon name="bot" size={size} color={color} />;
  if (kind === 'shell') return <Icon name="terminal" size={size} color={color} />;
  return <Icon name="alert" size={size} color={color} />;
}

export type DelegateStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

/**
 * 委派状态五态：运行中=转圈(accent) / 完成=圆勾(success) / 失败=圆叉(danger) /
 * 中止=圆内双竖线(textSecondary，主动停止 ≠ 执行报错) / 待运行=空心圆(60% 灰，区别于中止)
 */
export function DelegateStatusIcon({ status, size = iconSize.tool }: { status?: DelegateStatus; size?: number }) {
  if (status === 'running') return <SpinIcon size={size} />;
  if (status === 'completed') {
    return <Glyph size={size} color={colors.success} viewBox="0 0 16 16" strokeWidth={1.6}>
      <Circle cx={8} cy={8} r={6.5} /><Path d="M5 8l2 2 4-4" />
    </Glyph>;
  }
  if (status === 'failed') {
    return <Glyph size={size} color={colors.danger} viewBox="0 0 16 16" strokeWidth={1.6}>
      <Circle cx={8} cy={8} r={6.5} /><Path d="M6 6l4 4M10 6l-4 4" />
    </Glyph>;
  }
  if (status === 'aborted') {
    return <Glyph size={size} color={colors.textSecondary} viewBox="0 0 16 16" strokeWidth={1.6}>
      <Circle cx={8} cy={8} r={6.5} /><Path d="M6.5 6v4M9.5 6v4" />
    </Glyph>;
  }
  return <Glyph size={size} color={colors.textSecondary} strokeOpacity={0.6} viewBox="0 0 16 16" strokeWidth={1.6}>
    <Circle cx={8} cy={8} r={6.5} />
  </Glyph>;
}

// ── 工具图标 ─────────────────────────────────────────

/** 工具图标形状：按 name 归类取 Lucide path（映射与 PC `toolIconPaths` 逐条对应） */
function toolIconShape(name: string): ReactNode | null {
  let n = name.toLowerCase();
  if (n.startsWith('mcp__')) n = 'mcp'; // MCP 工具统一扳手
  switch (n) {
    case 'bash': case 'powershell': return <><Path d="m7 11 2-2-2-2" /><Path d="M11 13h4" /><Rect width={18} height={18} x={3} y={3} rx={2} ry={2} /></>;
    case 'edit': return <><Path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34" /><Path d="M14 2v5a1 1 0 0 0 1 1h5" /><Path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z" /></>;
    case 'read': return <><Path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><Circle cx={12} cy={12} r={3} /></>;
    case 'write': return <><Path d="M13 21h8" /><Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></>;
    // 搜索文件（file-search-corner）
    case 'grep': return <><Path d="M11.1 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.589 3.588A2.4 2.4 0 0 1 20 8v3.25" /><Path d="M14 2v5a1 1 0 0 0 1 1h5" /><Path d="m21 22-2.88-2.88" /><Circle cx={16} cy={17} r={3} /></>;
    // 目录类：find 展开态 / ls 收起态（PC 与 FileTreePanel 同源）
    case 'find': return <Path d="m6 14 1.5-2.9A2 2 0 019.24 10H20a2 2 0 011.94 2.5l-1.54 6a2 2 0 01-1.95 1.5H4a2 2 0 01-2-2V7c0-1.1.9-2 2-2h2" />;
    case 'ls': return <Path d="M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.9a2 2 0 01-1.69-.9L9.6 3.9A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />;
    // agent 类（bot）
    case 'task': case 'create_agent_template': case 'list_agents': case 'read_agent_log': case 'stop_agent': return BOT;
    // 知识 / 技能（wrench）
    case 'use_skill': case 'manage_skill': case 'learn': case 'search_experiences':
    case 'import_skill': case 'import_mcp_server':
      return <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />;
    // MCP 工具调用（plug）
    case 'mcp': return <><Path d="M12 22v-5" /><Path d="M15 8V2" /><Path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" /><Path d="M9 8V2" /></>;
    // 项目类（folder-kanban）
    case 'show_confirm_dev': case 'refresh_tasks': case 'set_task_status': case 'show_prototype':
      return <><Path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /><Path d="M8 10v4" /><Path d="M12 10v2" /><Path d="M16 10v6" /></>;
    // issue（bug）
    case 'list_issues': case 'set_issue_status':
      return <><Path d="M12 20v-9" /><Path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" /><Path d="M14.12 3.88 16 2" /><Path d="M21 21a4 4 0 0 0-3.81-4" /><Path d="M21 5a4 4 0 0 1-3.55 3.97" /><Path d="M22 13h-4" /><Path d="M3 21a4 4 0 0 1 3.81-4" /><Path d="M3 5a4 4 0 0 0 3.55 3.97" /><Path d="M6 13H2" /><Path d="m8 2 1.88 1.88" /><Path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" /></>;
    // 联网搜索（world-search：地球 + 放大镜）
    case 'web_search':
      return <><Path d="M21 12a9 9 0 1 0 -9 9" /><Path d="M3.6 9h16.8" /><Path d="M3.6 15h7.9" /><Path d="M11.5 3a17 17 0 0 0 0 18" /><Path d="M12.5 3a16.984 16.984 0 0 1 2.574 8.62" /><Path d="M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><Path d="M20.2 20.2l1.8 1.8" /></>;
    // 抓取网页（world-download：地球 + 下箭头）——与搜索同族但动作必须能区分
    case 'web_fetch':
      return <><Path d="M21 12a9 9 0 1 0 -9 9" /><Path d="M3.6 9h16.8" /><Path d="M3.6 15h8.4" /><Path d="M11.578 3a17 17 0 0 0 0 18" /><Path d="M12.5 3c1.719 2.755 2.5 5.876 2.5 9" /><Path d="M18 14v7m-3 -3l3 3l3 -3" /></>;
    // 待办（list-clock）
    case 'todo_write': case 'todo_user':
      return <><Path d="M16 13v2.2l1.6 1" /><Path d="M3 12h3.458" /><Path d="M3 19h3.832" /><Path d="M3 5h18" /><Circle cx={16} cy={15} r={6} /></>;
    // 提问（message-circle-question-mark）
    case 'ask_user':
      return <><Path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /><Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><Path d="M12 17h.01" /></>;
    // 图片（photo-ai）
    case 'describe_image':
      return <><Path d="M15 8h.01" /><Path d="M10 21h-4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5" /><Path d="M3 16l5-5c.928-.893 2.072-.893 3 0l1 1" /><Path d="M14 21v-4a2 2 0 1 1 4 0v4" /><Path d="M14 19h4" /><Path d="M21 15v6" /></>;
    default: return null;
  }
}

/** 工具标题图标（按工具名归类，未知工具不渲染——与 PC 一致） */
export function ToolIcon({ name, size = iconSize.tool, color = colors.toolTitle }: { name: string; size?: number; color?: string }) {
  const shape = toolIconShape(name);
  if (!shape) return null;
  return <Glyph size={size} color={color}>{shape}</Glyph>;
}

// ── 输入卡与其它自有图标 ──────────────────────────────

/** 输入卡工具栏图标：模型 / 权限 / 思考等级 */
export function ComposerIcon({ kind, permission }: { kind: 'model' | 'permission' | 'thinking'; permission?: PermissionMode }) {
  const color = kind === 'permission' && permission === 'full' ? colors.permissionOn : colors.textMuted;
  if (kind === 'model') return <ModelGlyph size={15} color={color} />;
  if (kind === 'permission') return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    {permission === 'full' ? <><Path d="M12 8v4" /><Path d="M12 16h.01" /></> : permission === 'readonly' ? <><Rect x={9} y={11} width={6} height={5} rx={1} /><Path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" /></> : <Path d="m9 12 2 2 4-4" />}
  </Svg>;
  return <Glyph size={15} color={color}>{BRAIN}</Glyph>;
}

/**
 * 附件类型图标：图片 / 文档。path 与描边参数抄自 PC `ChatInput.tsx` 附件菜单里的两个内联 svg
 * （`width/height=15`、`viewBox="0 0 16 16"`、`strokeWidth=1.4`）——比工具栏图标的 stroke 2 细一档，照抄不归一。
 */
export function AttachmentKindIcon({ kind, size = 15, color = colors.textSecondary }: { kind: 'image' | 'doc'; size?: number; color?: string }) {
  return <Glyph size={size} color={color} viewBox="0 0 16 16" strokeWidth={1.4}>
    {kind === 'image'
      ? <><Rect x={1.5} y={2.5} width={13} height={11} rx={2} /><Circle cx={5} cy={6} r={1.2} /><Path d="M1.5 11l3.5-3.5 2.5 2.5 3-4 4 5" /></>
      : <><Path d="M3 2h7l4 4v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><Path d="M10 2v4h4M6 9h4M6 12h4" /></>}
  </Glyph>;
}

/** 发送键图标（停止态是红方块） */
export function SendIcon({ stop }: { stop: boolean }) {
  return <Svg width={stop ? 16 : 14} height={stop ? 16 : 14} viewBox="0 0 16 16" fill="currentColor" color={stop ? colors.danger : colors.textInverse}>
    {stop ? <Rect x={3} y={3} width={10} height={10} rx={1} fill={colors.danger} /> : <Path d="M1 1l14 7-14 7 4-7-4-7z" fill={colors.textInverse} />}
  </Svg>;
}

/** 新建会话悬浮按钮图标（圆角气泡 + 加号，与桌面 SessionBar 同源） */
export function NewChatIcon() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" stroke={colors.textInverse} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><Path d="M8 12h8M12 8v8" stroke={colors.textInverse} strokeWidth={1.8} strokeLinecap="round" /></Svg>;
}
