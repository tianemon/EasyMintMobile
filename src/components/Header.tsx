import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, space } from '../theme/tokens';

type HeaderProps = {
  title: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
};

/** 页面标题栏：左返回 / 中标题（字符串或自定义节点）/ 右操作 */
export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.headerSide} onPress={onBack} disabled={!onBack}>
        <Text style={styles.headerAction}>{onBack ? '‹ 返回' : ''}</Text>
      </Pressable>
      {typeof title === 'string' ? <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text> : <View style={styles.headerTitle}>{title}</View>}
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

/** 标题栏样式：同时供页面自定义右侧操作（如首页「设置」）复用，保证与 Header 同一套值 */
export const headerStyles = StyleSheet.create({
  header: { height: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, paddingHorizontal: space.s3, backgroundColor: colors.content },
  headerSide: { width: 88 },
  headerRight: { alignItems: 'flex-end' },
  headerAction: { color: colors.accent, fontSize: fontSize.base, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: fontSize.title, color: colors.textPrimary },
});

const styles = headerStyles;
