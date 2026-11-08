/**
 * 手机上报给电脑的设备名：电脑端「请求连接」弹窗里显示的那一行。
 *
 * 三档降级，谁有辨识度用谁：
 *  1. 用户给设备起的名字（iOS 设置里的「名称」、Android 的「设备名称」）；
 *  2. 型号（`iPhone 15 Pro` / `Pixel 8`）——iOS 16 起没配 entitlement 时 `deviceName`
 *     恒为泛名「iPhone」，此时型号比它更有用；
 *  3. 平台名（`iPhone` / `iPad` / `Android`），保底不为空。
 *
 * 纯函数、不引 expo-device：判断逻辑要能被单测覆盖，原生模块只在外层取一次值。
 */
type DeviceNameInput = {
  deviceName?: string | null;
  modelName?: string | null;
  osName?: string | null;
};

/** iOS 16+ 未授权的泛名，以及 Android 上偶尔出现的空/占位值。 */
const GENERIC = new Set(['iphone', 'ipad', 'ipod', 'android', 'apple iphone', 'unknown', '']);

export function resolveDeviceName(input: DeviceNameInput): string {
  const custom = (input.deviceName ?? '').trim();
  const model = (input.modelName ?? '').trim();
  const os = (input.osName ?? '').trim();
  if (custom && !GENERIC.has(custom.toLowerCase())) return custom;
  if (model && !GENERIC.has(model.toLowerCase())) return model;
  if (custom) return custom;
  if (/ipad/i.test(os)) return 'iPad';
  if (/ios/i.test(os)) return 'iPhone';
  if (/android/i.test(os)) return 'Android';
  return os || '手机';
}
