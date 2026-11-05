import { StyleSheet, View } from 'react-native';
import { Glass } from './Glass';
import { PressableScale } from './PressableScale';
import { useTheme } from '../theme/theme-context';
import { NewChatIcon } from './icons';

type NewSessionFabProps = { onPress: () => void };

/** 会话列表右下角的新建会话悬浮按钮 */
export function NewSessionFab({ onPress }: NewSessionFabProps) {
  const { colors } = useTheme();
  return <PressableScale accessibilityLabel="新建会话" onPress={onPress} style={styles.fab}>
    <Glass variant="frosted" radius={28} fill={colors.success} style={styles.glass}>
      <View style={styles.inner}><NewChatIcon /></View>
    </Glass>
  </PressableScale>;
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 20, bottom: 22, width: 58, height: 58 },
  glass: { width: 58, height: 58 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
