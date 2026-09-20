import * as SecureStore from 'expo-secure-store';

/**
 * 外观模式偏好（跟随系统 / 亮色 / 深色）。
 *
 * 存在系统安全存储里：它是**设备设置**，不是业务数据——App 仍不把项目/会话/消息/模型这些
 * 业务数据写入文件或缓存（见 AGENTS.md 数据边界条）。keychainAccessible 与 credential-store 保持一致。
 */
const KEY = 'easymint.theme-mode.v1';

export type ThemeMode = 'light' | 'dark' | 'auto';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

/** 读不到或值非法一律回落 auto：首次启动、存储被清、旧版本升级都走这条。 */
export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const value = await SecureStore.getItemAsync(KEY);
    return isThemeMode(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** 写失败只意味着下次启动回落 auto，不影响本次会话已生效的切换，所以不外抛。 */
export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, mode, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    /* 忽略：偏好非关键数据 */
  }
}
