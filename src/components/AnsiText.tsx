import { memo, useMemo } from 'react';
import { Text } from 'react-native';
import type { TextStyle } from 'react-native';
import { parseAnsi } from '../session/ansi';

/**
 * ANSI 着色文本 —— 对应桌面端 `OutputWindow` 里的 `ansiToHtml`（整块输出模式）。
 *
 * memo + useMemo(parseAnsi)：日志内容每来一块就整段增长，解析结果按内容缓存，
 * 避免父组件因别的原因重渲染时把整段日志重解析一遍（PC 那边 `ShellOutputBody` 同款处理）。
 */
export const AnsiText = memo(function AnsiText({ text, style }: { text: string; style?: TextStyle }) {
  const segments = useMemo(() => parseAnsi(text), [text]);
  return <Text selectable style={style}>
    {segments.map((segment, index) => segment.color || segment.background || segment.bold
      ? <Text key={index} style={{
        ...(segment.color ? { color: segment.color } : null),
        ...(segment.background ? { backgroundColor: segment.background } : null),
        ...(segment.bold ? { fontWeight: '600' as const } : null),
      }}>{segment.text}</Text>
      : segment.text)}
  </Text>;
});
