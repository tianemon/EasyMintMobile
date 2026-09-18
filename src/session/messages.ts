import type { SessionSnapshot } from '../protocol/types';
import type { DraftAttachment } from './attachments';

/** 气泡内的一块内容：正文 / 思考 / 工具调用 */
export type DisplayBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; id: string; name: string; input?: Record<string, unknown>; output: string; state: 'running' | 'done' | 'error' };

export type DisplayToolBlock = Extract<DisplayBlock, { kind: 'tool' }>;

/** 消息流里的一条消息（快照重建与流式事件共用同一模型） */
export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  blocks?: DisplayBlock[];
  streaming?: boolean;
  systemKind?: string;
  attachments?: DraftAttachment[];
};

/**
 * Pi 会把同一回合的「思考 → 工具 → 工具 → 正文」拆成多条 assistant 记录。
 * 桌面端按回合显示在同一气泡；手机端也在渲染前合并，避免每个工具都叠加一层气泡内边距和行距。
 * 输入为最新在前，块内容仍需保持时间正序。
 */
export function mergeAssistantRuns(list: DisplayMessage[]): DisplayMessage[] {
  const merged: DisplayMessage[] = [];
  for (const message of list) {
    const latest = merged[merged.length - 1];
    if (message.role === 'assistant' && latest?.role === 'assistant') {
      merged[merged.length - 1] = {
        ...latest,
        id: `${latest.id}+${message.id}`,
        blocks: [...(message.blocks ?? []), ...(latest.blocks ?? [])],
        streaming: !!latest.streaming || !!message.streaming,
      };
    } else merged.push(message);
  }
  return merged;
}

/** 新消息插到列表头部（inverted 列表：最新在前） */
export function prependMessage(list: DisplayMessage[], message: DisplayMessage): DisplayMessage[] {
  return [message, ...list];
}

/**
 * 按 id 就地替换消息，未命中的消息保持原对象引用。
 * 「未变化的消息引用不变」是渲染隔离的前提——MessageRow 的 memo 靠它跳过非流式行，
 * 流式帧只换来流式的那一条。
 */
export function upsertMessage(list: DisplayMessage[], message: DisplayMessage): DisplayMessage[] {
  const index = list.findIndex((item) => item.id === message.id);
  if (index < 0) return prependMessage(list, message);
  return list.map((item, i) => i === index ? message : item);
}

/**
 * 把指定工具块标为完成。只有包含该工具块的消息才换新对象，其余消息保持原引用
 * （流式期间 tool_done 很密集，整列表换代会让所有行都重渲染）。
 */
export function markToolDone(list: DisplayMessage[], toolId: string): DisplayMessage[] {
  let touched = false;
  const next = list.map((item) => {
    const blocks = item.blocks;
    if (!blocks?.some((block) => block.kind === 'tool' && block.id === toolId && block.state !== 'done')) return item;
    touched = true;
    return { ...item, blocks: blocks.map((block) => block.kind === 'tool' && block.id === toolId ? { ...block, state: 'done' as const } : block) };
  });
  return touched ? next : list;
}

/** 把未知值收窄成可索引对象（协议字段全是 unknown） */
export function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

export function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const row = object(item);
      return typeof row.text === 'string' ? row.text : contentText(row.content);
    }).filter(Boolean).join('\n');
  }
  const row = object(value);
  if ('content' in row) return contentText(row.content);
  return typeof row.text === 'string' ? row.text : '';
}

export function contentBlocks(value: unknown): DisplayBlock[] {
  const content = Array.isArray(value) ? value : Array.isArray(object(value).content) ? object(value).content as unknown[] : [];
  const blocks: DisplayBlock[] = [];
  content.forEach((item) => {
    const row = object(item);
    if (row.type === 'text' && typeof row.text === 'string' && row.text) blocks.push({ kind: 'text', text: row.text });
    else if (row.type === 'thinking' && (typeof row.thinking === 'string' || typeof row.text === 'string')) {
      blocks.push({ kind: 'thinking', text: String(row.thinking ?? row.text) });
    } else if (row.type === 'tool_use') {
      blocks.push({ kind: 'tool', id: String(row.id ?? ''), name: String(row.name ?? '工具'), input: object(row.input), output: '', state: 'running' });
    } else if (row.type === 'tool_result') {
      blocks.push({ kind: 'tool', id: String(row.tool_use_id ?? row.id ?? ''), name: String(row.name ?? '工具'), output: contentText(row.content), state: row.is_error ? 'error' : 'done' });
    }
  });
  return blocks;
}

/**
 * 把电脑端下发的会话快照还原成消息流（最新在前），toolResult 回填到上一条 assistant 的对应工具块。
 * 输出顺序与 MessageList 一致，App 不再每帧 reverse。
 */
export function snapshotMessages(snapshot: SessionSnapshot): DisplayMessage[] {
  const messages: DisplayMessage[] = [];
  snapshot.messages.forEach((entry) => {
    const message = object(entry.message);
    if (entry.type === 'user') {
      const text = contentText(message.content ?? entry.message);
      if (!text) return;
      const details = object(message.details);
      messages.push({ id: entry.uuid, role: message.customType === 'system_message' ? 'system' : 'user', text,
        systemKind: message.customType === 'system_message' ? String(details.kind ?? 'system') : undefined });
      return;
    }
    if (entry.type === 'assistant') {
      const blocks = contentBlocks(message.content);
      if (blocks.length) messages.push({ id: entry.uuid, role: 'assistant', blocks, streaming: false });
      return;
    }
    if (entry.type === 'toolResult') {
      const toolId = String(message.toolCallId ?? '');
      const result = contentText(message.content);
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const target = messages[i];
        if (target?.role !== 'assistant') continue;
        const tool = target.blocks?.find((block) => block.kind === 'tool' && (!toolId || block.id === toolId));
        if (tool?.kind === 'tool') { tool.output = result; tool.state = message.isError ? 'error' : 'done'; break; }
      }
    }
  });
  return messages.reverse();
}
