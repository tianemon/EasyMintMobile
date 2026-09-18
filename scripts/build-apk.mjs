import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { DEFAULT_KEEP_COUNT, pruneOldApks } from './prune-apks.mjs';

// 本仓库即移动端工程根（2026-09-18 起从 EasyMint 主仓库迁出为独立仓库）。
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
/**
 * 只构建手机真正用得到的 ABI。
 * 默认 arm64-v8a（所有现代手机）；x86 / x86_64 只给模拟器、armeabi-v7a 是 32 位老设备——
 * 一起编会让原生编译量翻四倍（实测包体 120MB 里 66MB 是这些用不到的架构）。
 * 需要全架构包时：APK_ARCH=armeabi-v7a,arm64-v8a,x86,x86_64 npm run apk
 */
const apkArch = process.env.APK_ARCH ?? 'arm64-v8a';
const expo = join(projectRoot, 'node_modules', '.bin', isWindows ? 'expo.cmd' : 'expo');
const gradle = join(projectRoot, 'android', isWindows ? 'gradlew.bat' : 'gradlew');
// Expo prebuild 会重建 android/ 并删掉其中的 local.properties，构建机不一定导出 ANDROID_HOME——
// 这里主动探测 SDK 位置并注入环境，避免每次 prebuild 后 Gradle 找不到本机 SDK。
const sdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.platform === 'darwin' ? join(homedir(), 'Library', 'Android', 'sdk') : undefined,
  process.platform === 'linux' ? join(homedir(), 'Android', 'Sdk') : undefined,
].filter(Boolean);
const androidSdk = sdkCandidates.find((candidate) => existsSync(candidate));
const buildEnv = androidSdk
  ? { ...process.env, ANDROID_HOME: androidSdk, ANDROID_SDK_ROOT: androidSdk }
  : process.env;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: buildEnv, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(expo)) {
  throw new Error('缺少 node_modules，请先执行 npm install。');
}
if (!androidSdk) {
  throw new Error('找不到 Android SDK。请设置 ANDROID_HOME，或安装到系统默认 SDK 目录。');
}

/** 把限定后的 ABI 写进 gradle.properties（expo prebuild 会重置该文件，故每次 prebuild 后重新写） */
function patchGradleProperties() {
  const file = join(projectRoot, 'android', 'gradle.properties');
  const text = readFileSync(file, 'utf8');
  const line = `reactNativeArchitectures=${apkArch}`;
  const next = /^reactNativeArchitectures=.*$/m.test(text)
    ? text.replace(/^reactNativeArchitectures=.*$/m, line)
    : `${text.replace(/\n*$/, '\n')}${line}\n`;
  writeFileSync(file, next);
  console.log(`已限定构建 ABI：${apkArch}`);
}

/**
 * 原生工程与 app.json / package.json 一致时跳过 expo prebuild——
 * prebuild 会重建整个 android/，使 Gradle 增量缓存失效（是重复构建慢的主因）。
 * 两者不一致（改了配置/依赖）或 android/ 不存在时照旧重建。
 */
function ensurePrebuild() {
  const marker = join(projectRoot, 'android', '.prebuild-inputs');
  const inputs = createHash('sha256')
    .update(readFileSync(join(projectRoot, 'app.json')))
    .update(readFileSync(join(projectRoot, 'package.json')))
    .digest('hex');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === inputs) {
    console.log('原生工程与 app.json/package.json 一致，跳过 expo prebuild（保留 Gradle 增量）');
    return;
  }
  run(expo, ['prebuild', '--platform', 'android', '--no-install'], projectRoot);
  writeFileSync(marker, inputs);
  patchGradleProperties();
}

ensurePrebuild();
run(gradle, ['assembleRelease'], join(projectRoot, 'android'));

const source = join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(source)) throw new Error(`Gradle 构建完成，但没有找到 APK：${source}`);

const now = new Date();
const pad = (value, width = 2) => String(value).padStart(width, '0');
// 命名：EasyMint-yyyyMMddHHmmss.apk（时间取到秒，同一秒内不会产生两个包）
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const outputDir = join(projectRoot, 'apk');
const output = join(outputDir, `EasyMint-${stamp}.apk`);
mkdirSync(outputDir, { recursive: true });
copyFileSync(source, output);

// 新包落盘后才清理旧包——构建失败时不动已有产物。
const pruned = pruneOldApks(outputDir, DEFAULT_KEEP_COUNT);

const sha256 = createHash('sha256').update(readFileSync(output)).digest('hex');
console.log(`\nAPK: ${output}`);
console.log(`SHA-256: ${sha256}`);
if (pruned.length > 0) console.log(`已清理旧包 ${pruned.length} 个（保留最近 ${DEFAULT_KEEP_COUNT} 个）：${pruned.join(', ')}`);
