import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius, space } from '../theme/tokens';

/** 全屏加载态：可带转圈、副标题与一个操作按钮（重试等） */
export function LoadingView({ title, subtitle, spinner = false, action }: {
  title: string;
  subtitle?: string;
  spinner?: boolean;
  action?: ReactNode;
}) {
  return <View style={styles.loadingTransition}>
    {spinner && <ActivityIndicator color={colors.accent} />}
    <Text style={styles.loadingTitle}>{title}</Text>
    {!!subtitle && <Text style={commonStyles.muted}>{subtitle}</Text>}
    {action}
  </View>;
}

const styles = StyleSheet.create({
  loadingTransition: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 11, backgroundColor: colors.content },
  loadingMark: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  loadingOrbit: { position: 'absolute', width: 54, height: 54, borderRadius: radius.full, borderWidth: 2, borderColor: colors.borderLight, borderRightColor: colors.accent, transform: [{ rotate: '25deg' }] },
  loadingCore: { width: space.s3, height: space.s3, borderRadius: radius.full, backgroundColor: colors.accent },
  loadingTitle: { color: colors.textPrimary, fontSize: fontSize.title, fontWeight: '700' },
});
