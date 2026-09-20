import { Pressable, StyleSheet } from 'react-native';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { radius } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import { NewChatIcon } from './icons';

type NewSessionFabProps = { onPress: () => void };

/** 会话列表右下角的新建会话悬浮按钮 */
export function NewSessionFab({ onPress }: NewSessionFabProps) {
  const { shadow } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  return <Pressable accessibilityLabel="新建会话" style={({ pressed }) => [styles.newSessionFab, shadow.md, pressed && commonStyles.dim]} onPress={onPress}><NewChatIcon /></Pressable>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  newSessionFab: { position: 'absolute', right: 20, bottom: 22, width: 54, height: 54, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
});
