import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, BackHandler, Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AmbientBackground } from './src/components/AmbientBackground';
import { LoadingView } from './src/components/LoadingView';
import type { ComposerProps } from './src/components/Composer';
import { parsePairingUri } from './src/connection/pairing-uri';
import { pairWithPc, RemoteClient } from './src/connection/remote-client';
import { loadSelfName, saveSelfName } from './src/security/device-name-store';
import type {
  BackgroundAgent, BackgroundShell, ModelCapabilities, OpenProject, PendingAsk, PermissionMode,
  SessionListItem, SessionSnapshot,
} from './src/protocol/types';
import { ArchiveSheet } from './src/screens/ArchiveSheet';
import { ChatScreen } from './src/screens/ChatScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SessionMenuModal } from './src/screens/SessionMenuModal';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShellOutputSheet } from './src/screens/ShellOutputSheet';
import {
  loadDevices, markDeviceConnected, removeDevice, renameSelf, saveDevice, setActiveDevice,
} from './src/security/credential-store';
import type { StoredDevice } from './src/security/credential-store';
import { endCompacting } from './src/session/compacting';
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
import type { AskAnswer, ComposerControl, ConnectionStatus, ContextUsage, Page } from './src/types';

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
  const [devices, setDevices] = useState<StoredDevice[]>([]);
  /** 本机名字：设置页可改，配对与重连都上报它 */
  const [selfName, setSelfName] = useState('');
  const [activePcId, setActivePcId] = useState<string | null>(null);
  const [client, setClient] = useState<RemoteClient | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [bootReady, setBootReady] = useState(false);
  // busy 只用于「点下去要等结果」的跳转（项目/会话列表、配对）；首屏不再阻塞：
  // 设备列表立刻渲染，当前设备那一行的圆点自己从「正在连接」走到「已连接」
  const [busy, setBusy] = useState(false);
  /** 点了一台需要重连的设备：连上后自动进它的会话列表 */
  const [pendingPcId, setPendingPcId] = useState<string | null>(null);
  /** 下拉刷新的转圈只由用户手势触发；连接后的自动刷新不共用这个标记，否则一进首页就自己转 */
  const [pulling, setPulling] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<OpenProject[]>([]);
  const [project, setProject] = useState<OpenProject | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [session, setSession] = useState<SessionListItem | null>(null);
  const [chatOrigin, setChatOrigin] = useState<'home' | 'sessions'>('home');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [models, setModels] = useState<ModelCapabilities | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerControl, setComposerControl] = useState<ComposerControl>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const sessionBackdrop = useRef<View>(null);
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

  /** 当前设备：整个会话/项目链路仍只服务这一台，设备列表里的其余设备只展示状态 */
  const credential = useMemo(() => devices.find((item) => item.pcId === activePcId) ?? null, [activePcId, devices]);

  /** 当前会话（未创建的新会话用草稿格）——界面读的就是这一份 */
  const activeSessionId = session?.sessionId ?? DRAFT_SESSION_ID;
  const active = runtime[activeSessionId] ?? EMPTY_RUNTIME;
  const {
    messages, running, mintStatus, mintIcon, compacting, pendingAsk, backgroundShells, backgroundAgents,
    contextUsage, permission, thinking, thinkingOptions, model,
  } = active;

  // 状态行去重（**每个会话各自**记录上一次的值）：流式期间每帧都会写同一个值，逐帧 setState 会白跑一次整树渲染。
  // 键里带上图标：文案相同但工具换了（「正在处理...」→ 另一个工具的图标）也要更新。
  const mintStatusRef = useRef<Record<string, string>>({});
  const updateMintStatus = useCallback((sessionId: string, value: string, icon?: string) => {
    const key = `${icon ?? ''}|${value}`;
    if ((mintStatusRef.current[sessionId] ?? '') === key) return;
    mintStatusRef.current[sessionId] = key;
    patchRuntime(sessionId, { mintStatus: value, mintIcon: icon ?? '' });
  }, [patchRuntime]);

  const fail = useCallback((value: unknown) => {
    const message = value instanceof Error ? value.message : String(value);
    setError(message);
    Alert.alert('EasyMint', message);
  }, []);

  useEffect(() => {
    // 只读设备本，不等连接：首帧就是设备列表，连接在后面的 effect 里自己跑
    void loadDevices().then((book) => {
      setDevices(book.devices);
      setActivePcId(book.activePcId);
      // 与设备本同一次提交里落到「连接中」：否则首帧会先画一帧「未连接」再跳成「正在连接」
      if (book.activePcId) setConnection('connecting');
    })
      .catch(fail)
      .finally(() => setBootReady(true));
    // 与设备本并行读，不阻塞首帧
    void loadSelfName().then(setSelfName).catch(() => undefined);
  }, [fail]);

  useEffect(() => {
    if (bootReady && themeReady) void SplashScreen.hideAsync();
  }, [bootReady, themeReady]);

  useEffect(() => {
    if (!credential) { setClient(null); setConnection('disconnected'); return; }
    const next = new RemoteClient(credential);
    setClient(next);
    // 先落到「连接中」：换设备时上一台留下的 connected 会让人以为新设备已就绪，
    // 也会让 pendingPcId 的自动进入提前触发
    setConnection('connecting');
    const off = next.onStatus(setConnection);
    // 电脑端撤销了这台设备：清掉本地凭证并回扫码页。
    // 不清的话 App 会一直认为「已配对」，停在设备列表里无限重连（而且电脑上已经没有这条记录了）。
    const offRevoked = next.onPairingRevoked(() => {
      void (async () => {
        try {
          const book = await removeDevice(credential.pcId);
          setDevices(book.devices);
          setActivePcId(book.activePcId);
          setProject(null);
          setSessions([]);
          // 还有别的电脑就回设备列表，一台都不剩才回扫码页
          setPage(book.activePcId ? 'home' : 'scanner');
          setError('这台电脑上的配对已失效，请重新扫码配对');
        } catch (e) {
          fail(e);
        }
      })();
    });
    // 后台连接：失败不弹窗（电脑关机/不在同一网络都很常见），设备行上的圆点与文案就是结果。
    // 用户点这台设备时会再试一次，那一次失败才需要说话。
    void next.connect().catch(() => undefined);
    return () => { off(); offRevoked(); next.close(); };
  }, [credential]);

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

  // 项目 id 走 ref：refreshHomeSessions 的身份要稳定，否则 project 一变、连接 effect 就重跑一次
  const projectIdRef = useRef<string | null>(project?.id ?? null);
  projectIdRef.current = project?.id ?? null;

  /** 拉「当前项目 + 它的会话」。连上之后、设备页下拉刷新都走它；不负责跳页面 */
  const refreshHomeSessions = useCallback(async () => {
    if (!client) return;
    try {
      const openProjects = await client.command<OpenProject[]>('project.listOpen');
      const selected = openProjects.find((item) => item.id === projectIdRef.current) ?? openProjects[0] ?? null;
      setProjects(openProjects);
      setProject(selected);
      setSessions(selected ? await client.command<SessionListItem[]>('session.list', { projectId: selected.id }) : []);
    } catch (e) { fail(e); }
  }, [client, fail]);

  /** 会话页下拉刷新：只换列表，不切页面、不弹全屏加载 */
  const reloadSessions = useCallback(async () => {
    if (!client || !project) return;
    try {
      setSessions(await client.command<SessionListItem[]>('session.list', { projectId: project.id }));
    } catch (e) { fail(e); }
  }, [client, fail, project]);

  useEffect(() => {
    if (connection !== 'connected' || !credential) return;
    void refreshHomeSessions();
    // 只落盘、不回写 devices：回写会换掉 credential 的引用，连接 effect 会误以为换了设备而重连
    void markDeviceConnected(credential.pcId).catch(() => undefined);
  }, [connection, credential, refreshHomeSessions]);

  const streamMessageIds = useRef<Record<string, string | null>>({});
  /** 会话回合是否仍在跑：状态栏清空时据此回落到「正在处理...」（桌面端信号栈的简化版）。
   *  快照路径在 applySnapshot 里同步，流式回合边界由 useRemoteEvents 维护。 */
  const activeTurn = useRef<Record<string, boolean>>({});
  const applySnapshot = useCallback((sessionId: string, snapshot: SessionSnapshot, duringRequest: unknown[]) => {
    const recovered = snapshotMessagesWithBuffer(snapshot, duringRequest);
    streamMessageIds.current[sessionId] = recovered.messages.find((item) => item.streaming)?.id ?? null;
    const isRunning = recovered.running;
    activeTurn.current[sessionId] = isRunning;
    const available = snapshot.thinking?.available;
    // 与桌面端一致：快照本身不产生状态信号（StatusBar 此时无文本，整条不显示），
    // 下一个事件（tool_progress / 流式帧）才会把状态行带出来。这里只清掉上一个会话的残留。
    updateMintStatus(sessionId, '');
    // 压缩态连同它的超时兜底一起撤掉：只把 runtime 置 false 不够，挂着的定时器还会在 120s 后
    // 补一条「压缩状态异常」的假提示
    endCompacting(sessionId);
    patchRuntime(sessionId, {
      // snapshotMessages 已按列表顺序返回（最新在前）
      messages: recovered.messages,
      running: isRunning,
      // 快照的 status 只有 running/idle，分不出「正在压缩」。这里一律重置为未压缩：
      // 误判成未压缩只是发出去被 PC 拒（有归类好的错误卡），误判成压缩中会把输入卡死。
      compacting: false,
      permission: snapshot.cache?.permissionMode ?? 'standard',
      // 会话真实生效等级优先于缓存：PC 同一会话也是以 session.thinkingLevel 为准（缓存只是上次的期望值，
      // 可能被模型能力裁剪），取不到再回落缓存、再回落 medium
      thinking: snapshot.thinking?.level ?? snapshot.cache?.thinkingLevel ?? 'medium',
      thinkingOptions: available?.length ? THINKING_ORDER.filter((level) => available.includes(level)) : [...THINKING_ORDER],
      model: snapshot.cache?.model ?? '',
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
    patchRuntime, migrateRuntime, setMintStatus: updateMintStatus, activeTurn,
    setPage, setProject, setBusy, setChatOrigin, setComposerControl, setSession, setSessions, setDraft, setAttachments,
    setModels, setSettingsOpen, setMenuSession, setRenameTitle,
  }), [activeTurn, migrateRuntime, patchRuntime, setAttachments, setBusy, setChatOrigin, setComposerControl, setDraft,
    setMenuSession, setModels, setPage, setProject, setRenameTitle, setSession, setSessions, setSettingsOpen, updateMintStatus]);

  const remoteStore = useMemo<RemoteEventsStore>(() => ({
    patchRuntime, setMintStatus: updateMintStatus, syncBackground, emitShellChunk,
  }), [emitShellChunk, patchRuntime, syncBackground, updateMintStatus]);

  const actions = useSessionActions({
    client, project, session, page, running, draft, attachments, permission, thinking, model,
    menuSession, renameTitle, pendingAsk, fail, applySnapshot, refreshSessions, store: sessionStore,
  });

  // 提交提问卡：答案由提问卡自己收集（PC 同款），这里只转交；回调保持稳定，卡上的 memo 才有效
  const submitAsk = useCallback((answers: AskAnswer[] | null) => { void actions.answerAsk(answers); }, [actions.answerAsk]);

  useRemoteEvents({
    client, deviceId: credential?.deviceId, page, project, session, streamMessageIds, activeTurn, refreshHome: refreshHomeSessions,
    refreshProjects, refreshSessions, store: remoteStore,
  });

  const handleScan = useCallback(async (uri: string) => {
    try {
      setPage('home'); setBusy(true);
      const target = parsePairingUri(uri);
      // 上报设备名：用户自定义优先，其次是型号（iOS 拿不到系统里的设备名）
      const reportedName = await loadSelfName();
      const stored = await pairWithPc(target, reportedName, (code) => {
        setPairCode(code);
        setBusy(false);
      });
      const book = await saveDevice(stored);
      setDevices(book.devices); setActivePcId(book.activePcId);
      setPairCode(''); setPage('home');
    } catch (e) { setPairCode(''); fail(e); } finally { setBusy(false); }
  }, [fail]);

  const openSessionMenu = useCallback((item: SessionListItem) => {
    setMenuSession(item); setRenameTitle(item.title); setSettingsOpen(true);
  }, []);

  /**
   * 换设备时清掉所有跟着设备走的视图状态：项目、会话列表、会话运行态缓存、流式 id、回合标记。
   * 不清的话切回来会先看到上一台的旧消息/旧列表（快照要等下一次打开才覆盖）。
   */
  const resetDeviceState = useCallback(() => {
    setProject(null);
    setSessions([]);
    setSession(null);
    setRuntime({});
    streamMessageIds.current = {};
    activeTurn.current = {};
  }, []);

  /** 打开一台设备：已连接就直接进会话；其余情况切过去并在连上后自动进入 */
  const openDevice = useCallback(async (device: StoredDevice) => {
    if (device.pcId === activePcId) {
      if (connection === 'connected') setPage('sessions');
      // 正在连：先记下来，连上后自动进入（重复点不会打断握手）
      else if (connection === 'connecting') setPendingPcId(device.pcId);
      else void client?.connect().catch(fail);
      return;
    }
    try {
      setConnection('connecting');
      // 上一台的项目/会话必须清掉：连上后会立刻进入会话页，留着就是「B 的标题 + A 的列表」，
      // 点开还会拿 A 的 projectId 去问 B（PC 那边会话不属于该项目 → SESSION_NOT_FOUND）
      resetDeviceState();
      const book = await setActiveDevice(device.pcId);
      setDevices(book.devices);
      setActivePcId(book.activePcId);
      setPendingPcId(device.pcId);
    } catch (e) {
      // 落盘失败：别把界面留在「正在连接」——那一行会一直转，像卡死
      setConnection('disconnected');
      fail(e);
    }
  }, [activePcId, client, connection, fail, resetDeviceState]);

  // 切过设备后：连上就自动进入它的会话列表（用户点的是「进这台」，不该让他再点一次）。
  // 等 project 一起就位再跳：否则会先看到一帧「选择项目」+ 空列表
  useEffect(() => {
    if (connection === 'connected' && project && pendingPcId && pendingPcId === activePcId) {
      setPendingPcId(null);
      setPage('sessions');
    }
  }, [activePcId, connection, pendingPcId, project]);

  const forgetPc = useCallback(() => {
    if (!credential) return;
    Alert.alert('移除此电脑？', `将删除与「${credential.pcName}」的配对凭证。会话数据从未保存在手机上。`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => void removeDevice(credential.pcId).then((book) => {
        setDevices(book.devices);
        setActivePcId(book.activePcId);
        resetDeviceState();
        setConnection(book.activePcId ? 'connecting' : 'disconnected');
        setPage('home');
        setArchiveOpen(false);
        // 一台都不剩：把连接彻底收掉（否则会留着一条指向已删设备的 socket）
        if (!book.activePcId) { client?.close(); setClient(null); setConnection('disconnected'); }
      }).catch(fail) },
    ]);
  }, [client, credential, fail, resetDeviceState]);

  /** 归档列表里的「恢复」：取消归档标记后刷新会话列表 */
  const restoreArchived = useCallback(async (item: SessionListItem): Promise<boolean> => {
    if (!client || !project) return false;
    try {
      await client.command('session.archive', {
        projectId: project.id, sessionId: item.sessionId, data: { archived: false },
      });
      await reloadSessions();
      return true;
    } catch (e) { fail(e); return false; }
  }, [client, fail, project, reloadSessions]);

  const goBack = useCallback(() => {
    if (settingsOpen) { setSettingsOpen(false); setMenuSession(null); return true; }
    if (page === 'scanner') { setPage('home'); return true; }
    if (page === 'chat') {
      if (chatOrigin === 'sessions') { setPage('sessions'); void refreshSessions(project); }
      else { setPage('home'); void refreshHomeSessions(); }
      return true;
    }
    // 二级页一律回设备列表：项目列表是从会话页标题进的，因此它也只回设备列表
    if (page === 'sessions' || page === 'projects' || page === 'settings') { setPage('home'); return true; }
    return false;
  }, [chatOrigin, page, project, refreshHomeSessions, refreshSessions, settingsOpen]);

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
    onSelectModel: (modelId: string) => void actions.setRemoteSetting('model', modelId),
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
    draft, attachments, running, compacting, hasSession: !!session, permission, permissionLabel, thinking, thinkingOptions, model,
    provider: activeModelProvider, contextPercent: contextUsage.percent, contextWindow: contextUsage.maxTokens ?? null, control: composerControl,
    ...composerHandlers,
  }), [activeModelProvider, attachments, compacting, composerControl, composerHandlers, contextUsage.maxTokens, contextUsage.percent, draft, model,
    permission, permissionLabel, running, session, thinking, thinkingOptions]);

  if (!bootReady || !themeReady) return null;
  if (page === 'scanner') return <SafeAreaProvider>
    <AmbientBackground />
    <ScannerScreen onCancel={goBack} onScanned={(data) => void handleScan(data)} />
  </SafeAreaProvider>;

  let content: ReactNode;
  if (busy) content = <LoadingView spinner title="正在加载 EasyMint" />;
  else if (page === 'home') content = <HomeScreen
    devices={devices} activePcId={activePcId} connection={connection} refreshing={pulling}
    pairCode={pairCode} error={error}
    onRefresh={() => {
      // 离线时下拉的意图是「再试一次」，不是「再查一次接口」——别让用户吃一张 command 失败弹窗
      if (connection !== 'connected') { void client?.connect().catch(fail); return; }
      setPulling(true);
      void refreshHomeSessions().finally(() => setPulling(false));
    }}
    onOpenDevice={(device) => void openDevice(device)}
    onAddDevice={() => setPage('scanner')}
    onOpenSettings={() => setPage('settings')} />;
  else if (page === 'settings') content = <SettingsScreen device={credential} connection={connection}
    selfName={selfName}
    onRenameSelf={(name) => {
      void (async () => {
        const next = await saveSelfName(name);
        setSelfName(next);
        // 已配对凭证里的名字一起改：重连时 hello 带的是它，电脑端会立刻刷新
        const book = await renameSelf(next);
        setDevices(book.devices);
      })().catch(fail);
    }}
    onBack={() => setPage('home')} onRepair={() => setPage('scanner')} onForget={forgetPc} />;
  else if (page === 'projects') content = <ProjectsScreen projects={projects} statusLabel={statusLabel}
    onBack={() => setPage('home')} onOpenProject={(item) => void refreshSessions(item)} />;
  else if (page === 'sessions') content = <SessionsScreen blurTarget={sessionBackdrop} project={project} connection={connection} sessions={sessions}
    refreshing={reloading}
    onRefresh={() => { setReloading(true); void reloadSessions().finally(() => setReloading(false)); }}
    onOpenArchive={() => setArchiveOpen(true)}
    onBack={goBack} onSwitchProject={() => void refreshProjects()} onOpenSession={(item) => void actions.openSession(item)}
    onLongPressSession={openSessionMenu} onNewSession={() => void actions.startNewSession()} />;
  else content = <ChatScreen title={session?.title ?? '新会话'} connection={connection} messages={messages}
    pendingAsk={pendingAsk}
    onAnswerSubmit={submitAsk}
    backgroundShells={backgroundShells} backgroundAgents={backgroundAgents}
    onOpenShellOutput={(shell) => setViewingShell({ id: shell.id, command: shell.command })}
    onStopShell={(shellId) => void actions.stopShell(shellId)}
    onStopAgent={(delegationId, taskIndex) => void actions.stopAgent(delegationId, taskIndex)}
    running={running} mintStatus={mintStatus} mintIcon={mintIcon} composer={composer} onBack={goBack} />;

  // 状态栏图标明暗跟主题走：深色主题上用浅色图标（PC 亦然）
  return <SafeAreaProvider>
    <AmbientBackground />
    <SafeAreaView style={commonStyles.safe} edges={page === 'chat' ? ['bottom', 'left', 'right'] : ['top', 'bottom']}><StatusBar style={effectiveMode === 'dark' ? 'light' : 'dark'} />{content}
    <SessionMenuModal blurTarget={sessionBackdrop} visible={settingsOpen} session={menuSession} renameTitle={renameTitle}
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
    <ArchiveSheet visible={archiveOpen}
      sessions={sessions.filter((item) => item.archivedAt)}
      onClose={() => setArchiveOpen(false)}
      onRestore={(item) => { void restoreArchived(item).then((ok) => { if (ok) setArchiveOpen(false); }); }} />
  </SafeAreaView>
  </SafeAreaProvider>;
}
