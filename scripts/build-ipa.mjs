import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appPath, derivedData, ensurePods, ensurePrebuild, iosDir, projectRoot,
  resolveTeamId, run, scheme, stamp, workspace,
} from './ios-shared.mjs';
import { DEFAULT_KEEP_COUNT, pruneOldIpas } from './prune-ipas.mjs';

/**
 * 打 IPA（对应安卓侧的 `npm run apk`）：
 *   默认出**已签名**的 release IPA（可留档、可装已注册设备）
 *   加 `--unsigned`（或 IPA_UNSIGNED=1）出**未签名** IPA，给 Sideloadly/AltStore 用——对方用自己的 Apple ID 重签
 *
 * 用法：npm run ipa
 *       npm run ipa -- --unsigned
 */

const unsigned = process.argv.includes('--unsigned') || process.env.IPA_UNSIGNED === '1';
// 先把模式打出来：`npm run ipa --unsigned` 这种漏写 `--` 的写法会被 npm 静默吞掉参数、
// 悄悄走已签名分支，没有这行提示很难发现（实测 npm 10.9.7）
console.log(unsigned ? '模式：未签名 IPA（给 Sideloadly/AltStore 用）' : '模式：已签名 IPA');
const archivePath = join(iosDir, 'build', `${scheme}.xcarchive`);
const outputDir = join(projectRoot, 'ipa');
const output = join(outputDir, `EasyMint-${stamp()}${unsigned ? '-unsigned' : ''}.ipa`);

/**
 * 导出选项。method 必须用 Xcode 26+ 的名字——`xcodebuild -help` 里列出的可用值只有
 * app-store-connect / release-testing / enterprise / debugging / developer-id / mac-application / validation，
 * 旧的 development / ad-hoc 已从列表移除（传了直接报错）。免费个人团队没有分发证书，只能用 debugging。
 */
function exportOptions(teamId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>debugging</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>${teamId}</string>
  <key>destination</key><string>export</string>
</dict>
</plist>
`;
}

/**
 * 未签名 IPA：IPA 就是个 zip，结构是 Payload/<App>.app。
 * cpSync 默认不解引用符号链接（dereference 默认 false），.app 里 Frameworks 的链接会原样保留。
 */
function zipApp(app, target) {
  const stage = mkdtempSync(join(tmpdir(), 'easymint-ipa-'));
  cpSync(app, join(stage, 'Payload', `${scheme}.app`), { recursive: true });
  run('zip', ['-qry', target, 'Payload'], stage);
  rmSync(stage, { recursive: true, force: true });
}

ensurePrebuild();
ensurePods();
mkdirSync(outputDir, { recursive: true });

if (unsigned) {
  // 不碰证书与描述文件，所以不需要 Team，也不需要 -allowProvisioningUpdates
  run('xcodebuild', [
    '-workspace', workspace, '-scheme', scheme, '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-derivedDataPath', derivedData,
    'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=',
    'build',
  ], iosDir);
  if (!existsSync(appPath)) throw new Error(`构建成功但没找到产物：${appPath}`);
  zipApp(appPath, output);
} else {
  const team = resolveTeamId();
  run('xcodebuild', [
    '-workspace', workspace, '-scheme', scheme, '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-archivePath', archivePath,
    '-derivedDataPath', derivedData,
    '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration',
    `DEVELOPMENT_TEAM=${team}`,
    'archive',
  ], iosDir);
  if (!existsSync(archivePath)) throw new Error(`归档失败，没找到：${archivePath}`);

  const optionsFile = join(tmpdir(), `easymint-ExportOptions-${process.pid}.plist`);
  writeFileSync(optionsFile, exportOptions(team));
  // xcodebuild 把 IPA 命名为 <scheme>.ipa 落到 -exportPath：先导到临时目录，再改名成带时间戳的约定名
  const exportDir = mkdtempSync(join(tmpdir(), 'easymint-export-'));
  run('xcodebuild', [
    '-exportArchive',
    '-archivePath', archivePath,
    '-exportPath', exportDir,
    '-exportOptionsPlist', optionsFile,
    '-allowProvisioningUpdates',
  ], iosDir);
  const exported = join(exportDir, `${scheme}.ipa`);
  if (!existsSync(exported)) throw new Error(`导出结束但没找到 IPA：${exported}`);
  copyFileSync(exported, output);
  rmSync(exportDir, { recursive: true, force: true });
  rmSync(optionsFile, { force: true });
}

console.log(`\nIPA: ${output}`);
console.log(`SHA-256: ${createHash('sha256').update(readFileSync(output)).digest('hex')}`);
console.log(unsigned
  ? '未签名包：装不到正常 iPhone 上，要用 Sideloadly / AltStore 填自己的 Apple ID 重签。'
  : '已签名包：免费个人团队 7 天有效，要装到手机直接跑 npm run ios（编译+安装一步到位）。');

const pruned = pruneOldIpas(outputDir, DEFAULT_KEEP_COUNT);
if (pruned.length > 0) console.log(`已清理旧包 ${pruned.length} 个（保留最近 ${DEFAULT_KEEP_COUNT} 个）：${pruned.join(', ')}`);
