import { Platform, KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { AskCard } from '../components/AskCard';
import { BackgroundPills } from '../components/BackgroundPills';
import { Composer } from '../components/Composer';
import type { ComposerProps } from '../components/Composer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Header } from '../components/Header';
import { ModelGlyph } from '../components/icons';
import { MessageList } from '../components/MessageList';
import { ConnectionIndicator } from '../components/ProjectTitle';
import type { BackgroundAgent, BackgroundShell, PendingAsk } from '../protocol/types';
import type { DisplayMessage } from '../session/messages';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, space } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { AskAnswer, ConnectionStatus } from '../types';

type ChatScreenProps = {
  title: string;
  connection: ConnectionStatus;
  /** 消息流，最新在前（与 MessageList 的 inverted 顺序一致） */
  messages: DisplayMessage[];
  pendingAsk: PendingAsk | null;
  onAnswerSubmit: (answers: AskAnswer[] | null) => void;
  backgroundShells: BackgroundShell[];
  backgroundAgents: BackgroundAgent[];
  running: boolean;
  mintStatus: string;
  composer: ComposerProps;
  /** 点后台命令 → 打开输出查看页（PC ShellBar 同款） */
  onOpenShellOutput: (shell: BackgroundShell) => void;
  /** 停止单个后台命令 */
  onStopShell: (shellId: string) => void;
  /** 停止单个子 Agent */
  onStopAgent: (delegationId: string, taskIndex: number) => void;
  onBack: () => void;
};

/** 聊天页：标题栏 + 消息流 + 提问卡 + 后台任务 + 状态行 + 输入卡 */
export function ChatScreen(props: ChatScreenProps) {
  const commonStyles = useThemedStyles(makeCommonStyles);
  return <KeyboardAvoidingView style={commonStyles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
    <Header title={props.title} onBack={props.onBack} right={<ConnectionIndicator status={props.connection} />} />
    {/* 消息区渲染异常时保留错误提示，避免整页空白 */}
    <ErrorBoundary label="消息区渲染出错"><MessageList messages={props.messages} /></ErrorBoundary>
    {!!props.pendingAsk && <AskCard ask={props.pendingAsk} onSubmit={props.onAnswerSubmit} />}
    <BackgroundPills shells={props.backgroundShells} agents={props.backgroundAgents}
      onOpenShellOutput={props.onOpenShellOutput} onStopShell={props.onStopShell} onStopAgent={props.onStopAgent} />
    {props.running && !!props.mintStatus && <MintStatus text={props.mintStatus} />}
    <Composer {...props.composer} />
  </KeyboardAvoidingView>;
}

/** 运行状态行：模型图标（带动画）+ 当前动作文案，与 PC StatusBar 同构 */
function MintStatus({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // 图标占固定宽度（PC 是 w-[1.25em]）：动效不能把右侧文字推来推去
  return <View style={styles.mintStatus}>
    <View style={styles.mintStatusGlyph}><ModelGlyph animated size={14} color={colors.textSecondary} /></View>
    <Text style={styles.mintStatusText}>{text}</Text>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  mintStatus: { minHeight: 26, marginHorizontal: space.s4, paddingHorizontal: space.s1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  mintStatusGlyph: { width: 16, alignItems: 'center', justifyContent: 'center' },
  mintStatusText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '500' },
});
