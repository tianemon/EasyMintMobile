import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DisplayToolBlock } from '../session/messages';
import { toolDisplay } from '../session/tools';
import { colors, fontSize, radius, space } from '../theme/tokens';
import { ChevronIcon, Icon, SpinIcon, ToolIcon, iconSize } from './icons';

type ToolCardProps = { tool: DisplayToolBlock };

/** 工具调用卡：标题行（工具图标 + 动作词 + 状态图标）默认折叠，展开看原始输出 */
export function ToolCard({ tool }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const stateText = tool.state === 'running' ? '运行中' : tool.state === 'error' ? '失败' : '完成';
  return <View style={[styles.toolCard, tool.state === 'error' && styles.toolCardError]}>
    <Pressable style={styles.toolHeader} onPress={() => setExpanded((current) => !current)}>
      <View style={styles.toolTitleRow}><ToolIcon name={tool.name} />
        <Text numberOfLines={1} style={styles.toolTitle}>{toolDisplay(tool)}</Text>
        {tool.state === 'running' ? <SpinIcon size={iconSize.card} color={colors.accent} />
          : tool.state === 'error' ? <Icon name="cross" />
          : <Icon name="check" />}</View>
      <View style={styles.toolStateRow}>
        <Text style={styles.toolState}>{stateText}</Text>
        <ChevronIcon direction={expanded ? 'down' : 'right'} />
      </View>
    </Pressable>
    {expanded && !!tool.output && <Text selectable style={styles.toolOutput}>{tool.output}</Text>}
  </View>;
}

const styles = StyleSheet.create({
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
});
