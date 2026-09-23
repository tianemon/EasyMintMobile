import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { RemoteClient } from '../connection/remote-client';
import type {
  BackgroundAgent, BackgroundShell, OpenProject, PendingAsk, RemoteEvent, SessionListItem,
} from '../protocol/types';
import type { Page } from '../types';
import { contentBlocks, contentText, markToolDone, object, prependMessage, upsertMessage } from './messages';
import type { DisplayMessage } from './messages';
import type { PatchRuntime } from './runtime';
import { createStreamFrameQueue, scheduleOnNextFrame } from './stream-frames';
import { THINKING_ORDER } from './thinking';
import { toolStatus } from './tools';

/**
 * 事件归并要写入的状态。
 *
 * 会话级状态**一律按事件自己的会话 id 落格**（`patchRuntime`），不做「按当前会话过滤」——
 * 过滤依赖可变的「当前会话」，而事件回调、异步快照、用户动作时序交错，任何一条路径的时序差
 * 都会把状态写进别的会话（切换会话时发送按钮/状态文案串会话就是这么来的）。
 */
export type RemoteEventsStore = {
  patchRuntime: PatchRuntime;
  /** 状态文案带按会话去重 */
  setMintStatus: (sessionId: string, value: string) => void;
  /** 后台任务清单是全量的，按会话分组写回 */
  syncBackground: (kind: 'shell' | 'delegation', items: { sessionId?: string }[]) => void;
  /** 后台命令的实时输出块：除了累进会话运行态，再转发给「输出查看页」（它自己维护追加式内容） */
  emitShellChunk: (shellId: string, chunk: string) => void;
};

export type RemoteEventsOptions = {
  client: RemoteClient | null;
  /** 本机设备 id，用于过滤自己发出的 user_message 回显 */
  deviceId: string | undefined;
  page: Page;
  project: OpenProject | null;
  /** 当前显示的会话：重活（正文帧/工具帧）只给它做 */
  session: SessionListItem | null;
  streamMessageIds: RefObject<Record<string, string | null>>;
  refreshHome: () => void;
  refreshProjects: () => void;
  refreshSessions: (project: OpenProject) => void;
  store: RemoteEventsStore;
};

/**
 * 把电脑端推送的远程事件归并进**对应会话**的状态格。
 * 流式消息按 runId 复用同一条消息（每个会话各自记 id），避免每个增量帧都新建气泡；
 * 中间帧先按下一帧边界合并，见 stream-frames.ts。
 */
export function useRemoteEvents(options: RemoteEventsOptions): void {
  const { client, deviceId, page, project, session, streamMessageIds, refreshHome, refreshProjects, refreshSessions, store } = options;

  /**
   * 当前显示什么（会话 / 页面 / 项目）。
   * 一用于列表刷新类事件的页面判断（它们会调 setPage，用旧闭包会把用户从聊天页拽回列表页）；
   * 二用于「重活只给显示的会话做」——PC 端对**项目订阅**也会推 `agent:stream`（见 AGENTS.md），
   * 手机没打开该会话时仍然会收到每帧几千字的全量快照，不拦掉会把 JS 线程吃死（表现为能滑动但点不动）。
   * layout effect 在本帧提交时同步执行，早于任何事件回调。
   */
  const viewRef = useRef<{ sessionId: string | null; page: Page; projectId: string | null }>({
    sessionId: session?.sessionId ?? null, page, projectId: project?.id ?? null,
  });

  useLayoutEffect(() => {
    viewRef.current = { sessionId: session?.sessionId ?? null, page, projectId: project?.id ?? null };
  });

  useEffect(() => {
    if (!client) return;

    /** 应用一帧流式快照：message_start 与 message 共用（streaming 决定「还在流式」标记） */
    const applyStreamMessage = (sessionId: string, data: Record<string, unknown>, streaming: boolean): void => {
      if (!Array.isArray(data.blocks)) return;
      const blocks = contentBlocks(data.blocks);
      if (!blocks.length) return;
      const id = streamMessageIds.current[sessionId] ?? `stream-${String(data.runId ?? 'run')}-${Date.now()}`;
      streamMessageIds.current[sessionId] = id;
      store.setMintStatus(sessionId, streaming && blocks[blocks.length - 1]?.kind === 'thinking' ? '正在思考…' : '');
      store.patchRuntime(sessionId, (current) => ({ messages: upsertMessage(current.messages, { id, role: 'assistant', blocks, streaming }) }));
    };

    // 中间帧只在下一帧边界应用最后一帧（累计全文快照语义，中间态必被覆盖）。
    // 帧里带上投递时刻的会话 id：即使队列里还压着旧帧，也只会落进它自己的会话格。
    const frames = createStreamFrameQueue<{ sessionId: string; frame: Record<string, unknown> }>((pending) => {
      applyStreamMessage(pending.sessionId, pending.frame, true);
    }, scheduleOnNextFrame);

    const off = client.onEvent((event: RemoteEvent, envelope) => {
      const data = object(event.data);
      if (event.channel === 'project:open-windows-changed') {
        if (viewRef.current.page === 'home') refreshHome();
        else if (viewRef.current.page === 'projects') refreshProjects();
      }
      if (event.channel === 'session:list-changed' && viewRef.current.projectId && envelope.projectId === viewRef.current.projectId) {
        // 只有停在列表页才跟着刷新：正看聊天时刷新会把 setPage 拽回列表页
        if (viewRef.current.page === 'home') refreshHome();
        else if (viewRef.current.page === 'sessions' && project) refreshSessions(project);
      }
      // 后台任务清单：载荷是**所有订阅会话**的全量清单，按会话分组写回（只看当前会话会串）
      if (event.channel === 'agent:shell-count' && Array.isArray(event.data)) {
        store.syncBackground('shell', event.data as BackgroundShell[]);
        return;
      }
      if (event.channel === 'agent:delegation-count') {
        store.syncBackground('delegation', Array.isArray(data.tasks) ? data.tasks as BackgroundAgent[] : []);
        return;
      }

      // 以下都是会话级事件：没有会话 id 就无法归属，直接丢弃（宁可不动，也不写错会话）
      const sessionId = envelope.sessionId;
      if (!sessionId) return;

      if (event.channel === 'agent:exit') {
        frames.flush();
        store.setMintStatus(sessionId, '');
        streamMessageIds.current[sessionId] = null;
        store.patchRuntime(sessionId, (current) => ({
          running: false,
          messages: current.messages.map((item) => item.streaming ? { ...item, streaming: false } : item),
        }));
        return;
      }
      if (event.channel === 'agent:shell-output') {
        // 长命令的输出是高频大块：只给当前显示的会话追加，隐藏会话切回时靠快照补齐
        if (sessionId !== viewRef.current.sessionId) return;
        const id = String(data.id ?? '');
        const chunk = typeof data.chunk === 'string' ? data.chunk : '';
        // 输出查看页自己维护追加式内容：先转发实时块（它打开时会先拉日志尾部，直接拼不会重复）
        if (chunk) store.emitShellChunk(id, chunk);
        store.patchRuntime(sessionId, (current) => ({
          backgroundShells: current.backgroundShells.map((item) => item.id === id ? { ...item, output: `${item.output ?? ''}${chunk}`.slice(-12_000) } : item),
        }));
        return;
      }
      if (event.channel === 'agent:delegation-init') {
        const delegationId = String(data.delegationId ?? '');
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        store.patchRuntime(sessionId, (current) => ({
          backgroundAgents: [
            ...current.backgroundAgents.filter((item) => item.delegationId !== delegationId),
            ...tasks.map((item) => {
              const task = object(item);
              return { delegationId, index: Number(task.index ?? 0), title: String(task.title ?? task.task ?? 'Agent 任务'), status: 'pending' as const };
            }),
          ],
        }));
        return;
      }
      if (event.channel === 'agent:delegation-progress') {
        const delegationId = String(data.delegationId ?? '');
        const progress = object(data.progress);
        const index = Number(progress.index ?? 0);
        const status = String(progress.status ?? 'running') as BackgroundAgent['status'];
        store.patchRuntime(sessionId, (current) => {
          const found = current.backgroundAgents.some((item) => item.delegationId === delegationId && item.index === index);
          const updated = current.backgroundAgents.map((item) => item.delegationId === delegationId && item.index === index
            ? { ...item, status, currentTool: typeof progress.currentTool === 'string' ? progress.currentTool : item.currentTool } : item);
          if (status === 'completed' || status === 'failed' || status === 'aborted') {
            return { backgroundAgents: updated.filter((item) => item.delegationId !== delegationId || item.index !== index) };
          }
          return {
            backgroundAgents: found ? updated : [...updated, { delegationId, index, title: String(progress.description ?? progress.task ?? 'Agent 任务'), status,
              currentTool: typeof progress.currentTool === 'string' ? progress.currentTool : undefined }],
          };
        });
        return;
      }
      if (event.channel === 'agent:context-usage') {
        const percentage = typeof data.percentage === 'number' ? data.percentage : null;
        store.patchRuntime(sessionId, { contextUsage: { percent: percentage, maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : undefined } });
        return;
      }
      if (event.channel === 'agent:ask-request') {
        store.patchRuntime(sessionId, { pendingAsk: data as unknown as PendingAsk });
        return;
      }
      if (event.channel === 'agent:ask-closed') {
        store.patchRuntime(sessionId, { pendingAsk: null });
        return;
      }
      if (event.channel === 'agent:remote-settings-changed') {
        store.patchRuntime(sessionId, {
          ...(typeof data.model === 'string' ? { model: data.model } : {}),
          ...(typeof data.provider === 'string' ? { provider: data.provider } : {}),
          ...(typeof data.thinkingLevel === 'string' ? { thinking: data.thinkingLevel } : {}),
          ...(data.permissionMode === 'readonly' || data.permissionMode === 'standard' || data.permissionMode === 'full' ? { permission: data.permissionMode } : {}),
        });
        return;
      }
      if (event.channel === 'agent:thinking-level-changed') {
        const available = Array.isArray(data.available) ? data.available.filter((level): level is string => typeof level === 'string') : null;
        store.patchRuntime(sessionId, {
          ...(typeof data.level === 'string' ? { thinking: data.level } : {}),
          ...(available ? { thinkingOptions: THINKING_ORDER.filter((level) => available.includes(level)) } : {}),
        });
        return;
      }
      if (event.channel !== 'agent:stream') return;
      const type = data.type;
      // 正文字帧/工具帧是高频重活（载荷是全量累计正文）：只给当前显示的会话做。
      // 隐藏会话不是丢数据——切回它时 openSession 会重取快照，内容会收敛。
      if (sessionId !== viewRef.current.sessionId
        && (type === 'message_start' || type === 'message' || type === 'tool_progress' || type === 'tool_done' || type === 'tool_result')) return;
      // 唯一的可合并帧：同一条消息的流式中间帧（partial !== false）
      if (type === 'message' && data.partial !== false) {
        frames.defer(String(data.runId ?? 'run'), { sessionId, frame: data });
        return;
      }
      // 其余流式事件都是边界/终态信号，不可被窗口吞掉：先把待应用帧落地，保证应用顺序 = 到达顺序
      frames.flush();
      if (type === 'turn_start') {
        streamMessageIds.current[sessionId] = null;
        store.patchRuntime(sessionId, { running: true });
        store.setMintStatus(sessionId, '等待模型响应…');
      } else if (type === 'turn_end' || type === 'error') {
        streamMessageIds.current[sessionId] = null;
        store.setMintStatus(sessionId, '');
        store.patchRuntime(sessionId, (current) => ({
          running: false,
          messages: type === 'error'
            ? prependMessage(current.messages.map((item) => item.streaming ? { ...item, streaming: false } : item), {
              id: `error-${Date.now()}`, role: 'system', text: String(data.message ?? '任务执行失败'), systemKind: 'error',
            })
            : current.messages.map((item) => item.streaming ? { ...item, streaming: false } : item),
        }));
      } else if (type === 'user_message' && typeof data.text === 'string') {
        if (object(data.details).sourceDeviceId === deviceId) return;
        const id = String(object(data.details).messageId ?? `user-${Date.now()}`);
        store.patchRuntime(sessionId, (current) => ({
          messages: current.messages.some((item) => item.id === id)
            ? current.messages : prependMessage(current.messages, { id, role: 'user', text: data.text as string }),
        }));
      } else if (type === 'message_start') {
        streamMessageIds.current[sessionId] = null;
        applyStreamMessage(sessionId, data, true);
      } else if (type === 'message') {
        // partial === false 的结束帧：立即应用，这就是最终内容
        applyStreamMessage(sessionId, data, false);
      } else if (type === 'custom_event' && typeof data.text === 'string') {
        store.patchRuntime(sessionId, (current) => ({
          messages: prependMessage(current.messages, { id: `system-${Date.now()}`, role: 'system', text: data.text as string,
            systemKind: String(object(data.details).kind ?? 'system') }),
        }));
      } else if (type === 'tool_progress') {
        const name = String(data.toolName ?? '工具调用');
        store.setMintStatus(sessionId, toolStatus(name));
        const toolId = String(data.toolCallId ?? name);
        // id 在 updater 外算好：updater 可能被 React 重复调用，在里面取 Date.now() 会得到不同的 id
        const messageId = streamMessageIds.current[sessionId] ?? `stream-${String(data.runId ?? 'run')}-${Date.now()}`;
        streamMessageIds.current[sessionId] = messageId;
        store.patchRuntime(sessionId, (current) => {
          const delta = typeof data.deltaText === 'string' ? data.deltaText : '';
          const index = current.messages.findIndex((item) => item.id === messageId);
          if (index < 0) {
            return { messages: prependMessage(current.messages, { id: messageId, role: 'assistant', streaming: true, blocks: [{ kind: 'tool', id: toolId, name, output: delta, state: 'running' }] }) };
          }
          return { messages: current.messages.map((item, i) => {
            if (i !== index) return item;
            const blocks = [...(item.blocks ?? [])];
            const toolIndex = blocks.findIndex((block) => block.kind === 'tool' && block.id === toolId);
            if (toolIndex < 0) blocks.push({ kind: 'tool', id: toolId, name, output: delta, state: 'running' });
            else {
              const tool = blocks[toolIndex];
              if (tool?.kind === 'tool') blocks[toolIndex] = { ...tool, output: `${tool.output}${delta}`.slice(-12_000), state: 'running' };
            }
            return { ...item, blocks, streaming: true };
          }) };
        });
      } else if (type === 'tool_done') {
        store.setMintStatus(sessionId, '正在处理…');
        const toolId = String(data.toolCallId ?? data.toolName ?? 'running');
        store.patchRuntime(sessionId, (current) => ({ messages: markToolDone(current.messages, toolId) }));
      } else if (type === 'tool_result') {
        store.setMintStatus(sessionId, '正在处理…');
        const name = String(data.toolName ?? '工具调用');
        const toolId = String(data.toolCallId ?? name);
        const output = contentText(data.content);
        // 同 tool_progress：id 在 updater 外算好
        const messageId = streamMessageIds.current[sessionId] ?? `stream-${String(data.runId ?? 'run')}-${Date.now()}`;
        streamMessageIds.current[sessionId] = messageId;
        store.patchRuntime(sessionId, (current) => {
          const index = current.messages.findIndex((item) => item.id === messageId);
          const state = data.isError ? 'error' as const : 'done' as const;
          if (index < 0) {
            return { messages: prependMessage(current.messages, { id: messageId, role: 'assistant', streaming: true, blocks: [{ kind: 'tool', id: toolId, name, output, state }] }) };
          }
          return { messages: current.messages.map((item, i) => {
            if (i !== index) return item;
            const blocks = [...(item.blocks ?? [])];
            const toolIndex = blocks.findIndex((block) => block.kind === 'tool' && block.id === toolId);
            if (toolIndex < 0) blocks.push({ kind: 'tool', id: toolId, name, output, state });
            else { const tool = blocks[toolIndex]; if (tool?.kind === 'tool') blocks[toolIndex] = { ...tool, name, output: output || tool.output, state }; }
            return { ...item, blocks, streaming: true };
          }) };
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
