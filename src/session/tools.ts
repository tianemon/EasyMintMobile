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

/**
 * 工具名 → 动作词。**整表镜像桌面端 ChatBlocks.tsx 的 TOOL_LABELS**（同顺序、同用词），
 * 手机端只补 PC 表里还没有、但实际会话会出现的那几个——两边用词不一致时以 PC 为准。
 */
const TOOL_LABELS: Record<string, string> = {
  bash: '命令', edit: '编辑', read: '查看', write: '编写', grep: '搜索文件',
  find: '查找文件', ls: '列出目录', powershell: 'PowerShell',
  task: '派遣 Agent', create_agent_template: '创建模板', list_agents: '查看 Agent',
  read_agent_log: '读取日志', stop_agent: '停止 Agent',
  use_skill: '加载技能', manage_skill: '管理技能', learn: '沉淀经验',
  search_experiences: '搜索经验', retire_experiences: '退役经验', import_skill: '导入', import_mcp_server: '导入',
  show_confirm_dev: '确认开发', refresh_tasks: '刷新任务',
  set_task_status: '更新任务', show_prototype: '预览原型',
  list_issues: '查看 Issue', set_issue_status: '更新 Issue',
  web_fetch: '抓取网页', web_search: '搜索网页',
  todo_write: '更新步骤', todo_user: '用户待办',
  ask_user: '提问', describe_image: '查看图片',
  // 以下为手机端补充（PC 表尚未收录，缺了会退回「工具」）
  stop_shell: '停止命令', install_dependency: '安装依赖',
};

/** 工具卡标题行文案：动作词 + 关键参数（命令 / 文件 / 查询词） */
export function toolDisplay(tool: DisplayToolBlock): string {
  const name = tool.name.toLowerCase();
  // 与 PC 同口径：未收录的工具按 MCP / 工具 两类退化，不直接显示英文名
  const label = TOOL_LABELS[name] ?? (name.startsWith('mcp__') ? 'MCP' : '工具');
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
