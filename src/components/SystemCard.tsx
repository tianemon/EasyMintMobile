import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DisplayMessage } from '../session/messages';
import { SYSTEM_LABELS } from '../session/tools';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import { ChevronIcon, SystemKindIcon, iconSize } from './icons';
import { MarkdownView } from './markdown/MarkdownView';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 正文行高（PC 的 `leading-[1.55]` + `--text-body`） */
const BODY_LINE_HEIGHT = fontSize.body * 1.55;
/** 结果卡展开限高：PC 的 `calc(6lh + 0.5px)` —— 约 6 行，超出内部滚动 */
const RESULT_BODY_MAX_HEIGHT = BODY_LINE_HEIGHT * 6 + 0.5;
/** 摘要卡展开限高：PC 的 `calc(16lh + 0.5px)` */
const SUMMARY_BODY_MAX_HEIGHT = 22 * 16 + 0.5;
/** 可折叠的指令型系统消息 kind（PC 的 COLLAPSIBLE_SYSTEM_KINDS 同表） */
const COLLAPSIBLE_KINDS = new Set(['project-created', 'direct-create', 'flow', 'summary', 'learn']);
/** 人为主动停止的状态词（中止系=琥珀色，失败=红，完成=绿） */
const STOPPED_STATUSES = new Set(['中止', '已由用户中断', '已由用户中止', '已中止']);
/** 结果行：⏺ 名称 - 状态 · 时长（分隔符兼容新旧：连字符与破折号） */
const RESULT_ROW_RE = /^⏺ (.+?) [-—] (完成|失败|中止|已由用户中断|已由用户中止|已中止)(?: · (\d+)s)?$/;
/** 日志路径行：PC 渲染成可点链接（在文件夹中显示）；手机上无此能力，降级为等宽可复制文本 */
const LOG_PATH_RE = /^完整输出:\s*(\S.*)$/;

type SystemCardProps = {
  message: DisplayMessage;
  /** 内层滚动期间锁住外层 inverted 列表（与思考块/工具卡同款） */
  onInnerScrollGesture: (active: boolean) => void;
};

/**
 * 系统消息卡：kind 图标 + 标签 + 状态行（状态从正文首个状态行解析），展开看正文。
 *
 * 正文按 kind 分三种（与 PC ChatPanel 同口径）：
 *  - 结果型（delegation / shell）：逐行渲染——⏺ 行拆成 名称/状态/时长 分别着色、首条 ⏺ 行不重复
 *    （已上标题栏）、`完整输出:` 行走等宽、限高 6 行滚动；
 *  - 摘要（summary）：正文是 markdown，走 MarkdownView，限高 16 行；
 *  - 其余：纯文本原文。
 */
export function SystemCard({ message, onInnerScrollGesture }: SystemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const kind = message.systemKind ?? 'system';
  const body = (message.text ?? '').replace(/^\[系统消息\](-\[[^\]]*\])?\s*/, '');
  const lines = body.split('\n');
  const firstDotIndex = lines.findIndex((line) => line.startsWith('⏺ '));
  const status = firstDotIndex >= 0 ? lines[firstDotIndex]?.match(RESULT_ROW_RE) : null;
  const isResult = kind === 'delegation' || kind === 'shell';
  const isSummary = kind === 'summary';
  const collapsible = COLLAPSIBLE_KINDS.has(kind) || isResult;
  const showBody = (!collapsible || expanded) && !!body;
  const statusColor = (value: string | undefined): string =>
    value === '失败' ? colors.danger : value && STOPPED_STATUSES.has(value) ? colors.interrupt : colors.done;

  return <View style={styles.systemCard}>
    <Pressable disabled={!collapsible} style={styles.systemHeader} onPress={() => setExpanded((value) => !value)}>
      <SystemKindIcon kind={kind} />
      <Text style={styles.systemLabel}>{SYSTEM_LABELS[kind] ?? '系统消息'}</Text>
      {!!status && <Text style={[styles.systemStatus, { color: statusColor(status[2]) }]}>· {status[2]}{status[3] ? ` · ${status[3]}s` : ''}</Text>}
      {collapsible && <View style={styles.systemChevron}><ChevronIcon size={iconSize.nav} direction={expanded ? 'down' : 'right'} /></View>}
    </Pressable>
    {showBody && (isResult
      ? <ScrollView
        style={styles.resultScroll}
        contentContainerStyle={styles.resultBody}
        nestedScrollEnabled={false}
        onTouchStart={() => onInnerScrollGesture(true)}
        onTouchEnd={() => onInnerScrollGesture(false)}
        onScrollEndDrag={() => onInnerScrollGesture(false)}
        onMomentumScrollEnd={() => onInnerScrollGesture(false)}
        onResponderRelease={() => onInnerScrollGesture(false)}
        onResponderTerminate={() => onInnerScrollGesture(false)}
      >
        {lines.map((row, index) => {
          // 首条 ⏺ 行的状态/时长已上标题栏，正文里跳过避免重复（PC 同款）
          if (index === firstDotIndex) return null;
          const logPath = LOG_PATH_RE.exec(row);
          if (logPath) return <Text key={index} selectable style={styles.logPath}>{logPath[1]}</Text>;
          const parsed = row.startsWith('⏺ ') ? row.match(RESULT_ROW_RE) : null;
          if (!parsed) return row.trim() === '' ? null : <Text key={index} selectable style={styles.bodyLine}>{row}</Text>;
          const color = statusColor(parsed[2]);
          return <Text key={index} selectable style={styles.bodyLine}>
            <Text style={{ color }}>⏺ </Text>
            <Text style={styles.resultName}>{parsed[1]}</Text>
            <Text style={styles.resultStatus}> - <Text style={{ color }}>{parsed[2]}</Text></Text>
            {parsed[3] ? <Text style={styles.resultDuration}> • {parsed[3]}s</Text> : null}
          </Text>;
        })}
      </ScrollView>
      : isSummary
        ? <ScrollView
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryBody}
          nestedScrollEnabled={false}
          onTouchStart={() => onInnerScrollGesture(true)}
          onTouchEnd={() => onInnerScrollGesture(false)}
          onScrollEndDrag={() => onInnerScrollGesture(false)}
          onMomentumScrollEnd={() => onInnerScrollGesture(false)}
          onResponderRelease={() => onInnerScrollGesture(false)}
          onResponderTerminate={() => onInnerScrollGesture(false)}
        >
          <MarkdownView text={body} />
        </ScrollView>
        : <Text selectable style={styles.systemBody}>{body}</Text>)}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 左侧系统卡片，与 assistant 气泡左对齐（PC 是 padding 32 + 头像占位 40 后对齐内容列；手机无头像列，
  // 所以不能缩进——早先的 marginLeft 54 会把卡片从左侧推开，展开后更是一路撑到右侧，看着像跑到用户侧了）
  systemCard: { maxWidth: '82%', alignSelf: 'flex-start', borderRadius: radius.lg, borderBottomLeftRadius: 4, backgroundColor: colors.card, overflow: 'hidden' },
  systemHeader: { minHeight: 36, paddingHorizontal: space.s3, flexDirection: 'row', alignItems: 'center', gap: 6 },
  systemLabel: { color: colors.systemLabel, fontSize: fontSize.caption, fontWeight: '600' },
  systemStatus: { fontSize: fontSize.caption, fontWeight: '600' },
  systemChevron: { marginLeft: 'auto' },
  summaryScroll: { flexGrow: 0, flexShrink: 0, maxHeight: SUMMARY_BODY_MAX_HEIGHT },
  summaryBody: { paddingHorizontal: space.s3, paddingBottom: 10 },
  systemBody: { paddingHorizontal: space.s3, paddingBottom: 10, color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  // 结果卡正文：与标题栏对齐的内边距，行间不加间隙（PC 用 py-0.5 的行内边距模拟）
  resultScroll: { flexGrow: 0, flexShrink: 0, maxHeight: RESULT_BODY_MAX_HEIGHT },
  resultBody: { paddingHorizontal: space.s3, paddingBottom: 8 },
  bodyLine: { color: colors.textSecondary, fontSize: fontSize.body, lineHeight: BODY_LINE_HEIGHT, paddingVertical: 2 },
  resultName: { color: colors.textPrimary },
  resultStatus: { color: colors.textPrimary, fontSize: fontSize.caption, fontWeight: '600' },
  resultDuration: { color: colors.textMuted, fontSize: fontSize.caption },
  // 日志路径行：手机不能「在文件夹中显示」，降级为等宽可复制文本（与 PC 的信息量一致：完整日志在电脑上）
  logPath: { color: colors.info, fontFamily: monoFont, fontSize: fontSize.caption, paddingVertical: 2 },
});
