import { existsSync } from 'node:fs';
import {
  appPath, derivedData, ensurePods, ensurePrebuild, iosDir,
  resolveDeviceUdid, resolveTeamId, run, scheme, workspace,
} from './ios-shared.mjs';

/**
 * 装 Release 版到已连接的真机（对应安卓侧的 `npm run apk` + 手动安装）：
 *   prebuild（按需）→ pod install（按需）→ xcodebuild build → devicectl 安装到手机
 *
 * 用法：npm run ios
 * 可覆盖：IOS_DEVICE=<UDID> IOS_TEAM_ID=<团队ID> IOS_SCHEME=<工程名>
 */

ensurePrebuild();
ensurePods();

const team = resolveTeamId();
const device = resolveDeviceUdid();

run('xcodebuild', [
  '-workspace', workspace,
  '-scheme', scheme,
  '-configuration', 'Release',
  '-destination', `id=${device}`,
  '-derivedDataPath', derivedData,
  // 让 xcodebuild 自己去 Apple 建/更新证书与描述文件，并把这台设备注册进账号
  // （免费个人团队也能用；少了这两个参数会报 "No profiles for 'com.easymint.mobile' were found"）
  '-allowProvisioningUpdates',
  '-allowProvisioningDeviceRegistration',
  `DEVELOPMENT_TEAM=${team}`,
  'build',
], iosDir);

if (!existsSync(appPath)) throw new Error(`构建成功但没找到产物：${appPath}`);

run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device, appPath]);

console.log(`\n已安装：${appPath}`);
console.log('首次打开若提示「不受信任的开发者」：设置 → 通用 → VPN 与设备管理 → 信任该证书。');
