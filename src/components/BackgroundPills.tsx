import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BackgroundAgent, BackgroundShell } from '../protocol/types';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import { SpinIcon, ToolIcon, iconSize } from './icons';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

type BackgroundPillsProps = {
  shells: BackgroundShell[];
  agents: BackgroundAgent[];
  /** 点命令 → 打开输出查看页（对应 PC ShellBar 点命令行打开 ShellProcessView） */
  onOpenShellOutput: (shell: BackgroundShell) => void;
  /** 停止单个后台命令（对应 PC ShellBar 行内的「停止」） */
  onStopShell: (shellId: string) => void;
  /** 停止单个子 Agent（对应 PC AgentBar 行内的「停止」） */
  onStopAgent: (delegationId: string, taskIndex: number) => void;
};

/**
 * 后台任务胶囊：Agent / Shell 计数，点击展开当前执行清单。
 *
 * 与 PC 的 AgentBar / ShellBar 同构：
 *  - Shell 展开区是「运行中的 Shell(N)」+ 每行 [转圈 + 等宽命令 + 停止/停止中…]，点命令行看输出；
 *  - Agent 展开区是「运行中的 Agent(N)」+ 每行 [转圈 + 标题·当前工具 + 停止/停止中…]；
 *  - 输出正文/子 Agent 过程不在这里预览——PC 的做法是点开看（手机端 Shell 对应 ShellOutputSheet，子 Agent 过程查看尚未接入）。
 */
export function BackgroundPills({ shells, agents, onOpenShellOutput, onStopShell, onStopAgent }: BackgroundPillsProps) {
  const [expanded, setExpanded] = useState<'shell' | 'agent' | null>(null);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!shells.length && !agents.length) return null;
  return <View style={styles.backgroundWrap}>
    <View style={styles.backgroundBar}>
      {!!agents.length && <Pressable style={styles.backgroundPill} onPress={() => setExpanded((value) => value === 'agent' ? null : 'agent')}><ToolIcon name="task" color={colors.textSecondary} /><Text style={styles.backgroundPillText}>Agent · {agents.length}</Text></Pressable>}
      {!!shells.length && <Pressable style={[styles.backgroundPill, styles.shellPill]} onPress={() => setExpanded((value) => value === 'shell' ? null : 'shell')}><ToolIcon name="bash" color={colors.success} /><Text style={[styles.backgroundPillText, styles.shellPillText]}>Shell · {shells.length}</Text></Pressable>}
    </View>
    {expanded === 'agent' && <View style={styles.backgroundPanel}>
      <Text style={styles.panelTitle}>运行中的 Agent（{agents.length}）</Text>
      {agents.map((agent) => <View key={`${agent.delegationId}-${agent.index}`} style={styles.backgroundRow}>
        <SpinIcon size={iconSize.pill} />
        <Text numberOfLines={2} style={styles.backgroundText}>{agent.title}{agent.currentTool ? ` · ${agent.currentTool}` : ''}</Text>
        {agent.status === 'stopping'
          // 已点停止：等 PC 广播回写（任务从中止清单里消失），按钮换成文案避免重复触发（Shell 行同款）
          ? <Text style={styles.stoppingText}>停止中…</Text>
          : <Pressable accessibilityLabel={`停止 ${agent.title}`} onPress={() => onStopAgent(agent.delegationId, agent.index)} style={styles.stopButton}>
            <Text style={styles.stopText}>停止</Text>
          </Pressable>}
      </View>)}
    </View>}
    {expanded === 'shell' && <View style={styles.backgroundPanel}>
      <Text style={styles.panelTitle}>运行中的 Shell（{shells.length}）</Text>
      {shells.map((shell) => <View key={shell.id} style={styles.backgroundRow}>
        <SpinIcon size={iconSize.pill} />
        <Pressable style={styles.shellCommandButton} onPress={() => onOpenShellOutput(shell)}>
          <Text numberOfLines={1} style={styles.shellCommand}>{shell.command}</Text>
        </Pressable>
        {shell.status === 'stopping'
          // 已点停止：杀进程中，按钮换成文案避免重复触发（PC 同款）
          ? <Text style={styles.stoppingText}>停止中…</Text>
          : <Pressable accessibilityLabel={`停止 ${shell.command}`} onPress={() => onStopShell(shell.id)} style={styles.stopButton}>
            <Text style={styles.stopText}>停止</Text>
          </Pressable>}
      </View>)}
    </View>}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  backgroundWrap: { marginHorizontal: space.s4, marginTop: space.s1 },
  backgroundBar: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backgroundPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.lg, backgroundColor: colors.thinkingBody, flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Shell 胶囊用 success-soft 底 + 绿色文字（PC ShellBar 就是绿底绿字，和 Agent 胶囊区分开）
  shellPill: { backgroundColor: colors.successSoft },
  backgroundPillText: { color: colors.textSecondary, fontSize: fontSize.ui11, fontWeight: '700' },
  shellPillText: { color: colors.success },
  backgroundPanel: { marginTop: space.s1, padding: 9, gap: 7, maxHeight: 180, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  panelTitle: { color: colors.textMuted, fontSize: fontSize.caption, fontWeight: '600' },
  backgroundRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  shellCommandButton: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  shellCommand: { color: colors.textPrimary, fontFamily: monoFont, fontSize: fontSize.caption },
  // 停止按钮/停止中文案：Shell 行与 Agent 行共用（两行的停止语义与交互完全一致）
  stopButton: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger, backgroundColor: colors.dangerBg },
  stopText: { color: colors.danger, fontSize: fontSize.ui11, fontWeight: '600' },
  stoppingText: { flexShrink: 0, color: colors.textSecondary, fontSize: fontSize.ui11 },
  backgroundText: { flexGrow: 1, flexShrink: 1, color: colors.textSecondary, fontSize: fontSize.caption, lineHeight: 17 },
});
