import { Pressable, StyleSheet } from 'react-native';
import { commonStyles } from '../theme/commonStyles';
import { colors, radius } from '../theme/tokens';
import { shadow } from '../theme/tokens';
import { NewChatIcon } from './icons';

type NewSessionFabProps = { onPress: () => void };

/** 会话列表右下角的新建会话悬浮按钮 */
export function NewSessionFab({ onPress }: NewSessionFabProps) {
  return <Pressable accessibilityLabel="新建会话" style={({ pressed }) => [styles.newSessionFab, shadow.md, pressed && commonStyles.dim]} onPress={onPress}><NewChatIcon /></Pressable>;
}

const styles = StyleSheet.create({
  newSessionFab: { position: 'absolute', right: 20, bottom: 22, width: 54, height: 54, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
});
