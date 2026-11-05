// Run: npm test
// 桌面端 2026-11 跟进：状态类帧的文案映射 + 工具名清单镜像
//
// 这些**字面量**是桌面端 `app/shared/i18n/locales/zh-CN.json` 里的原文（ui.ChatPanel.* / pi.*），
// 断言里刻意写字面量而不是引用常量：状态栏文案一旦与桌面端跑偏，这里要能红。
import assert from 'node:assert/strict';
import test from 'node:test';
import { droppedSteerText, resolveStatusHint, streamStatusHint, streamSystemNotice, streamingHint } from '../src/session/status-hints.ts';
import { resolveSettingsRevision, SETTINGS_REPLAY_WINDOW_MS } from '../src/session/settings-revision.ts';
import { toolDisplay, toolLabel, toolStatus } from '../src/session/tools.ts';
import { resultError } from '../src/connection/remote-result.ts';
import { classifyApiError } from '../src/session/api-errors.ts';
import { toolActivityIcon } from '../src/session/tools.ts';

test('压缩类帧映射到状态栏文案，结束帧清空', () => {
  // ui.ChatPanel.contextNeedsCompactionCompacting（手机端没有手动压缩入口，统一用自动那条）
  assert.equal(streamStatusHint('compacting', {}), '检测到上下文需整理，正在整理…');
  // 'compact' 是 agent:context-summarizing 通道的 type 值，不是 agent:stream 帧类型，
  // 不能当成状态帧吞掉（返回 null 才会交给后续业务分支）
  assert.equal(streamStatusHint('compact', {}), null);
  // compacted 不是纯状态帧：桌面端 agent-service.ts:2835 给它带 text + details.kind="summary"，
  // ChatPanel.tsx:1822 当系统消息插入。返回 null 才能落到 streamSystemNotice，不能被吞。
  assert.equal(streamStatusHint('compacted', {}), null);
  assert.equal(streamStatusHint('compaction_finished', {}), '');
});

test('流式块类型 → 状态栏文案（正文期间不得为空）', () => {
  assert.equal(streamingHint('text'), '正在回复');          // pi.responding
  assert.equal(streamingHint('thinking'), '正在思考...');   // ui.ChatPanel.thinking
  assert.equal(streamingHint('tool'), '正在处理...');       // ui.ChatPanel.processing
  // 未知块类型也不能给空串：空串会让状态栏整条消失
  assert.equal(streamingHint(undefined), '正在处理...');
});

test('waiting_user 按 waiting 布尔值给/清状态', () => {
  // pi.waitingUser 原文不带省略号
  assert.equal(streamStatusHint('waiting_user', { waiting: true }), '等待你的回复');
  assert.equal(streamStatusHint('waiting_user', { waiting: false }), '');
});

test('retry_state 的 start 带次数与退避秒数，end 按成功与否回态', () => {
  assert.equal(
    streamStatusHint('retry_state', { retryPhase: 'start', retryAttempt: 2, retryMaxAttempts: 3, retryDelayMs: 4000 }),
    '正在重试 2/3（约 4 秒后）',
  );
  // 0 秒退避不写「约 0 秒后」——那句没有信息量（桌面端 chat-utils.ts 同口径）
  assert.equal(
    streamStatusHint('retry_state', { retryPhase: 'start', retryAttempt: 1, retryMaxAttempts: 3, retryDelayMs: 0 }),
    '正在重试 1/3',
  );
  assert.equal(streamStatusHint('retry_state', { retryPhase: 'end', retrySuccess: true }), '正在处理...');
  assert.equal(streamStatusHint('retry_state', { retryPhase: 'end', retrySuccess: false }), '');
});

test('业务帧返回 null，不能被状态帧分支吞掉', () => {
  for (const type of ['turn_start', 'turn_end', 'message', 'message_start', 'tool_progress', 'tool_done', 'error', 'user_message', 'custom_event']) {
    assert.equal(streamStatusHint(type, { blocks: [] }), null, `${type} 不该走状态栏`);
  }
});

test('被打断丢弃的插话给出条数与内容摘要', () => {
  const text = droppedSteerText(['继续', '再改一下']);
  assert.match(text, /2 条/);
  assert.match(text, /继续/);
  assert.match(text, /已丢弃/);
});

test('没有可提示的丢弃内容时返回 null，不插空气泡', () => {
  assert.equal(droppedSteerText(undefined), null);
  assert.equal(droppedSteerText(null), null);
  assert.equal(droppedSteerText('oops'), null);
  assert.equal(droppedSteerText([]), null);
  assert.equal(droppedSteerText(['   ', 42]), null);
});

test('桌面端新增的 6 个工具名不再退化成「工具」', () => {
  const expected = {
    generate_image: '生成图像', codemode: '运行脚本', tool_search: '查找工具',
    list_mcp_resources: '列出资源', list_mcp_resource_templates: '列出资源模板', read_mcp_resource: '读取资源',
  };
  for (const [name, label] of Object.entries(expected)) {
    assert.equal(toolLabel(name), label);
    assert.notEqual(toolLabel(name), '工具');
  }
  assert.equal(toolLabel('generate_image'.toUpperCase()), '生成图像'); // 归一化
});

test('手机端有意补充的工具名仍保留，进度文案不退回「正在处理」', () => {
  assert.equal(toolLabel('stop_shell'), '停止命令');
  assert.equal(toolLabel('install_dependency'), '安装依赖');
  assert.equal(toolStatus('codemode'), '正在运行脚本');
  assert.equal(toolStatus('generate_image'), '正在生成图像');
  assert.equal(toolStatus('read_mcp_resource'), '正在读取外部资源');
});

test('命令失败时留住 error.code，ABORT_TIMEOUT 才能被精确识别', () => {
  const error = resultError({ ok: false, error: { code: 'ABORT_TIMEOUT', message: '停止未确认完成，请稍后重试' } });
  assert.ok(error);
  assert.equal(error.code, 'ABORT_TIMEOUT');
  assert.match(error.message, /停止未确认/);
});

test('成功结果不产生错误；没有 code 时只保留 message', () => {
  assert.equal(resultError({ ok: true, data: { sessionId: 's' } }), null);
  const error = resultError({ ok: false, error: { message: '命令失败' } });
  assert.ok(error);
  assert.equal(error.code, undefined);
  assert.equal(error.message, '命令失败');
  assert.equal(resultError({}).message, '命令执行失败');
});

test('compacted 帧落成摘要卡，custom_event 保持原口径', () => {
  const summary = streamSystemNotice('compacted', {
    text: '【上下文摘要（本次压缩生成，原文）】\n\n正文', details: { kind: 'summary' },
  });
  assert.deepEqual(summary, {
    text: '【上下文摘要（本次压缩生成，原文）】\n\n正文', systemKind: 'summary',
  });
  assert.deepEqual(streamSystemNotice('custom_event', { text: '后台命令完成', details: { kind: 'shell' } }),
    { text: '后台命令完成', systemKind: 'shell' });
  assert.deepEqual(streamSystemNotice('custom_event', { text: '无 details' }),
    { text: '无 details', systemKind: 'system' });
});

test('业务帧与空文本不产生系统通知（不插空气泡）', () => {
  for (const type of ['turn_start', 'turn_end', 'message', 'tool_progress', 'compaction_finished', 'queue_dropped']) {
    assert.equal(streamSystemNotice(type, { text: 'x' }), null, `${type} 不是系统通知帧`);
  }
  assert.equal(streamSystemNotice('compacted', { text: '   ' }), null);
  assert.equal(streamSystemNotice('compacted', { summary: '只有 summary 没有 text' }), null);
});

test('清空状态栏时若回合仍在跑，回落到「正在处理...」', () => {
  assert.equal(resolveStatusHint(true, ''), '正在处理...');
  assert.equal(resolveStatusHint(false, ''), '');
  assert.equal(resolveStatusHint(true, '正在重试 1/3'), '正在重试 1/3');
});

test('revision 只拦近距重放；时钟回拨/缓存重建要放行并重置游标', () => {
  const base = Date.now();
  assert.deepEqual(resolveSettingsRevision(undefined, base), { stale: false, cursor: base });
  assert.deepEqual(resolveSettingsRevision(base, base + 10), { stale: false, cursor: base + 10 });
  assert.deepEqual(resolveSettingsRevision(base + 10, base + 10), { stale: false, cursor: base + 10 }); // 幂等重放
  assert.equal(resolveSettingsRevision(base + 10, base).stale, true); // 近距乱序
  const rolledBack = base - 10 * SETTINGS_REPLAY_WINDOW_MS;
  assert.deepEqual(resolveSettingsRevision(base + 10, rolledBack), { stale: false, cursor: rolledBack });
  // 没有 revision（老版本桌面端 / readCache() 返回 null）→ 不定序
  assert.deepEqual(resolveSettingsRevision(base + 10, NaN), { stale: false, cursor: base + 10 });
});

test('MCP 工具名连续分隔符不产生空段（与 PC 同款）', () => {
  const display = (name) => toolDisplay({
    kind: 'tool', id: 't', name: 'call_mcp_tool', output: '', state: 'done', input: { name },
  });
  assert.equal(display('mcp__srv__tool'), 'MCP · srv / tool');
  assert.equal(display('mcp__srv____tool'), 'MCP · srv / tool');
  assert.equal(display('mcp____srv__tool'), 'MCP · srv / tool');
});

test('上游错误原文归一化成桌面端那几句话（app/shared/api-errors.ts 同表）', () => {
  // 限流 / 服务繁忙是 warn 档（可自愈），auth / 额度是 error 档（需用户处理）
  assert.deepEqual(classifyApiError('Error: 429 Too Many Requests'),
    { code: 'rate_limit', tone: 'warn', message: '请求过于频繁，稍后再试' });
  const busy = classifyApiError('503 Service Unavailable');
  assert.equal(busy.code, 'service_unavailable');
  assert.equal(busy.tone, 'warn');
  assert.equal(busy.message, 'AI 服务暂时不可用');
  assert.equal(busy.hint, '稍后再试，或换一个模型/服务商');
  assert.equal(classifyApiError('401 invalid api key').message, '密钥无效或已过期');
  assert.equal(classifyApiError('insufficient_quota').hint, '检查服务商余额或额度');
  // 413 带 kind：桌面端据此出「清理图片」而不是「重试」
  const tooLarge = classifyApiError('413 Request Entity Too Large');
  assert.equal(tooLarge.kind, 'request_too_large');
  assert.equal(tooLarge.hint, '可整理历史图片后重试，或减少本次附件');
  // 用户主动打断不是错误——桌面端靠这个 code 判断「不出卡」
  assert.equal(classifyApiError('This operation was aborted').code, 'stopped');
  // 主进程已归一化成中文的路径靠中文分支命中（一份表，两个方向都能认）
  assert.equal(classifyApiError('对话内容超出模型上限').code, 'context_limit');
  // 未命中：去掉 Error: 前缀与换行、截断，仍要让用户看得懂是哪一步失败
  assert.equal(classifyApiError('Error: something weird happened\n  at stack').message, 'something weird happened');
  assert.equal(classifyApiError('').message, '请求失败');
});

test('状态行图标只由工具名决定（工具进行中要把 Mint 图标换成工具图标）', () => {
  assert.equal(toolActivityIcon('read'), 'read');
  assert.equal(toolActivityIcon('bash'), 'bash');
  assert.equal(toolActivityIcon('grep'), 'grep');
  assert.equal(toolActivityIcon('web_search'), 'web_search');
  assert.equal(toolActivityIcon('mcp__srv__tool'), 'call_mcp_tool');
});
