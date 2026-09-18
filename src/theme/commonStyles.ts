import { StyleSheet } from 'react-native';
import { colors, fontSize, radius, space } from './tokens';

/**
 * 跨页面共享的样式（外壳、卡片、列表、加载态、按压反馈）。
 * 只有被 2 个以上文件使用的样式才放这里，单文件专用的样式留在各自的 StyleSheet 中。
 */
export const commonStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.content },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.s6, gap: space.s4 },
  card: {
    width: '100%', maxWidth: 420, borderRadius: radius.lg, backgroundColor: colors.card,
    padding: 20, gap: 14, borderWidth: 1, borderColor: colors.border,
  },
  help: { textAlign: 'center', color: colors.textSecondary, fontSize: fontSize.md, lineHeight: 24 },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  dim: { opacity: 0.4 },
  list: { padding: 14, gap: 10 },
  sessionsPage: { position: 'relative' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 80 },
  answerInput: {
    minHeight: 44, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.inputBorder,
    borderRadius: radius.lg, paddingHorizontal: space.s3, paddingVertical: 10,
  },
});
