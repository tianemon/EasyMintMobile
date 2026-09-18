import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 保留几个产物。默认 1：只留最新包（用户 2026-09-18 明确）——产物可重新构建，
 *  单包约 100MB，攒着只会占地方。要留上一版做对比时传参覆盖（如 `... 3`）。 */
export const DEFAULT_KEEP_COUNT = 1;

const APK_NAME = /^EasyMint-.*\.apk$/;

/**
 * 只保留 apkDir 下最近 keepCount 个 EasyMint-*.apk（按修改时间倒序），其余删除。
 * 只匹配本工具产出的包名，不动目录里的其他文件。返回被删除的文件名。
 */
export function pruneOldApks(apkDir, keepCount = DEFAULT_KEEP_COUNT) {
  const entries = readdirSync(apkDir)
    .filter((name) => APK_NAME.test(name))
    .map((name) => {
      const path = join(apkDir, name);
      return { name, path, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const stale = entries.slice(Math.max(0, keepCount));
  for (const item of stale) rmSync(item.path, { force: true });
  return stale.map((item) => item.name);
}

// 直接运行：清理本仓库的 apk 目录（用法：node scripts/prune-apks.mjs [保留个数]）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apkDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'apk');
  const keep = Number(process.argv[2] ?? DEFAULT_KEEP_COUNT);
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`保留个数需为正整数，收到：${process.argv[2]}`);
  const removed = pruneOldApks(apkDir, keep);
  if (removed.length === 0) console.log(`apk/ 无需清理（保留最近 ${keep} 个）`);
  else {
    console.log(`保留最近 ${keep} 个，已清理 ${removed.length} 个：`);
    for (const name of removed) console.log(`  - ${name}`);
  }
}
