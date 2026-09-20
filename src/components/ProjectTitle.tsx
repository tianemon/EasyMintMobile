import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { ConnectionStatus } from '../types';

type ProjectTitleProps = {
  name: string;
  status: ConnectionStatus;
  onPress: () => void;
};

/** 标题栏中部的当前项目名（点击回项目列表，右侧带连接状态灯） */
export function ProjectTitle({ name, status, onPress }: ProjectTitleProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Pressable accessibilityLabel="切换项目" onPress={onPress} style={styles.projectTitleButton}>
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"><Path d="m6 9 6 6 6-6" stroke={colors.projectChevron} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    <Text numberOfLines={1} style={styles.projectTitleText}>{name}</Text>
    <View style={[styles.titleStatusLight, status === 'connected' ? styles.connectionLightOn : status === 'connecting' ? styles.connectionLightPending : styles.connectionLightOff]} />
  </Pressable>;
}

/** 标题栏右侧的电脑连接指示灯 */
export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const styles = useThemedStyles(makeStyles);
  const label = status === 'connected' ? '电脑已连接' : status === 'connecting' ? '正在连接电脑' : '电脑已断开';
  return <View accessibilityLabel={label} style={styles.connectionIndicator}>
    <View style={[styles.connectionLight, status === 'connected' ? styles.connectionLightOn : status === 'connecting' ? styles.connectionLightPending : styles.connectionLightOff]} />
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  projectTitleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, maxWidth: '100%' },
  projectTitleText: { flexShrink: 1, color: colors.textPrimary, fontWeight: '700', fontSize: fontSize.title },
  titleStatusLight: { width: space.s2, height: space.s2, borderRadius: radius.full },
  connectionIndicator: { minWidth: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  connectionLight: { width: 9, height: 9, borderRadius: radius.full },
  connectionLightOn: { backgroundColor: colors.accent },
  connectionLightPending: { backgroundColor: colors.warning },
  connectionLightOff: { backgroundColor: colors.dotGray },
});
