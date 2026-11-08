import * as SecureStore from 'expo-secure-store';
import { randomId } from './crypto';

/**
 * 本机安装标识：首次配对时生成，之后一直复用。
 *
 * 为什么必须稳定：电脑端 `acceptPair` 只按 `deviceId` 去重（同 id 覆盖旧记录）。
 * deviceId 每次配对都随机的话，同一台手机反复扫码会在「已配对设备」里堆出一串
 * 同名记录，而且撤销其中一条时另外几条仍然有效。
 *
 * 前缀 `app-` 与浏览器端的 `web-` 分开：桌面端按前缀把设备分流到「手机 App」和
 * 「手机浏览器」两条通道的准入判定（`isDeviceAllowed`）。
 */
const KEY = 'easymint.installation-id.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let cached: string | null = null;

/** 本机 deviceId（含前缀）。SecureStore 不可用时退回一次性 id：功能优先，不因存不了就配不了对。 */
export async function appDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (existing) {
      cached = `app-${existing}`;
      return cached;
    }
    const fresh = randomId();
    await SecureStore.setItemAsync(KEY, fresh, OPTIONS);
    cached = `app-${fresh}`;
    return cached;
  } catch {
    return `app-${randomId()}`;
  }
}
