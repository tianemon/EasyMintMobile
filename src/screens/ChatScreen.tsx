import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { AskCard } from '../components/AskCard';
import { BackgroundPills } from '../components/BackgroundPills';
import { Composer } from '../components/Composer';
import type { ComposerProps } from '../components/Composer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Header } from '../components/Header';
import { MessageList } from '../components/MessageList';
import { MintStatus } from '../components/MintStatus';
import { ConnectionIndicator } from '../components/ProjectTitle';
import type { BackgroundAgent, BackgroundShell, PendingAsk } from '../protocol/types';
import type { DisplayMessage } from '../session/messages';
import { makeCommonStyles } from '../theme/commonStyles';
import { useThemedStyles } from '../theme/theme-context';
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

/** 聊天页：标题栏 + 消息流（尾部含提问卡与状态行）+ 后台任务条 + 输入卡 */
export function ChatScreen(props: ChatScreenProps) {
  const commonStyles = useThemedStyles(makeCommonStyles);
  // 缓存尾部元素：MessageList 是 memo，tail 每次都是新元素会让它恒不命中（输入框打字也会穿透到列表）
  const tail = useMemo(() => <>
    {/* key=requestId：同一时刻可能有多条挂起请求排队，前一条答完后组件若被复用（无 key），
        后一条会继承前一条的本地 state（已置 true 的 submitting 让按钮永久点不动、编辑中的正文串到下一条）。
        桌面端 ChatPanel.tsx:3052 用同一个 key 防这件事 */}
    {!!props.pendingAsk && <AskCard key={props.pendingAsk.requestId} ask={props.pendingAsk} onSubmit={props.onAnswerSubmit} />}
    {props.running && !!props.mintStatus && <MintStatus text={props.mintStatus} icon={props.mintIcon} />}
  </>, [props.pendingAsk, props.onAnswerSubmit, props.running, props.mintStatus, props.mintIcon]);
  return <KeyboardAvoidingView style={commonStyles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
    <Header title={props.title} onBack={props.onBack} right={<ConnectionIndicator status={props.connection} />} />
    {/* 消息区渲染异常时保留错误提示，避免整页空白；提问卡与状态行交给列表尾部——
        桌面端同样把它们放在滚动区里（ChatPanel.tsx:3046-3057），跟着消息走，不固定在输入卡上方 */}
    <ErrorBoundary label="消息区渲染出错"><MessageList messages={props.messages} running={props.running}
      askId={props.pendingAsk?.requestId} tail={tail} /></ErrorBoundary>
    <BackgroundPills shells={props.backgroundShells} agents={props.backgroundAgents}
      onOpenShellOutput={props.onOpenShellOutput} onStopShell={props.onStopShell} onStopAgent={props.onStopAgent} />
    <Composer {...props.composer} />
  </KeyboardAvoidingView>;
}
