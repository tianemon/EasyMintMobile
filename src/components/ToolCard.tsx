import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DisplayToolBlock } from '../session/messages';
import { toolDisplay } from '../session/tools';
import { colors, fontSize, radius, space } from '../theme/tokens';

type ToolCardProps = { tool: DisplayToolBlock };

/** 工具调用卡：标题行（状态点 + 动作词 + 状态）默认折叠，展开看原始输出 */
export function ToolCard({ tool }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const stateText = tool.state === 'running' ? '运行中' : tool.state === 'error' ? '失败' : '完成';
  return <View style={[styles.toolCard, tool.state === 'error' && styles.toolCardError]}>
    <Pressable style={styles.toolHeader} onPress={() => setExpanded((current) => !current)}>
      <View style={styles.toolTitleRow}><View style={[styles.toolDot, tool.state === 'running' ? styles.toolDotRunning : tool.state === 'error' ? styles.toolDotError : styles.toolDotDone]} />
        <Text numberOfLines={1} style={styles.toolTitle}>{toolDisplay(tool)}</Text></View>
      <Text style={styles.toolState}>{stateText} {expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
    {expanded && !!tool.output && <Text selectable style={styles.toolOutput}>{tool.output}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  toolCard: { marginVertical: 3, alignSelf: 'stretch', borderRadius: radius.lg, backgroundColor: colors.cmdBox, overflow: 'hidden' },
  toolCardError: { backgroundColor: colors.dangerBg },
  toolHeader: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toolTitleRow: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  toolDot: { width: 7, height: 7, borderRadius: radius.full },
  toolDotRunning: { backgroundColor: colors.warning },
  toolDotDone: { backgroundColor: colors.accent },
  toolDotError: { backgroundColor: colors.danger },
  toolTitle: { flex: 1, color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  toolState: { color: colors.textMuted, fontSize: fontSize.caption },
  toolOutput: { maxHeight: 220, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 11, color: colors.textSecondary, backgroundColor: colors.codeSurface, fontSize: fontSize.caption, lineHeight: 18 },
});
