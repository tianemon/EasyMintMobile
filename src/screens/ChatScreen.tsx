import { Platform, KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { AskCard } from '../components/AskCard';
import { BackgroundPills } from '../components/BackgroundPills';
import { Composer } from '../components/Composer';
import type { ComposerProps } from '../components/Composer';
import { Header } from '../components/Header';
import { ComposerIcon } from '../components/icons';
import { MessageList } from '../components/MessageList';
import { ConnectionIndicator } from '../components/ProjectTitle';
import type { BackgroundAgent, BackgroundShell, PendingAsk } from '../protocol/types';
import type { DisplayMessage } from '../session/messages';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, space } from '../theme/tokens';
import type { ConnectionStatus } from '../types';

type ChatScreenProps = {
  title: string;
  connection: ConnectionStatus;
  messages: DisplayMessage[];
  pendingAsk: PendingAsk | null;
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
  onAnswerSubmit: () => void;
  backgroundShells: BackgroundShell[];
  backgroundAgents: BackgroundAgent[];
  running: boolean;
  mintStatus: string;
  composer: ComposerProps;
  onBack: () => void;
};

/** 聊天页：标题栏 + 消息流 + 提问卡 + 后台任务 + 状态行 + 输入卡 */
export function ChatScreen(props: ChatScreenProps) {
  return <KeyboardAvoidingView style={commonStyles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
    <Header title={props.title} onBack={props.onBack} right={<ConnectionIndicator status={props.connection} />} />
    <MessageList messages={props.messages} />
    {!!props.pendingAsk && <AskCard ask={props.pendingAsk} answers={props.answers} onAnswerChange={props.onAnswerChange} onSubmit={props.onAnswerSubmit} />}
    <BackgroundPills shells={props.backgroundShells} agents={props.backgroundAgents} />
    {props.running && !!props.mintStatus && <MintStatus text={props.mintStatus} />}
    <Composer {...props.composer} />
  </KeyboardAvoidingView>;
}

/** 运行状态行：模型图标 + 当前动作文案 */
function MintStatus({ text }: { text: string }) {
  return <View style={styles.mintStatus}><ComposerIcon kind="model" /><Text style={styles.mintStatusText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  mintStatus: { minHeight: 26, marginHorizontal: space.s4, paddingHorizontal: space.s1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  mintStatusText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '500' },
});
