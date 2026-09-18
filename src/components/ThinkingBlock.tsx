import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { colors, fontSize, radius } from '../theme/tokens';
import { ChevronIcon, Icon, SpinIcon, iconSize } from './icons';
import { fadeOpacity, splitFadeTail } from './markdown/parse';

/**
 * 思考块 —— 对齐桌面端 ChatBlocks 的 ThinkingBlockView（PC 是 DOM+CSS，这里是 RN 组件）。
 *
 * 融入气泡式（非独立卡片）：无外框、无底色标题栏；标题行整行可点切换展开。
 *
 * 外层是 inverted 列表；内层滚动到边界时不能把剩余位移交给镜像父级。触摸开始后通过
 * onInnerScrollGesture 锁住外层列表，同时关闭本 ScrollView 的 nested dispatch；触摸结束恢复。
 * 这使思考框保留独立滚动，又不会带动或反向滚动消息列表。
 */
/** 等宽字体：PC 的 --font-mono 在手机上的等价物（RN 不支持字体栈回退，按平台取一个） */
const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 展开区内边距（PC 的 px-3 py-1.5） */
const BODY_PADDING_X = 12;
const BODY_PADDING_Y = 6;
/** 展开区上下外边距（PC 的 mt-[5px] / mb-[3px]） */
const BODY_MARGIN_TOP = 5;
const BODY_MARGIN_BOTTOM = 3;
/** PC 的 leading-[1.625]（13px 字号 → 21.125px 行高） */
const BODY_LINE_HEIGHT = 1.625;
/** 展开区高度上限：对齐 PC 的 calc(var(--text-detail) * 9.75 + 12px)＝6 行 13px 文字 + 上下 6px 内边距 */
const BODY_MAX_HEIGHT = fontSize.detail * 9.75 + BODY_PADDING_Y * 2;
/** 距底部多少像素内算「在底部」（决定要不要继续跟随末尾） */
const AT_BOTTOM_PX = 24;

/**
 * 流式期间交给 <Text> 的窗口大小（字符）。
 *
 * 思考全文可达数万字，而 PC 下发的每帧都是**累计快照**（PC 注释：不做增量逻辑），
 * 也就是每帧都要重渲染整段——Android 的文本布局对几万字的排字是几十毫秒级，
 * 追不上帧率就表现为「内容卡住不动、手动滚也看不到新内容，直到思考结束才一次性追上」。
 * 展开区本来只显示 6 行，所以流式时只渲染尾部窗口：排版量降一个量级，视觉完全一致。
 * 停止流式后恢复渲染全文（可自由回滚查看）。
 */
const STREAM_WINDOW_CHARS = 1500;

/** 取尾部窗口，并尽量从一个整行开始（避免开头出现半行） */
function streamWindow(text: string): string {
  if (text.length <= STREAM_WINDOW_CHARS) return text;
  const cut = text.slice(text.length - STREAM_WINDOW_CHARS);
  const newline = cut.indexOf('\n');
  return newline >= 0 ? cut.slice(newline + 1) : cut;
}

/** 流式尾部渐隐：末尾 4 个 grapheme 逐个降不透明度（PC 对应 .stream-tail-fade） */
function tailFadeNodes(text: string): ReactNode {
  const { head, tail, trailing } = splitFadeTail(text);
  if (!tail.length) return text;
  return [
    head,
    ...tail.map((unit, index) => <Text key={index} style={{ opacity: fadeOpacity(index, tail.length) }}>{unit}</Text>),
    trailing,
  ];
}

type ThinkingBlockProps = {
  content: string;
  /** 流式中且本块是消息尾块（思考正在增长）：自动展开 + 尾部渐隐 */
  active: boolean;
  /** 内层触摸期间锁住外层 inverted 列表，阻止边界位移跨坐标系传递 */
  onInnerScrollGesture: (active: boolean) => void;
};

/** 思考过程块：streaming 时自动展开跟随输出，模型进入正文后自动折叠（用户手动操作过则不再自动改） */
export function ThinkingBlock({ content, active, onInnerScrollGesture }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const userControlled = useRef(false);
  const previousActive = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  /** 是否跟随末尾：手指一碰就让出控制权（否则流式期间每帧的 scrollToEnd 会把手指位移顶回去） */
  const followTail = useRef(true);

  const beginGesture = useCallback((): void => {
    followTail.current = false;
    onInnerScrollGesture(true);
  }, [onInnerScrollGesture]);
  const endGesture = useCallback((): void => onInnerScrollGesture(false), [onInnerScrollGesture]);

  // 会话切换、自动折叠或虚拟化卸载发生在手势中时，确保父列表不会保持锁定。
  useEffect(() => () => onInnerScrollGesture(false), [onInnerScrollGesture]);

  const onBodyScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    followTail.current = contentSize.height - contentOffset.y - layoutMeasurement.height < AT_BOTTOM_PX;
  }, []);

  const onBodyContentSizeChange = useCallback((): void => {
    if (followTail.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  // 流式思考时自动展开跟随输出，并标记非用户手动（供结束自动收起判定）
  useEffect(() => {
    if (active) {
      userControlled.current = false;
      followTail.current = true; // 新一轮思考：重新跟随末尾
      setExpanded(true);
    }
  }, [active]);

  // 思考结束（不再是流式尾块）：用户没手动干预过才自动收起
  useEffect(() => {
    if (!active && previousActive.current && !userControlled.current) setExpanded(false);
    previousActive.current = active;
  }, [active]);

  return (
    // 融入气泡式（非独立卡片）：无外框、无底色标题栏（PC 的 mt-1.5 mb-1）
    <View style={styles.block}>
      <Pressable onPress={() => { userControlled.current = true; if (expanded) endGesture(); setExpanded((v) => !v); }} style={styles.header}>
        <Icon name="brain" size={iconSize.tool} color={colors.toolTitle} />
        <Text style={styles.label}>思考</Text>
        {active && <SpinIcon size={iconSize.card} color={colors.accent} />}
        {/* 折叠箭头在文字右侧：展开时旋转 90° 常显；折叠态 PC 是 hover 才出现，
            手机无 hover → 常显，用更弱的颜色区分 */}
        <ChevronIcon size={iconSize.status} direction={expanded ? 'down' : 'right'}
          color={expanded ? colors.toolTitle : colors.textMuted} />
      </Pressable>
      {/* 展开区：圆角色块、thinkingBody 底色、上限 6 行框内滚动。 */}
      {expanded && (
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          // 父列表在本手势内已关闭；这里也禁用 nested dispatch，边界剩余位移不会上交。
          nestedScrollEnabled={false}
          scrollEventThrottle={100}
          onTouchStart={beginGesture}
          onTouchEnd={endGesture}
          // Android 的原生 ScrollView 开始拖动后不保证把 onTouchEnd 回传给 JS；
          // onScrollEndDrag 才是手指离开滚动区的可靠结束信号，必须在这里恢复父列表。
          onScrollEndDrag={endGesture}
          onMomentumScrollEnd={endGesture}
          onResponderRelease={endGesture}
          onResponderTerminate={endGesture}
          onScroll={onBodyScroll}
          onContentSizeChange={onBodyContentSizeChange}
        >
          <Text selectable style={styles.text}>{active ? tailFadeNodes(streamWindow(content)) : content}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 6, marginBottom: 4 },
  // 标题行 inline、gap 6、上下 2px，无底色无边框（PC 的 button）
  header: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 2 },
  // 标签恒为「思考」：12px、600、toolTitle、uppercase + letter-spacing wider（0.05em）
  label: { color: colors.toolTitle, fontSize: fontSize.caption, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  // 展开区：圆角色块、thinkingBody 底色、上下外边距 5/3、上限 6 行框内滚动。
  // flexGrow/flexShrink 必须显式钳死：否则会被 Yoga 当弹性项撑成畸形高度（早期空白块的根因）。
  body: { flexGrow: 0, flexShrink: 0, marginTop: BODY_MARGIN_TOP, marginBottom: BODY_MARGIN_BOTTOM, maxHeight: BODY_MAX_HEIGHT, backgroundColor: colors.thinkingBody, borderRadius: radius.lg },
  // 保留原始换行（等价 PC 的 whitespace-pre-wrap），等宽字体、行高 1.625
  text: {
    paddingHorizontal: BODY_PADDING_X,
    paddingVertical: BODY_PADDING_Y,
    color: colors.textSecondary,
    fontFamily: monoFont,
    fontSize: fontSize.detail,
    lineHeight: fontSize.detail * BODY_LINE_HEIGHT,
  },
});
