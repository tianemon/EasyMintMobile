// Run: npm test（node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test "tests/**/*.test.mjs"）
import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotMessagesWithBuffer } from '../src/session/messages.ts';

const snapshot = {
  session: { sessionId: 's', title: 'test' },
  messages: [{ type: 'user', uuid: 'u', message: { content: [{ type: 'text', text: 'question' }] } }],
  status: 'running', pendingAsks: [], eventSequence: 12,
  bufferedEvents: [
    { type: 'message', eventSequence: 12, blocks: [{ type: 'text', text: 'partial 2' }], partial: true },
    { type: 'message', eventSequence: 11, blocks: [{ type: 'text', text: 'partial 1' }], partial: true },
  ],
};

test('bufferedEvents and live events merge by eventSequence without duplicate bubbles', () => {
  const recovered = snapshotMessagesWithBuffer(snapshot, [
    { type: 'message', eventSequence: 12, blocks: [{ type: 'text', text: 'duplicate' }], partial: true },
    { type: 'message', eventSequence: 13, blocks: [{ type: 'text', text: 'partial 3' }], partial: true },
  ]);
  assert.equal(recovered.running, true);
  assert.equal(recovered.messages.length, 2);
  assert.deepEqual(recovered.messages[0].blocks, [{ kind: 'text', text: 'partial 3' }]);
});

test('idle snapshots do not revive old buffered frames', () => {
  const recovered = snapshotMessagesWithBuffer({ ...snapshot, status: 'idle' }, []);
  assert.equal(recovered.running, false);
  assert.equal(recovered.messages.length, 1);
});

test('turn_end during snapshot request clears running and keeps the last frame visible', () => {
  const recovered = snapshotMessagesWithBuffer(snapshot, [
    { type: 'message', eventSequence: 13, blocks: [{ type: 'text', text: 'final' }], partial: false },
    { type: 'turn_end', eventSequence: 14 },
  ]);
  assert.equal(recovered.running, false);
  assert.equal(recovered.messages[0].streaming, false);
  assert.deepEqual(recovered.messages[0].blocks, [{ kind: 'text', text: 'final' }]);
});

test('same text in an older answer does not hide the current streaming answer', () => {
  const repeated = {
    ...snapshot,
    messages: [
      { type: 'assistant', uuid: 'old', message: { content: [{ type: 'text', text: '好的' }] } },
      { type: 'user', uuid: 'new', message: { content: [{ type: 'text', text: '再说一次' }] } },
    ],
    bufferedEvents: [{ type: 'message', eventSequence: 12, partial: true, chatId: 'current', blocks: [{ type: 'text', text: '好的' }] }],
  };
  const recovered = snapshotMessagesWithBuffer(repeated, []);
  assert.equal(recovered.messages.length, 3);
  assert.equal(recovered.messages[0].streaming, true);
});

// 对端老版本可能不带 bufferedEvents；缺字段时必须当空数组处理，不能把 undefined 展开成异常
test('a snapshot without bufferedEvents does not throw', () => {
  const { bufferedEvents: omitted, ...withoutBuffer } = snapshot;
  assert.ok(Array.isArray(omitted)); // 前置：确认真的把字段摘掉了
  const recovered = snapshotMessagesWithBuffer(withoutBuffer, []);
  assert.equal(recovered.running, true);
  assert.equal(recovered.messages.length, 1);
});

// 同一序号同时来自缓冲与实时流时保留先到的那份（= 缓冲里的）。去重若不生效，最后帧会变成 'live 12'
test('duplicate eventSequence arriving from both sources keeps the earlier copy', () => {
  const recovered = snapshotMessagesWithBuffer(
    { ...snapshot, eventSequence: 11 },
    [{ type: 'message', eventSequence: 12, blocks: [{ type: 'text', text: 'live 12' }], partial: true }],
  );
  assert.deepEqual(recovered.messages[0].blocks, [{ kind: 'text', text: 'partial 2' }]);
});
