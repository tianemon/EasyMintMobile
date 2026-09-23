// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test temp/tests/buffered-events.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotMessagesWithBuffer } from '../../src/session/messages.ts';

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
