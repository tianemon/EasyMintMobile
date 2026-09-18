import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius, space } from '../theme/tokens';

type ScannerScreenProps = {
  onCancel: () => void;
  onScanned: (data: string) => void;
};

/** 扫码配对页：全屏相机 + 取景框（首次进入需授权相机） */
export function ScannerScreen({ onCancel, onScanned }: ScannerScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const locked = useRef(false);
  if (!permission) return <View style={commonStyles.center}><ActivityIndicator /></View>;
  if (!permission.granted) {
    return (
      <View style={commonStyles.center}>
        <Text style={commonStyles.help}>需要相机权限来扫描电脑端二维码。</Text>
        <Button label="允许相机" onPress={() => void requestPermission()} />
        <Button label="取消" secondary onPress={onCancel} />
      </View>
    );
  }
  return (
    <View style={commonStyles.fill}>
      <CameraView style={commonStyles.fill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (locked.current) return;
          locked.current = true;
          onScanned(data);
        }} />
      <View style={[styles.scannerOverlay, { paddingTop: insets.top + space.s4, paddingBottom: insets.bottom + space.s4 }]}>
        <Text style={styles.scannerTitle}>扫描电脑端配对二维码</Text>
        <View style={styles.scanFrame} />
        <Button label="取消" secondary onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scannerOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'space-between', padding: space.s8 },
  scannerTitle: { color: colors.textInverse, fontSize: fontSize.xl, fontWeight: '700', marginTop: 20, textShadowColor: colors.black, textShadowRadius: 4 },
  scanFrame: { width: 250, height: 250, borderWidth: 3, borderColor: colors.scanFrameBorder, borderRadius: radius.lg },
});
