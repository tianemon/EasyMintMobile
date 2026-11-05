// Run: npm test
// 回合结构（分组 / 用时 / 折叠摘要 / 结论抽取）与工具形态（diff、HTML 降级）的纯函数口径。
// 这些断言对应桌面端 chat-turn-presentation.ts / execution-process-model.ts / ChatBlocks.tsx 的行为，
// 桌面端改口径时这里要一起改——两者是镜像关系，不是巧合。
import assert from 'node:assert/strict';
import test from 'node:test';
import { diffStats, numberLines, visibleDiffRange } from '../src/session/diff.ts';
import { nestedCalls, presentationFrom, toolPresentation } from '../src/session/messages.ts';
import { htmlToText } from '../src/components/markdown/parse.ts';
import { describeProcessItem } from '../src/session/tools.ts';
import {
  buildRows, formatTurnDuration, groupByExecution, summarizeProcess, turnDuration, turnMode,
} from '../src/session/turns.ts';

const text = (value, phase) => ({ kind: 'text', text: value, ...(phase ? { phase } : {}) });
const tool = (id, name, input, output = '', state = 'done') => ({ kind: 'tool', id, name, input, output, state });
const ai = (id, blocks, extra = {}) => ({ id, role: 'assistant', blocks, ...extra });
const user = (id, value, extra = {}) => ({ id, role: 'user', text: value, ...extra });

test('一条回合的边界：user 切开、终态后再来的 assistant 另起一组、toolUse 链保持一组', () => {
  const messages = [
    ai('a1', [], { stopReason: 'stop' }),
    ai('a2', [], { stopReason: 'toolUse' }),
    ai('a3', [], { stopReason: 'stop' }),
  ];
  // a1 已终态 → a2 是自动续跑，新一组；a2 是 toolUse → a3 仍属同一次执行
  assert.deepEqual(groupByExecution(messages), [[0], [1, 2]]);
  // user 消息本身不属于任何 assistant 组
  assert.deepEqual(groupByExecution([ai('a1', [], { stopReason: 'stop' })]), [[0]]);
  assert.deepEqual(groupByExecution([{ id: 'u', role: 'user', text: 'hi' }]), []);
  // 没有 stopReason 的流式消息不制造新边界
  assert.deepEqual(groupByExecution([ai('a1', []), ai('a2', [])]), [[0, 1]]);
});

test('回合用时：末条 created_at + durationMs 减起点；时间戳缺失/乱序时有明确退化', () => {
  assert.equal(turnDuration(1000, 5000, 200, false), 4200);
  // 只有末条自身耗时（没有起点时间戳）
  assert.equal(turnDuration(undefined, 5000, 300, false), 300);
  // 乱序算出负数：非打断回合放弃给值，被打断的回合退回末条时间（宁可偏短也不编）
  assert.equal(turnDuration(5000, 1000, undefined, false), undefined);
  assert.equal(turnDuration(5000, 1000, undefined, true), 0);
  assert.equal(turnDuration(undefined, undefined, undefined, false), undefined);
});

test('本地回显的提问用 sentAt 当走秒锚点（还没拿到 PC 时间戳时也不丢「等待模型」那段）', () => {
  const rows = buildRows([
    ai('a1', [text('答', 'final_answer')], { stopReason: 'stop', createdAt: 6000, durationMs: 0 }),
    // 本地回显：只有本机 sentAt，没有 createdAt
    { id: 'u1', role: 'user', text: '问', sentAt: 5000 },
  ], false, describeProcessItem);
  // 6000 - 5000：起点取 sentAt，而不是退到首条 assistant 的 createdAt（那样会是 0）
  assert.equal(rows[0].turn.startedAt, 5000);
  assert.equal(rows[0].turn.durationMs, 1000);
});

test('用时文案与桌面端 executionLabel 同词序', () => {
  assert.equal(formatTurnDuration(83_000), '用时 1分钟 23秒');
  assert.equal(formatTurnDuration(12_000, { active: true }), '已执行 0分钟 12秒');
  assert.equal(formatTurnDuration(-5000), '用时 0分钟 0秒');
  assert.equal(formatTurnDuration(undefined), '用时未知');
  assert.equal(formatTurnDuration(undefined, { interrupted: true }), '执行过程（已打断）');
  assert.equal(formatTurnDuration(8000, { interrupted: true }), '执行了 8 秒被打断');
});

test('渲染形态三选一：运行中 / 折成用时 / 摊开（判定是纯函数，界面按它分叉）', () => {
  const view = (messages, running) => buildRows(messages, running, describeProcessItem)[0].turn;
  // 运行中：模型只跑了工具、还没吐正文，也必须走 running（否则整行只剩计时器）
  const toolsOnly = view([
    ai('a1', [tool('t1', 'read', { path: '/a/b/app.ts' }, '', 'running')], { createdAt: 2000 }),
    user('u1', '读一下', { createdAt: 1000 }),
  ], true);
  assert.equal(turnMode(toolsOnly), 'running');
  // 已结束且抽出了结论 → 折
  const concluded = view([
    ai('a2', [tool('t1', 'read', { path: '/a/b/app.ts' }, 'ok'), text('结论', 'final_answer')], { stopReason: 'stop', createdAt: 2000 }),
    user('u1', '读一下', { createdAt: 1000 }),
  ], false);
  assert.equal(turnMode(concluded), 'folded');
  // 被打断且只有工具（没有结论可留）→ 摊开，别把「刚才发生了什么」默认收起来
  const abortedTools = view([
    ai('a3', [tool('t1', 'bash', { command: 'ls' }, 'ok')], { stopReason: 'aborted', createdAt: 2000 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], false);
  assert.equal(turnMode(abortedTools), 'flat');
  // 纯文字回复：结论在气泡里、没有过程可回放 → 不折（只出时长标题），不能给一个点不开的箭头
  const plain = view([
    ai('a4', [text('直接回答', 'final_answer')], { stopReason: 'stop', createdAt: 2000 }),
    user('u1', '问', { createdAt: 1000 }),
  ], false);
  assert.equal(turnMode(plain), 'flat');
  assert.equal(plain.processCount, 0);
});

test('折叠行摘要：单条给带目标的文案，多条按动作去重（与桌面端一样不带次数）', () => {
  const single = summarizeProcess([{ kind: 'tool', key: 'k', tool: tool('t1', 'read', { path: '/a/b/app.ts' }), running: false }], describeProcessItem);
  assert.equal(single, '已读取 app.ts');
  const twice = summarizeProcess([
    { kind: 'tool', key: 'k1', tool: tool('t1', 'read', { path: '/a/b/app.ts' }), running: false },
    { kind: 'tool', key: 'k2', tool: tool('t2', 'read', { path: '/a/b/other.ts' }), running: false },
  ], describeProcessItem);
  assert.equal(twice, '读取文件');
  const mixed = summarizeProcess([
    { kind: 'thinking', key: 'k0', text: '想一下', running: false },
    { kind: 'tool', key: 'k1', tool: tool('t1', 'bash', { command: 'ls -la' }), running: false },
    { kind: 'tool', key: 'k2', tool: tool('t2', 'read', { path: '/a/b/app.ts' }), running: false },
  ], describeProcessItem);
  assert.equal(mixed, '思考过程、运行命令、读取文件'); // 去重后按首次出现排序
  assert.equal(summarizeProcess([], describeProcessItem), '');
});

test('已结束回合：过程折进 pieces、最终结论单独抽出，行序保持最新在前', () => {
  // 入参与 store/FlatList 一致：最新在前
  const messages = [
    ai('a2', [{ kind: 'thinking', text: '想了想' }, text('结论在这里', 'final_answer')],
      { stopReason: 'stop', createdAt: 5000, durationMs: 500, usage: { inputTokens: 10, outputTokens: 2 } }),
    ai('a1', [tool('t1', 'read', { path: '/a/b/app.ts' }, '内容'), text('先看下文件', 'commentary')],
      { stopReason: 'toolUse', createdAt: 4000 }),
    user('u1', '看下 app.ts', { createdAt: 3000 }),
  ];
  const rows = buildRows(messages, false, describeProcessItem);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'turn');
  assert.equal(rows[1].kind, 'message');
  const turn = rows[0].turn;
  assert.deepEqual(turn.conclusion.map((item) => item.text), ['结论在这里']);
  assert.equal(turn.processCount, 3); // 思考 + 读文件 + 中间叙述
  assert.equal(turn.pieces.length, 1);
  assert.equal(turn.pieces[0].kind, 'process');
  assert.equal(turn.pieces[0].items.length, 3);
  assert.equal(turn.durationMs, 2500); // 5000 + 500 - 3000
  assert.deepEqual(turn.usage, { inputTokens: 10, outputTokens: 2 });
  assert.equal(turn.active, false);
});

test('运行中回合：不抽结论、正文照常流式，状态已经落后也不把终态消息当运行中', () => {
  const running = buildRows([
    ai('a1', [tool('t1', 'bash', { command: 'sleep 1' }, 'partial', 'running'), text('正在处理')], { createdAt: 1000 }),
    user('u1', '跑一下', { createdAt: 900 }),
  ], true, describeProcessItem);
  const active = running[0].turn;
  assert.equal(active.active, true);
  assert.equal(active.conclusion.length, 0);
  assert.deepEqual(active.pieces.map((piece) => piece.kind), ['process', 'text']);
  assert.equal(active.durationMs, undefined);

  // 已经收到 stopReason=stop：即使 running 还为 true，也按完成态折叠
  const settled = buildRows([
    ai('a1', [tool('t1', 'bash', { command: 'ls' }, 'ok'), text('好了', 'final_answer')], { stopReason: 'stop', createdAt: 2000 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], true, describeProcessItem);
  assert.equal(settled[0].turn.active, false);
  assert.equal(settled[0].turn.conclusion.length, 1);
});

test('抽不出结论的回合（打断 / 只有中间叙述）保持原始交错顺序', () => {
  const rows = buildRows([
    ai('a1', [text('先说明一下', 'commentary'), tool('t1', 'bash', { command: 'ls' }, 'ok')], { stopReason: 'aborted', createdAt: 2000 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], false, describeProcessItem);
  const turn = rows[0].turn;
  assert.equal(turn.interrupted, true);
  assert.equal(turn.conclusion.length, 0);
  // 正文没有被折进过程，仍按原顺序单列
  assert.deepEqual(turn.pieces.map((piece) => piece.kind), ['text', 'process']);

  // 被打断 + 正文**没有 phase 标记**（老会话）：同样不抽结论，不能把半截话当成最终结论
  const legacy = buildRows([
    ai('b1', [tool('t1', 'bash', { command: 'ls' }, 'ok'), text('被打断前的半截回答')], { stopReason: 'aborted', createdAt: 2000 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], false, describeProcessItem)[0].turn;
  assert.equal(legacy.conclusion.length, 0);
  assert.deepEqual(legacy.pieces.map((piece) => piece.kind), ['process', 'text']);

  // 但带 final_answer 标记的正文，被打断时仍要留下（桌面端 taggedIndex 分支）
  const tagged = buildRows([
    ai('c1', [tool('t1', 'bash', { command: 'ls' }, 'ok'), text('已经写好的结论', 'final_answer'), text('还在继续…')],
      { stopReason: 'aborted', createdAt: 2000 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], false, describeProcessItem)[0].turn;
  assert.deepEqual(tagged.conclusion.map((item) => item.text), ['已经写好的结论']);

  // 非终态（末条还是 toolUse）也不抽结论：桌面端 !terminal 直接返回空，别把中间态折成「结论」
  const halfway = buildRows([
    ai('d1', [tool('t1', 'bash', { command: 'ls' }, 'ok'), text('先说一句')], { stopReason: 'toolUse', createdAt: 2000 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], false, describeProcessItem)[0].turn;
  assert.equal(halfway.conclusion.length, 0);
});

test('系统消息不并入回合，各自成行且把回合切开（否则卡片会跑到回合前面或被收起）', () => {
  const rows = buildRows([
    ai('a2', [text('后半段', 'final_answer')], { stopReason: 'stop', createdAt: 3000 }),
    { id: 's1', role: 'system', text: '⏺ 命令 - 完成', systemKind: 'shell', createdAt: 2000 },
    ai('a1', [text('前半段', 'final_answer')], { stopReason: 'toolUse', createdAt: 1500 }),
    user('u1', '跑一下', { createdAt: 1000 }),
  ], false, describeProcessItem);
  assert.deepEqual(rows.map((row) => row.kind), ['turn', 'message', 'turn', 'message']);
  // 系统卡夹在两段之间，位置没被回合吞掉
  assert.equal(rows[1].message.id, 's1');
  assert.equal(rows[0].turn.conclusion[0].text, '后半段');
});

test('回合已结束仍无结果的工具算「未完成」，不再显示成正在跑', () => {
  const rows = buildRows([
    ai('a1', [tool('t1', 'read', { path: '/a/b/app.ts' }, '', 'running')], { stopReason: 'aborted', createdAt: 2000 }),
    user('u1', '读一下', { createdAt: 1000 }),
  ], false, describeProcessItem);
  const item = rows[0].turn.pieces[0].items[0];
  assert.equal(item.running, false);
  assert.equal(describeProcessItem(item).text, '未完成读取文件 app.ts');
  // 同一个工具在运行中的回合里仍算「正在读取」
  const live = buildRows([
    ai('a1', [tool('t1', 'read', { path: '/a/b/app.ts' }, '', 'running')], { createdAt: 2000 }),
    user('u1', '读一下', { createdAt: 1000 }),
  ], true, describeProcessItem);
  const liveItem = live[0].turn.pieces[0].items[0];
  assert.equal(liveItem.running, true);
  assert.equal(describeProcessItem(liveItem).text, '正在读取 app.ts');
});

test('未变的回合复用上一帧的视图对象，流式消息换代才重建（渲染 memo 的前提）', () => {
  const answer = ai('cache-a1', [text('结论', 'final_answer')], { stopReason: 'stop', createdAt: 1000 });
  const question = user('cache-u1', '问题', { createdAt: 900 });
  const first = buildRows([answer, question], false, describeProcessItem)[0];
  const second = buildRows([answer, question], false, describeProcessItem)[0];
  assert.equal(first.kind, 'turn');
  assert.equal(second.kind, 'turn');
  assert.equal(first.turn, second.turn, '消息引用没变时应当复用同一个 TurnView 对象');

  const replaced = { ...answer, blocks: [...answer.blocks, text('补一句', 'final_answer')] };
  const third = buildRows([replaced, question], false, describeProcessItem)[0];
  assert.notEqual(third.turn, first.turn);
  assert.equal(third.turn.conclusion.length, 2);
});

test('diff 统计跳过文件头，可见区间取首个改动前 3 行到末个改动后 3 行', () => {
  assert.deepEqual(diffStats('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-old\n+new\n context'), { added: 1, removed: 1 });
  const lines = Array.from({ length: 12 }, (_, index) => ` context ${index}`);
  lines[6] = '+changed';
  const range = visibleDiffRange(lines);
  assert.deepEqual(range, { from: 3, to: 9 });
  assert.equal(visibleDiffRange([' a', ' b']), null);
  // presentation 里的 diff 优先于正文
  assert.deepEqual(diffStats('没有 diff 的正文', { kind: 'edit_diff', diff: '+x\n-y' }), { added: 1, removed: 1 });
});

test('write 预览行号右对齐补零，行数与内容一致', () => {
  assert.equal(numberLines('a\nb'), '   1  a\n   2  b');
  assert.equal(numberLines('').split('\n').length, 1);
});

test('工具结果形态：权限信封解出 permission_denied，变更内容标记解出 edit_diff', () => {
  const block = { kind: 'permission_denied', rule: 'core.protected_write', mode: 'standard', operation: 'write', target: '/etc/hosts', detail: '系统文件' };
  const fromEnvelope = toolPresentation(`[EASYMINT_PERMISSION]${JSON.stringify(block)}\n写入被拦截`, undefined, true);
  assert.equal(fromEnvelope?.kind, 'permission_denied');
  assert.equal(fromEnvelope?.rule, 'core.protected_write');
  const fromDetails = toolPresentation('随便的正文', { presentation: block }, true);
  assert.equal(fromDetails?.kind, 'permission_denied');
  const diff = toolPresentation('已编辑 app.ts\n\n变更内容:\n@@ -1 +1 @@\n-a\n+b', undefined, false);
  assert.equal(diff?.kind, 'edit_diff');
  assert.ok(diff?.diff.includes('@@'));
  // 流式帧里的 presentation 是已经解好的结构体，只需形状收窄
  assert.deepEqual(presentationFrom({ kind: 'edit_diff', diff: '@@ -1 +1 @@\n-a\n+b' }),
    { kind: 'edit_diff', diff: '@@ -1 +1 @@\n-a\n+b' });
  assert.equal(presentationFrom({ kind: 'edit_diff' }), undefined);
  assert.equal(presentationFrom(undefined), undefined);
  // 快照 details.presentation 里的 edit_diff 也要能认出来
  assert.equal(toolPresentation('正文', { presentation: { kind: 'edit_diff', diff: '+x' } }, false)?.kind, 'edit_diff');
  assert.equal(toolPresentation('普通输出', undefined, false), undefined);
  assert.equal(toolPresentation('普通输出', { presentation: { kind: 'unknown' } }, false), undefined);
});

test('nestedCalls 载荷：状态归一化，非预期形状返回 undefined', () => {
  const parsed = nestedCalls({ calls: [{ id: 'n1', name: 'read', status: 'ok', arguments: { path: '/a' }, durationMs: 12 }], complete: true });
  assert.equal(parsed?.complete, true);
  assert.equal(parsed?.calls[0].status, 'ok');
  assert.equal(nestedCalls({ calls: [{ id: 'n2', name: 'x', status: 'weird' }] })?.calls[0].status, 'unfinished');
  assert.equal(nestedCalls(undefined), undefined);
  assert.equal(nestedCalls({ calls: 'nope' }), undefined);
});

test('内联 HTML 降级：剥标签留文字，块级标签换行', () => {
  assert.equal(htmlToText('<details><summary>摘要</summary><p>正文 <b>加粗</b></p></details>'), '摘要\n正文 加粗');
  assert.equal(htmlToText('a<br/>b'), 'a\nb');
  assert.equal(htmlToText('<span>&lt;保留实体&gt;</span>'), '<保留实体>');
});
