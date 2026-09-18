import { memo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, ListRenderItemInfo } from 'react-native';
import type { DisplayMessage } from '../session/messages';
import { colors, fontSize, radius } from '../theme/tokens';
import { MarkdownView } from './markdown/MarkdownView';
import { SystemCard } from './SystemCard';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  // 定位期临时样式（消息区异常排查完移除）
  debug: { paddingHorizontal: 8, paddingBottom: 4, color: '#1a1a1a', backgroundColor: '#ffe58f', fontSize: 10 },
  chatList: { padding: 14, gap: 12, flexGrow: 1, justifyContent: 'flex-start' },
  bubble: { maxWidth: '88%', padding: 13, borderRadius: radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.card },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.cardAgent },
  systemBubble: { alignSelf: 'center', backgroundColor: colors.surfaceAlt },
  bubbleText: { color: colors.textPrimary, fontSize: fontSize.base, lineHeight: 22 },
});

type MessageListProps = { messages: DisplayMessage[] };

// 以下三项提到模块级：身份稳定，避免每次列表渲染都换新引用导致 FlatList 重建单元格
const keyExtractor = (item: DisplayMessage): string => item.id;
const contentContainerStyle = styles.chatList;
const maintainVisibleContentPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: 72 };
const renderItem = ({ item }: ListRenderItemInfo<DisplayMessage>) => <MessageRow message={item} />;

/** 消息流（inverted 列表：数据已是「最新在前」） */
export const MessageList = memo(function MessageList({ messages }: MessageListProps) {
  // ── 定位期临时诊断（消息区异常排查完移除）───────────────────────────
  const [contentHeight, setContentHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  return <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setViewHeight(Math.round(e.nativeEvent.layout.height))}>
    <FlatList data={messages} keyExtractor={keyExtractor}
      inverted contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      onContentSizeChange={(_w: number, h: number) => setContentHeight(Math.round(h))}
      renderItem={renderItem} />
    <Text style={styles.debug} selectable numberOfLines={3}>
      {`诊断 消息${messages.length}条 · 内容高${contentHeight} · 视口高${viewHeight} · ${describeMessages(messages)}`}
    </Text>
  </View>;
});

/** 每条消息的角色与块种类（只列前 4 条），用于判断是数据不对还是布局不对 */
function describeMessages(messages: DisplayMessage[]): string {
  return messages.slice(0, 4).map((message, index) => {
    const kinds = message.blocks?.map((block) => block.kind).join('/');
    const size = message.text ? `t${message.text.length}` : '';
    return `#${index}${message.role[0]}${kinds ? `(${kinds})` : ''}${size}`;
  }).join(' ');
}

/**
 * memo：props 只有该条消息本体。流式帧只替换正在流式的那一条（见 upsertMessage），
 * 其余消息引用不变 → 浅比较相等 → React 跳过这些行的渲染（流式期间非流式行 render 次数为 0）。
 */
const MessageRow = memo(function MessageRow({ message }: { message: DisplayMessage }) {
  if (message.role === 'system') return <SystemCard message={message} />;
  if (message.role === 'user') return <View style={[styles.bubble, styles.userBubble]}><Text selectable style={styles.bubbleText}>{message.text}</Text></View>;
  return <View style={[styles.bubble, styles.assistantBubble]}>{message.blocks?.map((block, index) => {
    const isLast = index === (message.blocks?.length ?? 0) - 1;
    if (block.kind === 'thinking') return <ThinkingBlock key={`${message.id}-${index}-thinking`} content={block.text}
      active={!!message.streaming && isLast} />;
    if (block.kind === 'tool') return <ToolCard key={`${message.id}-${block.id || index}`} tool={block} />;
    // 模型正文走 Markdown 渲染；fadeTail 只给流式中正在增长的尾块（尾部字符渐隐）
    return <MarkdownView key={`${message.id}-${index}-text`} text={block.text} fadeTail={!!message.streaming && isLast} />;
  })}</View>;
});
