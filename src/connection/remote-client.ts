import type {
  CommandName,
  PairingOffer,
  PcCredential,
  RemoteEnvelope,
  RemoteEvent,
} from '../protocol/types';
import { resultError } from './remote-result';
import { appDeviceId } from '../security/installation-id';
import { decodePairingPayload, validatePairingOffer } from './pairing-uri';
import type { PairingTarget } from './pairing-uri';
import {
  base64,
  computeSharedSecret,
  createPairingKeyPair,
  decrypt,
  deriveKeys,
  encrypt,
  pairingCode,
  proof,
  randomId,
  type SessionKeys,
} from '../security/crypto';

type Status = 'disconnected' | 'connecting' | 'connected';
type JsonObject = Record<string, unknown>;

function openSocket(address: string, port: number, timeoutMs = 4_000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${address}:${port}`);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`无法连接 ${address}`));
    }, timeoutMs);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve(socket);
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`无法连接 ${address}`));
    };
  });
}

async function connectAny(addresses: string[], port: number): Promise<WebSocket> {
  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await openSocket(address, port);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法连接电脑，请确认两台设备在同一局域网');
}

function parseMessage(event: MessageEvent): JsonObject | null {
  if (typeof event.data !== 'string') return null;
  try {
    const value = JSON.parse(event.data);
    return value && typeof value === 'object' ? value as JsonObject : null;
  } catch {
    return null;
  }
}

/**
 * 短码换完整载荷：二维码里只有地址/端口/6 位码，公钥与 token 走这条查询拿。
 * 服务端只回载荷、不消耗短码；token 的一次性消费仍在 init 那一步。
 */
async function lookupOffer(socket: WebSocket, code: string): Promise<PairingOffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('电脑端没有响应，请重新生成二维码')), 5_000);
    const done = (error?: Error, offer?: PairingOffer): void => {
      clearTimeout(timer);
      if (error) reject(error);
      else if (offer) resolve(offer);
    };
    socket.onmessage = (event) => {
      const message = parseMessage(event);
      if (message?.type === 'mobile-pair-lookup-failed') {
        done(new Error('配对二维码已过期，请在电脑上重新生成'));
        return;
      }
      if (message?.type !== 'mobile-pair-offer' || typeof message.payload !== 'string') return;
      try {
        done(undefined, validatePairingOffer(decodePairingPayload(message.payload)));
      } catch (e) {
        done(e instanceof Error ? e : new Error('配对二维码内容不完整'));
      }
    };
    socket.onerror = () => done(new Error('配对连接中断'));
    socket.send(JSON.stringify({ type: 'mobile-pair-lookup', code }));
  });
}

export async function pairWithPc(
  target: PairingTarget,
  deviceName: string,
  onVerificationCode: (code: string) => void,
): Promise<PcCredential> {
  // 短码形态要先连上电脑换载荷；长码（旧桌面端）直接用码里的公钥
  let offer: PairingOffer;
  let socket: WebSocket;
  if (target.kind === 'offer') {
    offer = target.offer;
    socket = await connectAny(offer.addresses, offer.port);
  } else {
    socket = await connectAny([target.host], target.port);
    try {
      offer = await lookupOffer(socket, target.code);
    } catch (error) {
      // 查表失败（超时/码过期/载荷非法）必须关掉这条连接：长码路径由下面的 finish 统一关，
      // 短码路径若漏了这里，失败一次就漏一条 socket——服务端 MAX_CONNECTIONS 很快被占满，
      // 之后连「重试」都会被 1013 拒掉。
      socket.close();
      throw error;
    }
  }
  // 稳定的本机标识：电脑端按 deviceId 覆盖记录，随机 id 会让同一台手机堆出多条
  const deviceId = await appDeviceId();
  const pair = createPairingKeyPair();
  const sharedSecret = computeSharedSecret(pair.secretKey, offer.publicKey);
  const keys = deriveKeys(sharedSecret);
  onVerificationCode(pairingCode(keys.auth, offer.token));

  return await new Promise<PcCredential>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('电脑端确认超时，请重新扫码'));
    }, Math.max(1_000, offer.expiresAt - Date.now() + 60_000));
    const finish = (error?: Error, credential?: PcCredential) => {
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else if (credential) resolve(credential);
    };
    socket.onmessage = (event) => {
      const message = parseMessage(event);
      if (message?.type === 'mobile-pair-rejected') {
        finish(new Error('电脑端拒绝了配对'));
        return;
      }
      if (message?.type !== 'mobile-pair-accepted') return;
      const expected = proof(keys.auth, `pair-accepted:${offer.token}:${deviceId}`);
      if (message.pcId !== offer.pcId || message.proof !== expected) {
        finish(new Error('电脑身份校验失败'));
        return;
      }
      finish(undefined, {
        version: 1,
        pcId: offer.pcId,
        pcName: offer.pcName,
        addresses: offer.addresses,
        port: offer.port,
        deviceId,
        deviceName,
        sharedSecret: base64.encode(sharedSecret),
      });
    };
    socket.onerror = () => finish(new Error('配对连接中断'));
    socket.send(JSON.stringify({
      type: 'mobile-pair-init',
      token: offer.token,
      deviceId,
      deviceName,
      publicKey: pair.publicKey,
    }));
  });
}

export class RemoteClient {
  private socket: WebSocket | null = null;
  private keys: SessionKeys;
  private connectionId = '';
  private sendSequence = 0;
  private receiveSequence = 0;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private statusListeners = new Set<(status: Status) => void>();
  private eventListeners = new Set<(event: RemoteEvent, envelope: RemoteEnvelope) => void>();

  constructor(private readonly credential: PcCredential) {
    this.keys = deriveKeys(base64.decode(credential.sharedSecret));
  }

  onStatus(listener: (status: Status) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onEvent(listener: (event: RemoteEvent, envelope: RemoteEnvelope) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    this.emitStatus('connecting');
    let socket: WebSocket;
    try {
      socket = await connectAny(this.credential.addresses, this.credential.port);
    } catch (error) {
      // 先开手机、后开电脑：第一次必然连不上。这里不排重试的话，之后电脑起来了也没人再试
      this.emitStatus('disconnected');
      this.scheduleReconnect();
      throw error;
    }
    this.socket = socket;
    this.connectionId = randomId();
    this.sendSequence = 0;
    this.receiveSequence = 0;
    const nonce = randomId();

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('连接认证超时')), 5_000);
        socket.onmessage = (event) => {
          const message = parseMessage(event);
          if (message?.type !== 'mobile-hello-ack') return;
          const expected = proof(
            this.keys.auth,
            `hello-ack:${this.credential.deviceId}:${this.connectionId}:${nonce}`,
          );
          if (message.connectionId !== this.connectionId || message.proof !== expected) {
            clearTimeout(timer);
            reject(new Error('电脑身份校验失败'));
            return;
          }
          clearTimeout(timer);
          resolve();
        };
        socket.onerror = () => {
          clearTimeout(timer);
          reject(new Error('连接认证失败'));
        };
        socket.send(JSON.stringify({
          type: 'mobile-hello',
          deviceId: this.credential.deviceId,
          // 电脑端按它刷新设备名：改了名不用重新配对
          deviceName: this.credential.deviceName,
          connectionId: this.connectionId,
          nonce,
          proof: proof(this.keys.auth, `hello:${this.credential.deviceId}:${this.connectionId}:${nonce}`),
        }));
      });
    } catch (error) {
      socket.close();
      this.socket = null;
      this.emitStatus('disconnected');
      this.scheduleReconnect();
      throw error;
    }

    socket.onmessage = (event) => this.handleMessage(event);
    socket.onerror = () => undefined;
    socket.onclose = () => this.handleClose();
    this.reconnectAttempt = 0;
    this.emitStatus('connected');
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.rejectPending(new Error('连接已关闭'));
    this.emitStatus('disconnected');
  }

  command<T>(
    command: CommandName,
    options: { projectId?: string; sessionId?: string; data?: unknown } = {},
  ): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('电脑尚未连接'));
    }
    const requestId = randomId();
    const sequence = ++this.sendSequence;
    const envelope: RemoteEnvelope = {
      version: 1,
      connectionId: this.connectionId,
      sequence,
      sentAt: Date.now(),
      kind: 'command',
      requestId,
      projectId: options.projectId,
      sessionId: options.sessionId,
      payload: { command, data: options.data },
    };
    const encrypted = encrypt(this.keys.clientToServer, this.connectionId, sequence, JSON.stringify(envelope));
    this.socket.send(JSON.stringify({ type: 'mobile-encrypted', ...encrypted }));

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('命令执行超时'));
      }, 60_000);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
    });
  }

  private handleMessage(event: MessageEvent): void {
    const message = parseMessage(event);
    if (message?.type !== 'mobile-encrypted') return;
    const sequence = Number(message.sequence);
    if (!Number.isSafeInteger(sequence) || sequence !== this.receiveSequence + 1) {
      this.socket?.close(1008, 'invalid sequence');
      return;
    }
    try {
      const plaintext = decrypt(this.keys.serverToClient, this.connectionId, sequence, {
        iv: String(message.iv ?? ''),
        tag: String(message.tag ?? ''),
        data: String(message.data ?? ''),
      });
      const envelope = JSON.parse(plaintext) as RemoteEnvelope;
      if (envelope.version !== 1 || envelope.connectionId !== this.connectionId || envelope.sequence !== sequence) {
        throw new Error('envelope mismatch');
      }
      this.receiveSequence = sequence;
      if (envelope.kind === 'result' && envelope.requestId) {
        const pending = this.pending.get(envelope.requestId);
        if (!pending) return;
        this.pending.delete(envelope.requestId);
        clearTimeout(pending.timer);
        const payload = envelope.payload as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
        const error = resultError(payload);
        if (error) pending.reject(error);
        else pending.resolve(payload.data);
      } else if (envelope.kind === 'event') {
        const payload = envelope.payload as RemoteEvent;
        if (payload && typeof payload.channel === 'string') {
          for (const listener of this.eventListeners) listener(payload, envelope);
        }
      }
    } catch {
      this.socket?.close(1008, 'decryption failed');
    }
  }

  private handleClose(): void {
    this.socket = null;
    this.rejectPending(new Error('与电脑的连接已中断'));
    this.emitStatus('disconnected');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer) return;
    const delay = Math.min(15_000, 1_000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private emitStatus(status: Status): void {
    for (const listener of this.statusListeners) listener(status);
  }
}
