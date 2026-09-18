import type { DisplayToolBlock } from './messages';

/** 流式期间的进度文案（工具名 → 中文动作词） */
export function toolStatus(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized === 'read' || normalized === 'glob') return '正在读取文件';
  if (normalized === 'write') return '正在写入文件';
  if (normalized === 'edit') return '正在编辑文件';
  if (normalized === 'grep') return '正在搜索内容';
  if (normalized === 'bash') return '正在执行命令';
  if (normalized === 'task') return '正在派遣 Agent';
  if (normalized === 'webfetch') return '正在获取网页';
  if (normalized === 'websearch') return '正在联网搜索';
  if (normalized === 'use_skill' || normalized.startsWith('skill__')) return '正在加载技能';
  if (normalized.startsWith('mcp__')) return '正在调用外部工具';
  return '正在处理';
}

const TOOL_LABELS: Record<string, string> = {
  bash: '终端', read: '读取', write: '写入', edit: '编辑', glob: '查找文件', grep: '搜索',
  task: 'Agent', webfetch: '获取网页', websearch: '联网搜索', use_skill: '技能',
};

/** 工具卡标题行文案：动作词 + 关键参数（命令 / 文件 / 查询词） */
export function toolDisplay(tool: DisplayToolBlock): string {
  const label = TOOL_LABELS[tool.name.toLowerCase()] ?? (tool.name.startsWith('mcp__') ? '外部工具' : tool.name);
  const input = tool.input ?? {};
  const detail = input.command ?? input.file_path ?? input.path ?? input.query ?? input.url ?? input.description;
  return typeof detail === 'string' && detail.trim() ? `${label} · ${detail.trim()}` : label;
}

/** 系统消息 kind → 标签（与电脑端 customType 语义对应） */
export const SYSTEM_LABELS: Record<string, string> = {
  delegation: 'SubAgent', shell: '后台命令', 'project-created': '项目初始化',
  'direct-create': '直接创建', flow: '流程指令', handoff: '会话交接',
  summary: '上下文摘要', learn: '经验沉淀', system: '系统消息', error: '运行错误',
};
