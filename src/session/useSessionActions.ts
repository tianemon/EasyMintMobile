import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Alert } from 'react-native';
import type { RemoteClient } from '../connection/remote-client';
import type {
  BackgroundAgent, BackgroundShell, ModelCapabilities, OpenProject, PendingAsk, PermissionMode,
  SessionListItem, SessionSnapshot,
} from '../protocol/types';
import type { ComposerControl, Page } from '../types';
import { prependMessage } from './messages';
import type { DisplayMessage } from './messages';

/** 会话命令要写入的状态（setter 由 App 提供，标识稳定） */
export type SessionActionsStore = {
  setPage: (page: Page) => void;
  setProject: (project: OpenProject | null) => void;
  setBusy: (value: boolean) => void;
  setChatOrigin: (origin: 'home' | 'sessions') => void;
  setComposerControl: (control: ComposerControl) => void;
  setSession: (session: SessionListItem | null) => void;
  setSessions: Dispatch<SetStateAction<SessionListItem[]>>;
  setDraft: (value: string) => void;
  setMintStatus: (value: string) => void;
  setRunning: (value: boolean) => void;
  setMessages: Dispatch<SetStateAction<DisplayMessage[]>>;
  setPermission: (value: PermissionMode) => void;
  setThinking: (value: string) => void;
  setModel: (value: string) => void;
  setProvider: (value: string | undefined) => void;
  setModels: (value: ModelCapabilities | null) => void;
  setBackgroundShells: Dispatch<SetStateAction<BackgroundShell[]>>;
  setBackgroundAgents: Dispatch<SetStateAction<BackgroundAgent[]>>;
  setPendingAsk: (value: PendingAsk | null) => void;
  setAskAnswers: (value: Record<string, string>) => void;
  setSettingsOpen: (value: boolean) => void;
  setMenuSession: (value: SessionListItem | null) => void;
  setRenameTitle: (value: string) => void;
};

export type SessionActionsOptions = {
  client: RemoteClient | null;
  project: OpenProject | null;
  session: SessionListItem | null;
  page: Page;
  running: boolean;
  draft: string;
  permission: PermissionMode;
  thinking: string;
  model: string;
  provider: string | undefined;
  menuSession: SessionListItem | null;
  renameTitle: string;
  pendingAsk: PendingAsk | null;
  askAnswers: Record<string, string>;
  fail: (error: unknown) => void;
  applySnapshot: (snapshot: SessionSnapshot) => void;
  refreshSessions: (project: OpenProject) => Promise<void>;
  store: SessionActionsStore;
};

export type SessionActions = {
  openSession: (selected: SessionListItem, selectedProject?: OpenProject, origin?: 'home' | 'sessions') => Promise<void>;
  startNewSession: () => Promise<void>;
  send: () => Promise<void>;
  stop: () => Promise<void>;
  setRemoteSetting: (kind: 'permission' | 'thinking' | 'model', value: string, modelProvider?: string) => Promise<void>;
  answerAsk: () => Promise<void>;
  renameSession: () => Promise<void>;
  setPinned: (pinned: boolean) => Promise<void>;
  archiveCurrent: (archived: boolean) => void;
};

/** 会话级命令（打开/新建/发送/中止/设置/问答/重命名/置顶/归档），全部走 RemoteClient.command */
export function useSessionActions(options: SessionActionsOptions): SessionActions {
  const {
    client, project, session, page, running, draft, permission, thinking, model, provider,
    menuSession, renameTitle, pendingAsk, askAnswers, fail, applySnapshot, refreshSessions, store,
  } = options;

  const openSession = useCallback(async (selected: SessionListItem, selectedProject = project, origin: 'home' | 'sessions' = page === 'sessions' ? 'sessions' : 'home') => {
    if (!client || !selectedProject) return;
    try {
      store.setBusy(true);
      store.setComposerControl(null);
      const [snapshot, capabilities] = await Promise.all([
        client.command<SessionSnapshot>('session.snapshot', { projectId: selectedProject.id, sessionId: selected.sessionId }),
        client.command<ModelCapabilities>('capability.models'),
      ]);
      store.setProject(selectedProject); store.setSession(selected); store.setChatOrigin(origin); applySnapshot(snapshot); store.setModels(capabilities); store.setPage('chat');
    } catch (e) { fail(e); } finally { store.setBusy(false); }
  }, [applySnapshot, client, fail, page, project, store]);

  const startNewSession = useCallback(async () => {
    if (!client || !project) return;
    try {
      const [defaults, capabilities] = await Promise.all([
        client.command<{ permissionMode: PermissionMode; thinkingLevel: string; model?: string }>('session.create', { projectId: project.id }),
        client.command<ModelCapabilities>('capability.models'),
      ]);
      store.setComposerControl(null); store.setChatOrigin(page === 'home' ? 'home' : 'sessions'); store.setSession(null); store.setMessages([]); store.setPermission(defaults.permissionMode);
      store.setThinking(defaults.thinkingLevel); store.setModel(defaults.model ?? '');
      store.setModels(capabilities); store.setPage('chat'); store.setMintStatus(''); store.setBackgroundShells([]); store.setBackgroundAgents([]);
    } catch (e) { fail(e); }
  }, [client, fail, page, project, store]);

  const send = useCallback(async () => {
    if (!client || !project || !draft.trim()) return;
    const text = draft.trim();
    store.setDraft('');
    store.setMintStatus('等待模型响应…');
    store.setMessages((current) => prependMessage(current, { id: `local-${Date.now()}`, role: 'user', text }));
    try {
      if (session && running) {
        await client.command('session.steer', { projectId: project.id, sessionId: session.sessionId, data: { text } });
      } else {
        const result = await client.command<{ sessionId: string }>('session.send', {
          projectId: project.id, sessionId: session?.sessionId,
          data: { text, permissionMode: permission, thinkingLevel: thinking,
            ...(model ? { model } : {}), ...(provider ? { provider } : {}) },
        });
        if (!session) {
          const created = { sessionId: result.sessionId, title: text.slice(0, 30), createdAt: Date.now(), updatedAt: Date.now() };
          store.setSession(created);
          store.setSessions((current) => current.some((item) => item.sessionId === result.sessionId) ? current : [created, ...current]);
        }
        store.setRunning(true);
      }
    } catch (e) { store.setMintStatus(''); fail(e); }
  }, [client, draft, fail, model, permission, project, provider, running, session, store, thinking]);

  const stop = useCallback(async () => {
    if (!client || !project || !session) return;
    try {
      await client.command('session.abort', { projectId: project.id, sessionId: session.sessionId });
      store.setRunning(false); store.setMintStatus('');
    } catch (e) { fail(e); }
  }, [client, fail, project, session, store]);

  const setRemoteSetting = useCallback(async (kind: 'permission' | 'thinking' | 'model', value: string, modelProvider?: string) => {
    if (kind === 'permission') store.setPermission(value as PermissionMode);
    if (kind === 'thinking') store.setThinking(value);
    if (kind === 'model') { store.setModel(value); store.setProvider(modelProvider); }
    if (!client || !project || !session) return;
    try {
      const command = kind === 'permission' ? 'session.setPermission' : kind === 'thinking' ? 'session.setThinking' : 'session.setModel';
      const data = kind === 'permission' ? { mode: value } : kind === 'thinking' ? { level: value } : { model: value, provider: modelProvider };
      await client.command(command, { projectId: project.id, sessionId: session.sessionId, data });
    } catch (e) { fail(e); }
  }, [client, fail, project, session, store]);

  const answerAsk = useCallback(async () => {
    if (!client || !project || !session || !pendingAsk) return;
    try {
      await client.command('session.answerAsk', { projectId: project.id, sessionId: session.sessionId,
        data: { requestId: pendingAsk.requestId, answers: pendingAsk.questions.map((question) => ({
          questionId: question.id, values: [askAnswers[question.id] ?? ''],
        })) } });
      store.setPendingAsk(null); store.setAskAnswers({});
    } catch (e) { fail(e); }
  }, [askAnswers, client, fail, pendingAsk, project, session, store]);

  const renameSession = useCallback(async () => {
    const target = menuSession ?? session;
    if (!client || !project || !target || !renameTitle.trim()) return;
    try {
      await client.command('session.rename', { projectId: project.id, sessionId: target.sessionId, data: { title: renameTitle.trim() } });
      const renamed = { ...target, title: renameTitle.trim() };
      store.setSessions((current) => current.map((item) => item.sessionId === target.sessionId ? renamed : item));
      if (session?.sessionId === target.sessionId) store.setSession(renamed);
      store.setMenuSession(renamed);
    } catch (e) { fail(e); }
  }, [client, fail, menuSession, project, renameTitle, session, store]);

  const setPinned = useCallback(async (pinned: boolean) => {
    const target = menuSession ?? session;
    if (!client || !project || !target) return;
    try {
      await client.command('session.pin', { projectId: project.id, sessionId: target.sessionId, data: { pinned } });
      const updated = { ...target, pinnedAt: pinned ? Date.now() : undefined };
      store.setSessions((current) => current.map((item) => item.sessionId === target.sessionId ? updated : item));
      if (session?.sessionId === target.sessionId) store.setSession(updated);
      store.setMenuSession(updated);
    } catch (e) { fail(e); }
  }, [client, fail, menuSession, project, session, store]);

  const archiveCurrent = useCallback((archived: boolean) => {
    const target = menuSession ?? session;
    if (!client || !project || !target) return;
    const perform = () => void client.command('session.archive', {
      projectId: project.id, sessionId: target.sessionId, data: { archived },
    }).then(() => { store.setSettingsOpen(false); store.setMenuSession(null); void refreshSessions(project); }).catch(fail);
    if (!archived) { perform(); return; }
    Alert.alert('归档会话？', target.title, [{ text: '取消', style: 'cancel' }, {
      text: '归档', style: 'destructive', onPress: perform,
    }]);
  }, [client, fail, menuSession, project, refreshSessions, session, store]);

  return { openSession, startNewSession, send, stop, setRemoteSetting, answerAsk, renameSession, setPinned, archiveCurrent };
}
