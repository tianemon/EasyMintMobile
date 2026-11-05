// Run: npm test
// 会话列表右端时间 / 设备「上次在线」的定档文案（与本机时区相关，构造时间时一律走本地 Date）
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLastSeen, formatSessionTime } from '../src/session/session-time.ts';

const now = new Date(2026, 10, 5, 16, 30).getTime(); // 2026-11-05 16:30 本地

test('会话时间：今天给时分，昨天/更早按日历给日期', () => {
  assert.equal(formatSessionTime(new Date(2026, 10, 5, 9, 5).getTime(), now), '09:05');
  assert.equal(formatSessionTime(new Date(2026, 10, 4, 23, 59).getTime(), now), '昨天');
  assert.equal(formatSessionTime(new Date(2026, 10, 3, 12, 0).getTime(), now), '11月3日');
  assert.equal(formatSessionTime(new Date(2025, 11, 31, 12, 0).getTime(), now), '2025年12月31日');
  // 缺字段不产出占位符：右端直接不显示
  assert.equal(formatSessionTime(undefined, now), '');
});

test('设备上次在线：分钟 / 小时 / 昨天 / 日期四档', () => {
  assert.equal(formatLastSeen(now - 20_000, now), '刚刚');
  assert.equal(formatLastSeen(now - 12 * 60_000, now), '12 分钟前');
  assert.equal(formatLastSeen(now - 3 * 3_600_000, now), '3 小时前');
  // 今天的 01:00 距现在 15 小时，仍算「15 小时前」而不是「昨天」
  assert.equal(formatLastSeen(new Date(2026, 10, 5, 1, 0).getTime(), now), '15 小时前');
  assert.equal(formatLastSeen(new Date(2026, 10, 4, 23, 0).getTime(), now), '昨天');
  assert.equal(formatLastSeen(new Date(2026, 10, 1, 8, 0).getTime(), now), '11月1日');
  assert.equal(formatLastSeen(undefined, now), '');
});
