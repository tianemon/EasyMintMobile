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
import { ShellOutputSheet } from './src/screens/ShellOutputSheet';
import { clearCredential, loadCredential, saveCredential } from './src/security/credential-store';
import { snapshotMessagesWithBuffer } from './src/session/messages';
import type { DisplayMessage } from './src/session/messages';
import { DRAFT_SESSION_ID, EMPTY_RUNTIME } from './src/session/runtime';
import type { PatchRuntime, SessionRuntime } from './src/session/runtime';
import { appendAttachments, pickAttachments } from './src/session/attachments';
import type { AttachmentKind, DraftAttachment } from './src/session/attachments';
import { THINKING_ORDER, resolveThinkingLevel } from './src/session/thinking';
import { useRemoteEvents } from './src/session/useRemoteEvents';
import type { RemoteEventsStore } from './src/session/useRemoteEvents';
import { useSessionActions } from './src/session/useSessionActions';
import type { SessionActionsStore } from './src/session/useSessionActions';
import { makeCommonStyles } from './src/theme/commonStyles';
import { ThemeProvider, useTheme, useThemedStyles } from './src/theme/theme-context';
import type { AskAnswer, ComposerControl, ConnectionStatus, ContextUsage, HomeSession, Page } from './src/types';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 220, fade: true });

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}

function AppContent() {
  // 主题：偏好读完才渲染（themeReady），否则首帧会先亮后暗闪一下
  const { effectiveMode, ready: themeReady } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
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
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [models, setModels] = useState<ModelCapabilities | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [composerControl, setComposerControl] = useState<ComposerControl>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [menuSession, setMenuSession] = useState<SessionListItem | null>(null);
  /** 正在查看输出的后台命令（只存打开时的 id/命令：命令结束后从运行态清单里消失，弹层仍要保留内容） */
  const [viewingShell, setViewingShell] = useState<{ id: string; command: string } | null>(null);

  // ── 会话级运行态：按会话 id 各存一份（与 PC 的 messagesBySession 同构，见 session/runtime.ts）──
  // 写入一律按**事件自己的会话 id** 落格，显示哪份由当前会话决定 → 串会话在结构上不可能发生。
  const [runtime, setRuntime] = useState<Record<string, SessionRuntime>>({});
  const patchRuntime = useCallback<PatchRuntime>((sessionId, patch) => {
    setRuntime((current) => {
      const base = current[sessionId] ?? EMPTY_RUNTIME;
      const next = typeof patch === 'function' ? patch(base) : patch;
      return { ...current, [sessionId]: { ...base, ...next } };
    });
  }, []);
  /** 新建会话：`session.send` 拿到真实 id 后把草稿格状态迁过去 */
  const migrateRuntime = useCallback((from: string, to: string): void => {
    setRuntime((current) => {
      const moved = current[from];
      if (!moved || from === to) return current;
      const { [from]: _discard, ...rest } = current;
      return { ...rest, [to]: { ...(current[to] ?? EMPTY_RUNTIME), ...moved } };
    });
  }, []);
  /** 后台任务清单是全量的（PC 按订阅过滤后下发），按会话分组写回——只看当前会话会串到别的会话 */
  const syncBackground = useCallback((kind: 'shell' | 'delegation', items: { sessionId?: string }[]): void => {
    setRuntime((current) => {
      const grouped: Record<string, unknown[]> = {};
      for (const item of items) {
        if (!item.sessionId) continue;
        (grouped[item.sessionId] ??= []).push(item);
      }
      const next: Record<string, SessionRuntime> = {};
      for (const [sid, rt] of Object.entries(current)) {
        next[sid] = kind === 'shell'
          ? { ...rt, backgroundShells: (grouped[sid] ?? []) as SessionRuntime['backgroundShells'] }
          : { ...rt, backgroundAgents: (grouped[sid] ?? []) as SessionRuntime['backgroundAgents'] };
      }
      return next;
    });
  }, []);

  /** 输出查看页的实时块订阅（避免把每个 chunk 都写进 React 状态：只有打开的那个查看页在听） */
  const shellChunkListeners = useRef(new Set<(shellId: string, chunk: string) => void>());
  const emitShellChunk = useCallback((shellId: string, chunk: string): void => {
    for (const listener of shellChunkListeners.current) listener(shellId, chunk);
  }, []);
  const subscribeShellChunks = useCallback((listener: (shellId: string, chunk: string) => void): (() => void) => {
    shellChunkListeners.current.add(listener);
    return () => { shellChunkListeners.current.delete(listener); };
  }, []);

  /** 当前会话（未创建的新会话用草稿格）——界面读的就是这一份 */
  const activeSessionId = session?.sessionId ?? DRAFT_SESSION_ID;
  const active = runtime[activeSessionId] ?? EMPTY_RUNTIME;
  const {
    messages, running, mintStatus, pendingAsk, backgroundShells, backgroundAgents,
    contextUsage, permission, thinking, thinkingOptions, model, provider,
  } = active;

  // 状态文案去重（**每个会话各自**记录上一次的值）：流式期间每帧都会写同一个值，逐帧 setState 会白跑一次整树渲染。
  const mintStatusRef = useRef<Record<string, string>>({});
  const updateMintStatus = useCallback((sessionId: string, value: string) => {
    if ((mintStatusRef.current[sessionId] ?? '') === value) return;
    mintStatusRef.current[sessionId] = value;
    patchRuntime(sessionId, { mintStatus: value });
  }, [patchRuntime]);

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
    if (bootReady && themeReady) void SplashScreen.hideAsync();
  }, [bootReady, themeReady]);

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

  const streamMessageIds = useRef<Record<string, string | null>>({});
  const applySnapshot = useCallback((sessionId: string, snapshot: SessionSnapshot, duringRequest: unknown[]) => {
    const recovered = snapshotMessagesWithBuffer(snapshot, duringRequest);
    streamMessageIds.current[sessionId] = recovered.messages.find((item) => item.streaming)?.id ?? null;
    const isRunning = recovered.running;
    const available = snapshot.thinking?.available;
    updateMintStatus(sessionId, isRunning ? '正在处理…' : '');
    patchRuntime(sessionId, {
      // snapshotMessages 已按列表顺序返回（最新在前）
      messages: recovered.messages,
      running: isRunning,
      permission: snapshot.cache?.permissionMode ?? 'standard',
      // 会话真实生效等级优先于缓存：PC 同一会话也是以 session.thinkingLevel 为准（缓存只是上次的期望值，
      // 可能被模型能力裁剪），取不到再回落缓存、再回落 medium
      thinking: snapshot.thinking?.level ?? snapshot.cache?.thinkingLevel ?? 'medium',
      thinkingOptions: available?.length ? THINKING_ORDER.filter((level) => available.includes(level)) : [...THINKING_ORDER],
      model: snapshot.cache?.model ?? '',
      provider: snapshot.cache?.provider,
      pendingAsk: snapshot.pendingAsks[0] ?? null,
      backgroundShells: snapshot.background?.shells ?? [],
      backgroundAgents: snapshot.background?.agents ?? [],
      // 快照不带上下文占用：置为未知，宁可空着也不留上一个会话的数值
      contextUsage: { percent: null },
    });
    setRenameTitle(snapshot.session.title);
  }, [patchRuntime, updateMintStatus]);

  // 两个 store 对象只装 useState 的 setter 与 useCallback 包装（标识都稳定），收进 useMemo：
  // 避免每次 App 渲染新建对象 → 下层 hook 的 useCallback 跟着失效 → 输入卡 props 每帧换代。
  const sessionStore = useMemo<SessionActionsStore>(() => ({
    patchRuntime, migrateRuntime, setMintStatus: updateMintStatus,
    setPage, setProject, setBusy, setChatOrigin, setComposerControl, setSession, setSessions, setDraft, setAttachments,
    setModels, setSettingsOpen, setMenuSession, setRenameTitle,
  }), [migrateRuntime, patchRuntime, setAttachments, setBusy, setChatOrigin, setComposerControl, setDraft,
    setMenuSession, setModels, setPage, setProject, setRenameTitle, setSession, setSessions, setSettingsOpen, updateMintStatus]);

  const remoteStore = useMemo<RemoteEventsStore>(() => ({
    patchRuntime, setMintStatus: updateMintStatus, syncBackground, emitShellChunk,
  }), [emitShellChunk, patchRuntime, syncBackground, updateMintStatus]);

  const actions = useSessionActions({
    client, project, session, page, running, draft, attachments, permission, thinking, model, provider,
    menuSession, renameTitle, pendingAsk, fail, applySnapshot, refreshSessions, store: sessionStore,
  });

  // 提交提问卡：答案由提问卡自己收集（PC 同款），这里只转交；回调保持稳定，卡上的 memo 才有效
  const submitAsk = useCallback((answers: AskAnswer[] | null) => { void actions.answerAsk(answers); }, [actions.answerAsk]);

  useRemoteEvents({
    client, deviceId: credential?.deviceId, page, project, session, streamMessageIds, refreshHome: refreshHomeSessions,
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
    // 能力变化只影响**当前会话**的输入卡：按当前会话落格，不动别的会话
    patchRuntime(activeSessionId, (current) => ({
      thinkingOptions: available,
      thinking: resolveThinkingLevel(current.thinking, available),
    }));
  }, [activeModelCapabilities, activeSessionId, patchRuntime]);
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
    // 上限判定收进 appendAttachments（与桌面端同源），这里只负责落 state 与提示。
    // 读 attachments 快照而非函数式更新，是为了能拿到 notice 向用户说明超限原因；
    // 选择器是系统模态，两次选取不会并发，快照不会过期。
    onPickAttachments: (kind: AttachmentKind) => void pickAttachments(kind).then((items) => {
      if (!items.length) return;
      const result = appendAttachments(attachments, items);
      setAttachments(result.next);
      if (result.notice) Alert.alert('无法添加附件', result.notice);
    }).catch(fail),
    onRemoveAttachment: (id: string) => setAttachments((current) => current.filter((item) => item.id !== id)),
  }), [actions.send, actions.stop, actions.setRemoteSetting, attachments, fail]);

  const composer: ComposerProps = useMemo(() => ({
    draft, attachments, running, hasSession: !!session, permission, permissionLabel, thinking, thinkingOptions, model,
    provider: activeModelProvider, contextPercent: contextUsage.percent, contextWindow: contextUsage.maxTokens ?? null, control: composerControl,
    ...composerHandlers,
  }), [activeModelProvider, attachments, composerControl, composerHandlers, contextUsage.maxTokens, contextUsage.percent, draft, model, permission,
    permissionLabel, running, session, thinking, thinkingOptions]);

  if (!bootReady || !themeReady) return null;
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
    pendingAsk={pendingAsk}
    onAnswerSubmit={submitAsk}
    backgroundShells={backgroundShells} backgroundAgents={backgroundAgents}
    onOpenShellOutput={(shell) => setViewingShell({ id: shell.id, command: shell.command })}
    onStopShell={(shellId) => void actions.stopShell(shellId)}
    running={running} mintStatus={mintStatus} composer={composer} onBack={goBack} />;

  // 状态栏图标明暗跟主题走：深色主题上用浅色图标（PC 亦然）
  return <SafeAreaProvider><SafeAreaView style={commonStyles.safe} edges={['top', 'bottom']}><StatusBar style={effectiveMode === 'dark' ? 'light' : 'dark'} />{content}
    <SessionMenuModal visible={settingsOpen} session={menuSession} renameTitle={renameTitle}
      onRenameTitleChange={setRenameTitle}
      onDismiss={() => { setSettingsOpen(false); setMenuSession(null); }}
      onRequestClose={() => setSettingsOpen(false)}
      onRename={() => void actions.renameSession()}
      onTogglePin={() => { if (menuSession) void actions.setPinned(!menuSession.pinnedAt); }}
      onToggleArchive={() => { if (menuSession) actions.archiveCurrent(!menuSession.archivedAt); }} />
    <ShellOutputSheet visible={!!viewingShell}
      shell={viewingShell ? { id: viewingShell.id, command: viewingShell.command, running: backgroundShells.some((item) => item.id === viewingShell.id) } : null}
      loadLog={actions.readShellLog} subscribeChunks={subscribeShellChunks}
      onStop={(shellId) => void actions.stopShell(shellId)} onClose={() => setViewingShell(null)} />
    <ConnectionSettingsSheet visible={appSettingsOpen} pcName={credential?.pcName ?? '未配对'} statusLabel={statusLabel}
      onClose={() => setAppSettingsOpen(false)}
      onRefresh={() => { setAppSettingsOpen(false); void refreshHomeSessions(); }}
      onRepair={() => { setAppSettingsOpen(false); setPage('scanner'); }}
      onForget={forgetPc} />
  </SafeAreaView></SafeAreaProvider>;
}
