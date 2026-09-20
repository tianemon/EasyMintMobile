import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Platform, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { mergeAssistantRuns } from '../session/messages';
import type { DisplayMessage } from '../session/messages';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';
import { MarkdownView } from './markdown/MarkdownView';
import { SystemCard } from './SystemCard';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 14 },
  /**
   * ⚠ 行与气泡必须显式 flexGrow: 0 / flexShrink: 0 —— 它们是"按内容定高"的，不能参与弹性分配。
   *
   * 这是长会话空白块的根因：RN 的 ScrollView 默认带 `flexGrow: 1, flexShrink: 1`
   * （ScrollView.js 的 baseVertical/baseHorizontal），行内凡出现 ScrollView 就会被 Yoga
   * 按弹性项伸展，把整行撑到畸形高度（实测单行 267030px，比整个列表的内容高还大），
   * 表现为一片盖住消息、翻不回去的空白。
   */
  row: { flexGrow: 0, flexShrink: 0, paddingBottom: 12 },
  bubble: { flexGrow: 0, flexShrink: 0, maxWidth: '88%', padding: 13, borderRadius: radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.card },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.cardAgent },
  bubbleText: { color: colors.textPrimary, fontSize: fontSize.base, lineHeight: 22 },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  attachmentImage: { width: 92, height: 92, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  attachmentDoc: { width: 92, minHeight: 52, padding: 8, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  attachmentName: { color: colors.textPrimary, fontSize: fontSize.caption, textAlign: 'center' },
});

type MessageListProps = { messages: DisplayMessage[] };

/** 稳定 renderItem / keyExtractor：store 每次事件都产生新数组，内联函数会让 FlatList 对全部行重新求值 */
const keyExtractor = (message: DisplayMessage): string => message.id;
const maintainVisibleContentPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: 72 };

/**
 * 消息流 —— inverted FlatList，数据顺序为「最新在前」。
 *
 * inverted 让 offset=0 天然对应最新消息，避免超长、变高消息下 scrollToEnd 使用平均行高
 * 估算而停在历史中间。Android 上的思考块不能把边界剩余位移交给这个镜像父列表：
 * ThinkingBlock 在整个触摸手势期间通知这里关闭父列表 scrollEnabled，并且自身关闭
 * nestedScrollEnabled。内层仍由自己的 ScrollView 正常滚动，滚到边界后剩余位移被丢弃，
 * 手势结束再恢复消息列表，等价于 PC 的 overscroll-behavior: contain。
 *
 * maintainVisibleContentPosition 显式开启：用户停在最新消息附近时跟随流式增长；上翻历史后
 * 不会被新内容拉回。它不是 VirtualizedList 的默认行为，不能删掉后依赖隐式锚定。
 */
export const MessageList = memo(function MessageList({ messages }: MessageListProps) {
  const styles = useThemedStyles(makeStyles);
  const displayMessages = useMemo(() => mergeAssistantRuns(messages), [messages]);
  const [innerScrollGesture, setInnerScrollGesture] = useState(false);
  const setInnerGesture = useCallback((active: boolean): void => setInnerScrollGesture(active), []);
  const renderRow = useCallback(({ item }: ListRenderItemInfo<DisplayMessage>) =>
    <MessageRow message={item} onInnerScrollGesture={setInnerGesture} />, [setInnerGesture]);

  return <View style={styles.wrap}>
    <FlatList
      data={displayMessages}
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
 * memo：props 只有该条消息本体。流式帧只替换正在流式的那一条（见 upsertMessage），
 * 其余消息引用不变 → 浅比较相等 → React 跳过这些行的渲染。
 */
const MessageRow = memo(function MessageRow({ message, onInnerScrollGesture }: {
  message: DisplayMessage;
  onInnerScrollGesture: (active: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  if (message.role === 'system') return <View style={styles.row}><SystemCard message={message} onInnerScrollGesture={onInnerScrollGesture} /></View>;
  if (message.role === 'user') {
    return <View style={styles.row}>
      <View style={[styles.bubble, styles.userBubble]}>
        {!!message.attachments?.length && <View style={styles.attachments}>{message.attachments.map((attachment) =>
          attachment.kind === 'image'
            ? <Image key={attachment.id} source={{ uri: `data:${attachment.mimeType};base64,${attachment.data}` }} style={styles.attachmentImage} resizeMode="contain" />
            : <View key={attachment.id} style={styles.attachmentDoc}><Text numberOfLines={2} style={styles.attachmentName}>{attachment.name}</Text></View>)}</View>}
        {!!message.text && <Text selectable={Platform.OS !== 'android'} style={styles.bubbleText}>{message.text}</Text>}
      </View>
    </View>;
  }
  return <View style={styles.row}>
    <View style={[styles.bubble, styles.assistantBubble]}>{message.blocks?.map((block, index) => {
      const isLast = index === (message.blocks?.length ?? 0) - 1;
      if (block.kind === 'thinking') return <ThinkingBlock key={`${message.id}-${index}-thinking`} content={block.text}
        active={!!message.streaming && isLast} onInnerScrollGesture={onInnerScrollGesture} />;
      if (block.kind === 'tool') return <ToolCard key={`${message.id}-${block.id || index}`} tool={block} onInnerScrollGesture={onInnerScrollGesture} />;
      // 模型正文走 Markdown 渲染；fadeTail 只给流式中正在增长的尾块（尾部字符渐隐）
      return <MarkdownView key={`${message.id}-${index}-text`} text={block.text} fadeTail={!!message.streaming && isLast} />;
    })}</View>
  </View>;
});
