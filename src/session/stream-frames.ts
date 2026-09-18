/**
 * 流式帧合并器：把同一 runId 的连续 `message` 帧压成「窗口内最后一帧」，窗口取下一帧边界（rAF）。
 *
 * 为什么可以丢中间帧：Pi 的 `message_update` 携带的是**累计全文快照**（桌面端 event-bridge 明确
 * 「不做增量逻辑」），后一帧完全覆盖前一帧，中间态不含任何最后一帧里没有的信息。所以合并丢掉的
 * 只会是「会被后续帧覆盖的中间态」，不丢内容。
 *
 * 不能进队列、必须立即应用的：`message_start`、`partial === false` 的结束帧、`turn_start` /
 * `turn_end` / `error`、`tool_*`、`custom_event`——它们不是同一条消息的中间态，或本身就是终态信号，
 * 被窗口吞掉会让状态卡住或内容缺失。调用方在应用这些事件前先 `flush()`。
 *
 * 顺序保证：`flush()` 会先把待应用的帧落地，调用方再处理当前事件——等价于「合并后仍按帧到达顺序
 * 应用」，不会出现旧快照盖掉新状态。
 *
 * 调度契约：`schedule` 必须在下一帧**异步**调用 flush（rAF / 定时器），不支持同步回调。
 */

export type FrameScheduler = (flush: () => void) => () => void;

export type StreamFrameQueue<T> = {
  /** 排队一帧：同 key 的连续帧只保留最后一帧，并在下一帧边界触发 flush */
  defer: (key: string, frame: T) => void;
  /** 立刻应用待应用的帧（无待应用帧时空转），用于「不可合并事件」之前的顺序保序 */
  flush: () => void;
  /** 丢弃待应用帧并取消调度（订阅重建 / 卸载时用：后续帧仍是全量快照，内容会收敛） */
  clear: () => void;
};

export function createStreamFrameQueue<T>(apply: (frame: T) => void, schedule: FrameScheduler): StreamFrameQueue<T> {
  let key: string | null = null;
  let pending: T | null = null;
  let cancel: (() => void) | null = null;

  const flush = () => {
    if (cancel) { cancel(); cancel = null; }
    if (pending === null) return;
    const frame = pending;
    pending = null;
    key = null;
    apply(frame);
  };

  return {
    defer(nextKey, frame) {
      // 换 key（换消息）时先落地上一条的末帧，保持到达顺序
      if (key !== null && key !== nextKey) flush();
      key = nextKey;
      pending = frame;
      if (!cancel) cancel = schedule(flush);
    },
    flush,
    clear() {
      if (cancel) { cancel(); cancel = null; }
      pending = null;
      key = null;
    },
  };
}

/** 下一帧边界应用：rAF 优先，宿主没有 rAF 时回落一个 16ms 定时器 */
export function scheduleOnNextFrame(flush: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(() => flush());
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(flush, 16);
  return () => clearTimeout(handle);
}
