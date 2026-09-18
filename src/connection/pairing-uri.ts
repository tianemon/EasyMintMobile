import type { PairingOffer } from '../protocol/types';

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parsePairingUri(uri: string): PairingOffer {
  const match = /^easymint:\/\/pair\?payload=([^&]+)$/.exec(uri.trim());
  if (!match) throw new Error('这不是 EasyMint 配对二维码');
  const offer = JSON.parse(decodeBase64Url(decodeURIComponent(match[1]))) as Partial<PairingOffer>;
  if (
    offer.version !== 1 || !offer.token || !offer.pcId || !offer.pcName ||
    !Array.isArray(offer.addresses) || !offer.addresses.every((item) => typeof item === 'string') ||
    !Number.isInteger(offer.port) || !offer.publicKey || !Number.isFinite(offer.expiresAt)
  ) throw new Error('配对二维码内容不完整');
  if ((offer.expiresAt ?? 0) <= Date.now()) throw new Error('配对二维码已过期，请在电脑上重新生成');
  if (offer.addresses.length === 0) throw new Error('电脑没有可用的局域网地址');
  return offer as PairingOffer;
}
