import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * iOS 打包/安装两个脚本（install-ios.mjs / build-ipa.mjs）的公共部分：
 * 生成原生工程、装 Pods、取签名 Team 与目标设备。
 *
 * ⚠️ 必须在**你自己的终端**里跑：Xcode 构建过程中 expo 的 ExpoModulesJSI 构建阶段会再起一个
 * xcodebuild、Swift 宏也会另起 ExpoModulesMacros-tool 进程，两者都要申请 sandbox，
 * 而 AI 助手那侧的 shell 被宿主套了沙盒（sandbox_apply: Operation not permitted），必失败。
 */

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const iosDir = join(projectRoot, 'ios');

/** app.json 的 expo.name 就是 prebuild 生成的工程名（EasyMint）；可用 IOS_SCHEME 覆盖 */
export const appConfig = JSON.parse(readFileSync(join(projectRoot, 'app.json'), 'utf8')).expo;
export const scheme = process.env.IOS_SCHEME ?? appConfig.name;
export const workspace = join(iosDir, `${scheme}.xcworkspace`);

/** 编译产物目录：固定成 ios/build/DD，两次脚本（安装 / 打 IPA）能共用同一份增量缓存 */
export const derivedData = join(iosDir, 'build', 'DD');
export const appPath = join(derivedData, 'Build', 'Products', 'Release-iphoneos', `${scheme}.app`);

/** 同步执行并透传输出；失败直接以子进程的退出码结束（不要吞掉 Xcode 的报错） */
export function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`\n命令失败（退出码 ${result.status ?? 1}）：${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

/**
 * 原生工程与 app.json / package.json 一致时跳过 expo prebuild——与 build-apk.mjs 同一判据，
 * 只是标记落在 ios/ 下（两端各自独立）。prebuild 会清掉 ios/ 目录使 Pods 与编译缓存失效，
 * 是重复构建慢的主因。
 */
export function ensurePrebuild() {
  const marker = join(iosDir, '.prebuild-inputs');
  const inputs = createHash('sha256')
    .update(readFileSync(join(projectRoot, 'app.json')))
    .update(readFileSync(join(projectRoot, 'package.json')))
    .digest('hex');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === inputs) {
    console.log('原生工程与 app.json/package.json 一致，跳过 expo prebuild');
    return;
  }
  run(join(projectRoot, 'node_modules', '.bin', 'expo'), ['prebuild', '--platform', 'ios', '--no-install']);
  writeFileSync(marker, inputs);
}

/**
 * 是否需要重装 Pods：用 CocoaPods 自己的判据——Podfile.lock 与 Pods/Manifest.lock 是否一致
 * （Xcode 里那条 `diff Podfile.lock Manifest.lock` 的脚本阶段就是这么判的）。
 * prebuild 清过目录、或加了新原生模块时，这里会自动触发一次 pod install。
 */
export function ensurePods() {
  const lock = join(iosDir, 'Podfile.lock');
  const manifest = join(iosDir, 'Pods', 'Manifest.lock');
  const same = existsSync(lock) && existsSync(manifest) && readFileSync(lock, 'utf8') === readFileSync(manifest, 'utf8');
  if (same) {
    console.log('Pods 与 Podfile.lock 一致，跳过 pod install');
    return;
  }
  run('pod', ['install'], iosDir);
}

/**
 * 取签名用的 Team ID：优先环境变量 IOS_TEAM_ID，否则从 Xcode 已登录账号里读
 * （偏好里的 IDEProvisioningTeamByIdentifier）。免费个人团队也在这里，无需付费账号。
 */
export function resolveTeamId() {
  if (process.env.IOS_TEAM_ID) return process.env.IOS_TEAM_ID;

  const plist = join(homedir(), 'Library', 'Preferences', 'com.apple.dt.Xcode.plist');
  let extracted;
  try {
    // 只把这一棵子树转成 JSON：整个 Xcode 偏好里含二进制对象，
    // `plutil -convert json` 会直接报 "Invalid object in plist for JSON format"
    extracted = execFileSync(
      'plutil',
      ['-extract', 'IDEProvisioningTeamByIdentifier', 'json', '-o', '-', plist],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch {
    throw new Error('读不到 Xcode 里已登录的开发者团队。请在 Xcode → Settings → Accounts 添加 Apple ID，或用 IOS_TEAM_ID=<团队ID> 指定。');
  }

  const teams = Object.values(JSON.parse(extracted)).flat().filter((team) => team?.teamID);
  if (teams.length === 0) {
    throw new Error('Xcode 里没有已登录的开发者团队。请在 Xcode → Settings → Accounts 添加 Apple ID，或用 IOS_TEAM_ID=<团队ID> 指定。');
  }
  if (teams.length > 1) {
    const list = teams.map((team) => `${team.teamID}（${team.teamName}）`).join('、');
    throw new Error(`Xcode 里有多个团队，请用 IOS_TEAM_ID 指定其中一个：${list}`);
  }
  console.log(`签名团队：${teams[0].teamID}（${teams[0].teamName}${teams[0].isFreeProvisioningTeam ? '，免费账号 7 天有效期' : ''}）`);
  return teams[0].teamID;
}

/**
 * 递归找 key：devicectl 的 JSON 现在带 _deprecationNotice，声明 hardwareProperties /
 * deviceProperties / connectionProperties 将迁到 properties 下。按键名递归取值，
 * 字段换位置时不会瞎。
 */
function findKey(node, key) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findKey(item, key);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (key in node) return node[key];
  for (const value of Object.values(node)) {
    const hit = findKey(value, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * 设备显示名。先按确切路径取，取不到再退回硬件 marketingName——
 * 不能直接递归找 `name`：JSON 里 capabilities[].name 会先命中（曾取到 "Acquire Usage Assertion"）。
 */
function deviceName(entry) {
  return entry?.deviceProperties?.name
    ?? entry?.properties?.state?.name
    ?? findKey(entry, 'marketingName')
    ?? '未知设备';
}

/** 取第一台连着电脑的真机（reality=physical，模拟器不算）；IOS_DEVICE=<UDID> 可覆盖 */
export function resolveDeviceUdid() {
  if (process.env.IOS_DEVICE) return process.env.IOS_DEVICE;

  const dir = mkdtempSync(join(tmpdir(), 'easymint-devices-'));
  const file = join(dir, 'devices.json');
  run('xcrun', ['devicectl', 'list', 'devices', '--json-output', file]);

  const devices = JSON.parse(readFileSync(file, 'utf8')).result?.devices ?? [];
  const physical = devices.filter((device) => findKey(device, 'reality') === 'physical');
  if (physical.length === 0) {
    throw new Error('没检测到已连接的 iPhone/iPad。用数据线连上、在手机上点「信任」后重试，或用 IOS_DEVICE=<UDID> 指定。');
  }
  if (physical.length > 1) console.log(`检测到 ${physical.length} 台真机，用第一台`);
  console.log(`目标设备：${deviceName(physical[0])}`);
  return findKey(physical[0], 'udid');
}

/** 产物时间戳，与 build-apk.mjs 的 yyyyMMddHHmmss 同格式 */
export function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
