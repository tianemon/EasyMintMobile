import { Pressable, StyleSheet, Text, View } from 'react-native';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius, space } from '../theme/tokens';

type ListRowProps = {
  title: string;
  subtitle?: string;
  titleLines?: number;
  subtitleLines?: number;
  onPress: () => void;
  /** 传入时长按弹出会话操作（列表行 450ms） */
  onLongPress?: () => void;
};

/** 列表行（项目 / 会话通用）：标题 + 副标题 + 右箭头 */
export function ListRow({ title, subtitle, titleLines, subtitleLines, onPress, onLongPress }: ListRowProps) {
  return <Pressable delayLongPress={onLongPress ? 450 : undefined} style={styles.row} onPress={onPress} onLongPress={onLongPress}>
    <View style={styles.rowGrow}>
      <Text numberOfLines={titleLines} style={styles.rowTitle}>{title}</Text>
      <Text numberOfLines={subtitleLines} style={commonStyles.muted}>{subtitle}</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.card, padding: space.s4, borderWidth: 1, borderColor: colors.border, gap: space.s3 },
  rowGrow: { flex: 1, gap: space.s1 },
  rowTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  chevron: { fontSize: fontSize.chevron, color: colors.textMuted },
});
