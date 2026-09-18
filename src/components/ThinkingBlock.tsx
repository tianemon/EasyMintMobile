import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme/tokens';

type ThinkingBlockProps = {
  content: string;
  /** 是否仍在流式思考（决定默认展开与标题文案） */
  active: boolean;
};

/** 思考过程块：流式时自动展开跟随输出，模型进入正文后自动折叠（用户手动操作过则不再自动改） */
export function ThinkingBlock({ content, active }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const userControlled = useRef(false);
  const previousActive = useRef(false);

  // 与桌面端一致：流式思考时展开以便跟随输出；模型进入正文、工具调用或本轮结束时，
  // 如果用户没有手动展开/收起过，就把它折叠回去。
  useEffect(() => {
    if (active) {
      userControlled.current = false;
      setExpanded(true);
    }
  }, [active]);
  useEffect(() => {
    if (!active && previousActive.current && !userControlled.current) setExpanded(false);
    previousActive.current = active;
  }, [active]);

  return (
    <View style={styles.thinkingCard}>
      <Pressable style={styles.thinkingHeader} onPress={() => {
        userControlled.current = true;
        setExpanded((current) => !current);
      }}>
        <Text style={styles.thinkingLabel}>{active ? '正在思考' : '思考过程'}</Text>
        <Text style={styles.thinkingToggle}>{expanded ? '收起⌃' : '展开⌄'}</Text>
      </Pressable>
      {expanded && <Text selectable style={styles.thinkingText}>{content}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  thinkingCard: { minWidth: 190, backgroundColor: colors.thinkingBody, borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.s2 },
  thinkingHeader: { minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thinkingLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  thinkingToggle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  thinkingText: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 11, color: colors.textSecondary, fontSize: fontSize.detail, lineHeight: 19 },
});
