import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { ThemeMode } from '../theme/theme-preference';

type ConnectionSettingsSheetProps = {
  visible: boolean;
  pcName: string;
  statusLabel: string;
  onClose: () => void;
  onRefresh: () => void;
  onRepair: () => void;
  onForget: () => void;
};

/** 外观三档：与桌面端 theme-store 的语义一致（auto 跟系统走） */
const APPEARANCE_OPTIONS = [['auto', '跟随系统'], ['light', '亮色'], ['dark', '深色']] as const;

/** 电脑连接设置页（顶部滑入的 pageSheet） */
export function ConnectionSettingsSheet(props: ConnectionSettingsSheetProps) {
  const { mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  return <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
    <SafeAreaProvider><SafeAreaView style={commonStyles.safe} edges={['top', 'bottom']}>
      <Header title="连接设置" onBack={props.onClose} />
      <View style={styles.settings}>
        <View style={commonStyles.card}><Text style={styles.cardTitle}>{props.pcName}</Text><Text style={commonStyles.muted}>{props.statusLabel} · 手机仅保存配对凭证</Text></View>
        <Button label="刷新聊天列表" secondary onPress={props.onRefresh} />
        <Button label="重新配对" secondary onPress={props.onRepair} />
        <View style={styles.appearance}>
          <Text style={styles.sectionTitle}>外观</Text>
          <View style={styles.appearanceRow}>{APPEARANCE_OPTIONS.map(([value, label]) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value as ThemeMode)}
              style={[styles.appearanceOption, mode === value && styles.appearanceOptionActive]}>
              <Text style={[styles.appearanceText, mode === value && styles.appearanceTextActive]}>{label}</Text>
            </Pressable>
          ))}</View>
        </View>
        <Button label="移除此电脑" secondary danger onPress={props.onForget} />
      </View>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  settings: { padding: 18, gap: space.s3 },
  sectionTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.sectionLabel, marginTop: 10 },
  cardTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.textPrimary },
  appearance: { gap: space.s2 },
  appearanceRow: { flexDirection: 'row', gap: space.s2 },
  // minHeight 44 是移动端最小触控高度（同 Composer 附件菜单）
  appearanceOption: { flexGrow: 1, flexShrink: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputField },
  appearanceOptionActive: { backgroundColor: colors.selectedRowBg, borderColor: colors.selectedRowBorder },
  appearanceText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  appearanceTextActive: { color: colors.textPrimary },
});
