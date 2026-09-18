import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, space } from '../theme/tokens';

type ConnectionSettingsSheetProps = {
  visible: boolean;
  pcName: string;
  statusLabel: string;
  onClose: () => void;
  onRefresh: () => void;
  onRepair: () => void;
  onForget: () => void;
};

/** 电脑连接设置页（顶部滑入的 pageSheet） */
export function ConnectionSettingsSheet(props: ConnectionSettingsSheetProps) {
  return <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
    <SafeAreaProvider><SafeAreaView style={commonStyles.safe} edges={['top', 'bottom']}>
      <Header title="连接设置" onBack={props.onClose} />
      <View style={styles.settings}>
        <View style={commonStyles.card}><Text style={styles.cardTitle}>{props.pcName}</Text><Text style={commonStyles.muted}>{props.statusLabel} · 手机仅保存配对凭证</Text></View>
        <Button label="刷新聊天列表" secondary onPress={props.onRefresh} />
        <Button label="重新配对" secondary onPress={props.onRepair} />
        <Button label="移除此电脑" secondary danger onPress={props.onForget} />
      </View>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  settings: { padding: 18, gap: space.s3 },
  sectionTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.sectionLabel, marginTop: 10 },
  cardTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.textPrimary },
});
