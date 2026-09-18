import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PendingAsk } from '../protocol/types';
import { commonStyles } from '../theme/commonStyles';
import { colors, radius, space } from '../theme/tokens';
import { Button } from './Button';

type AskCardProps = {
  ask: PendingAsk;
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
  onSubmit: () => void;
};

/** 模型提问卡（ask_user）：选项芯片 + 自定义输入 + 提交 */
export function AskCard({ ask, answers, onAnswerChange, onSubmit }: AskCardProps) {
  return <View style={styles.askCard}>
    {ask.questions.map((question) => <View key={question.id} style={styles.askQuestion}>
      <Text style={styles.askTitle}>{question.question}</Text>
      {!!question.options?.length && <View style={styles.chips}>{question.options.map((option) =>
        <Pressable key={option.value} style={[styles.chip, answers[question.id] === option.value && styles.chipSelected]}
          onPress={() => onAnswerChange(question.id, option.value)}><Text>{option.label}</Text></Pressable>)}</View>}
      {(ask.allowCustom || !question.options?.length) && <TextInput style={commonStyles.answerInput} placeholder="输入回答"
        value={question.options?.some((option) => option.value === answers[question.id]) ? '' : (answers[question.id] ?? '')}
        onChangeText={(value) => onAnswerChange(question.id, value)} />}
    </View>)}
    <Button label="提交回答" disabled={ask.questions.some((question) => !answers[question.id]?.trim())} onPress={onSubmit} />
  </View>;
}

const styles = StyleSheet.create({
  askCard: { marginHorizontal: 10, marginBottom: 6, padding: space.s3, backgroundColor: colors.askBg, borderRadius: radius.lg, gap: 10 },
  askQuestion: { gap: space.s2 },
  askTitle: { fontWeight: '700', color: colors.askText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.chipBg },
  chipSelected: { backgroundColor: colors.chipSelectedBg, borderWidth: 1, borderColor: colors.chipSelectedBorder },
});
