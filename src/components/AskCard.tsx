import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PendingAsk } from '../protocol/types';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { AskAnswer } from '../types';
import { ChevronIcon, Icon, iconSize } from './icons';

type AskCardProps = {
  ask: PendingAsk;
  /** 提交已答题目；null = 全部跳过（取消提问，主进程按用户取消处理） */
  onSubmit: (answers: AskAnswer[] | null) => void;
};

/**
 * Mint 结构化提问卡（聊天区内嵌）——与桌面端 `AskUserCard` 同构：
 *  - **一次只显示一个问题**：单选点选项即记录并自动进入下一题；多选（multi_select）勾选不跳题，
 *    点「下一题 / 完成」显式前进；
 *  - 主按钮文案随位置变化：有草稿「发送」、非最后一题「下一题」、最后一题「完成」；
 *  - 左上角 ‹ n/N › 前后切换，右上角 ✕ 全部跳过（取消提问）；
 *  - 级联：`depends_on` 前置答案匹配才进入可见序列。
 *
 * 状态全在本组件内（与 PC 一致）：答案不往会话运行态里写，避免流式帧把输入带偏。
 */
export const AskCard = memo(function AskCard({ ask, onSubmit }: AskCardProps) {
  const { colors, shadow } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [index, setIndex] = useState(0);
  /** 每题答案：选项 value 数组（单选存单元素；跳过的题不在其中） */
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  /** 每题自定义输入草稿（切题保留） */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 可见问题序列：depends_on 前置答案匹配才显示
  const order = useMemo(() => ask.questions.filter((q) => !q.depends_on
    || Object.entries(q.depends_on).every(([parentId, parentValue]) => (answers[parentId] ?? []).includes(parentValue))),
  [ask.questions, answers]);

  // 前置选择变化导致当前题不可见 → 落在最后一个可见题
  useEffect(() => {
    if (index >= order.length) setIndex(Math.max(0, order.length - 1));
  }, [index, order.length]);

  const question = order[index];
  const total = order.length;
  const isLast = index === total - 1;
  const multi = question?.multi_select === true;
  const draft = question ? (drafts[question.id] ?? '') : '';
  const draftNonEmpty = draft.trim().length > 0;
  const selected = question ? (answers[question.id] ?? []) : [];

  /** 提交：按题序收集已答（跳过的题不在 answers 中），无任何作答 = 空数组（主进程按取消处理） */
  const submit = useCallback((finalAnswers: Record<string, string[]>) => {
    setSubmitting(true);
    onSubmit(ask.questions.flatMap((item) => {
      const values = finalAnswers[item.id];
      return values && values.length ? [{ questionId: item.id, values }] : [];
    }));
  }, [ask.questions, onSubmit]);

  const advance = useCallback((): void => {
    if (!question || submitting) return;
    if (isLast) submit(answers);
    else setIndex((current) => current + 1);
  }, [answers, isLast, question, submit, submitting]);

  /** 单选：记录并自动进入下一题（最后一题选完即提交）；清掉该题草稿避免重复并入 */
  const pick = (value: string): void => {
    if (!question || submitting) return;
    const next = { ...answers, [question.id]: [value] };
    setAnswers(next);
    setDrafts((prev) => {
      if (!(question.id in prev)) return prev;
      const clean = { ...prev };
      delete clean[question.id];
      return clean;
    });
    if (isLast) submit(next);
    else setIndex((current) => current + 1);
  };

  /** 多选：勾选/取消切换，不跳题 */
  const toggle = (value: string): void => {
    if (!question || submitting) return;
    const current = answers[question.id] ?? [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setAnswers({ ...answers, [question.id]: next });
  };

  /** 带草稿前进：草稿并入该题答案（与已勾选项并列），然后前进/提交 */
  const proceedWithDraft = (): void => {
    if (!question || submitting || !draftNonEmpty) return;
    const text = draft.trim();
    const current = answers[question.id] ?? [];
    const next = { ...answers, [question.id]: current.includes(text) ? current : [...current, text] };
    setAnswers(next);
    setDrafts((prev) => {
      const clean = { ...prev };
      delete clean[question.id];
      return clean;
    });
    if (isLast) submit(next);
    else setIndex((current) => current + 1);
  };

  /** ✕ 全部跳过 = 取消提问（null 语义） */
  const skipAll = (): void => {
    if (submitting) return;
    setSubmitting(true);
    onSubmit(null);
  };

  if (!question) return null;
  const mainLabel = draftNonEmpty ? '发送' : isLast ? '完成' : '下一题';

  return <View style={[styles.card, shadow.md]}>
    {/* 左上角前后切换 ‹ n/N ›，右上角全部跳过 ✕ */}
    <View style={styles.navRow}>
      <Pressable accessibilityLabel="上一题" disabled={index === 0} onPress={() => setIndex(Math.max(0, index - 1))}
        style={[styles.navButton, index === 0 && styles.navDisabled]}>
        <ChevronIcon size={iconSize.card} direction="left" color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.navCount}>{index + 1}/{total}</Text>
      <Pressable accessibilityLabel={isLast ? '已到最后一题' : '跳过此题'} disabled={isLast} onPress={advance}
        style={[styles.navButton, isLast && styles.navDisabled]}>
        <ChevronIcon size={iconSize.card} direction="right" color={colors.textSecondary} />
      </Pressable>
      <Pressable accessibilityLabel="全部跳过（取消提问）" onPress={skipAll} style={[styles.navButton, styles.skipButton]}>
        <Icon name="cross" size={iconSize.card} color={colors.textSecondary} />
      </Pressable>
    </View>

    <Text style={styles.question}>{question.question}{multi && !question.question.includes('多选') ? '（可多选）' : ''}</Text>

    {!!question.options?.length && <View style={styles.options}>
      {question.options.map((option) => {
        const active = selected.includes(option.value);
        return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }}
          style={[styles.option, active && styles.optionActive]}
          onPress={() => (multi ? toggle(option.value) : pick(option.value))}>
          {multi && <View style={[styles.checkbox, active && styles.checkboxActive]}>
            <Icon name="check" size={iconSize.status} color={active ? colors.textInverse : 'transparent'} />
          </View>}
          <Text style={styles.optionText}>
            {option.label}{option.description ? `（${option.description}）` : ''}
          </Text>
          {option.recommended && <Text style={[styles.recommended, active && styles.recommendedActive]}>推荐</Text>}
        </Pressable>;
      })}
    </View>}

    {ask.allowCustom && <View style={styles.customRow}>
      <TextInput style={styles.customInput} value={draft} multiline
        placeholder="输入你的答案…" placeholderTextColor={colors.textMuted}
        onChangeText={(value) => setDrafts((prev) => ({ ...prev, [question.id]: value }))} />
      <Pressable accessibilityLabel={mainLabel} onPress={draftNonEmpty ? proceedWithDraft : advance}
        style={[styles.mainButton, draftNonEmpty && styles.mainButtonActive]}>
        <Text style={[styles.mainButtonText, draftNonEmpty && styles.mainButtonTextActive]}>{mainLabel}</Text>
      </Pressable>
    </View>}

    {!ask.allowCustom && <View style={styles.actionsRow}>
      <Pressable accessibilityLabel={mainLabel} onPress={advance} style={styles.mainButton}>
        <Text style={styles.mainButtonText}>{mainLabel}</Text>
      </Pressable>
    </View>}
  </View>;
});

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // PC 用毛玻璃（backdrop-blur）；RN 没有等价物，用卡片面 + 描边 + 阴影近似（层次靠色差，同设计语言）
  card: { marginHorizontal: 10, marginBottom: 6, paddingHorizontal: space.s3, paddingBottom: space.s3, backgroundColor: colors.elevated, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 6 },
  navButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  navDisabled: { opacity: 0.3 },
  skipButton: { marginLeft: 'auto' },
  navCount: { color: colors.textMuted, fontSize: fontSize.xxs, fontWeight: '600', paddingHorizontal: 2 },
  question: { paddingTop: 6, color: colors.textPrimary, fontSize: fontSize.caption, fontWeight: '600', lineHeight: 18 },
  options: { paddingTop: space.s2, gap: 2 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s3, paddingVertical: 7, borderRadius: radius.lg },
  optionActive: { backgroundColor: colors.successSoft },
  checkbox: { width: 14, height: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionText: { flexGrow: 1, flexShrink: 1, color: colors.textPrimary, fontSize: fontSize.caption, lineHeight: 18 },
  recommended: { flexShrink: 0, paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.lg, backgroundColor: colors.successSoft, color: colors.accent, fontSize: fontSize.xxs, fontWeight: '600' },
  recommendedActive: { backgroundColor: colors.accent, color: colors.textInverse },
  customRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s2, paddingTop: 6 },
  customInput: { flexGrow: 1, flexShrink: 1, minHeight: 34, maxHeight: 110, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.lg, backgroundColor: colors.inputField, color: colors.textPrimary, fontSize: fontSize.caption, lineHeight: 17, textAlignVertical: 'top' },
  mainButton: { flexShrink: 0, paddingHorizontal: space.s3, paddingVertical: 8, borderRadius: radius.lg },
  mainButtonActive: { backgroundColor: colors.accent },
  mainButtonText: { color: colors.textSecondary, fontSize: fontSize.xxs, fontWeight: '600' },
  mainButtonTextActive: { color: colors.textInverse },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 6 },
});
