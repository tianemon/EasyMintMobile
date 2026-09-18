import type { OpenProject, SessionListItem } from './protocol/types';

/** 页面路由（App 根状态） */
export type Page = 'home' | 'scanner' | 'projects' | 'sessions' | 'chat';

/** 与电脑端的连接状态（RemoteClient.onStatus 上报） */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/** 首页「项目 + 会话」组合 */
export type HomeSession = { project: OpenProject; session: SessionListItem };

/** 上下文用量（agent:context-usage 事件） */
export type ContextUsage = { percent: number | null; maxTokens?: number };

/** 输入卡工具菜单当前展开的控制项（attachment 为回形针的图片/文档菜单） */
export type ComposerControl = 'model' | 'permission' | 'thinking' | 'attachment' | null;
