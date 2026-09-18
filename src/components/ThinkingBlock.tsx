import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { colors, fontSize, radius } from '../theme/tokens';
import { ChevronIcon, Icon, SpinIcon, iconSize } from './icons';
import { fadeOpacity, splitFadeTail } from './markdown/parse';

/**
 * 思考块 —— 逐项对齐桌面端 ChatBlocks 的 ThinkingBlockView（PC 是 DOM+CSS，这里是 RN 组件）。
 *
 * 融入气泡式（非独立卡片）：无外框、无底色标题栏；标题行整行可点切换展开，展开区是一个
 * 圆角色块，**高度封顶 6 行、超出在框内滚动**（PC 的 maxHeight + overflow-y-auto）。
 *
 * 高度封顶不只是外观：未封顶时思考文本每帧都在变长，每帧的布局与挂载成本随长度增长，
 * 最终把 JS/UI 线程占满、连帧合并的 flush 都排不上（详见 session/stream-frames.ts 的调度说明）。
 */

/** 等宽字体：PC 的 --font-mono 在手机上的等价物（RN 不支持字体栈回退，按平台取一个） */
const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 展开区内边距（PC 的 px-3 py-1.5） */
const BODY_PADDING_X = 12;
const BODY_PADDING_Y = 6;
/** 展开区上下外边距（PC 的 mt-[5px] / mb-[3px]）——留在裁剪容器内，折叠收起时才不占高度 */
const BODY_MARGIN_TOP = 5;
const BODY_MARGIN_BOTTOM = 3;
/** PC 的 leading-[1.625]（13px 字号 → 21.125px 行高） */
const BODY_LINE_HEIGHT = 1.625;
/** 展开区高度上限：对齐 PC 的 calc(var(--text-detail) * 9.75 + 12px)＝6 行 13px 文字 + 上下 6px 内边距 */
const BODY_MAX_HEIGHT = fontSize.detail * 9.75 + BODY_PADDING_Y * 2;

/** 折叠/展开动画时长（PC 的 duration-200 + ease-out）；收起后延后一点卸载内容，等动画播完 */
const FOLD_DURATION = 200;
const FOLD_EASING = Easing.bezier(0, 0, 0.2, 1);
const UNMOUNT_DELAY = 230;
/** 等内容实测高度的上限：正常下一帧就到，超过就用封顶值播——宁可高度不精确，也不能停在 0 高度看不见内容 */
const MEASURE_TIMEOUT_MS = 100;

/**
 * 贴底跟随判定（口径同 PC 的 chat-utils followDecision）：只有用户输入后 500ms 内的
 * 滚动变化才算滚动意图，程序性贴底不参与判定——否则自己的滚动会把跟随锁死。
 */
const USER_INPUT_WINDOW_MS = 500;
const AT_BOTTOM_PX = 8;

/**
 * 裁剪容器高度：内容实测高度封顶后，再补上展开区上下外边距（外层裁剪容器要连同外边距一起容纳，
 * 折叠收起时才真正回到 0 高度）。
 */
function clipHeight(contentHeight: number): number {
  return Math.min(contentHeight, BODY_MAX_HEIGHT) + BODY_MARGIN_TOP + BODY_MARGIN_BOTTOM;
}

/** 流式尾部渐隐：末尾 4 个 grapheme 逐个降不透明度（PC 对应 .stream-tail-fade，切分口径复用任务 11 的工具） */
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
};

/** 思考过程块：streaming 时自动展开跟随输出，模型进入正文后自动折叠（用户手动操作过则不再自动改） */
export function ThinkingBlock({ content, active }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  // 展开区内容是否渲染：收起动画播完才卸载——折叠时思考内容不参与气泡宽度计算
  // （思考里不可断行的长行/URL 仍会把气泡撑到展开宽度）
  const [bodyMounted, setBodyMounted] = useState(false);
  const userControlled = useRef(false);
  const previousActive = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // 自动贴底跟随：用户滚离底部即暂停，滚回底部恢复
  const autoScroll = useRef(true);
  // 最近一次用户触摸滚动区的时间（只有用户碰过，滚动变化才可能是滚动意图）
  const lastUserInput = useRef(0);
  // 裁剪容器高度动画（PC 的 grid-rows 0fr↔1fr：RN 无 grid，等价成容器高度 0↔内容高度）
  const bodyHeight = useRef(new Animated.Value(0)).current;
  // 内容实测高度（含内边距）：Text 的布局不受外层裁剪影响，因此恒等于未裁剪的完整高度
  const contentHeight = useRef(0);
  // 展开时先挂载内容、等实测高度到手再启动动画（不等就拿封顶值当目标，短内容会提前播完）
  const pendingExpand = useRef(false);
  const animating = useRef(false);
  const animSeq = useRef(0);

  // 写完的裁剪高度（内容超过封顶后高度恒定，不必每帧再提交一次样式）
  const appliedClip = useRef(0);
  const setClip = useCallback((height: number): void => {
    const next = clipHeight(height);
    if (next === appliedClip.current) return;
    appliedClip.current = next;
    bodyHeight.setValue(next);
  }, [bodyHeight]);

  const animateBody = useCallback((open: boolean): void => {
    const seq = ++animSeq.current;
    animating.current = true;
    const measured = contentHeight.current || BODY_MAX_HEIGHT;
    Animated.timing(bodyHeight, {
      toValue: open ? clipHeight(measured) : 0,
      duration: FOLD_DURATION,
      easing: FOLD_EASING,
      useNativeDriver: false, // 高度是布局属性，只能走 JS driver
    }).start(() => {
      if (animSeq.current !== seq) return; // 已被后启动的动画接管（展开/收起连续切换）
      animating.current = false;
      // 动画期间内容可能已增长：落定到实测高度，避免停在旧高度把新内容裁掉
      if (open) setClip(contentHeight.current || measured);
    });
  }, [bodyHeight, setClip]);

  // 展开/收起的挂载与动画：展开先挂载内容再播；收起播完（UNMOUNT_DELAY）再卸载
  useEffect(() => {
    if (expanded) {
      // 高度已实测（收起动画未完又展开、内容还没卸载）→ 不必等 onLayout
      if (contentHeight.current > 0) { animateBody(true); return; }
      setBodyMounted(true);
      pendingExpand.current = true;
      const fallback = setTimeout(() => {
        if (!pendingExpand.current) return;
        pendingExpand.current = false;
        animateBody(true);
      }, MEASURE_TIMEOUT_MS);
      return () => clearTimeout(fallback);
    }
    pendingExpand.current = false;
    // 内容从未挂载过（首帧）或已卸载：没有可收的内容，不播收起动画
    if (contentHeight.current > 0) animateBody(false);
    const timer = setTimeout(() => {
      contentHeight.current = 0;
      setBodyMounted(false);
    }, UNMOUNT_DELAY);
    return () => clearTimeout(timer);
  }, [expanded, animateBody]);

  // 与桌面端一致：流式思考时自动展开跟随输出，并标记非用户手动（供结束自动收起判定）
  useEffect(() => {
    if (active) {
      userControlled.current = false;
      autoScroll.current = true; // 自动展开：贴底跟随最新
      setExpanded(true);
    }
  }, [active]);

  // 思考结束（不再是流式尾块）：用户没手动干预过才自动收起
  useEffect(() => {
    if (!active && previousActive.current && !userControlled.current) setExpanded(false);
    previousActive.current = active;
  }, [active]);

  const markUserInput = (): void => { lastUserInput.current = Date.now(); };

  const onScrollContent = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    // 用户输入后 500ms 之外的变化（程序性贴底、内容变高引起的滚动、夹紧）一律不参与判定
    if (Date.now() - lastUserInput.current > USER_INPUT_WINDOW_MS) return;
    autoScroll.current = distFromBottom < AT_BOTTOM_PX;
  };

  const onContentLayout = (event: LayoutChangeEvent): void => {
    const height = event.nativeEvent.layout.height;
    contentHeight.current = height;
    if (pendingExpand.current) {
      pendingExpand.current = false;
      animateBody(true); // 拿到实测高度再播，短内容才不会被按封顶值提前播完
      return;
    }
    // 已展开且动画已结束：内容增长时容器即时跟上（PC 的 1fr 行本来就是内容高度）
    if (expanded && !animating.current) setClip(height);
  };

  // 内容增长自动贴底；用户手动滚动后暂停跟随（distFromBottom 判定见 onScrollContent）
  const onContentSizeChange = (): void => {
    if (expanded && autoScroll.current) scrollRef.current?.scrollToEnd({ animated: false });
  };

  const toggle = (): void => {
    userControlled.current = true;
    if (expanded) { setExpanded(false); return; }
    autoScroll.current = false; // 手动展开：从顶部看历史，贴底无意义
    setExpanded(true);
  };

  return (
    // 融入气泡式（非独立卡片）：无外框、无底色标题栏（PC 的 mt-1.5 mb-1）
    <View style={styles.block}>
      {/* 整行可点：展开/收起 */}
      <Pressable onPress={toggle} style={styles.header}>
        {/* 大脑图标（与输入卡的思考等级图标同源）：13px、toolTitle 灰 */}
        <Icon name="brain" size={iconSize.tool} color={colors.toolTitle} />
        <Text style={styles.label}>思考</Text>
        {/* 思考中指示：流式尾块时转圈 */}
        {active && <SpinIcon size={iconSize.card} color={colors.accent} />}
        {/* 折叠箭头在文字右侧：展开时旋转 90° 常显；折叠态 PC 是 hover 才出现，
            手机无 hover → 常显，用更弱的颜色区分 */}
        <ChevronIcon size={iconSize.status} direction={expanded ? 'down' : 'right'}
          color={expanded ? colors.toolTitle : colors.textMuted} />
      </Pressable>
      {/* 展开动画：容器高度 0↔内容高度。折叠时内容不渲染（bodyMounted）——思考内容不参与气泡宽度计算 */}
      {bodyMounted && (
        <Animated.View style={[styles.bodyClip, { height: bodyHeight }]}>
          <ScrollView
            ref={scrollRef}
            style={styles.body}
            // Android 的嵌套滚动（内层可滚时先滚内层，滚到底再交给外层消息列表）
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScroll={onScrollContent}
            onTouchStart={markUserInput}
            onScrollBeginDrag={markUserInput}
            onContentSizeChange={onContentSizeChange}
          >
            {/* 原始换行保留（等价 PC 的 whitespace-pre-wrap），等宽字体、行高 1.625 */}
            <Text selectable style={styles.text} onLayout={onContentLayout}>
              {active ? tailFadeNodes(content) : content}
            </Text>
          </ScrollView>
        </Animated.View>
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
  // 裁剪容器：高度由动画驱动（0 ↔ 内容高度），收起时内容完全不占空间
  bodyClip: { overflow: 'hidden' },
  // 展开区：圆角色块（无外框、无左竖线）、thinkingBody 底色、上下外边距 5/3、限高 6 行内滚动
  body: { flex: 1, marginTop: BODY_MARGIN_TOP, marginBottom: BODY_MARGIN_BOTTOM, maxHeight: BODY_MAX_HEIGHT, backgroundColor: colors.thinkingBody, borderRadius: radius.lg },
  text: {
    paddingHorizontal: BODY_PADDING_X,
    paddingVertical: BODY_PADDING_Y,
    color: colors.textSecondary,
    fontFamily: monoFont,
    fontSize: fontSize.detail,
    lineHeight: fontSize.detail * BODY_LINE_HEIGHT,
  },
});
