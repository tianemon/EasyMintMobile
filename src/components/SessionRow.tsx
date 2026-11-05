import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionListItem } from '../protocol/types';
import { formatSessionTime } from '../session/session-time';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';

type SessionRowProps = {
  session: SessionListItem;
  /** 第一条不画分隔线：线是「两条之间的界线」，不该出现在列表顶端 */
  first: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

/**
 * 会话行：无边框、无图标的纯文本行，行与行之间用内缩分隔线。
 *
 * 与旧 `ListRow` 的区别不只是外观：
 * - 分隔线左右各内缩 `chatInset`，与标题左沿对齐，不顶到屏幕两端
 * - 右端放时间（今天 16:22 / 昨天 / 11月3日）而不是箭头——手机上箭头没有额外信息，
 *   时间能直接回答「这条是什么时候聊的」
 * - 置顶不再用图标：只靠排序体现，避免列表里混入两种视觉元素
 */
export function SessionRow({ session, first, onPress, onLongPress }: SessionRowProps) {
  const styles = useThemedStyles(makeStyles);
  const time = formatSessionTime(session.updatedAt);
  return <Pressable delayLongPress={450} onPress={onPress} onLongPress={onLongPress}
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
    {!first && <View style={styles.divider} />}
    <View style={styles.main}>
      <Text numberOfLines={1} style={styles.title}>{session.title || '未命名会话'}</Text>
      <Text numberOfLines={2} style={styles.subtitle}>
        {session.lastMessage || `${session.messageCount ?? 0} 条消息`}
      </Text>
    </View>
    {!!time && <Text style={styles.time}>{time}</Text>}
  </Pressable>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 行高不写死：单行摘要与两行摘要都能自然撑开，靠 padding 保持节奏（12/16/13）
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, paddingHorizontal: chatInset, paddingTop: 12, paddingBottom: 13 },
  rowPressed: { backgroundColor: colors.glassPress },
  // 分隔线用绝对定位自己画：borderBottom 会拉到行两端，而这里要左右各留 chatInset
  divider: { position: 'absolute', top: 0, left: chatInset, right: chatInset, height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 20, color: colors.textPrimary },
  // 不再给副标题叠 opacity：深色下 #909090 再乘 0.82 会掉到 4:1 附近（13px 文字低于 AA）
  subtitle: { marginTop: 3, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary },
  // 时间用 secondary 而不是 muted：深色下 muted(#6e6e6e) 在 #141414 上只有 3.6:1，11px 文字读不清
  time: { flexShrink: 0, paddingTop: 3, fontSize: fontSize.ui11, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
});
