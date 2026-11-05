import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Glass } from './Glass';
import { PressableScale } from './PressableScale';
import { useTheme } from '../theme/theme-context';
import { NewChatIcon } from './icons';

type NewSessionFabProps = { onPress: () => void; blurTarget?: RefObject<View | null> };

/** 会话列表右下角的新建会话悬浮按钮 */
export function NewSessionFab({ onPress, blurTarget }: NewSessionFabProps) {
  const { colors } = useTheme();
  return <PressableScale accessibilityLabel="新建会话" onPress={onPress} style={styles.fab}>
    <Glass variant="liquid" radius={29} blur={!!blurTarget} blurTarget={blurTarget} intensity={8} sheen={false} elevated={false} fill={colors.liquidClearFill} style={styles.glass}>
      <View style={styles.inner}><NewChatIcon color={colors.floatingActionIcon} /></View>
    </Glass>
  </PressableScale>;
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 28, bottom: 34, width: 58, height: 58 },
  glass: { width: 58, height: 58 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
