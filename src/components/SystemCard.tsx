import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DisplayMessage } from '../session/messages';
import { SYSTEM_LABELS } from '../session/tools';
import { colors, fontSize, radius, space } from '../theme/tokens';

type SystemCardProps = { message: DisplayMessage };

/** 系统消息卡：kind 图标 + 标签 + ⏺ 状态，delegation/shell/flow 等可折叠 */
export function SystemCard({ message }: SystemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const kind = message.systemKind ?? 'system';
  const body = (message.text ?? '').replace(/^\[系统消息\](-\[[^\]]*\])?\s*/, '');
  const firstStatus = body.split('\n').find((line) => line.startsWith('⏺ '));
  const status = firstStatus?.match(/^⏺ (.+?) [-—] (完成|失败|中止|已由用户中断|已由用户中止|已中止)(?: · (\d+)s)?$/);
  const collapsible = kind === 'delegation' || kind === 'shell' || ['project-created', 'direct-create', 'flow', 'summary', 'learn'].includes(kind);
  return <View style={styles.systemCard}>
    <Pressable disabled={!collapsible} style={styles.systemHeader} onPress={() => setExpanded((value) => !value)}>
      <Text style={styles.systemIcon}>{kind === 'delegation' ? '◉' : kind === 'shell' ? '›_' : 'ⓘ'}</Text>
      <Text style={styles.systemLabel}>{SYSTEM_LABELS[kind] ?? '系统消息'}</Text>
      {!!status && <Text style={[styles.systemStatus, status[2] === '失败' && styles.systemStatusError]}>· {status[2]}{status[3] ? ` · ${status[3]}s` : ''}</Text>}
      {collapsible && <Text style={styles.systemChevron}>{expanded ? '⌄' : '›'}</Text>}
    </Pressable>
    {(!collapsible || expanded) && !!body && <Text selectable style={styles.systemBody}>{body}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  systemCard: { maxWidth: '82%', alignSelf: 'flex-start', marginLeft: 54, borderRadius: radius.lg, borderBottomLeftRadius: 4, backgroundColor: colors.card, overflow: 'hidden' },
  systemHeader: { minHeight: 36, paddingHorizontal: space.s3, flexDirection: 'row', alignItems: 'center', gap: 6 },
  systemIcon: { color: colors.systemLabel, fontSize: fontSize.caption, fontWeight: '700' },
  systemLabel: { color: colors.systemLabel, fontSize: fontSize.caption, fontWeight: '600' },
  systemStatus: { color: colors.accent, fontSize: fontSize.caption, fontWeight: '600' },
  systemStatusError: { color: colors.danger },
  systemChevron: { marginLeft: 'auto', color: colors.textMuted, fontSize: fontSize.md },
  systemBody: { paddingHorizontal: space.s3, paddingBottom: 10, color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
});
