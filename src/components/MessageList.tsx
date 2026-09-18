import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { DisplayMessage } from '../session/messages';
import { colors, fontSize, radius } from '../theme/tokens';
import { SystemCard } from './SystemCard';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';

type MessageListProps = { messages: DisplayMessage[] };

/** 消息流（inverted 列表：数据已是「最新在前」） */
export function MessageList({ messages }: MessageListProps) {
  return <FlatList data={messages} keyExtractor={(item) => item.id}
    inverted contentContainerStyle={styles.chatList} keyboardShouldPersistTaps="handled"
    maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 72 }}
    renderItem={({ item }) => <MessageRow message={item} />} />;
}

function MessageRow({ message }: { message: DisplayMessage }) {
  if (message.role === 'system') return <SystemCard message={message} />;
  if (message.role === 'user') return <View style={[styles.bubble, styles.userBubble]}><Text selectable style={styles.bubbleText}>{message.text}</Text></View>;
  return <View style={[styles.bubble, styles.assistantBubble]}>{message.blocks?.map((block, index) => {
    if (block.kind === 'thinking') return <ThinkingBlock key={`${message.id}-${index}-thinking`} content={block.text}
      active={!!message.streaming && index === (message.blocks?.length ?? 0) - 1} />;
    if (block.kind === 'tool') return <ToolCard key={`${message.id}-${block.id || index}`} tool={block} />;
    return <Text selectable key={`${message.id}-${index}-text`} style={styles.bubbleText}>{block.text}</Text>;
  })}</View>;
}

const styles = StyleSheet.create({
  chatList: { padding: 14, gap: 12, flexGrow: 1, justifyContent: 'flex-start' },
  bubble: { maxWidth: '88%', padding: 13, borderRadius: radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.card },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.cardAgent },
  systemBubble: { alignSelf: 'center', backgroundColor: colors.surfaceAlt },
  bubbleText: { color: colors.textPrimary, fontSize: fontSize.base, lineHeight: 22 },
});
