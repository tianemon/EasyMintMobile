import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AnsiText } from '../components/AnsiText';
import { Header } from '../components/Header';
import { ChevronIcon, iconSize } from '../components/icons';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { ShellLog } from '../types';

/** 渲染上限：日志可达 100KB（PC 的截断口径），RN 里一次铺太多着色段会拖慢布局，只渲染尾部 */
const MAX_VIEW_CHARS = 30_000;
/** 距底部多少像素内算「在底部」（决定要不要继续跟随） */
const AT_BOTTOM_PX = 24;

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

type ShellOutputSheetProps = {
  visible: boolean;
  shell: { id: string; command: string; running: boolean } | null;
  /** 打开时拉一次日志尾部（对应 PC 的 shell.readLog → 日志尾部 100KB） */
  loadLog: (shellId: string) => Promise<ShellLog>;
  /** 订阅实时输出（命令运行中追加）；返回退订函数 */
  subscribeChunks: (listener: (shellId: string, chunk: string) => void) => () => void;
  onStop: (shellId: string) => void;
  onClose: () => void;
};

/**
 * 后台命令输出查看页 —— 对应桌面端的 `ShellProcessView` + `OutputWindow`：
 * 打开先加载日志尾部，运行中订阅 `agent:shell-output` 实时追加；等宽 + ANSI 着色；
 * 自动贴底跟随（手指滚离底部即停止，回底按钮恢复）；顶部提示内容被截断。
 */
export function ShellOutputSheet(props: ShellOutputSheetProps) {
  const { shell, visible } = props;
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [content, setContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const followTail = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const shellId = shell?.id ?? null;

  // 打开/切换命令：加载日志尾部（读不到就是空内容，不报错）
  useEffect(() => {
    if (!visible || !shellId) return;
    let cancelled = false;
    followTail.current = true;
    setAwayFromBottom(false);
    setContent('');
    setTruncated(false);
    setLoading(true);
    void props.loadLog(shellId).then((log) => {
      if (cancelled) return;
      // 拼在已收到的实时块**前面**：readLog 是网络往返，期间到的块比尾部更新，直接覆盖会把它们丢掉
      setContent((current) => log.content + current);
      setTruncated(log.truncated);
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // loadLog 由 App 提供，标识稳定；shellId/visible 变化才重新加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shellId]);

  // 实时输出：只认当前查看的命令（PC 同款按 id 过滤）
  useEffect(() => {
    if (!visible || !shellId) return;
    return props.subscribeChunks((id, chunk) => {
      if (id !== shellId) return;
      setContent((current) => current + chunk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shellId]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < AT_BOTTOM_PX;
    followTail.current = atBottom;
    setAwayFromBottom(!atBottom);
  };
  const onContentSizeChange = (): void => {
    if (followTail.current) scrollRef.current?.scrollToEnd({ animated: false });
  };
  const scrollToBottom = (): void => {
    followTail.current = true;
    setAwayFromBottom(false);
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const visibleText = content.length > MAX_VIEW_CHARS ? content.slice(-MAX_VIEW_CHARS) : content;
  const clipped = content.length > MAX_VIEW_CHARS;
  const running = !!shell?.running;

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
    <SafeAreaProvider><SafeAreaView style={commonStyles.safe} edges={['top', 'bottom']}>
      <Header title={shell?.command ?? '命令输出'} onBack={props.onClose} right={shell && running
        ? <Pressable accessibilityLabel="停止命令" onPress={() => props.onStop(shell.id)} style={styles.stopButton}>
          <Text style={styles.stopText}>停止</Text>
        </Pressable>
        : undefined} />
      <View style={styles.body}>
        <View style={styles.statusRow}>
          {running && <ActivityIndicator size="small" color={colors.accent} />}
          <Text style={styles.statusText}>{running ? '运行中' : '已结束'}</Text>
        </View>
        {(truncated || clipped) && <Text style={styles.truncatedHint}>
          日志较大，仅显示最近输出{clipped ? `（已渲染末尾 ${MAX_VIEW_CHARS / 1000} 千字符）` : ''}
        </Text>}
        <ScrollView
          ref={scrollRef}
          style={styles.output}
          contentContainerStyle={styles.outputContent}
          nestedScrollEnabled={false}
          scrollEventThrottle={100}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
        >
          {loading
            ? <Text style={styles.placeholder}>读取输出…</Text>
            : visibleText
              ? <AnsiText text={visibleText} style={styles.outputText} />
              : <Text style={styles.placeholder}>{running ? '等待输出…' : '(无输出)'}</Text>}
        </ScrollView>
        {awayFromBottom && <Pressable accessibilityLabel="回到底部" onPress={scrollToBottom} style={styles.toBottom}>
          <ChevronIcon size={iconSize.nav} direction="down" color={colors.textInverse} />
        </Pressable>}
      </View>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  stopButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  stopText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '700' },
  body: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.s4, paddingTop: space.s2 },
  statusText: { color: colors.textSecondary, fontSize: fontSize.caption },
  truncatedHint: { paddingHorizontal: space.s4, paddingTop: space.s1, color: colors.warning, fontSize: fontSize.code },
  // 输出区底色对齐 PC 的 `bg-[var(--color-sidebar)]/40`（比弹层内容面沉一档，让终端配色站得住）
  output: { flex: 1, marginTop: space.s2, backgroundColor: colors.surfaceAlt },
  outputContent: { paddingHorizontal: space.s4, paddingVertical: space.s3 },
  outputText: { color: colors.textPrimary, fontFamily: monoFont, fontSize: fontSize.code, lineHeight: 17 },
  placeholder: { color: colors.textSecondary, fontSize: fontSize.code },
  // 回底按钮：PC 是右下角悬浮圆形按钮，位置躲开底部安全区
  toBottom: { position: 'absolute', right: space.s4, bottom: space.s6, width: 34, height: 34, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
