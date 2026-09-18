import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { THINKING_ORDER, resolveThinkingLevel } from './src/session/thinking';
import { useRemoteEvents } from './src/session/useRemoteEvents';
import { useSessionActions } from './src/session/useSessionActions';
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
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
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
  const newestFirstMessages = useMemo(() => [...messages].reverse(), [messages]);

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
    setMessages(snapshotMessages(snapshot));
    const isRunning = snapshot.status !== 'idle' && snapshot.status !== 'stopped';
    setRunning(isRunning);
    setMintStatus(isRunning ? '正在处理…' : '');
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
  }, []);

  const actions = useSessionActions({
    client, project, session, page, running, draft, permission, thinking, model, provider,
    menuSession, renameTitle, pendingAsk, askAnswers, fail, applySnapshot, refreshSessions,
    store: {
      setPage, setProject, setBusy, setChatOrigin, setComposerControl, setSession, setSessions, setDraft,
      setMintStatus, setRunning, setMessages, setPermission, setThinking, setModel, setProvider, setModels,
      setBackgroundShells, setBackgroundAgents, setPendingAsk, setAskAnswers, setSettingsOpen, setMenuSession, setRenameTitle,
    },
  });

  useRemoteEvents({
    client, deviceId: credential?.deviceId, page, project, session, refreshHome: refreshHomeSessions,
    refreshProjects, refreshSessions,
    store: {
      setMessages, setRunning, setMintStatus, setBackgroundShells, setBackgroundAgents, setContextUsage,
      setPendingAsk, setAskAnswers, setModel, setProvider, setThinking, setPermission, setThinkingOptions,
    },
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

  const composer: ComposerProps = {
    draft, running, hasSession: !!session, permission, permissionLabel, thinking, thinkingOptions, model,
    provider: activeModelProvider, contextPercent: contextUsage.percent, control: composerControl,
    onDraftChange: setDraft,
    onControlChange: setComposerControl,
    onSend: () => void actions.send(),
    onStop: () => void actions.stop(),
    onSelectModel: (modelId, providerId) => void actions.setRemoteSetting('model', modelId, providerId),
    onSelectPermission: (mode) => void actions.setRemoteSetting('permission', mode),
    onSelectThinking: (level) => void actions.setRemoteSetting('thinking', level),
  };

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
  else content = <ChatScreen title={session?.title ?? '新会话'} connection={connection} messages={newestFirstMessages}
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
