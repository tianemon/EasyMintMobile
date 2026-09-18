import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../../theme/tokens';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 复制反馈保持时长：与桌面端 CodeBlock 的 2s 一致 */
const COPIED_RESET_MS = 2000;

/**
 * 围栏代码块：标题栏（左「语言标识」/ 右「复制」）+ 可横向滚动的代码区。
 *
 * memo 是流式性能的一环：代码块一旦闭合内容就不变，内容相同的重渲染直接跳过
 * （父组件每帧重建元素，靠浅比较挡掉 marked 重解析与 native 视图重建）。
 * 语言标识由调用方传入已映射的显示名（见 parse.ts 的 languageLabel，未知回落 TEXT）。
 */
export const CodeBlock = memo(function CodeBlock({ language, code, last }: { language: string; code: string; last?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清掉复位定时器：消息列表会回收单元格，留着定时器会对已卸载组件 setState
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(() => {
    // RN 核心的 Clipboard 已标记弃用（官方建议装 @react-native-clipboard/clipboard / expo-clipboard），
    // 但本仓库约定本轮只新增 marked 一个依赖，故先用核心模块；后续换官方包时只需改这一处。
    Clipboard.setString(code);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, [code]);

  return <View style={[styles.block, last && styles.blockLast]}>
    <View style={styles.header}>
      <Text style={styles.language}>{language}</Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={copy}>
        <Text style={styles.copy}>{copied ? '已复制' : '复制'}</Text>
      </Pressable>
    </View>
    {/* 横向滚动：ScrollView 宽度被气泡约束（气泡 maxWidth 兜底），内容再长也只在块内滚，不撑破气泡 */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Text selectable style={styles.code}>{code}</Text>
    </ScrollView>
  </View>;
});

const styles = StyleSheet.create({
  block: {
    marginVertical: space.s2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.codeBlockBg,
    overflow: 'hidden',
  },
  /** 整条消息以代码块结尾时去掉下边距（与桌面端最后子元素不收尾边距同口径） */
  blockLast: { marginBottom: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s3,
    paddingVertical: space.s1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.codeBlockHeader,
  },
  language: { color: colors.textMuted, fontSize: fontSize.caption, letterSpacing: 0.5 },
  copy: { color: colors.textSecondary, fontSize: fontSize.caption },
  // alignSelf: stretch 显式声明横向拉满父宽度（列容器默认行为）——代码再长也不靠自身内容宽把气泡撑宽，只在自己块内滚。
  // flexGrow: 0 / flexShrink: 0：RN 的 ScrollView 默认 flexGrow: 1（baseHorizontal），
  // 嵌在行/气泡里会被当成弹性项伸展成空白容器，这里必须显式管住（同 ThinkingBlock）。
  scroll: { flexGrow: 0, flexShrink: 0, alignSelf: 'stretch', backgroundColor: colors.codeBlockBg },
  scrollContent: { paddingHorizontal: space.s3, paddingVertical: space.s2 },
  code: { color: colors.textPrimary, fontFamily: monoFont, fontSize: fontSize.code, lineHeight: 17 },
});
