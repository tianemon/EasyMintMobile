import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DisplayToolBlock } from '../session/messages';
import { isCommandTool, toolCommand, toolDescription, toolDisplay, toolLabel } from '../session/tools';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import { ChevronIcon, Icon, SpinIcon, ToolIcon, iconSize } from './icons';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 展开区高度上限：对齐 PC 的 `calc(var(--text-detail) * 9.75 + 28px)`（约 6 行 + 内边距） */
const BASH_BODY_MAX_HEIGHT = fontSize.detail * 9.75 + 28;
/** PC 的 `leading-[1.625]`（13px 字号 → 21.125px 行高） */
const BASH_LINE_HEIGHT = 1.625;

type ToolCardProps = {
  tool: DisplayToolBlock;
  /** 内层滚动期间锁住外层 inverted 列表（与思考块同款：边界剩余位移不能跨坐标系交给父列表） */
  onInnerScrollGesture: (active: boolean) => void;
};

/**
 * 工具调用卡：标题行（工具图标 + 动作词 + 状态图标）默认折叠，展开看原始输出。
 *
 * 命令类工具（bash）按 PC 的分工：**标题只放动作词 + description**，命令本身进展开区的深色命令块，
 * 输出跟在下方、整体封顶 6 行滚动（PC ChatBlocks 的 bash 分支同款）。
 */
export function ToolCard({ tool, onInnerScrollGesture }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const stateText = tool.state === 'running' ? '运行中' : tool.state === 'error' ? '失败' : '完成';

  const commandTool = isCommandTool(tool.name);
  const command = commandTool ? toolCommand(tool.input) : '';
  const description = commandTool ? toolDescription(tool.input) : '';
  // bash：标题 = 动作词（+ · description）；其它工具：动作词 + 关键参数（路径/查询词）
  const title = commandTool
    ? (description ? `${toolLabel(tool.name)} · ${description}` : toolLabel(tool.name))
    : toolDisplay(tool);
  const hasBody = commandTool ? (!!command || !!tool.output) : !!tool.output;

  return <View style={[styles.toolCard, tool.state === 'error' && styles.toolCardError]}>
    <Pressable style={styles.toolHeader} onPress={() => setExpanded((current) => !current)}>
      <View style={styles.toolTitleRow}><ToolIcon name={tool.name} />
        <Text numberOfLines={1} style={styles.toolTitle}>{title}</Text>
        {tool.state === 'running' ? <SpinIcon size={iconSize.card} color={colors.accent} />
          : tool.state === 'error' ? <Icon name="cross" />
          : <Icon name="check" />}</View>
      <View style={styles.toolStateRow}>
        <Text style={styles.toolState}>{stateText}</Text>
        <ChevronIcon direction={expanded ? 'down' : 'right'} />
      </View>
    </Pressable>
    {expanded && hasBody && (commandTool
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
      : <Text selectable style={styles.toolOutput}>{tool.output}</Text>)}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 与 PC 工具块统一为 mt-1.5/mb-1；同一回合的连续工具已合并进一个 assistant 气泡。
  toolCard: { marginTop: 6, marginBottom: 4, alignSelf: 'stretch', borderRadius: radius.lg, backgroundColor: colors.cmdBox, overflow: 'hidden' },
  toolCardError: { backgroundColor: colors.dangerBg },
  toolHeader: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // ⚠ 不能用 `flex: 1`（= flexBasis: 0）：气泡是按内容撑开的（alignSelf: flex-start），
  // flexBasis 0 意味着这一项对气泡的宽度贡献为 0，气泡会被压到最小宽度，
  // 于是图标、文字、对勾全挤在一起。用 flexGrow + flexBasis auto：能填满剩余宽度，
  // 同时把自己的自然（不折行）宽度算进气泡里。
  toolTitleRow: { flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  toolTitle: { flexShrink: 1, color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  // 状态区永不压缩：压缩了就会出现「对勾贴到文字上」
  toolStateRow: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolState: { color: colors.textMuted, fontSize: fontSize.caption },
  toolOutput: { maxHeight: 220, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 11, color: colors.textSecondary, backgroundColor: colors.codeSurface, fontSize: fontSize.caption, lineHeight: 18 },
  // 命令类展开区：外层比气泡深一档（PC 的 thinking-body），内层命令块再深一档（cmd-box）
  bashBody: { marginTop: 2, backgroundColor: colors.thinkingBody },
  // flexGrow/flexShrink 必须显式钳死：否则会被 Yoga 当弹性项撑成畸形高度（同思考块）
  bashScroll: { flexGrow: 0, flexShrink: 0, maxHeight: BASH_BODY_MAX_HEIGHT },
  bashScrollContent: { paddingHorizontal: 8, paddingVertical: 8 },
  bashCommand: { borderRadius: radius.lg, backgroundColor: colors.cmdBox, paddingHorizontal: 8, paddingVertical: 6 },
  bashCommandText: { color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.detail, lineHeight: fontSize.detail * BASH_LINE_HEIGHT },
  bashOutput: { marginTop: 6, color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.detail, lineHeight: fontSize.detail * BASH_LINE_HEIGHT },
});
