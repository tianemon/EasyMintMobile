import { memo, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatUsage } from '../session/messages';
import { describeProcessItem } from '../session/tools';
import type { ProcessItem, TurnPiece, TurnView as TurnViewData } from '../session/turns';
import { formatTurnDuration, summarizeProcess, turnMode } from '../session/turns';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';
import { ChevronIcon, SpinIcon, ToolIcon, iconSize } from './icons';
import { MarkdownView } from './markdown/MarkdownView';
import { ToolCard } from './ToolCard';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 过程展开区高度上限：与思考块同档（6 行 13px + 内边距） */
const DETAIL_MAX_HEIGHT = fontSize.detail * 9.75 + 24;
/** 已完成回合的展开视口：桌面端 `.execution-process-viewport { max-height: 240px; overflow-y: auto }` */
const TRANSCRIPT_MAX_HEIGHT = 240;

type TurnRowProps = {
  turn: TurnViewData;
  onInnerScrollGesture: (active: boolean) => void;
};

/**
 * 一次「执行」的渲染 —— 对应桌面端 `ExecutionProcess`（运行中折一行）+ `CompletedExecution`（完成后折「用时 X」）
 * 与 preserveSegments（摊开）三种形态。**三种形态由两个独立事实决定，不能压成一个标志位**
 * （压过一版就踩了坑：运行中若模型先跑工具、还没吐正文，既没有正文片段可摊、又因为 `active` 被 header
 * 挡掉，整行只剩一个计时器，工具卡和状态行全不显示）：
 *
 *  - `running`：过程折成一行摘要（带转圈），正文照常流式；模型只跑工具时也至少有这一行在动
 *  - `folded`：已完成且抽出了结论 → 一行「用时 X ⌄」，展开进**有界视口**按原顺序回放过程
 *  - `flat`：抽不出结论（被打断 / 只有中间叙述）→ 过程直接摊开、保持原始交错顺序（PC 的 preserveSegments）
 */
export const TurnRow = memo(function TurnRow({ turn, onInnerScrollGesture }: TurnRowProps) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  // 折成一行「用时 X」的前提是抽出了结论、且确实有过程可回放；其余（运行中 / 被打断 / 只跑了工具）
  // 分别走 running 与 flat。判定在 session/turns.ts 的 turnMode 里，纯函数、有测试守着。
  const mode = turnMode(turn);
  const foldable = mode === 'folded';
  // 已完成一律给时间行；摊开态（preserveSegments）桌面端用的是 running 那套措辞（「已执行 …」）
  const timeLabel = formatTurnDuration(turn.durationMs,
    mode === 'flat' ? { active: true, interrupted: turn.interrupted } : { interrupted: turn.interrupted });

  return <View style={styles.row}>
    {mode === 'running' && turn.startedAt !== undefined && <TurnTimer startedAt={turn.startedAt} />}

    {mode !== 'running' && (foldable
      ? <Pressable style={styles.header} onPress={() => setOpen((value) => !value)}>
        <Text style={styles.headerLabel}>{timeLabel}</Text>
        <ChevronIcon direction={open ? 'down' : 'right'} />
      </Pressable>
      : <View style={styles.header}><Text style={styles.headerLabel}>{timeLabel}</Text></View>)}

    {/* 已完成：展开才回放，且整段过程装在一个有界视口里（桌面端 240px，超出内部滚动） */}
    {mode === 'folded' && open && <ScrollView
      style={styles.transcriptScroll}
      // 父列表已在本手势内关闭；这里也禁用 nested dispatch，边界剩余位移不上交（同思考块）
      nestedScrollEnabled={false}
      onTouchStart={() => onInnerScrollGesture(true)}
      onTouchEnd={() => onInnerScrollGesture(false)}
      onScrollEndDrag={() => onInnerScrollGesture(false)}
      onMomentumScrollEnd={() => onInnerScrollGesture(false)}
      onResponderRelease={() => onInnerScrollGesture(false)}
      onResponderTerminate={() => onInnerScrollGesture(false)}
    >
      <View style={styles.transcript}>
        {renderItems(turn.pieces.flatMap((piece) => piece.kind === 'process' ? piece.items : []), styles, onInnerScrollGesture, false)}
      </View>
    </ScrollView>}

    {mode === 'running' && turn.pieces.map((piece) => piece.kind === 'process'
      ? <ProcessSummary key={piece.key} piece={piece} turn={turn} onInnerScrollGesture={onInnerScrollGesture} />
      : <View key={piece.key} style={styles.agentBlock}>
        <MarkdownView text={piece.text} fadeTail={piece.tail} />
      </View>)}

    {/* 摊开态：工具卡直接可见，不再每项一条折叠行（被打断时用户要看的就是发生了什么） */}
    {mode === 'flat' && turn.pieces.map((piece) => piece.kind === 'process'
      ? <View key={piece.key}>{renderItems(piece.items, styles, onInnerScrollGesture, false)}</View>
      : <View key={piece.key} style={styles.agentBlock}>
        <MarkdownView text={piece.text} />
      </View>)}

    {turn.conclusion.length > 0 && <View style={styles.conclusion}>
      {turn.conclusion.map((item) => <View key={item.key} style={styles.agentBlock}>
        <MarkdownView text={item.text} />
      </View>)}
    </View>}

    {!!turn.usage && <Text style={styles.meta}>{formatUsage(turn.usage)}</Text>}
  </View>;
});

/** 运行中的过程摘要行：一条执行内的一个过程切片，默认折成一行 */
function ProcessSummary({ piece, turn, onInnerScrollGesture }: {
  piece: Extract<TurnPiece, { kind: 'process' }>;
  turn: TurnViewData;
  onInnerScrollGesture: (active: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const summary = summarizeProcess(piece.items, describeProcessItem) || turn.summary;
  return <View style={styles.process}>
    <Pressable style={styles.processHeader} onPress={() => setOpen((value) => !value)}>
      <ToolIcon name={iconOf(piece.items, turn)} />
      <Text numberOfLines={1} style={styles.processLabel}>{summary}</Text>
      {piece.running && <SpinIcon size={iconSize.card} />}
      <ChevronIcon direction={open ? 'down' : 'right'} />
    </Pressable>
    {open && <View style={styles.detail}>
      <ScrollView
        style={styles.detailScroll}
        nestedScrollEnabled={false}
        onTouchStart={() => onInnerScrollGesture(true)}
        onTouchEnd={() => onInnerScrollGesture(false)}
        onScrollEndDrag={() => onInnerScrollGesture(false)}
        onMomentumScrollEnd={() => onInnerScrollGesture(false)}
        onResponderRelease={() => onInnerScrollGesture(false)}
        onResponderTerminate={() => onInnerScrollGesture(false)}
      >
        {renderItems(piece.items, styles, onInnerScrollGesture, true)}
      </ScrollView>
    </View>}
  </View>;
}

function iconOf(items: ProcessItem[], turn: TurnViewData): string {
  const tool = items.find((item) => item.kind === 'tool');
  if (tool?.kind === 'tool') return tool.tool.name;
  return items.some((item) => item.kind === 'thinking') ? 'read' : turn.iconName;
}

/** 思考/中间叙述流式期间只渲染尾部窗口（字符）：整段几万字每帧重排会追不上帧率 */
const STREAM_WINDOW_CHARS = 1500;

/**
 * 过程条目渲染。与桌面端 `ProcessDetails`（ExecutionProcess.tsx:127-150）同分工：
 *  - 全是思考 → 等宽 `<pre>`（手机端等价物）
 *  - 混有正文 → 正文按 markdown 渲染（桌面端走 AssistantContent）
 * 工具一律交给 ToolCard（自带按工具分叉的形态）。
 */
function renderItems(items: ProcessItem[], styles: ReturnType<typeof makeStyles>, onInnerScrollGesture: (active: boolean) => void, live: boolean) {
  return items.map((item) => {
    if (item.kind === 'tool') {
      return <ToolCard key={item.key} tool={item.tool} onInnerScrollGesture={onInnerScrollGesture} live={live} />;
    }
    if (item.kind === 'commentary') {
      return <View key={item.key} style={styles.commentary}><MarkdownView text={item.text} /></View>;
    }
    // 思考：桌面端就是不套折叠的等宽正文；流式时只喂尾部窗口（同 ThinkingBlock 的做法），停止后给全文
    return <Text key={item.key} selectable style={styles.thinkingText}>{live && item.text.length > STREAM_WINDOW_CHARS
      ? `…${item.text.slice(-STREAM_WINDOW_CHARS)}` : item.text}</Text>;
  });
}

/** 实时走秒：桌面端 ExecutionTimer 同款，本地一秒一跳，不让整条消息跟着重渲染 */
function TurnTimer({ startedAt }: { startedAt: number }) {
  const styles = useThemedStyles(makeStyles);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <Text style={styles.timer}>{formatTurnDuration(Math.max(0, now - startedAt), { active: true })}</Text>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // ⚠ 行必须显式 flexGrow: 0 / flexShrink: 0：inverted 列表里按内容定高的行不能参与弹性分配。
  // 这里**不加** paddingBottom——行间距由 MessageList 的行容器统一给，两处都加会变成其它行的两倍。
  row: { flexGrow: 0, flexShrink: 0 },
  timer: { color: colors.textMuted, fontSize: fontSize.caption, fontWeight: '500', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  headerLabel: { color: colors.textMuted, fontSize: fontSize.caption },
  // 展开后的过程回放：左侧竖线 + 深一档底，与桌面端 execution-transcript 的层级一致
  transcriptScroll: { flexGrow: 0, flexShrink: 0, maxHeight: TRANSCRIPT_MAX_HEIGHT },
  transcript: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.s2, marginTop: 2 },
  commentary: { marginBottom: space.s2 },
  process: { marginBottom: 4 },
  // maxWidth 必须给：alignSelf: 'flex-start' 的容器按内容定宽，命令摘要很长时拿不到可用宽度，
  // 单行截断就退化成溢出（文字被画到容器外面）而不是省略号
  processHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  processLabel: { flexShrink: 1, color: colors.toolTitle, fontSize: fontSize.caption, fontWeight: '600' },
  detail: { marginTop: 2, borderRadius: radius.lg, backgroundColor: colors.thinkingBody, paddingHorizontal: 8, paddingVertical: 6 },
  detailScroll: { flexGrow: 0, flexShrink: 0, maxHeight: DETAIL_MAX_HEIGHT },
  thinkingText: { color: colors.textSecondary, fontFamily: monoFont, fontSize: fontSize.detail, lineHeight: fontSize.detail * 1.625, marginBottom: 4 },
  bubble: { flexGrow: 0, flexShrink: 0, maxWidth: '88%', padding: 13, borderRadius: radius.lg, marginBottom: space.s2 },
  // Mint 正文不套气泡（桌面端 msg-conclusion 同样是透明无底），靠一条横线与上文分开
  agentBlock: { alignSelf: 'stretch', marginBottom: space.s2 },
  conclusion: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12, marginTop: 4 },
  meta: { color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2, marginBottom: 4 },
});
