import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '../components/AmbientBackground';
import { AskCard } from '../components/AskCard';
import { BackgroundPills } from '../components/BackgroundPills';
import { Composer } from '../components/Composer';
import type { ComposerProps } from '../components/Composer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HEADER_HEIGHT, Header } from '../components/Header';
import { Glass } from '../components/Glass';
import { MessageList } from '../components/MessageList';
import { ConnectionIndicator } from '../components/ProjectTitle';
import type { BackgroundAgent, BackgroundShell, PendingAsk } from '../protocol/types';
import type { DisplayMessage } from '../session/messages';
import { makeCommonStyles } from '../theme/commonStyles';
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

/** 聊天页：标题栏 + 消息流（尾部含提问卡与状态行）+ 后台任务条 + 输入卡 */
export function ChatScreen(props: ChatScreenProps) {
  const commonStyles = useThemedStyles(makeCommonStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // 输入卡的玻璃要模糊「卡片背后的消息」，Android 必须显式给 BlurView 一个目标视图
  const blurTarget = useRef<View>(null);
  // 输入卡是浮在消息列表上方的：量出它的实际高度，给列表留出等量的底部内边距
  const [floatingHeight, setFloatingHeight] = useState(0);
  // 缓存尾部元素：MessageList 是 memo，tail 每次都是新元素会让它恒不命中（输入框打字也会穿透到列表）
  const tail = useMemo(() => (
    // key=requestId：同一时刻可能有多条挂起请求排队，前一条答完后组件若被复用（无 key），
    // 后一条会继承前一条的本地 state（已置 true 的 submitting 让按钮永久点不动、编辑中的正文串到下一条）。
    // 桌面端 ChatPanel.tsx:3052 用同一个 key 防这件事
    !!props.pendingAsk
      ? <AskCard key={props.pendingAsk.requestId} ask={props.pendingAsk} onSubmit={props.onAnswerSubmit} />
      : null
  ), [props.pendingAsk, props.onAnswerSubmit]);
  return <KeyboardAvoidingView style={commonStyles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
    {/* 消息区渲染异常时保留错误提示，避免整页空白；提问卡与状态行交给列表尾部——
        桌面端同样把它们放在滚动区里（ChatPanel.tsx:3046-3057），跟着消息走，不固定在输入卡上方 */}
    <View style={commonStyles.fill}>
      {/* 列表铺满整页（一直延伸到输入卡下面），玻璃才有内容可透过 */}
      <BlurTargetView ref={blurTarget} style={[StyleSheet.absoluteFill, styles.blurTarget]}>
        <AmbientBackground style={{ bottom: -insets.bottom }} />
        <ErrorBoundary label="消息区渲染出错"><MessageList messages={props.messages} running={props.running}
          askId={props.pendingAsk?.requestId} tail={tail} bottomInset={floatingHeight} topInset={HEADER_HEIGHT + insets.top}
          // 状态文案只在运行中给；具体渲不渲染由 MessageList 判断（有 live 过程时由回合行承担）
          statusText={props.running ? props.mintStatus : ''} statusIcon={props.mintIcon} /></ErrorBoundary>
        {/* 底部渐隐：只发生在**屏幕底端**那条窄带（输入卡下方的留白），
            让滚到边缘的消息融进底色而不是被屏幕切一刀。
            高度写死不跟输入卡高度联动——之前按「卡片高度 + 96」铺，等于在卡片上方又压了一条
            半透明色带：卡片本身是透明玻璃，背后被这条带子盖住，看起来就是「卡片是白色的」，
            而且色带是矩形，卡片圆角外侧会露出直角边。 */}
        <View pointerEvents="none" style={styles.fade}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="chat-bottom-fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.ambientBase} stopOpacity="0" />
                <Stop offset="30%" stopColor={colors.ambientBase} stopOpacity="0.05" />
                <Stop offset="100%" stopColor={colors.ambientBase} stopOpacity="0.95" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#chat-bottom-fade)" />
          </Svg>
        </View>
      </BlurTargetView>
      <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Glass blur blurTarget={blurTarget} radius={0} intensity={42} elevated={false} rim="none" style={commonStyles.fill} />
        </View>
        <Header title={props.title} onBack={props.onBack} right={<ConnectionIndicator status={props.connection} />} />
      </View>
      <View style={styles.floating} pointerEvents="box-none"
        onLayout={(event) => setFloatingHeight(event.nativeEvent.layout.height)}>
        <BackgroundPills shells={props.backgroundShells} agents={props.backgroundAgents}
          onOpenShellOutput={props.onOpenShellOutput} onStopShell={props.onStopShell} onStopAgent={props.onStopAgent} />
        <Composer {...props.composer} blurTarget={blurTarget} />
      </View>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  /**
   * 模糊目标要裁到自己的边界：里面那份环境底是**外扩**铺设的（为了对齐窗口坐标，
   * 上边探出标题栏、下边探出安全区），不裁的话它会盖到标题栏上。
   */
  blurTarget: { overflow: 'hidden' },
  // 浮层只按内容占位，空白处（卡片两侧）让触摸穿透到列表
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /**
   * 高度 = 输入卡下边距(26) + 6：只盖住屏幕最底下那条带。
   * 再多就会伸到卡片背后，透过透明玻璃看到一条矩形色带的边（就是「圆角外还有直角」的来源）。
   */
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },
});
