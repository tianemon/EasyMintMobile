import type { PairingOffer } from '../protocol/types';

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * 二维码两种形态：
 *  - 短码（当前）：`easymint://pair?h=<地址>&p=<端口>&c=<6 位码>`，约 50 字符。
 *    公钥/token/pcId 不进二维码——那样模块数要翻一倍，比浏览器二维码密得多。
 *    手机连上电脑后用短码换完整载荷（`mobile-pair-lookup`），通道仍是 47778。
 *  - 长码（旧桌面端）：`easymint://pair?payload=<base64url(数组或对象)>`，老码仍要能扫。
 */
export type PairingTarget =
  | { kind: 'compact'; host: string; port: number; code: string }
  | { kind: 'offer'; offer: PairingOffer };

/**
 * 载荷两种形态都要认：
 *  - 数组（当前桌面端）：`[version, token, pcId, pcName, addresses, port, publicKey, expiresAt]`
 *    字段名与引号在二维码里是纯开销，去掉后 base64 短约三成。
 *  - 对象（更早的桌面端）：老版本生成的二维码仍要能扫，不能因为升级手机端就失效。
 */
function toOffer(raw: unknown): Partial<PairingOffer> {
  if (Array.isArray(raw)) {
    const [version, token, pcId, pcName, addresses, port, publicKey, expiresAt] = raw as unknown[];
    return {
      version: Number(version) as PairingOffer['version'],
      token: typeof token === 'string' ? token : undefined,
      pcId: typeof pcId === 'string' ? pcId : undefined,
      pcName: typeof pcName === 'string' ? pcName : undefined,
      addresses: Array.isArray(addresses) ? addresses.map(String) : undefined,
      port: Number(port),
      publicKey: typeof publicKey === 'string' ? publicKey : undefined,
      expiresAt: Number(expiresAt),
    } as Partial<PairingOffer>;
  }
  return (raw ?? {}) as Partial<PairingOffer>;
}

export function parsePairingUri(uri: string): PairingTarget {
  const text = uri.trim();
  const short = /^easymint:\/\/pair\?h=([^&]+)&p=(\d{2,5})&c=([A-Za-z0-9]{4,12})$/.exec(text);
  if (short) {
    const host = decodeURIComponent(short[1]);
    const port = Number(short[2]);
    if (!host || !Number.isInteger(port)) throw new Error('配对二维码内容不完整');
    return { kind: 'compact', host, port, code: short[3].toUpperCase() };
  }

  const match = /^easymint:\/\/pair\?payload=([^&]+)$/.exec(text);
  if (!match) throw new Error('这不是 EasyMint 配对二维码');
  let raw: unknown;
  try {
    raw = JSON.parse(decodeBase64Url(decodeURIComponent(match[1])));
  } catch {
    throw new Error('配对二维码内容不完整');
  }
  const offer = toOffer(raw);
  if (
    offer.version !== 1 || !offer.token || !offer.pcId || !offer.pcName ||
    !Array.isArray(offer.addresses) || !offer.addresses.every((item) => typeof item === 'string') ||
    !Number.isInteger(offer.port) || !offer.publicKey || !Number.isFinite(offer.expiresAt)
  ) throw new Error('配对二维码内容不完整');
  if ((offer.expiresAt ?? 0) <= Date.now()) throw new Error('配对二维码已过期，请在电脑上重新生成');
  if (offer.addresses.length === 0) throw new Error('电脑没有可用的局域网地址');
  return { kind: 'offer', offer: offer as PairingOffer };
}

/** 把 base64url 载荷解成原始结构（数组或对象），交给 validatePairingOffer 归一化。 */
export function decodePairingPayload(encoded: string): unknown {
  return JSON.parse(decodeBase64Url(encoded));
}

/** 短码换完整载荷后的校验（与长码同一套条件，错误文案也一致）。 */
export function validatePairingOffer(raw: unknown): PairingOffer {
  const offer = toOffer(raw);
  if (
    offer.version !== 1 || !offer.token || !offer.pcId || !offer.pcName ||
    !Array.isArray(offer.addresses) || !offer.addresses.every((item) => typeof item === 'string') ||
    !Number.isInteger(offer.port) || !offer.publicKey || !Number.isFinite(offer.expiresAt)
  ) throw new Error('配对二维码内容不完整');
  if ((offer.expiresAt ?? 0) <= Date.now()) throw new Error('配对二维码已过期，请在电脑上重新生成');
  if (offer.addresses.length === 0) throw new Error('电脑没有可用的局域网地址');
  return offer as PairingOffer;
}
