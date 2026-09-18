import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LoadingView } from './src/components/LoadingView';
import type { ComposerProps } from './src/components/Composer';
import { parsePairingUri } from './src/connection/pairing-uri';
import { pairWithPc, RemoteClient } from './src/connection/remote-client';
import type {
  BackgroundAgent, BackgroundShell, ModelCapabilities, OpenProject, PcCredential, PendingAsk, PermissionMode,
  SessionListItem, SessionSnapshot,
} from './src/protocol/types';
import { ChatScreen } from './src/screens/ChatScreen';
import { ConnectionSettingsSheet } from './src/screens/ConnectionSettingsSheet';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SessionMenuModal } from './src/screens/SessionMenuModal';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { clearCredential, loadCredential, saveCredential } from './src/security/credential-store';
import { snapshotMessages } from './src/session/messages';
import type { DisplayMessage } from './src/session/messages';
import { MAX_TOTAL_ATTACHMENT_BYTES, pickAttachments } from './src/session/attachments';
import type { AttachmentKind, DraftAttachment } from './src/session/attachments';
import { THINKING_ORDER, resolveThinkingLevel } from './src/session/thinking';
import { useRemoteEvents } from './src/session/useRemoteEvents';
import type { RemoteEventsStore } from './src/session/useRemoteEvents';
import { useSessionActions } from './src/session/useSessionActions';
import type { SessionActionsStore } from './src/session/useSessionActions';
import { commonStyles } from './src/theme/commonStyles';
import type { ComposerControl, ConnectionStatus, ContextUsage, HomeSession, Page } from './src/types';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 220, fade: true });

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [credential, setCredential] = useState<PcCredential | null>(null);
  const [client, setClient] = useState<RemoteClient | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [bootReady, setBootReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [homeLoading, setHomeLoading] = useState(true);
  const [pairCode, setPairCode] = useState('');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<OpenProject[]>([]);
  const [homeSessions, setHomeSessions] = useState<HomeSession[]>([]);
  const [project, setProject] = useState<OpenProject | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [session, setSession] = useState<SessionListItem | null>(null);
  const [chatOrigin, setChatOrigin] = useState<'home' | 'sessions'>('home');
  // inverted 列表使用「最新在前」，插入/替换就地做，避免每帧 reverse 整个数组
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [running, setRunning] = useState(false);
  const [mintStatus, setMintStatus] = useState('');
  const [backgroundShells, setBackgroundShells] = useState<BackgroundShell[]>([]);
  const [backgroundAgents, setBackgroundAgents] = useState<BackgroundAgent[]>([]);
  const [permission, setPermission] = useState<PermissionMode>('standard');
  const [thinking, setThinking] = useState('medium');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState<string | undefined>();
  const [thinkingOptions, setThinkingOptions] = useState<string[]>([...THINKING_ORDER]);
  const [models, setModels] = useState<ModelCapabilities | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [composerControl, setComposerControl] = useState<ComposerControl>(null);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);
  const [askAnswers, setAskAnswers] = useState<Record<string, string>>({});
  const [renameTitle, setRenameTitle] = useState('');
  const [contextUsage, setContextUsage] = useState<ContextUsage>({ percent: null });
  const [menuSession, setMenuSession] = useState<SessionListItem | null>(null);

  // 状态文案去重：流式期间每帧都会写同一个值，逐帧 setState 会白跑一次整树渲染。
  // ref 与 state 同源——所有写入（含快照/会话命令）都走这个包装，不会出现 ref 与实际值脱节。
  const mintStatusRef = useRef('');
  const updateMintStatus = useCallback((value: string) => {
    if (mintStatusRef.current === value) return;
    mintStatusRef.current = value;
    setMintStatus(value);
  }, []);

  const fail = useCallback((value: unknown) => {
    const message = value instanceof Error ? value.message : String(value);
    setError(message);
    Alert.alert('EasyMint', message);
  }, []);

  useEffect(() => {
    void loadCredential().then((stored) => { setCredential(stored); setHomeLoading(!!stored); setBusy(false); })
      .catch((e) => { setHomeLoading(false); setBusy(false); fail(e); })
      .finally(() => setBootReady(true));
  }, [fail]);

  useEffect(() => {
    if (bootReady) void SplashScreen.hideAsync();
  }, [bootReady]);

  useEffect(() => {
    if (!credential) return;
    const next = new RemoteClient(credential);
    setClient(next);
    const off = next.onStatus(setConnection);
    void next.connect().catch(fail);
    return () => { off(); next.close(); };
  }, [credential, fail]);

  const refreshProjects = useCallback(async () => {
    if (!client) return;
    try {
      setBusy(true);
      setProjects(await client.command<OpenProject[]>('project.listOpen'));
      setPage('projects');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }, [client, fail]);

  const refreshSessions = useCallback(async (selected: OpenProject | null = project) => {
    if (!client || !selected) return;
    try {
      setBusy(true);
      setSessions(await client.command<SessionListItem[]>('session.list', { projectId: selected.id }));
      setProject(selected);
      setPage('sessions');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }, [client, fail, project]);

  const refreshHomeSessions = useCallback(async () => {
    if (!client) return;
    try {
      setHomeLoading(true);
      const openProjects = await client.command<OpenProject[]>('project.listOpen');
      const selected = openProjects.find((item) => item.id === project?.id) ?? openProjects[0] ?? null;
      setProjects(openProjects);
      setProject(selected);
      setSessions(selected ? await client.command<SessionListItem[]>('session.list', { projectId: selected.id }) : []);
      setHomeSessions([]);
      setPage('home');
    } catch (e) { fail(e); } finally { setHomeLoading(false); }
  }, [client, fail, project?.id]);

  useEffect(() => {
    if (connection === 'connected') void refreshHomeSessions();
  }, [connection, refreshHomeSessions]);

  const applySnapshot = useCallback((snapshot: SessionSnapshot) => {
    // snapshotMessages 已按列表顺序返回（最新在前）
    setMessages(snapshotMessages(snapshot));
    const isRunning = snapshot.status !== 'idle' && snapshot.status !== 'stopped';
    setRunning(isRunning);
    updateMintStatus(isRunning ? '正在处理…' : '');
    setPermission(snapshot.cache?.permissionMode ?? 'standard');
    // 会话真实生效等级优先于缓存：PC 同一会话也是以 session.thinkingLevel 为准（缓存只是上次的期望值，
    // 可能被模型能力裁剪），取不到再回落缓存、再回落 medium
    setThinking(snapshot.thinking?.level ?? snapshot.cache?.thinkingLevel ?? 'medium');
    const available = snapshot.thinking?.available;
    setThinkingOptions(available?.length ? THINKING_ORDER.filter((level) => available.includes(level)) : [...THINKING_ORDER]);
    setModel(snapshot.cache?.model ?? '');
    setProvider(snapshot.cache?.provider);
    setPendingAsk(snapshot.pendingAsks[0] ?? null);
    setRenameTitle(snapshot.session.title);
    setBackgroundShells(snapshot.background?.shells ?? []);
    setBackgroundAgents(snapshot.background?.agents ?? []);
  }, [updateMintStatus]);

  // 两个 store 对象只装 useState 的 setter 与 useCallback 包装（标识都稳定），收进 useMemo：
  // 避免每次 App 渲染新建对象 → 下层 hook 的 useCallback 跟着失效 → 输入卡 props 每帧换代。
  const sessionStore = useMemo<SessionActionsStore>(() => ({
    setPage, setProject, setBusy, setChatOrigin, setComposerControl, setSession, setSessions, setDraft, setAttachments,
    setMintStatus: updateMintStatus, setRunning, setMessages, setPermission, setThinking, setModel, setProvider, setModels,
    setBackgroundShells, setBackgroundAgents, setPendingAsk, setAskAnswers, setSettingsOpen, setMenuSession, setRenameTitle,
  }), [setAskAnswers, setBackgroundAgents, setBackgroundShells, setBusy, setChatOrigin, setComposerControl, setDraft,
    setAttachments, setMenuSession, setMessages, setModel, setModels, setPage, setPendingAsk, setPermission, setProject, setProvider,
    setRenameTitle, setRunning, setSession, setSessions, setSettingsOpen, setThinking, updateMintStatus]);

  const remoteStore = useMemo<RemoteEventsStore>(() => ({
    setMessages, setRunning, setMintStatus: updateMintStatus, setBackgroundShells, setBackgroundAgents, setContextUsage,
    setPendingAsk, setAskAnswers, setModel, setProvider, setThinking, setPermission, setThinkingOptions,
  }), [setAskAnswers, setBackgroundAgents, setBackgroundShells, setContextUsage, setMessages, setModel, setPendingAsk,
    setPermission, setProvider, setRunning, setThinking, setThinkingOptions, updateMintStatus]);

  const actions = useSessionActions({
    client, project, session, page, running, draft, attachments, permission, thinking, model, provider,
    menuSession, renameTitle, pendingAsk, askAnswers, fail, applySnapshot, refreshSessions, store: sessionStore,
  });

  useRemoteEvents({
    client, deviceId: credential?.deviceId, page, project, session, refreshHome: refreshHomeSessions,
    refreshProjects, refreshSessions, store: remoteStore,
  });

  const handleScan = useCallback(async (uri: string) => {
    try {
      setPage('home'); setBusy(true);
      const offer = parsePairingUri(uri);
      const stored = await pairWithPc(offer, `EasyMint ${Platform.OS}`, (code) => {
        setPairCode(code);
        setBusy(false);
      });
      await saveCredential(stored);
      setPairCode(''); setHomeLoading(true); setCredential(stored);
    } catch (e) { setPairCode(''); fail(e); } finally { setBusy(false); }
  }, [fail]);

  const openSessionMenu = useCallback((item: SessionListItem) => {
    setMenuSession(item); setRenameTitle(item.title); setSettingsOpen(true);
  }, []);

  const forgetPc = useCallback(() => {
    Alert.alert('移除此电脑？', '手机将删除配对凭证。会话数据从未保存在手机上。', [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => void clearCredential().then(() => {
        client?.close(); setCredential(null); setClient(null); setHomeLoading(false); setAppSettingsOpen(false); setPage('home');
      }) },
    ]);
  }, [client]);

  const goBack = useCallback(() => {
    if (appSettingsOpen) { setAppSettingsOpen(false); return true; }
    if (settingsOpen) { setSettingsOpen(false); setMenuSession(null); return true; }
    if (page === 'scanner') { setPage('home'); return true; }
    if (page === 'chat') {
      if (chatOrigin === 'sessions') { setPage('sessions'); void refreshSessions(project); }
      else { setPage('home'); void refreshHomeSessions(); }
      return true;
    }
    if (page === 'sessions') { setPage('projects'); return true; }
    if (page === 'projects') { setPage('home'); return true; }
    return false;
  }, [appSettingsOpen, chatOrigin, page, project, refreshHomeSessions, refreshSessions, settingsOpen]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const statusLabel = useMemo(() => connection === 'connected' ? '已连接' : connection === 'connecting' ? '连接中' : '已断开', [connection]);
  const activeModelProvider = useMemo(() => models?.providers.find((item) => item.id === models.currentProvider) ?? null, [models]);
  const activeModelCapabilities = useMemo(() => {
    const selectedModel = model || activeModelProvider?.currentModel;
    return activeModelProvider?.models.find((item) => item.id === selectedModel) ?? null;
  }, [activeModelProvider, model]);
  useEffect(() => {
    const declared = activeModelCapabilities?.thinkingLevels;
    const available = declared?.length ? THINKING_ORDER.filter((level) => declared.includes(level)) : [...THINKING_ORDER];
    setThinkingOptions(available);
    setThinking((current) => resolveThinkingLevel(current, available));
  }, [activeModelCapabilities]);
  const permissionLabel = permission === 'readonly' ? '只读' : permission === 'full' ? '完全访问' : '标准';

  // 输入卡的 props 保持引用稳定：流式期间 App 每帧重渲染，props 不变时 memo(Composer) 直接跳过整块输入卡。
  // 依赖必须覆盖 ComposerProps 的每一项，漏项会让输入卡读到过期值。
  const composerHandlers = useMemo(() => ({
    onDraftChange: setDraft,
    onControlChange: setComposerControl,
    onSend: () => void actions.send(),
    onStop: () => void actions.stop(),
    onSelectModel: (modelId: string, providerId: string | undefined) => void actions.setRemoteSetting('model', modelId, providerId),
    onSelectPermission: (mode: PermissionMode) => void actions.setRemoteSetting('permission', mode),
    onSelectThinking: (level: string) => void actions.setRemoteSetting('thinking', level),
    onPickAttachments: (kind: AttachmentKind) => void pickAttachments(kind)
      .then((items) => setAttachments((current) => {
        const next = [...current, ...items];
        if (next.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
          Alert.alert('附件过大', '单次发送的附件总量不能超过 15 MB');
          return current;
        }
        return next;
      }))
      .catch(fail),
    onRemoveAttachment: (id: string) => setAttachments((current) => current.filter((item) => item.id !== id)),
  }), [actions.send, actions.stop, actions.setRemoteSetting, fail]);

  const composer: ComposerProps = useMemo(() => ({
    draft, attachments, running, hasSession: !!session, permission, permissionLabel, thinking, thinkingOptions, model,
    provider: activeModelProvider, contextPercent: contextUsage.percent, contextWindow: contextUsage.maxTokens ?? null, control: composerControl,
    ...composerHandlers,
  }), [activeModelProvider, attachments, composerControl, composerHandlers, contextUsage.maxTokens, contextUsage.percent, draft, model, permission,
    permissionLabel, running, session, thinking, thinkingOptions]);

  if (!bootReady) return null;
  if (page === 'scanner') return <SafeAreaProvider><ScannerScreen onCancel={goBack} onScanned={(data) => void handleScan(data)} /></SafeAreaProvider>;

  let content: ReactNode;
  if (busy) content = <LoadingView spinner title="正在加载 EasyMint" />;
  else if (page === 'home') content = <HomeScreen
    credential={credential} pairCode={pairCode} error={error} homeLoading={homeLoading} connection={connection}
    project={project} sessions={sessions}
    onOpenScanner={() => setPage('scanner')} onOpenSettings={() => setAppSettingsOpen(true)}
    onSwitchProject={() => void refreshProjects()} onRefresh={() => void refreshHomeSessions()}
    onRetryConnect={() => { void client?.connect().catch(fail); }}
    onOpenSession={(item) => void actions.openSession(item, project ?? undefined, 'home')}
    onLongPressSession={openSessionMenu} onNewSession={() => void actions.startNewSession()} />;
  else if (page === 'projects') content = <ProjectsScreen projects={projects} statusLabel={statusLabel}
    onBack={() => setPage('home')} onOpenProject={(item) => void refreshSessions(item)} />;
  else if (page === 'sessions') content = <SessionsScreen project={project} connection={connection} sessions={sessions}
    onBack={goBack} onSwitchProject={() => void refreshProjects()} onOpenSession={(item) => void actions.openSession(item)}
    onLongPressSession={openSessionMenu} onNewSession={() => void actions.startNewSession()} />;
  else content = <ChatScreen title={session?.title ?? '新会话'} connection={connection} messages={messages}
    pendingAsk={pendingAsk} answers={askAnswers}
    onAnswerChange={(questionId, value) => setAskAnswers((current) => ({ ...current, [questionId]: value }))}
    onAnswerSubmit={() => void actions.answerAsk()}
    backgroundShells={backgroundShells} backgroundAgents={backgroundAgents}
    running={running} mintStatus={mintStatus} composer={composer} onBack={goBack} />;

  return <SafeAreaProvider><SafeAreaView style={commonStyles.safe} edges={['top', 'bottom']}><StatusBar style="dark" />{content}
    <SessionMenuModal visible={settingsOpen} session={menuSession} renameTitle={renameTitle}
      onRenameTitleChange={setRenameTitle}
      onDismiss={() => { setSettingsOpen(false); setMenuSession(null); }}
      onRequestClose={() => setSettingsOpen(false)}
      onRename={() => void actions.renameSession()}
      onTogglePin={() => { if (menuSession) void actions.setPinned(!menuSession.pinnedAt); }}
      onToggleArchive={() => { if (menuSession) actions.archiveCurrent(!menuSession.archivedAt); }} />
    <ConnectionSettingsSheet visible={appSettingsOpen} pcName={credential?.pcName ?? '未配对'} statusLabel={statusLabel}
      onClose={() => setAppSettingsOpen(false)}
      onRefresh={() => { setAppSettingsOpen(false); void refreshHomeSessions(); }}
      onRepair={() => { setAppSettingsOpen(false); setPage('scanner'); }}
      onForget={forgetPc} />
  </SafeAreaView></SafeAreaProvider>;
}
