import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { diffLines, visibleDiffRange } from '../session/diff';
import type { DisplayPresentation } from '../session/messages';
import type { ThemeColors } from '../theme/tokens';
import { fontSize } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 展开区封顶高度：对齐桌面端 `calc(var(--text-code) * 19.5)`（约 12 行） */
const DIFF_MAX_HEIGHT = fontSize.code * 19.5;
const LINE_HEIGHT = fontSize.code * 1.6;

type DiffViewProps = {
  content: string;
  presentation?: DisplayPresentation;
  /** 内层滚动期间锁住外层 inverted 列表（与思考块 / 工具卡同款） */
  onInnerScrollGesture: (active: boolean) => void;
};

type DiffRow = { kind: 'add' | 'remove' | 'context' | 'header' | 'ellipsis'; text: string; lineNo: string };

/**
 * 堆叠式 diff（不做并排——手机宽度放不下两列）。
 *
 * 与桌面端 `ChatBlocks.tsx:758-828` 同口径：
 *  - 底色只区分增删（红绿），**文字保持正文色**，加减号用语义色，避免整行染色后读不清
 *  - 可见区间 = 首个改动前 3 行 ~ 末个改动后 3 行，区间内全量保留，区间外显示省略号
 *  - 行号列宽按最宽行号右对齐
 *
 * 手机端不做语法高亮：PC 那套 tokenizer 是编辑器级依赖，移动端只保留 diff 结构本身。
 */
export function DiffView({ content, presentation, onInnerScrollGesture }: DiffViewProps) {
  const styles = useThemedStyles(makeStyles);
  const rows = useMemo(() => buildRows(content, presentation), [content, presentation]);
  const lineNoWidth = useMemo(() => rows.reduce((width, row) => Math.max(width, row.lineNo.length), 0), [rows]);

  return <ScrollView
    style={styles.scroll}
    contentContainerStyle={styles.body}
    // 父列表已在本手势内关闭；这里也禁用 nested dispatch，边界剩余位移不上交（同思考块）
    nestedScrollEnabled={false}
    onTouchStart={() => onInnerScrollGesture(true)}
    onTouchEnd={() => onInnerScrollGesture(false)}
    onScrollEndDrag={() => onInnerScrollGesture(false)}
    onMomentumScrollEnd={() => onInnerScrollGesture(false)}
    onResponderRelease={() => onInnerScrollGesture(false)}
    onResponderTerminate={() => onInnerScrollGesture(false)}
  >
    {rows.map((row, index) => row.kind === 'ellipsis'
      ? <Text key={index} style={styles.ellipsis}>…</Text>
      : <View key={index} style={[styles.line, row.kind === 'add' && styles.add, row.kind === 'remove' && styles.remove]}>
        {lineNoWidth > 0 && <Text style={[styles.lineNo, { width: lineNoWidth * 7 + 8 }]}>{row.lineNo}</Text>}
        <Text style={[styles.code, row.kind === 'header' && styles.headerText]}>{row.text}</Text>
      </View>)}
  </ScrollView>;
}

/** Pi 的 diff 行形如 `+ 12 code` / `- 13 code` / ` 14 code`；行号可缺失（老结果） */
const LINE_NO_RE = /^\s*(\d+)\s+([\s\S]*)$/;

function buildRows(content: string, presentation?: DisplayPresentation): DiffRow[] {
  const lines = diffLines(content, presentation);
  const range = visibleDiffRange(lines);
  const visible = range ? lines.slice(range.from, range.to + 1) : lines;
  const rows: DiffRow[] = [];
  if (range && range.from > 0) rows.push({ kind: 'ellipsis', text: '', lineNo: '' });
  for (const raw of visible) {
    // 文件头与 hunk 头先判掉：它们也以 +/- 开头，不能当成增删行
    if (raw.startsWith('@@') || raw.startsWith('+++') || raw.startsWith('---')) {
      rows.push({ kind: 'header', text: raw, lineNo: '' });
      continue;
    }
    const marker = raw[0];
    const tagged = marker === '+' || marker === '-';
    const parsed = LINE_NO_RE.exec(tagged ? raw.slice(1) : raw);
    const lineNo = parsed?.[1] ?? '';
    const body = parsed ? parsed[2] : (tagged ? raw.slice(1) : raw).replace(/^ /, '');
    rows.push({ kind: tagged ? (marker === '+' ? 'add' : 'remove') : 'context', text: `${tagged ? `${marker} ` : '  '}${body}`, lineNo });
  }
  if (range && range.to < lines.length - 1) rows.push({ kind: 'ellipsis', text: '', lineNo: '' });
  return rows;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // flexGrow/flexShrink 必须显式钳死：否则会被 Yoga 当弹性项撑成畸形高度（同思考块）
  scroll: { flexGrow: 0, flexShrink: 0, maxHeight: DIFF_MAX_HEIGHT },
  body: { paddingVertical: 2 },
  line: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 2 },
  add: { backgroundColor: colors.diffAdd },
  remove: { backgroundColor: colors.diffRemove },
  lineNo: { flexShrink: 0, color: colors.textMuted, fontFamily: monoFont, fontSize: fontSize.code, lineHeight: LINE_HEIGHT, textAlign: 'right' },
  code: { flexGrow: 1, flexShrink: 1, minWidth: 0, color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.code, lineHeight: LINE_HEIGHT },
  headerText: { color: colors.textMuted },
  ellipsis: { color: colors.textMuted, fontFamily: monoFont, fontSize: fontSize.code, lineHeight: LINE_HEIGHT },
});
