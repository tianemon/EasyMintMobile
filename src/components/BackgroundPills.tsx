import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BackgroundAgent, BackgroundShell } from '../protocol/types';
import { colors, fontSize, radius, space } from '../theme/tokens';

type BackgroundPillsProps = {
  shells: BackgroundShell[];
  agents: BackgroundAgent[];
};

/** 后台任务胶囊：Agent / Shell 计数，点击展开当前执行清单 */
export function BackgroundPills({ shells, agents }: BackgroundPillsProps) {
  const [expanded, setExpanded] = useState<'shell' | 'agent' | null>(null);
  if (!shells.length && !agents.length) return null;
  return <View style={styles.backgroundWrap}>
    <View style={styles.backgroundBar}>
      {!!agents.length && <Pressable style={styles.backgroundPill} onPress={() => setExpanded((value) => value === 'agent' ? null : 'agent')}><Text style={styles.backgroundPillText}>◉ Agent · {agents.length}</Text></Pressable>}
      {!!shells.length && <Pressable style={styles.backgroundPill} onPress={() => setExpanded((value) => value === 'shell' ? null : 'shell')}><Text style={styles.backgroundPillText}>›_ Shell · {shells.length}</Text></Pressable>}
    </View>
    {expanded === 'agent' && <View style={styles.backgroundPanel}>{agents.map((agent) => <View key={`${agent.delegationId}-${agent.index}`} style={styles.backgroundRow}><View style={styles.runningDot} /><Text numberOfLines={2} style={styles.backgroundText}>{agent.title}{agent.currentTool ? ` · ${agent.currentTool}` : ''}</Text></View>)}</View>}
    {expanded === 'shell' && <View style={styles.backgroundPanel}>{shells.map((shell) => <View key={shell.id} style={styles.backgroundTask}><View style={styles.backgroundRow}><View style={styles.runningDot} /><Text numberOfLines={2} style={styles.backgroundText}>{shell.command}</Text></View>{!!shell.output && <Text numberOfLines={4} style={styles.backgroundOutput}>{shell.output}</Text>}</View>)}</View>}
  </View>;
}

const styles = StyleSheet.create({
  backgroundWrap: { marginHorizontal: space.s4, marginTop: space.s1 },
  backgroundBar: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backgroundPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.lg, backgroundColor: colors.thinkingBody },
  backgroundPillText: { color: colors.textSecondary, fontSize: fontSize.ui11, fontWeight: '700' },
  backgroundPanel: { marginTop: space.s1, padding: 9, gap: 7, maxHeight: 180, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  backgroundTask: { gap: 5 },
  backgroundRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  runningDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.warning },
  backgroundText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption, lineHeight: 17 },
  backgroundOutput: { marginLeft: 14, color: colors.logText, fontSize: fontSize.ui11, lineHeight: 16, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
});
