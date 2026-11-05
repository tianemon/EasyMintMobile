import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, radius, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';
import { ChevronIcon, iconSize } from './icons';

type ListRowProps = {
  title: string;
  subtitle?: string;
  titleLines?: number;
  subtitleLines?: number;
  /** 标题左侧标记（钉住 / 归档等图标） */
  leading?: ReactNode;
  onPress: () => void;
  /** 传入时长按弹出会话操作（列表行 450ms） */
  onLongPress?: () => void;
  /** 无边框变体：透明底、无描边、无圆角，行与行之间用内缩分隔线（与会话列表同一套语言） */
  flat?: boolean;
  /** flat 时第一条不画分隔线 */
  first?: boolean;
};

/** 列表行（项目 / 会话通用）：标题 + 副标题 + 右箭头 */
export function ListRow({ title, subtitle, titleLines, subtitleLines, leading, onPress, onLongPress, flat = false, first = false }: ListRowProps) {
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  return <Pressable delayLongPress={onLongPress ? 450 : undefined}
    style={({ pressed }) => [styles.row, flat && styles.rowFlat, flat && pressed && styles.rowFlatPressed]}
    onPress={onPress} onLongPress={onLongPress}>
    {flat && !first && <View style={styles.divider} />}
    <View style={styles.rowGrow}>
      <View style={styles.rowTitleLine}>
        {!!leading && leading}
        <Text numberOfLines={titleLines} style={styles.rowTitle}>{title}</Text>
      </View>
      <Text numberOfLines={subtitleLines} style={commonStyles.muted}>{subtitle}</Text>
    </View>
    <ChevronIcon size={iconSize.nav} />
  </Pressable>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.card, padding: space.s4, borderWidth: 1, borderColor: colors.border, gap: space.s3 },
  rowFlat: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingHorizontal: chatInset, paddingVertical: 14 },
  rowFlatPressed: { backgroundColor: colors.surfaceAlt },
  // 分隔线与会话行同一条规则：行内绝对定位、左右各内缩 chatInset（borderBottom 会顶到两端）
  divider: { position: 'absolute', top: 0, left: chatInset, right: chatInset, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  rowGrow: { flex: 1, gap: space.s1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowTitle: { flexShrink: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
});
