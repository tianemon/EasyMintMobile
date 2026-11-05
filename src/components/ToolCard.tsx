import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { diffStats, numberLines } from '../session/diff';
import type { DisplayNestedCall, DisplayToolBlock } from '../session/messages';
import { truncateToolOutput } from '../session/messages';
import { isCommandTool, toolCommand, toolDescription, toolDisplay, toolLabel } from '../session/tools';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import { DiffView } from './DiffView';
import { ChevronIcon, Icon, SpinIcon, ToolIcon, iconSize } from './icons';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 展开区高度上限：对齐 PC 的 `calc(var(--text-detail) * 9.75 + 28px)`（约 6 行 + 内边距） */
const BASH_BODY_MAX_HEIGHT = fontSize.detail * 9.75 + 28;
/** PC 的 `leading-[1.625]`（13px 字号 → 21.125px 行高） */
const BASH_LINE_HEIGHT = 1.625;
const TEXT_BODY_MAX_HEIGHT = 220;

type ToolCardProps = {
  tool: DisplayToolBlock;
  /** 内层滚动期间锁住外层 inverted 列表（与思考块同款：边界剩余位移不能跨坐标系交给父列表） */
  onInnerScrollGesture: (active: boolean) => void;
  /** 所在回合是否仍在跑：false 时「running」状态表示「没等到结果」，显示未完成而不是一直转圈 */
  live?: boolean;
};

/** 工具卡动作 → 状态图标（运行中转圈、失败红叉、完成对勾；回合已结束仍无结果的标「未完成」） */
function StateGlyph({ tool, live }: { tool: DisplayToolBlock; live: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (tool.state === 'running') {
    return live ? <SpinIcon size={iconSize.card} color={colors.accent} /> : <Text style={styles.duration}>未完成</Text>;
  }
  return tool.state === 'error' ? <Icon name="cross" /> : <Icon name="check" />;
}

/** 文件路径工具取参数里的路径（Pi 用 file_path，部分工具用 path） */
function filePathOf(input: Record<string, unknown> | undefined): string {
  const value = input?.file_path ?? input?.path;
  return typeof value === 'string' ? value : '';
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

/**
 * 工具调用卡。形态**按工具分叉**，与桌面端 `ChatBlocks.tsx:934-1162` 的 SingleToolCard 对齐：
 *
 *  - `read`：只渲染一行「查看 · 文件名 + 状态」——文件内容已在结果里，手机上没必要铺一遍
 *  - `edit`（结果带 `edit_diff`）：标题行给 `+N -M` 统计，展开看**堆叠式 diff**
 *  - `write`：标题行给行数，展开看**带行号的内容预览**（新建/整体重写没有旧内容可比）
 *  - `bash`：标题只放动作词 + description，命令与输出进展开区（封顶 6 行滚动）
 *  - 权限拦截（`permission_denied`）：标题标「需要完全访问」，不把拦截横幅渲染成红色报错
 *  - 其余工具：标题 + 可展开的原始输出（超 30 行只留尾部 20 行）
 *
 * 子 Agent 调用（`nested`）一律挂在卡下方做缩进子行，与桌面端同位置。
 */
export function ToolCard({ tool, onInnerScrollGesture, live = true }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const name = tool.name.toLowerCase();
  const input = tool.input ?? {};
  const commandTool = isCommandTool(tool.name);
  const command = commandTool ? toolCommand(input) : '';
  const description = commandTool ? toolDescription(input) : '';
  const label = toolLabel(tool.name);
  const filePath = filePathOf(input);
  const fileName = filePath ? basename(filePath) : '';
  const permission = tool.presentation?.kind === 'permission_denied' ? tool.presentation : undefined;
  const diff = tool.presentation?.kind === 'edit_diff' ? tool.presentation : undefined;
  const stats = diff ? diffStats(diff.diff, diff) : null;
  const writeContent = name === 'write' && typeof input.content === 'string' ? input.content : undefined;
  const writeLines = writeContent ? writeContent.split('\n').length : 0;

  // 标题详情：命令类只放 description（命令本身进展开区）；文件类放文件名；其余沿用 toolDisplay 的详情段
  const full = commandTool ? label : toolDisplay(tool);
  const detail = commandTool
    ? description
    : fileName || (full.startsWith(label) ? full.slice(label.length).replace(/^ · /, '') : full);

  const hasBody = permission ? false
    : diff || writeContent !== undefined ? true
      : commandTool ? (!!command || !!tool.output)
        : !!tool.output;

  // read：一行到底，不折叠、不给展开箭头（桌面端 read 分支同款）
  if (name === 'read') {
    return <View style={styles.row}>
      <View style={styles.titleRow}>
        <ToolIcon name={tool.name} />
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        <Text numberOfLines={1} style={styles.detail}>{fileName || '(未知文件)'}</Text>
        <StateGlyph tool={tool} live={live} />
        {tool.durationMs !== undefined && <Text style={styles.duration}>{(tool.durationMs / 1000).toFixed(1)}s</Text>}
      </View>
    </View>;
  }

  return <View style={styles.card}>
    <Pressable disabled={!hasBody} style={styles.row} onPress={() => setExpanded((value) => !value)}>
      <View style={styles.titleRow}>
        <ToolIcon name={tool.name} />
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        {!!detail && <Text numberOfLines={1} style={styles.detail}>{detail}</Text>}
        {!!permission && <Text style={styles.permission}>· 需要完全访问</Text>}
        {!!stats && (stats.added > 0 || stats.removed > 0) && <Text style={styles.stats}>
          <Text style={{ color: colors.success }}>{stats.added > 0 ? `+${stats.added}` : ''}</Text>
          {stats.added > 0 && stats.removed > 0 ? <Text> • </Text> : null}
          <Text style={{ color: colors.danger }}>{stats.removed > 0 ? `-${stats.removed}` : ''}</Text>
        </Text>}
        {!!writeLines && <Text style={styles.detail}>{writeLines} 行</Text>}
        <StateGlyph tool={tool} live={live} />
        {tool.durationMs !== undefined && <Text style={styles.duration}>{(tool.durationMs / 1000).toFixed(1)}s</Text>}
        {hasBody && <ChevronIcon direction={expanded ? 'down' : 'right'} />}
      </View>
    </Pressable>

    {expanded && hasBody && (diff
      ? <View style={styles.diffBody}>
        <DiffView content={diff.diff} presentation={diff} onInnerScrollGesture={onInnerScrollGesture} />
      </View>
      : writeContent !== undefined
        ? <ScrollView
          style={styles.textScroll}
          nestedScrollEnabled={false}
          onTouchStart={() => onInnerScrollGesture(true)}
          onTouchEnd={() => onInnerScrollGesture(false)}
          onScrollEndDrag={() => onInnerScrollGesture(false)}
          onMomentumScrollEnd={() => onInnerScrollGesture(false)}
          onResponderRelease={() => onInnerScrollGesture(false)}
          onResponderTerminate={() => onInnerScrollGesture(false)}
        >
          <Text selectable style={styles.output}>{numberLines(writeContent)}</Text>
        </ScrollView>
        : commandTool
          ? <View style={styles.bashBody}>
            <ScrollView
              style={styles.bashScroll}
              contentContainerStyle={styles.bashScrollContent}
              // 父列表已在本手势内关闭；这里也禁用 nested dispatch，边界剩余位移不上交（同思考块）
              nestedScrollEnabled={false}
              onTouchStart={() => onInnerScrollGesture(true)}
              onTouchEnd={() => onInnerScrollGesture(false)}
              onScrollEndDrag={() => onInnerScrollGesture(false)}
              onMomentumScrollEnd={() => onInnerScrollGesture(false)}
              onResponderRelease={() => onInnerScrollGesture(false)}
              onResponderTerminate={() => onInnerScrollGesture(false)}
            >
              {!!command && <View style={styles.bashCommand}><Text selectable style={styles.bashCommandText}>{command}</Text></View>}
              {!!tool.output && <Text selectable style={styles.bashOutput}>{tool.output}</Text>}
            </ScrollView>
          </View>
          : <ScrollView
            // 限高交给 ScrollView 而不是 Text（Text 的 maxHeight 会把尾部直接裁掉、还滚不动）
            style={styles.textScroll}
            nestedScrollEnabled={false}
            onTouchStart={() => onInnerScrollGesture(true)}
            onTouchEnd={() => onInnerScrollGesture(false)}
            onScrollEndDrag={() => onInnerScrollGesture(false)}
            onMomentumScrollEnd={() => onInnerScrollGesture(false)}
            onResponderRelease={() => onInnerScrollGesture(false)}
            onResponderTerminate={() => onInnerScrollGesture(false)}
          >
            <Text selectable style={styles.output}>{truncateToolOutput(tool.output)}</Text>
          </ScrollView>)}

    {!!tool.nested?.calls.length && <View style={styles.nested}>
      {tool.nested.calls.map((call) => <NestedRow key={call.id} call={call} pending={tool.state === 'running'} />)}
      {tool.state !== 'running' && !tool.nested.complete && <Text style={styles.nestedNote}>部分嵌套调用或参数未保留</Text>}    </View>}
  </View>;
}

/** 子 Agent 内部的一次调用：一行摘要，点开看参数 JSON（桌面端 `details/summary` 的等价物） */
function NestedRow({ call, pending }: { call: DisplayNestedCall; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const styles = useThemedStyles(makeStyles);
  const status = call.status === 'error' ? '失败' : call.status === 'unfinished' ? (pending ? '执行中' : '未完成') : '完成';
  const intent = typeof call.arguments?.description === 'string' ? String(call.arguments.description)
    : typeof call.arguments?.file_path === 'string' ? basename(String(call.arguments.file_path))
      : typeof call.arguments?.path === 'string' ? basename(String(call.arguments.path)) : '';
  return <View>
    <Pressable onPress={() => setOpen((value) => !value)}>
      <Text numberOfLines={1} style={styles.nestedLine}>
        {intent || call.name} · {status}{call.durationMs !== undefined ? ` · ${call.durationMs}ms` : ''}
      </Text>
    </Pressable>
    {open && <Text selectable style={styles.nestedArgs}>
      {call.arguments ? JSON.stringify(call.arguments, null, 2) : '参数未保留'}
      {call.error ? `\n${call.error}` : ''}
    </Text>}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 融入气泡式（非独立卡片）：标题行中性灰，展开区深一档——与桌面端工具行的层级一致
  card: { marginTop: 4, marginBottom: 2, alignSelf: 'stretch' },
  row: { minHeight: 30, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center' },
  // ⚠ 不能用 `flex: 1`（= flexBasis: 0）：气泡按内容撑开，flexBasis 0 会把宽度贡献算成 0，
  // 于是图标与文字全挤在一起。用 flexGrow + flexBasis auto：能填满剩余宽度，也把自然宽度算进气泡。
  titleRow: { flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexShrink: 0, color: colors.toolTitle, fontSize: fontSize.caption, fontWeight: '600' },
  detail: { flexShrink: 1, color: colors.textMuted, fontSize: fontSize.caption },
  permission: { flexShrink: 0, color: colors.textMuted, fontSize: fontSize.caption },
  stats: { flexShrink: 0, fontSize: fontSize.caption },
  duration: { flexShrink: 0, color: colors.textMuted, fontSize: fontSize.caption },
  diffBody: { marginTop: 2, borderRadius: radius.lg, backgroundColor: colors.codeSurface, paddingHorizontal: 6, paddingVertical: 4 },
  textScroll: { flexGrow: 0, flexShrink: 0, maxHeight: TEXT_BODY_MAX_HEIGHT, marginTop: 2, borderRadius: radius.lg, backgroundColor: colors.codeSurface },
  // 桌面端 ChatBlocks.tsx:848 同口径：超过 30 行只留尾部 20 行；限高放在 ScrollView 上才能滚。
  output: { padding: 9, color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.detail, lineHeight: fontSize.detail * BASH_LINE_HEIGHT },
  // 命令类展开区：外层比气泡深一档（PC 的 thinking-body），内层命令块再深一档（cmd-box）
  bashBody: { marginTop: 2, borderRadius: radius.lg, backgroundColor: colors.thinkingBody },
  // flexGrow/flexShrink 必须显式钳死：否则会被 Yoga 当弹性项撑成畸形高度（同思考块）
  bashScroll: { flexGrow: 0, flexShrink: 0, maxHeight: BASH_BODY_MAX_HEIGHT },
  bashScrollContent: { paddingHorizontal: 8, paddingVertical: 8 },
  bashCommand: { borderRadius: radius.lg, backgroundColor: colors.cmdBox, paddingHorizontal: 8, paddingVertical: 6 },
  bashCommandText: { color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.detail, lineHeight: fontSize.detail * BASH_LINE_HEIGHT },
  bashOutput: { marginTop: 6, color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.detail, lineHeight: fontSize.detail * BASH_LINE_HEIGHT },
  nested: { marginTop: 2, marginLeft: space.s3, paddingLeft: space.s2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  nestedLine: { color: colors.textMuted, fontSize: fontSize.caption, paddingVertical: 2 },
  nestedArgs: { color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.code, lineHeight: 16, paddingBottom: 4 },
  nestedNote: { color: colors.textMuted, fontSize: fontSize.caption, paddingVertical: 2 },
});
