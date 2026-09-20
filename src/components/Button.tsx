import { Pressable, StyleSheet, Text } from 'react-native';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';

type ButtonProps = {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, secondary = false, danger = false, disabled = false }: ButtonProps) {
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  return (
    <Pressable disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary,
        danger && styles.buttonDanger, (pressed || disabled) && commonStyles.dim]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  button: { minHeight: 46, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: colors.inputField },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.textInverse, fontWeight: '700', fontSize: fontSize.base },
  buttonSecondaryText: { color: colors.textSecondary },
});
