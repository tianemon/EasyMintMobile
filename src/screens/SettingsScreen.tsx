import appConfig from '../../app.json';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppearanceSlider } from '../components/AppearanceSlider';
import { Glass } from '../components/Glass';
import { Header } from '../components/Header';
import { PressableScale } from '../components/PressableScale';
import { displayDeviceName } from '../security/credential-store';
import type { StoredDevice } from '../security/credential-store';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, radius, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';
import type { ConnectionStatus } from '../types';

type SettingsScreenProps = {
  device: StoredDevice | null;
  connection: ConnectionStatus;
  onBack: () => void;
  onRepair: () => void;
  onForget: () => void;
};

const VERSION = `${appConfig.expo.version} (${appConfig.expo.android?.versionCode ?? 1})`;

/** 行高：设置行统一 52，比列表行略高——设置页要点得准，也撑得起分组之间的呼吸 */
const ROW_HEIGHT = 52;
/** 卡片内文字与分隔线的左内边距 */
const CARD_INSET = space.s4;

/**
 * 设置页（二级）。
 *
 * 版式是「页面背景 + 分组卡片」，**不是一整块大玻璃**：之前在整页上盖了一块玻璃面板、
 * 内容全挤在顶部，下半屏是一大块空玻璃——既没有层级，又让玻璃看起来像一块脏板。
 * 现在只有分组本身是卡片（frosted），组与组之间的留白露出环境层，页面才有纵深。
 *
 * 组内用「行 + 内缩分隔线」：设备信息一行，操作按钮一行（并排），关于一行。
 * 操作按钮直接压在卡片上（不再各自包一块玻璃）——在卡片里再嵌玻璃会变成第三层材质，
 * 深色下尤其发灰。
 */
export function SettingsScreen({ device, connection, onBack, onRepair, onForget }: SettingsScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  const status = connection === 'connected' ? '已连接' : connection === 'connecting' ? '正在连接' : '未连接';
  const ip = device?.addresses.find((address) => /^\d+\./.test(address)) ?? device?.addresses[0];

  return <View style={commonStyles.fill}>
    <Header title="设置" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 外观：滑块自己就是一块玻璃，不再套卡片，否则两层玻璃叠在一起会发闷 */}
      <Text style={styles.groupLabel}>外观</Text>
      <View style={styles.sliderWrap}><AppearanceSlider /></View>

      <Text style={styles.groupLabel}>电脑</Text>
      <Glass variant="frosted" radius={16} elevated={false} style={styles.card}>
        {device ? <>
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text numberOfLines={1} style={styles.deviceName}>{displayDeviceName(device.pcName)}</Text>
              <View style={styles.statusLine}>
                <View style={[styles.dot, connection === 'connected' ? styles.dotOn
                  : connection === 'connecting' ? styles.dotPending : styles.dotOff]} />
                <Text style={styles.statusText}>{status}</Text>
                {!!ip && <Text numberOfLines={1} style={styles.ip}>· {ip}</Text>}
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.actions}>
            <PressableScale onPress={onRepair} style={styles.actionWrap} innerStyle={styles.action}>
              <Text style={styles.actionText}>重新配对</Text>
            </PressableScale>
            <View style={styles.actionDivider} />
            <PressableScale onPress={onForget} style={styles.actionWrap} innerStyle={styles.action}>
              <Text style={[styles.actionText, styles.actionDangerText]}>移除此电脑</Text>
            </PressableScale>
          </View>
        </> : <View style={styles.row}><Text style={styles.empty}>还没有配对的电脑</Text></View>}
      </Glass>

      <Text style={styles.groupLabel}>关于</Text>
      <Glass variant="frosted" radius={16} elevated={false} style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>版本</Text>
          <Text style={styles.rowValue}>{VERSION}</Text>
        </View>
      </Glass>
    </ScrollView>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { paddingHorizontal: chatInset, paddingTop: 2, paddingBottom: 32 },
  // 分组标题比内容多缩 4px：视觉上与卡片内的文字更容易连成一组
  groupLabel: {
    paddingLeft: 4, paddingTop: 18, paddingBottom: 8,
    fontSize: fontSize.caption, letterSpacing: 0.4, color: colors.textSecondary,
  },
  // 滑块与卡片同宽（内容区已含 chatInset），此处不再叠内边距
  sliderWrap: { height: 54 },
  card: { overflow: 'hidden' },
  row: {
    minHeight: ROW_HEIGHT, paddingHorizontal: CARD_INSET, paddingVertical: space.s2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s3,
  },
  rowMain: { flex: 1, minWidth: 0 },
  deviceName: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  dotOn: { backgroundColor: colors.success },
  dotPending: { backgroundColor: colors.warning },
  dotOff: { backgroundColor: colors.dotGray },
  statusText: { fontSize: fontSize.xs, color: colors.textSecondary },
  ip: { flexShrink: 1, fontSize: fontSize.xs, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  // 分隔线左右各内缩 CARD_INSET，与内容同宽——只给左边缩、右边顶到卡片边，视觉上是歪的
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginHorizontal: CARD_INSET },
  // 两个操作是**文字按钮 + 竖分隔线**：铺底色会在卡片上凿出两块更深的砖，
  // 破坏性操作也只染文字，不铺红底（实心红会把它抬成整页最重的元素）
  actions: { flexDirection: 'row', alignItems: 'center', height: 48 },
  actionWrap: { flex: 1, height: 48 },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: colors.divider },
  actionText: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  actionDangerText: { color: colors.danger },
  rowLabel: { fontSize: fontSize.body, color: colors.textPrimary },
  rowValue: { fontSize: fontSize.sm, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  empty: { fontSize: fontSize.sm, color: colors.textSecondary },
});
