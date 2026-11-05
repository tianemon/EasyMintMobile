// Run: npm test
// 桌面端消息展示对齐：附件标记、快照还原、有序插入、usage 行、输出截断、系统卡状态词
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eventTimestamp, formatTokenCount, formatUsage, insertMessageByTime, parseAttachMarkers,
  snapshotAttachments, snapshotMessages, truncateToolOutput,
} from '../src/session/messages.ts';
import {
  ALWAYS_EXPANDED_KINDS, authLinkFromRow, RESULT_KINDS, RESULT_ROW_RE, statusTone,
} from '../src/session/system-status.ts';
import { SYSTEM_LABELS, toolDisplay } from '../src/session/tools.ts';

const msg = (id, createdAt) => ({ id, role: 'system', text: id, createdAt });
const snapshot = (messages) => ({
  session: {}, messages, status: 'idle', pendingAsks: [], bufferedEvents: [],
});

test('附件标记只留 basename，本机绝对路径不进气泡', () => {
  const { attaches, cleanText } = parseAttachMarkers(
    '[Image #1: /Users/amon/.easymint/uploads/123-a.png] 请看图 [File #2: /Users/amon/docs/report.pdf]',
  );
  assert.deepEqual(attaches.map((item) => [item.name, item.kind]), [
    ['123-a.png', 'image'], ['report.pdf', 'doc'],
  ]);
  assert.equal(cleanText, '请看图');
  assert.equal(parseAttachMarkers('普通正文').cleanText, '普通正文');
});

test('只有附件、没有正文的历史消息不再被整条丢弃', () => {
  const list = snapshotMessages(snapshot([{
    type: 'user', uuid: 'u1', created_at: 1000,
    message: { role: 'user', customType: undefined, content: [
      { type: 'text', text: '[Image #1: /Users/amon/.easymint/uploads/123-a.png]' },
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
    ] },
  }]));
  assert.equal(list.length, 1);
  assert.equal(list[0].text, '');
  assert.equal(list[0].attachments[0].name, '123-a.png');
  assert.equal(list[0].attachments[0].data, 'AAAA'); // 磁盘 image 块仍带像素数据
  assert.equal(list[0].createdAt, 1000);
  assert.ok(!JSON.stringify(list).includes('/Users/amon'), '气泡里不能有桌面端绝对路径');
});

test('多张图片按标记顺序各自命名，声明附件按名字去重', () => {
  const attachments = snapshotAttachments(
    { content: [
      { type: 'image', data: 'AAA', mimeType: 'image/png' },
      { type: 'image', data: 'BBB', mimeType: 'image/jpeg' },
    ] },
    { attachments: [{ name: 'a.png', kind: 'image' }, { name: 'notes.md', kind: 'doc' }] },
    [
      { id: 'm1', name: 'a.png', kind: 'image' },
      { id: 'm2', name: 'b.jpg', kind: 'image' },
      { id: 'm3', name: 'notes.md', kind: 'doc' },
    ],
  );
  assert.deepEqual(attachments.map((item) => item.name), ['a.png', 'b.jpg', 'notes.md']);
  assert.deepEqual(attachments.map((item) => item.data), ['AAA', 'BBB', undefined]);
});

test('details.attachments 还原成占位卡；空文本且无附件的消息仍跳过', () => {
  const list = snapshotMessages(snapshot([
    { type: 'user', uuid: 'u1', message: { role: 'user', content: [{ type: 'text', text: '请看附件' }],
      details: { attachments: [{ name: 'report.pdf', kind: 'doc' }] } } },
    { type: 'user', uuid: 'u2', message: { role: 'user', content: '' } },
  ]));
  assert.equal(list.length, 1);
  assert.equal(list[0].text, '请看附件');
  assert.deepEqual(list[0].attachments.map((a) => a.name), ['report.pdf']);
  assert.equal(list[0].attachments[0].data, undefined);
  assert.equal(snapshotAttachments({}, {}, []).length, 0);
});

test('快照里的轻档标记与 assistant usage 被消费', () => {
  const list = snapshotMessages(snapshot([
    { type: 'user', uuid: 'u1', out_of_context: true, image_stripped: true,
      message: { role: 'user', content: '旧提问' } },
    // 快照直通 Pi 原始消息，usage 是磁盘上的 input/output/cacheRead/cacheWrite；
    // 只有流式帧才是归一化后的 *Tokens —— 两种形状都得认，否则重开会话元信息行恒为 0
    { type: 'assistant', uuid: 'a1', created_at: 2000,
      message: { role: 'assistant', content: [{ type: 'text', text: '回答' }],
        usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5, totalTokens: 155 } } },
    { type: 'assistant', uuid: 'a2', created_at: 3000,
      message: { role: 'assistant', content: [{ type: 'text', text: '回答2' }],
        usage: { inputTokens: 7, outputTokens: 3 } } },
  ]));
  const user = list.find((item) => item.id === 'u1');
  const assistant = list.find((item) => item.id === 'a1');
  const streamed = list.find((item) => item.id === 'a2');
  assert.equal(user.outOfContext, true);
  assert.equal(user.imageStripped, true);
  assert.equal(assistant.createdAt, 2000);
  assert.deepEqual(assistant.usage, { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 });
  // 流式那套归一化形状照旧
  assert.deepEqual(streamed.usage, { inputTokens: 7, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 });
});

test('insertMessageByTime 在「最新在前」的列表里按落盘时间插入', () => {
  const list = [msg('new', 300), msg('mid', 200), msg('old', 100)];
  assert.deepEqual(insertMessageByTime(list, msg('between', 250)).map((m) => m.id),
    ['new', 'between', 'mid', 'old']);
  // 比全部都旧 → 落到末尾
  assert.deepEqual(insertMessageByTime(list, msg('oldest', 50)).map((m) => m.id),
    ['new', 'mid', 'old', 'oldest']);
  // 没有时间戳 → 退化为头插；列表里没有带时间戳的项时也不能甩到末尾
  assert.equal(insertMessageByTime(list, { id: 'no-time', role: 'system' })[0].id, 'no-time');
  assert.equal(insertMessageByTime([{ id: 'plain', role: 'system' }], msg('timed', 10))[0].id, 'timed');
});

test('token 格式化与 usage 行同桌面端口径（含 0% 命中）', () => {
  assert.equal(formatTokenCount(999), '999');
  assert.equal(formatTokenCount(1200), '1.2K');
  assert.equal(formatTokenCount(1_500_000), '1.5M');
  assert.equal(formatUsage({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 }),
    '输入 135 · 输出20 · 缓存命中 22.22%');
  assert.equal(formatUsage({ inputTokens: 10, outputTokens: 4 }), '输入 10 · 输出4 · 缓存命中 0.00%');
  assert.equal(formatUsage(undefined), '');
});

test('工具输出超过 30 行只留尾部 20 行，短输出原样', () => {
  const long = Array.from({ length: 40 }, (_, i) => `L${i}`).join('\n');
  const clipped = truncateToolOutput(long);
  assert.ok(clipped.includes('L20') && clipped.includes('L39'));
  assert.ok(!clipped.includes('L0\n'));
  assert.match(clipped, /仅显示尾部 20 行/);
  assert.equal(truncateToolOutput('a\nb'), 'a\nb');
});

test('human-action 归入结果型、全 kind 默认折叠、新状态词能解析并着色', () => {
  assert.ok(RESULT_KINDS.has('human-action'));
  assert.equal(SYSTEM_LABELS['human-action'], '命令交互');
  assert.equal(ALWAYS_EXPANDED_KINDS.has('error'), true);
  assert.equal(ALWAYS_EXPANDED_KINDS.has('handoff'), false);
  for (const word of ['完成', '失败', '已随权限切换中止', '等待你操作']) {
    const parsed = `⏺ 部署命令 - ${word} · 3s`.match(RESULT_ROW_RE);
    assert.ok(parsed, `${word} 应被结果行正则匹配`);
    assert.equal(parsed[2], word);
  }
  assert.equal(statusTone('失败'), 'failed');
  assert.equal(statusTone('等待你操作'), 'interrupt');
  assert.equal(statusTone('完成'), 'done');
});

test('技能类工具标题补上桌面端同款详情文案', () => {
  const display = (name, input) => toolDisplay({
    kind: 'tool', id: 't', name, input, output: '', state: 'done',
  });
  assert.equal(display('use_skill', { name: 'pdf' }), '加载技能 · 技能：pdf');
  assert.equal(display('import_skill', {}), '导入 · 技能');
  assert.equal(display('manage_skill', { name: 'pdf', action: 'edit' }), '管理技能 · 技能：pdf（edit）');
  assert.equal(display('manage_skill', { action: 'list' }), '管理技能 · 技能管理（list）');
  assert.equal(display('learn', { skill: { name: 'pdf' } }), '沉淀经验 · 沉淀技能：pdf');
  assert.equal(display('learn', {}), '沉淀经验');
});

test('事件时间锚优先 payload.timestamp，缺失时用 PC 的 envelope.sentAt，不混用手机时钟', () => {
  // custom_event 带 Pi 落盘时间戳；compacted / queue_dropped 不带，必须落到同一台 PC 的 sentAt
  assert.equal(eventTimestamp({ timestamp: 1700 }, 1800), 1700);
  assert.equal(eventTimestamp({}, 1800), 1800);
  assert.equal(eventTimestamp({ timestamp: '2026-11-04T00:00:00Z' }, 1800), 1800);
  assert.equal(eventTimestamp({ timestamp: NaN }, 1800), 1800);
  // 两者都缺（老版本桌面端）才用本机时钟兜底
  const fallback = eventTimestamp({}, undefined);
  assert.ok(Math.abs(fallback - Date.now()) < 1000);
});

test('human-action 授权链接只认指定行与 http(s)，别把任意 URL 变成可点外链', () => {
  assert.deepEqual(authLinkFromRow('授权链接: https://example.com/auth?a=1'),
    { label: '授权链接', url: 'https://example.com/auth?a=1' });
  assert.deepEqual(authLinkFromRow('  可能相关的链接: http://x.dev/a  '),
    { label: '可能相关的链接', url: 'http://x.dev/a' });
  assert.equal(authLinkFromRow('说明: https://example.com'), null);
  assert.equal(authLinkFromRow('授权链接: javascript:alert(1)'), null);
  assert.equal(authLinkFromRow('随便一行'), null);
});
