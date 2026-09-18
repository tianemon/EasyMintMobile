import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { RemoteClient } from '../connection/remote-client';
import type {
  BackgroundAgent, BackgroundShell, OpenProject, PendingAsk, PermissionMode,
  RemoteEvent, SessionListItem,
} from '../protocol/types';
import type { ContextUsage, Page } from '../types';
import { contentBlocks, contentText, markToolDone, object, prependMessage, upsertMessage } from './messages';
import type { DisplayMessage } from './messages';
import { createStreamFrameQueue, scheduleOnNextFrame } from './stream-frames';
import { THINKING_ORDER } from './thinking';
import { toolStatus } from './tools';

/** 事件归并要写入的会话状态集合（setter 由 App 提供，标识稳定） */
export type RemoteEventsStore = {
  setMessages: Dispatch<SetStateAction<DisplayMessage[]>>;
  setRunning: (value: boolean) => void;
  setMintStatus: (value: string) => void;
  setBackgroundShells: Dispatch<SetStateAction<BackgroundShell[]>>;
  setBackgroundAgents: Dispatch<SetStateAction<BackgroundAgent[]>>;
  setContextUsage: (value: ContextUsage) => void;
  setPendingAsk: (value: PendingAsk | null) => void;
  setAskAnswers: (value: Record<string, string>) => void;
  setModel: (value: string) => void;
  setProvider: (value: string | undefined) => void;
  setThinking: (value: string) => void;
  setPermission: (value: PermissionMode) => void;
  setThinkingOptions: (value: string[]) => void;
};

export type RemoteEventsOptions = {
  client: RemoteClient | null;
  /** 本机设备 id，用于过滤自己发出的 user_message 回显 */
  deviceId: string | undefined;
  page: Page;
  project: OpenProject | null;
  session: SessionListItem | null;
  refreshHome: () => void;
  refreshProjects: () => void;
  refreshSessions: (project: OpenProject) => void;
  store: RemoteEventsStore;
};

/**
 * 把电脑端推送的远程事件归并进会话状态。
 * 流式消息按 runId 复用同一条消息（streamMessageId），避免每个增量帧都新建气泡；
 * 中间帧先按下一帧边界合并，见 stream-frames.ts。
 */
export function useRemoteEvents(options: RemoteEventsOptions): void {
  const { client, deviceId, page, project, session, refreshHome, refreshProjects, refreshSessions, store } = options;
  const streamMessageId = useRef<string | null>(null);

  useEffect(() => {
    if (!client) return;

    /** 应用一帧流式快照：message_start 与 message 共用（streaming 决定「还在流式」标记） */
    const applyStreamMessage = (data: Record<string, unknown>, streaming: boolean): void => {
      if (!Array.isArray(data.blocks)) return;
      const blocks = contentBlocks(data.blocks);
      if (!blocks.length) return;
      const id = streamMessageId.current ?? `stream-${String(data.runId ?? 'run')}-${Date.now()}`;
      streamMessageId.current = id;
      store.setMintStatus(streaming && blocks[blocks.length - 1]?.kind === 'thinking' ? '正在思考…' : '');
      store.setMessages((current) => upsertMessage(current, { id, role: 'assistant', blocks, streaming }));
    };

    // 中间帧只在下一帧边界应用最后一帧（累计全文快照语义，中间态必被覆盖）
    const frames = createStreamFrameQueue<Record<string, unknown>>((data) => applyStreamMessage(data, true), scheduleOnNextFrame);

    const off = client.onEvent((event: RemoteEvent, envelope) => {
      const data = object(event.data);
      if (event.channel === 'project:open-windows-changed') {
        if (page === 'home') refreshHome();
        else if (page === 'projects') refreshProjects();
      }
      if (event.channel === 'session:list-changed' && project && envelope.projectId === project.id) {
        if (page === 'home') refreshHome();
        else if (page === 'sessions') refreshSessions(project);
      }
      if (event.channel === 'agent:shell-count' && Array.isArray(event.data)) {
        store.setBackgroundShells((event.data as BackgroundShell[]).filter((item) => !item.sessionId || item.sessionId === session?.sessionId));
        return;
      }
      if (event.channel === 'agent:delegation-count') {
        const tasks = Array.isArray(data.tasks) ? data.tasks as BackgroundAgent[] : [];
        store.setBackgroundAgents(tasks.filter((item) => !item.sessionId || item.sessionId === session?.sessionId));
        return;
      }
      if (!session || envelope.sessionId !== session.sessionId) return;
      if (event.channel === 'agent:shell-output') {
        const id = String(data.id ?? '');
        const chunk = typeof data.chunk === 'string' ? data.chunk : '';
        store.setBackgroundShells((current) => current.map((item) => item.id === id ? { ...item, output: `${item.output ?? ''}${chunk}`.slice(-12_000) } : item));
        return;
      }
      if (event.channel === 'agent:delegation-init') {
        const delegationId = String(data.delegationId ?? '');
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        store.setBackgroundAgents((current) => [
          ...current.filter((item) => item.delegationId !== delegationId),
          ...tasks.map((item) => {
            const task = object(item);
            return { delegationId, index: Number(task.index ?? 0), title: String(task.title ?? task.task ?? 'Agent 任务'), status: 'pending' as const };
          }),
        ]);
        return;
      }
      if (event.channel === 'agent:delegation-progress') {
        const delegationId = String(data.delegationId ?? '');
        const progress = object(data.progress);
        const index = Number(progress.index ?? 0);
        const status = String(progress.status ?? 'running') as BackgroundAgent['status'];
        store.setBackgroundAgents((current) => {
          const found = current.some((item) => item.delegationId === delegationId && item.index === index);
          const updated = current.map((item) => item.delegationId === delegationId && item.index === index
            ? { ...item, status, currentTool: typeof progress.currentTool === 'string' ? progress.currentTool : item.currentTool } : item);
          if (status === 'completed' || status === 'failed' || status === 'aborted') return updated.filter((item) => item.delegationId !== delegationId || item.index !== index);
          return found ? updated : [...updated, { delegationId, index, title: String(progress.description ?? progress.task ?? 'Agent 任务'), status,
            currentTool: typeof progress.currentTool === 'string' ? progress.currentTool : undefined }];
        });
        return;
      }
      if (event.channel === 'agent:context-usage') {
        const percentage = typeof data.percentage === 'number' ? data.percentage : null;
        store.setContextUsage({ percent: percentage, maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : undefined });
        return;
      }
      if (event.channel === 'agent:ask-request') { store.setPendingAsk(data as unknown as PendingAsk); store.setAskAnswers({}); }
      if (event.channel === 'agent:ask-closed') store.setPendingAsk(null);
      if (event.channel === 'agent:remote-settings-changed') {
        if (typeof data.model === 'string') store.setModel(data.model);
        if (typeof data.provider === 'string') store.setProvider(data.provider);
        if (typeof data.thinkingLevel === 'string') store.setThinking(data.thinkingLevel);
        if (data.permissionMode === 'readonly' || data.permissionMode === 'standard' || data.permissionMode === 'full') store.setPermission(data.permissionMode);
      }
      if (event.channel === 'agent:thinking-level-changed') {
        if (typeof data.level === 'string') store.setThinking(data.level);
        if (Array.isArray(data.available)) {
          const available = data.available.filter((level): level is string => typeof level === 'string');
          store.setThinkingOptions(THINKING_ORDER.filter((level) => available.includes(level)));
        }
        return;
      }
      if (event.channel !== 'agent:stream') return;
      const type = data.type;
      // 唯一的可合并帧：同一条消息的流式中间帧（partial !== false）
      if (type === 'message' && data.partial !== false) {
        frames.defer(String(data.runId ?? 'run'), data);
        return;
      }
      // 其余流式事件都是边界/终态信号，不可被窗口吞掉：先把待应用帧落地，保证应用顺序 = 到达顺序
      frames.flush();
      if (type === 'turn_start') { store.setRunning(true); store.setMintStatus('等待模型响应…'); streamMessageId.current = null; }
      else if (type === 'turn_end' || type === 'error') {
        store.setRunning(false); store.setMintStatus(''); streamMessageId.current = null;
        store.setMessages((current) => current.map((item) => item.streaming ? { ...item, streaming: false } : item));
        if (type === 'error') store.setMessages((current) => prependMessage(current, {
          id: `error-${Date.now()}`, role: 'system', text: String(data.message ?? '任务执行失败'), systemKind: 'error',
        }));
      }
      else if (type === 'user_message' && typeof data.text === 'string') {
        if (object(data.details).sourceDeviceId === deviceId) return;
        const id = String(object(data.details).messageId ?? `user-${Date.now()}`);
        store.setMessages((current) => current.some((item) => item.id === id)
          ? current : prependMessage(current, { id, role: 'user', text: data.text as string }));
      } else if (type === 'message_start') {
        streamMessageId.current = null;
        applyStreamMessage(data, true);
      } else if (type === 'message') {
        // partial === false 的结束帧：立即应用，这就是最终内容
        applyStreamMessage(data, false);
      } else if (type === 'custom_event' && typeof data.text === 'string') {
        store.setMessages((current) => prependMessage(current, { id: `system-${Date.now()}`, role: 'system', text: data.text as string,
          systemKind: String(object(data.details).kind ?? 'system') }));
      } else if (type === 'tool_progress') {
        const name = String(data.toolName ?? '工具调用');
        store.setMintStatus(toolStatus(name));
        const toolId = String(data.toolCallId ?? name);
        const messageId = streamMessageId.current ?? `stream-${String(data.runId ?? 'run')}-${Date.now()}`;
        streamMessageId.current = messageId;
        store.setMessages((current) => {
          const delta = typeof data.deltaText === 'string' ? data.deltaText : '';
          const index = current.findIndex((item) => item.id === messageId);
          if (index < 0) return prependMessage(current, { id: messageId, role: 'assistant', streaming: true, blocks: [{ kind: 'tool', id: toolId, name, output: delta, state: 'running' }] });
          return current.map((item, i) => {
            if (i !== index) return item;
            const blocks = [...(item.blocks ?? [])];
            const toolIndex = blocks.findIndex((block) => block.kind === 'tool' && block.id === toolId);
            if (toolIndex < 0) blocks.push({ kind: 'tool', id: toolId, name, output: delta, state: 'running' });
            else {
              const tool = blocks[toolIndex];
              if (tool?.kind === 'tool') blocks[toolIndex] = { ...tool, output: `${tool.output}${delta}`.slice(-12_000), state: 'running' };
            }
            return { ...item, blocks, streaming: true };
          });
        });
      } else if (type === 'tool_done') {
        store.setMintStatus('正在处理…');
        const toolId = String(data.toolCallId ?? data.toolName ?? 'running');
        store.setMessages((current) => markToolDone(current, toolId));
      } else if (type === 'tool_result') {
        store.setMintStatus('正在处理…');
        const name = String(data.toolName ?? '工具调用');
        const toolId = String(data.toolCallId ?? name);
        const output = contentText(data.content);
        const messageId = streamMessageId.current ?? `stream-${String(data.runId ?? 'run')}-${Date.now()}`;
        streamMessageId.current = messageId;
        store.setMessages((current) => {
          const index = current.findIndex((item) => item.id === messageId);
          const state = data.isError ? 'error' as const : 'done' as const;
          if (index < 0) return prependMessage(current, { id: messageId, role: 'assistant', streaming: true, blocks: [{ kind: 'tool', id: toolId, name, output, state }] });
          return current.map((item, i) => {
            if (i !== index) return item;
            const blocks = [...(item.blocks ?? [])];
            const toolIndex = blocks.findIndex((block) => block.kind === 'tool' && block.id === toolId);
            if (toolIndex < 0) blocks.push({ kind: 'tool', id: toolId, name, output, state });
            else { const tool = blocks[toolIndex]; if (tool?.kind === 'tool') blocks[toolIndex] = { ...tool, name, output: output || tool.output, state }; }
            return { ...item, blocks, streaming: true };
          });
        });
      }
    });

    return () => {
      off();
      // 订阅重建/卸载时丢弃待应用帧，避免把上一个会话的帧写进新会话（后续帧仍是全量快照，内容会收敛）
      frames.clear();
    };
    // setter 由 useState 提供、标识稳定，无需进依赖；store 对象每次渲染都是新引用，故按字段解构传递。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, deviceId, page, project, session, refreshHome, refreshProjects, refreshSessions]);
}
