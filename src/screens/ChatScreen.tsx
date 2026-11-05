import { Platform, KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { AskCard } from '../components/AskCard';
import { BackgroundPills } from '../components/BackgroundPills';
import { Composer } from '../components/Composer';
import type { ComposerProps } from '../components/Composer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Header } from '../components/Header';
import { ModelGlyph, ToolIcon } from '../components/icons';
import { MessageList } from '../components/MessageList';
import { ConnectionIndicator } from '../components/ProjectTitle';
import type { BackgroundAgent, BackgroundShell, PendingAsk } from '../protocol/types';
import type { DisplayMessage } from '../session/messages';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { chatInset, fontSize, space } from '../theme/tokens';
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
  /** 状态行图标：工具进行中是该工具的图标，其余为空（用模型图标） */
  mintIcon: string;
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
    <ErrorBoundary label="消息区渲染出错"><MessageList messages={props.messages} running={props.running} /></ErrorBoundary>
    {!!props.pendingAsk && <AskCard ask={props.pendingAsk} onSubmit={props.onAnswerSubmit} />}
    <BackgroundPills shells={props.backgroundShells} agents={props.backgroundAgents}
      onOpenShellOutput={props.onOpenShellOutput} onStopShell={props.onStopShell} onStopAgent={props.onStopAgent} />
    {props.running && !!props.mintStatus && <MintStatus text={props.mintStatus} icon={props.mintIcon} />}
    <Composer {...props.composer} />
  </KeyboardAvoidingView>;
}

/**
 * 运行状态行：图标 + 当前动作文案，与桌面端 StatusBar 同构。
 *
 * 图标按状态切换（StatusBar.tsx:163-166）：有工具在跑就换成**该工具的图标**，
 * 否则用带动效的模型图标。图标占固定宽度（PC 是 w-[1.25em]），换图标不能把文字推来推去。
 */
function MintStatus({ text, icon }: { text: string; icon?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.mintStatus}>
    <View style={styles.mintStatusGlyph}>
      {icon
        ? <ToolIcon name={icon} size={14} color={colors.textSecondary} />
        : <ModelGlyph animated size={14} color={colors.textSecondary} />}
    </View>
    {/* 单行截断：命令类状态的文案是整条命令（「正在运行命令 npm run build && …」），
        不截断会换行成好几行、把底部整条状态行撑高，桌面端 .statusbar 同样是 truncate */}
    <Text numberOfLines={1} style={styles.mintStatusText}>{text}</Text>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 左右与消息列/输入卡/提问卡共用 chatInset（左边界一条线），内部不再叠 padding：
  // 桌面端 .statusbar 是 margin: 0 inset 再 padding: 0 s4，手机端没有 avatar 列，图标直接压在这条线上更整齐
  mintStatus: { minHeight: 26, marginHorizontal: chatInset, flexDirection: 'row', alignItems: 'center', gap: 7 },
  mintStatusGlyph: { width: 16, alignItems: 'center', justifyContent: 'center' },
  // flexShrink 必须给：Text 在 row 里默认按内容宽度，不给就没法截断（会被父容器裁掉而不是出省略号）
  mintStatusText: { flexShrink: 1, color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '500' },
});
