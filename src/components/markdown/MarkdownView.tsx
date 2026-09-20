import { memo, useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { Token, Tokens } from 'marked';
import type { ThemeColors } from '../../theme/tokens';
import { fontSize, space } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/theme-context';
import { CodeBlock } from './CodeBlock';
import { InlineTokens } from './inline';
import { languageLabel, lexMarkdown, splitMarkdownParts, splitStableBlocks, trimCodeBody } from './parse';

/**
 * 手机端的 Markdown 渲染入口（自绘 RN 组件，不走 WebView）。
 *
 * 流式性能的三层处理：
 *  ① 事件层已按帧合并（session/stream-frames.ts），这里每帧最多渲染一次；
 *  ② 本组件把正文切成「已完成块」（splitStableBlocks）+「正在增长的尾块」，
 *     每个块交给独立的 memo 子组件——内容字符串不变就不重跑 marked，也不重建 native 视图；
 *  ③ 只有尾块每帧重新解析，且只对尾块做字符级渐隐（历史块与流式结束后都不加）。
 */

type MarkdownViewProps = {
  text: string;
  /** 是否正在增长的尾块（只在流式中的最后一块为 true） */
  fadeTail?: boolean;
};

type Row =
  | { kind: 'code'; language: string; code: string }
  | { kind: 'markdown'; text: string; fade: boolean };

// Android 的原生 selectable Text 点击时会请求把自身移入可见区域；在 inverted
// FlatList 中该坐标会被反向解释，导致消息列表跳动。iOS 保留系统文本选择。
const textSelectable = Platform.OS !== 'android';

export const MarkdownView = memo(function MarkdownView({ text, fadeTail }: MarkdownViewProps) {
  const rows = useMemo(() => buildRows(text, !!fadeTail), [text, fadeTail]);
  const last = rows.length - 1;
  return <>{rows.map((row, index) => row.kind === 'code'
    ? <CodeBlock key={index} language={row.language} code={row.code} last={index === last} />
    : <MarkdownSegment key={index} markdown={row.text} fade={row.fade} trim={index === last} />)}</>;
});

/**
 * 一个「已完成的块」或尾块：memo + useMemo(lexMarkdown) 是流式不重复解析的关键——
 * 流式期间父组件每帧都重建元素，但只要本块的文本没变，marked 一次都不会被调用。
 * trim：只有整条消息的最后一块才收尾边距（对齐桌面端 `[&_p:last-child]:mb-0`）。
 */
const MarkdownSegment = memo(function MarkdownSegment({ markdown, fade, trim }: { markdown: string; fade: boolean; trim: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const blocks = useMemo(() => lexMarkdown(markdown).filter(isVisible), [markdown]);
  return <>{renderBlocks(styles, blocks, fade, false, trim)}</>;
});

function buildRows(text: string, fadeTail: boolean): Row[] {
  const parts = splitMarkdownParts(text, fadeTail);
  const rows: Row[] = [];
  parts.forEach((part, index) => {
    if (part.kind === 'code') {
      rows.push({ kind: 'code', language: part.lang, code: part.code });
      return;
    }
    const isTailPart = fadeTail && index === parts.length - 1;
    // 冻结前缀 + 尾部：切出来的每块文本在后续帧里保持不变（尾块除外），memo 因此能挡住重解析
    const groups = isTailPart ? splitStableBlocks(part.text) : [part.text];
    groups.forEach((group, groupIndex) => rows.push({
      kind: 'markdown',
      text: group,
      fade: isTailPart && groupIndex === groups.length - 1,
    }));
  });
  return rows;
}

/** 空行（space）与链接定义（def）不产生可见内容 */
function isVisible(token: Token): boolean {
  return token.type !== 'space' && token.type !== 'def';
}

/** 子 token 兜底：marked 的 Token 联合含 `Tokens.Generic`，`tokens` 因此始终是可选的 */
function blockTokens(token: Token): Token[] {
  return 'tokens' in token && token.tokens ? token.tokens : [];
}

/** 样式表类型：下面这些纯渲染函数不是组件（不适用 hooks），样式一律由调用方传进来 */
type MarkdownStyles = ReturnType<typeof makeStyles>;

/** 块级 token → 元素。fade 只作用于最后一块的末尾纯文本；trim 去掉最后一块的收尾边距（只给整条消息的最后一块） */
function renderBlocks(styles: MarkdownStyles, tokens: Token[], fade: boolean, quote = false, trim = false): ReactNode[] {
  const last = tokens.length - 1;
  return tokens.map((token, index) => renderBlock(styles, token, index, fade && index === last, quote, trim && index === last));
}

function renderBlock(styles: MarkdownStyles, token: Token, key: number, fade: boolean, quote: boolean, last: boolean): ReactNode {
  // marked 的 Token 联合带 `Tokens.Generic`（type: string），switch 窄不到具体成员——
  // list/table 两处按已确认的 token.type 断言到具体类型
  switch (token.type) {
    case 'paragraph':
    case 'text':
      return <Text key={key} selectable={textSelectable} style={[styles.paragraph, quote && styles.quoteText, last && styles.blockLast]}>
        <InlineTokens tokens={blockTokens(token)} fade={fade} />
      </Text>;
    case 'heading':
      return <Text key={key} selectable={textSelectable} style={[styles.heading, HEADING_STYLES[Math.min(token.depth, 6) - 1], quote && styles.quoteText, last && styles.blockLast]}>
        <InlineTokens tokens={blockTokens(token)} fade={fade} />
      </Text>;
    case 'code':
      // 围栏代码块在 parse.ts 已摘成独立 Row；这里只会遇到缩进代码块（无语言标识）
      return <CodeBlock key={key} language={languageLabel(token.lang)} code={trimCodeBody(token.text)} />;
    case 'blockquote':
      return <View key={key} style={styles.quote}>{renderBlocks(styles, blockTokens(token).filter(isVisible), fade, true)}</View>;
    case 'list':
      return <View key={key} style={styles.list}>{renderListItems(styles, token as Tokens.List, fade, quote)}</View>;
    case 'table':
      return renderTable(styles, key, token as Tokens.Table, fade);
    case 'hr':
      return <View key={key} style={styles.hr} />;
    case 'html':
      return <Text key={key} selectable={textSelectable} style={[styles.paragraph, quote && styles.quoteText, last && styles.blockLast]}>{token.text}</Text>;
    default:
      return 'tokens' in token && token.tokens
        ? <View key={key}>{renderBlocks(styles, token.tokens.filter(isVisible), fade, quote)}</View>
        : null;
  }
}

function renderListItems(styles: MarkdownStyles, list: Tokens.List, fade: boolean, quote: boolean): ReactNode[] {
  const start = typeof list.start === 'number' ? list.start : 1;
  return list.items.map((item, index) => <View key={index} style={styles.listItem}>
    <Text style={[styles.marker, list.ordered ? styles.markerOrdered : styles.markerBullet]}>
      {list.ordered ? `${start + index}.` : '•'}
    </Text>
    <View style={styles.listItemBody}>
      {renderBlocks(styles, item.tokens.filter(isVisible), fade && index === list.items.length - 1, quote)}
    </View>
  </View>);
}

function renderTable(styles: MarkdownStyles, key: number, table: Tokens.Table, fade: boolean): ReactNode {
  const lastRow = table.rows.length - 1;
  return <View key={key} style={styles.table}>
    <View style={styles.tableRow}>
      {table.header.map((cell, index) => <Text key={index} style={[styles.tableCell, styles.tableHeadCell, alignStyle(styles, cell.align)]}>
        <InlineTokens tokens={cell.tokens} />
      </Text>)}
    </View>
    {table.rows.map((row, rowIndex) => <View key={rowIndex} style={styles.tableRow}>
      {row.map((cell, cellIndex) => <Text key={cellIndex} style={[styles.tableCell, alignStyle(styles, cell.align)]}>
        <InlineTokens tokens={cell.tokens} fade={fade && rowIndex === lastRow && cellIndex === row.length - 1} />
      </Text>)}
    </View>)}
  </View>;
}

function alignStyle(styles: MarkdownStyles, align: 'center' | 'left' | 'right' | null) {
  return align === 'center' ? styles.cellCenter : align === 'right' ? styles.cellRight : undefined;
}

/**
 * 标题档位：桌面端 prose 在 14px 正文下的标题为 21/20/18/14px，
 * 这里映射到既有字号 token（20/18/16/15/14），不新造 token。
 */
const HEADING_STYLES = [
  { fontSize: fontSize.xl, lineHeight: 26, marginTop: space.s4, marginBottom: space.s3 },
  { fontSize: fontSize.lg, lineHeight: 25, marginTop: space.s4, marginBottom: space.s2 },
  { fontSize: fontSize.md, lineHeight: 24, marginTop: space.s3, marginBottom: space.s2 },
  { fontSize: fontSize.base, lineHeight: 20, marginTop: space.s3, marginBottom: space.s1 },
  { fontSize: fontSize.body, lineHeight: 22, marginTop: space.s3, marginBottom: space.s1 },
  { fontSize: fontSize.body, lineHeight: 22, marginTop: space.s3, marginBottom: space.s1 },
];

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  paragraph: { color: colors.textPrimary, fontSize: fontSize.body, lineHeight: 22, marginBottom: space.s3 },
  /** 整条消息的最后一块：不收尾边距，避免气泡底部比顶部多出一段空白 */
  blockLast: { marginBottom: 0 },
  heading: { color: colors.textPrimary, fontWeight: '700' },
  quote: { marginVertical: space.s2, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space.s3 },
  quoteText: { color: colors.textSecondary, fontStyle: 'italic' },
  list: { marginVertical: space.s2 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start' },
  marker: { color: colors.textSecondary, fontSize: fontSize.body, lineHeight: 22, minWidth: 20 },
  markerOrdered: { textAlign: 'right', paddingRight: space.s1 + 2 },
  markerBullet: { textAlign: 'left' },
  // 同理禁用 `flex: 1`（flexBasis: 0）——气泡按内容撑开时它会让宽度坍缩；用 flexGrow + flexBasis auto
  listItemBody: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  table: { marginVertical: space.s2 },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: space.s1,
    paddingVertical: space.s1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    color: colors.textPrimary,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  tableHeadCell: { fontWeight: '600', borderBottomColor: colors.border },
  cellCenter: { textAlign: 'center' },
  cellRight: { textAlign: 'right' },
  hr: { height: 1, marginVertical: space.s3, backgroundColor: colors.border },
});
