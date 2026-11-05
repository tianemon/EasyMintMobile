import { useRef } from 'react';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '../components/AmbientBackground';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { Glass } from '../components/Glass';
import { ChevronIcon, GearIcon, PlusIcon, iconSize } from '../components/icons';
import { PressableScale } from '../components/PressableScale';
import { displayDeviceName } from '../security/credential-store';
import type { StoredDevice } from '../security/credential-store';
import { formatLastSeen } from '../session/session-time';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { ConnectionStatus } from '../types';

type HomeScreenProps = {
  devices: StoredDevice[];
  activePcId: string | null;
  connection: ConnectionStatus;
  refreshing: boolean;
  /** 配对中的六位码（非空时盖住列表，走配对引导） */
  pairCode: string;
  error: string;
  onRefresh: () => void;
  onOpenDevice: (device: StoredDevice) => void;
  onAddDevice: () => void;
  onOpenSettings: () => void;
};

/**
 * 一级首页：已配对的电脑列表。
 *
 * 打开 app 不再整屏等连接——首页立刻渲染，当前设备那一行的圆点自己从「正在连接」走到
 * 「已连接」。点哪台进哪台的会话；其余设备的连接在后台按需建立（见 App 的 openDevice）。
 */
export function HomeScreen(props: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View>(null);
  const { devices, activePcId, connection, pairCode, error } = props;
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  const { colors } = useTheme();

  // 配对中的六位码：沿用旧版的居中卡片，配对完成后自动回列表
  if (pairCode) {
    return <View style={commonStyles.center}>
      <Text style={styles.codeHint}>请在电脑上核对并确认</Text>
      <Text style={styles.code}>{pairCode}</Text>
    </View>;
  }

  return <View style={commonStyles.fill}>
    <BlurTargetView ref={blurTarget} style={commonStyles.fill}>
    {/* Match the full-window background behind the system bars, rather than restarting the gradient inside the safe area. */}
    <AmbientBackground style={{ top: -insets.top, bottom: -insets.bottom }} />
    <Header title="设备" right={
      <PressableScale accessibilityLabel="设置" hitSlop={8} onPress={props.onOpenSettings} style={styles.headerAction}>
        <Glass variant="frosted" radius={13} style={styles.headerPill}>
          <View style={styles.headerPillInner}><GearIcon size={19} color={colors.textSecondary} /></View>
        </Glass>
      </PressableScale>
    } />
    {/* 设备通常只有一两台：卡片**贴着内容**长，不留一整块空面板；
        长列表（会话/项目）才铺平——那是另一种版式，见 SessionsScreen */}
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh}
        tintColor={colors.textMuted} colors={[colors.textMuted]} />}>
      {devices.length ? <Glass variant="frosted" radius={16} elevated={false} style={styles.card}>
        {devices.map((item, index) => {
          const isActive = item.pcId === activePcId;
          const connected = isActive && connection === 'connected';
          const connecting = isActive && connection === 'connecting';
          const ip = item.addresses.find((address) => /^\d+\./.test(address)) ?? item.addresses[0];
          const tail = connected
            ? ip ?? ''
            : item.lastConnectedAt ? `上次 ${formatLastSeen(item.lastConnectedAt)}` : '';
          return <Pressable key={item.pcId} accessibilityRole="button" onPress={() => props.onOpenDevice(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            {index > 0 && <View style={styles.divider} />}
            <View style={styles.rowMain}>
              <Text numberOfLines={1} style={styles.deviceName}>{displayDeviceName(item.pcName)}</Text>
              <View style={styles.statusLine}>
                <View style={[styles.dot, connected ? styles.dotOn : connecting ? styles.dotPending : styles.dotOff]} />
                <Text style={styles.statusText}>{connected ? '已连接' : connecting ? '正在连接' : '未连接'}</Text>
                {!!tail && <Text numberOfLines={1} style={styles.statusTail}>· {tail}</Text>}
              </View>
            </View>
            <ChevronIcon size={iconSize.nav} />
          </Pressable>;
        })}
      </Glass> : <View style={styles.empty}>
        <Text style={styles.emptyTitle}>还没有配对的电脑</Text>
        <Text style={styles.emptyText}>在电脑端打开「设备互联」生成二维码，然后用手机扫描。</Text>
        <Button label="扫描二维码配对" onPress={props.onAddDevice} />
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>}
    </ScrollView>
    </BlurTargetView>
    {!!devices.length && <PressableScale accessibilityLabel="添加设备" onPress={props.onAddDevice} style={styles.fab}>
      <Glass variant="liquid" radius={29} blur blurTarget={blurTarget} intensity={8} sheen={false} elevated={false} fill={colors.liquidClearFill} style={styles.fabGlass}>
        <View style={styles.fabInner}><PlusIcon size={22} color={colors.floatingActionIcon} /></View>
      </Glass>
    </PressableScale>}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  headerAction: { width: 40, height: 40 },
  headerPill: { width: 40, height: 40 },
  headerPillInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 列表面板：左右各留 12，行内仍用 chatInset，于是正文左沿 = 28（与原型一致）
  // 底部留 96：最后一行不会被右下角按钮压住
  content: { paddingHorizontal: chatInset, paddingTop: 6, paddingBottom: 96 },
  card: { overflow: 'hidden' },
  row: { paddingHorizontal: chatInset, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  // 玻璃上的按压反馈用一层薄白光，不要灰底（灰底会把玻璃压脏）
  rowPressed: { backgroundColor: colors.glassPress },
  divider: { position: 'absolute', top: 0, left: chatInset, right: chatInset, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  rowMain: { flex: 1, minWidth: 0 },
  deviceName: { fontSize: 15, fontWeight: '600', lineHeight: 20, color: colors.textPrimary },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  dotOn: { backgroundColor: colors.accent },
  dotPending: { backgroundColor: colors.warning },
  dotOff: { backgroundColor: colors.dotGray },
  statusText: { fontSize: fontSize.xs, color: colors.textSecondary },
  // 尾巴（IP / 上次在线）弱一档，且必须能截断：IPv6 很长，不能把行撑开
  statusTail: { flexShrink: 1, fontSize: fontSize.xs, color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: space.s3, paddingBottom: 80 },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  emptyText: { fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginBottom: space.s2 },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },
  codeHint: { fontSize: fontSize.base, color: colors.textSecondary },
  code: { fontSize: fontSize.display, fontWeight: '800', letterSpacing: 7, color: colors.accent },
  fab: { position: 'absolute', right: 28, bottom: 34, width: 58, height: 58 },
  fabGlass: { width: 58, height: 58 },
  fabInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
