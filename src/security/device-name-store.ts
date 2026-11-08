import * as SecureStore from 'expo-secure-store';
import { deviceName, modelName, osName } from 'expo-device';
import { resolveDeviceName } from '../connection/device-name';

/**
 * 本机在电脑上显示的名字。
 *
 * 为什么需要用户自己填：iOS 16 起要读系统里的「设备名称」需要 Apple 特批的 entitlement，
 * 没有就恒返回 "iPhone"；浏览器端更是没有任何 API。能自动拿到的只有型号（iPhone 16 Pro），
 * 两台同型号手机在电脑上就分不开。所以默认给型号，允许改。
 */
const KEY = 'easymint.device-name.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** 没起名时的默认值：型号优先（自定义名在 iOS 上拿不到）。 */
export function defaultDeviceName(): string {
  return resolveDeviceName({ deviceName, modelName, osName });
}

export async function loadSelfName(): Promise<string> {
  try {
    const saved = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // 读不到就用默认，不让存储问题挡住配对
  }
  return defaultDeviceName();
}

/** 返回落盘后的名字（trim + 截断），空值不写。 */
export async function saveSelfName(name: string): Promise<string> {
  const next = name.trim().slice(0, 40);
  if (!next) return loadSelfName();
  await SecureStore.setItemAsync(KEY, next, OPTIONS);
  return next;
}
