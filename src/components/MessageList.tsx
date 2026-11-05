import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { DisplayMessage } from '../session/messages';
import { describeProcessItem } from '../session/tools';
import type { DisplayRow } from '../session/turns';
import { buildRows } from '../session/turns';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, radius, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';
import { SystemCard } from './SystemCard';
import { TurnRow } from './TurnView';

/** 用户气泡正文封顶行数（桌面端 UserMessageText 同规格：12 行 + 0.5px 亚像素补偿） */
const USER_MAX_LINES = 12;
const USER_LINE_HEIGHT = 22;
/** 粗估每行可容纳的字符数（CJK 15px、气泡宽约 88% 屏宽时约 18 字），只用来判断要不要上滚动 */
const CHARS_PER_LINE = 18;

/**
 * 超长提问：默认封顶 12 行（桌面端 UserMessageText 同规格），点「展开全文」看完整内容。
 *
 * 这里刻意**不用内层 ScrollView**：气泡宽度是按内容撑开的（alignSelf: flex-end），
 * 嵌一个纵向 ScrollView 会让宽度依赖内容、内容又依赖宽度，落成 1 字一行的长条；
 * 而且内层滚动要在手势期间锁住外层列表，短消息按住拖动就滚不动列表了。
 * 折叠 + 展开既能看全，又不碰手势。
 */
function UserText({ text, selectable }: { text: string; selectable: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const long = needsScroll(text);
  return <>
    <Text
      selectable={selectable}
      numberOfLines={long && !expanded ? USER_MAX_LINES : undefined}
      style={styles.bubbleText}
    >{text}</Text>
    {long && <Pressable onPress={() => setExpanded((value) => !value)} hitSlop={6}>
      <Text style={styles.expandToggle}>{expanded ? '收起' : '展开全文'}</Text>
    </Pressable>}
  </>;
}

/**
 * 是否超出 12 行。
 *
 * 内层滚动会在手势期间锁住外层列表，对**本来就不滚**的短消息是纯损失，
 * 所以先用字符数粗估，只在确实超长时才给折叠入口。
 */
function needsScroll(text: string): boolean {
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    lines += Math.max(1, Math.ceil(paragraph.length / CHARS_PER_LINE));
    if (lines > USER_MAX_LINES) return true;
  }
  return false;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { flex: 1 },
  // 左右与状态行/输入卡共用 chatInset（左边界一条线）。
  // 上下 8 = 桌面端消息滚动容器的 `pb-2`：最后一条消息到状态行的呼吸就是这 8px，
  // 再叠状态行自己的 26px 高度，状态行与输入卡之间不再要额外边距（桌面端 .input-card 同样没有上边距）。
  // inverted 列表的 contentContainer 会被整体翻转，上下同值才不受影响。
  content: { paddingHorizontal: chatInset, paddingVertical: space.s2 },
  /**
   * ⚠ 行与气泡必须显式 flexGrow: 0 / flexShrink: 0 —— 它们是"按内容定高"的，不能参与弹性分配。
   *
   * 这是长会话空白块的根因：RN 的 ScrollView 默认带 `flexGrow: 1, flexShrink: 1`
   * （ScrollView.js 的 baseVertical/baseHorizontal），行内凡出现 ScrollView 就会被 Yoga
   * 按弹性项伸展，把整行撑到畸形高度（实测单行 267030px，比整个列表的内容高还多），
   * 表现为一片盖住消息、翻不回去的空白。
   */
  row: { flexGrow: 0, flexShrink: 0, paddingBottom: space.s3 },
  bubble: { flexGrow: 0, flexShrink: 0, maxWidth: '88%', padding: 13, borderRadius: radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.userBubbleBg },
  bubbleText: { color: colors.userBubbleText, fontSize: fontSize.base, lineHeight: USER_LINE_HEIGHT },
  expandToggle: { color: colors.userBubbleText, fontSize: fontSize.caption, opacity: 0.75, marginTop: 4 },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  attachmentImage: { width: 92, height: 92, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  attachmentDoc: { width: 92, minHeight: 52, padding: 8, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  attachmentName: { color: colors.textPrimary, fontSize: fontSize.caption, textAlign: 'center' },
  /** 轻档标记：桌面端在气泡**下方**（ChatPanel.tsx:3655-3657），不是塞在气泡里 */
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, justifyContent: 'flex-end' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },
  badgeText: { color: colors.textSecondary, fontSize: fontSize.xxs },
});

type MessageListProps = {
  messages: DisplayMessage[];
  /** 会话是否仍在跑：决定最后一个回合是「运行中折叠」还是「完成用时」 */
  running: boolean;
};

/** 稳定 renderItem / keyExtractor：store 每次事件都产生新数组，内联函数会让 FlatList 对全部行重新求值 */
const keyExtractor = (row: DisplayRow): string => row.key;
const maintainVisibleContentPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: 72 };

/**
 * 消息流 —— inverted FlatList，数据顺序为「最新在前」。
 *
 * 数据不是「一条消息一行」，而是 `buildRows` 产出的**回合行**：一条 assistant 回合一整行，
 * 内部再折叠过程 / 分开结论。理由见 session/turns.ts：
 * 桌面端一条回合可能跨多条 Pi 消息，按消息逐行渲染会得到「每个工具一张卡、每段话说一遍」的长条。
 *
 * inverted 让 offset=0 天然对应最新消息，避免超长、变高消息下 scrollToEnd 使用平均行高
 * 估算而停在历史中间。内层滚动容器（工具输出、diff、思考正文、长提问）不能把边界剩余位移
 * 交给这个镜像父列表：它们在整个触摸手势期间通知这里关闭父列表 scrollEnabled，并且自身关闭
 * nestedScrollEnabled。内层仍由自己的 ScrollView 正常滚动，滚到边界后剩余位移被丢弃，
 * 手势结束再恢复消息列表，等价于 PC 的 overscroll-behavior: contain。
 *
 * maintainVisibleContentPosition 显式开启：用户停在最新消息附近时跟随流式增长；上翻历史后
 * 不会被新内容拉回。它不是 VirtualizedList 的默认行为，不能删掉后依赖隐式锚定。
 */
export const MessageList = memo(function MessageList({ messages, running }: MessageListProps) {
  const styles = useThemedStyles(makeStyles);
  const rows = useMemo(() => buildRows(messages, running, describeProcessItem), [messages, running]);
  const [innerScrollGesture, setInnerScrollGesture] = useState(false);
  const setInnerGesture = useCallback((active: boolean): void => setInnerScrollGesture(active), []);
  const renderRow = useCallback(({ item }: ListRenderItemInfo<DisplayRow>) => item.kind === 'turn'
    ? <View style={styles.row}><TurnRow turn={item.turn} onInnerScrollGesture={setInnerGesture} /></View>
    : <MessageRow message={item.message} onInnerScrollGesture={setInnerGesture} />, [setInnerGesture]);

  return <View style={styles.wrap}>
    <FlatList
      data={rows}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      style={styles.wrap}
      contentContainerStyle={styles.content}
      inverted
      scrollEnabled={!innerScrollGesture}
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews
      // 首屏与批次的渲染量：长会话下把挂载量压在几十行内，避免一次性挂满几百行造成卡顿
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={7}
    />
  </View>;
});

/**
 * 非回合行：系统卡与用户气泡。
 * memo：props 只有该条消息本体，其余消息引用不变 → 浅比较相等 → React 跳过渲染。
 */
const MessageRow = memo(function MessageRow({ message, onInnerScrollGesture }: {
  message: DisplayMessage;
  onInnerScrollGesture: (active: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  if (message.role === 'system') {
    return <View style={styles.row}><SystemCard message={message} onInnerScrollGesture={onInnerScrollGesture} /></View>;
  }
  return <View style={styles.row}>
    <View style={[styles.bubble, styles.userBubble]}>
      {!!message.attachments?.length && <View style={styles.attachments}>{message.attachments.map((attachment) =>
        // 历史附件可能只有 basename（桌面端 log 路径不下发、图片像素也可能已被剥离）：
        // 没有 base64 就退成与 doc 同款的占位卡，别把本机绝对路径露出来、也别喂一个坏 data URI 给 Image。
        attachment.kind === 'image' && attachment.data
          ? <Image key={attachment.id} source={{ uri: `data:${attachment.mimeType ?? 'image/jpeg'};base64,${attachment.data}` }} style={styles.attachmentImage} resizeMode="contain" />
          : <View key={attachment.id} style={styles.attachmentDoc}><Text numberOfLines={2} style={styles.attachmentName}>{attachment.name}</Text></View>)}</View>}
      {!!message.text && <UserText text={message.text} selectable={Platform.OS !== 'android'} />}
    </View>
    {/* 轻档标记在气泡下方：塞进气泡会与正文混在一起（桌面端 ChatPanel.tsx:3655-3657 同位置） */}
    {(!!message.outOfContext || !!message.imageStripped || !!message.imagesPathOnly) && <View style={styles.badges}>
      {!!message.outOfContext && <View style={styles.badge}><Text style={styles.badgeText}>已退出上下文</Text></View>}
      {!!message.imageStripped && !message.outOfContext && <View style={styles.badge}><Text style={styles.badgeText}>历史图片已整理</Text></View>}
      {!!message.imagesPathOnly && <View style={styles.badge}><Text style={styles.badgeText}>图片仅传路径</Text></View>}
    </View>}
  </View>;
});
