import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

// 本仓库即移动端工程根（2026-09-18 起从 EasyMint 主仓库迁出为独立仓库）。
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
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

run(expo, ['prebuild', '--platform', 'android', '--no-install'], projectRoot);
run(gradle, ['assembleRelease'], join(projectRoot, 'android'));

const source = join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(source)) throw new Error(`Gradle 构建完成，但没有找到 APK：${source}`);

const now = new Date();
const pad = (value, width = 2) => String(value).padStart(width, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${pad(now.getMilliseconds(), 3)}`;
const outputDir = join(projectRoot, 'apk');
const output = join(outputDir, `EasyMint-${stamp}.apk`);
mkdirSync(outputDir, { recursive: true });
copyFileSync(source, output);

const sha256 = createHash('sha256').update(readFileSync(output)).digest('hex');
console.log(`\nAPK: ${output}`);
console.log(`SHA-256: ${sha256}`);
