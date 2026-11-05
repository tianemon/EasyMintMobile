import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '../components/Glass';
import type { SessionListItem } from '../protocol/types';
import { formatSessionTime } from '../session/session-time';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, radius, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';

type ArchiveSheetProps = {
  visible: boolean;
  sessions: SessionListItem[];
  onClose: () => void;
  onRestore: (session: SessionListItem) => void;
};

/**
 * 归档会话弹层（会话列表右上角时钟图标打开）。
 *
 * 桌面端是浮层列表 + 悬停恢复；手机没有悬停，把「恢复」做成显式按钮：
 * 这个动作在手机上只能点，藏起来等于没有。行结构仍与主列表同一条内缩分隔线。
 */
export function ArchiveSheet({ visible, sessions, onClose, onRestore }: ArchiveSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭归档列表" />
      {/* 底部留白跟系统手势条走：写死 16 在无 home indicator 的机型上会显得空，在有的一侧会压到条 */}
      <Glass variant="frosted" radius={24} style={[styles.sheet, { marginBottom: Math.max(10, insets.bottom) }]}>
        <View style={styles.grip} />
        <View style={styles.header}>
          <Text style={styles.title}>已归档</Text>
          <Text style={styles.count}>{sessions.length} 个会话</Text>
        </View>
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.sessionId}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>没有已归档的会话</Text>}
          renderItem={({ item, index }) => <View style={styles.row}>
            {index > 0 && <View style={styles.divider} />}
            <View style={styles.rowMain}>
              <Text numberOfLines={1} style={styles.rowTitle}>{item.title || '未命名会话'}</Text>
              <Text style={styles.rowTime}>归档于 {formatSessionTime(item.archivedAt ?? item.updatedAt)}</Text>
            </View>
            <Pressable onPress={() => onRestore(item)} hitSlop={10}
              style={({ pressed }) => [styles.restore, pressed && styles.restorePressed]}>
              <Text style={styles.restoreText}>恢复</Text>
            </Pressable>
          </View>}
        />
      </Glass>
    </View>
  </Modal>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 归档弹层盖在会话列表上，遮罩比会话操作弹层淡一档：这里不是破坏性操作，不该压黑整屏
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  // 浮起来的弹层：四周都留白、圆角统一，比贴底整块更像「一块玻璃」
  sheet: { maxHeight: '70%', marginHorizontal: 8, paddingTop: 7, paddingBottom: 16 },
  grip: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.border, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: space.s2, paddingHorizontal: chatInset, paddingBottom: 8 },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.sheetText },
  count: { fontSize: fontSize.ui11, color: colors.textMuted },
  // flexShrink 必须给：RN 默认 flexShrink=0，归档多了列表会超出 70% 高度被裁掉而不是滚动
  list: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: chatInset, paddingVertical: 11 },
  divider: { position: 'absolute', top: 0, left: chatInset, right: chatInset, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: fontSize.body, fontWeight: '500', color: colors.sheetText },
  rowTime: { marginTop: 2, fontSize: fontSize.ui11, color: colors.textMuted },
  restore: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedRowBg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.selectedRowBorder },
  restorePressed: { opacity: 0.7 },
  restoreText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.accent },
  empty: { paddingHorizontal: chatInset, paddingVertical: 24, fontSize: fontSize.sm, color: colors.textMuted },
});
