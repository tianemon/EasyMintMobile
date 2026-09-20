import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 保留几个产物。默认 1：只留最新包（与安卓侧同一约定）——产物可重新构建。 */
export const DEFAULT_KEEP_COUNT = 1;

/**
 * 只匹配 build-ipa.mjs 产出的名字：EasyMint-<yyyyMMddHHmmss>.ipa 与 ...-unsigned.ipa。
 * 手工打的其他 ipa（例如不带时间戳的 EasyMint-unsigned.ipa）不在此列，不会被清掉。
 */
const IPA_NAME = /^EasyMint-\d{14}(-unsigned)?\.ipa$/;

/**
 * 只保留 ipaDir 下最近 keepCount 个 EasyMint-<时间戳>.ipa（按修改时间倒序），其余删除。
 * 返回被删除的文件名。
 */
export function pruneOldIpas(ipaDir, keepCount = DEFAULT_KEEP_COUNT) {
  const entries = readdirSync(ipaDir)
    .filter((name) => IPA_NAME.test(name))
    .map((name) => {
      const path = join(ipaDir, name);
      return { name, path, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const stale = entries.slice(Math.max(0, keepCount));
  for (const item of stale) rmSync(item.path, { force: true });
  return stale.map((item) => item.name);
}

// 直接运行：清理本仓库的 ipa 目录（用法：node scripts/prune-ipas.mjs [保留个数]）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ipaDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'ipa');
  const keep = Number(process.argv[2] ?? DEFAULT_KEEP_COUNT);
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`保留个数需为正整数，收到：${process.argv[2]}`);
  const removed = pruneOldIpas(ipaDir, keep);
  if (removed.length === 0) console.log(`ipa/ 无需清理（保留最近 ${keep} 个）`);
  else {
    console.log(`保留最近 ${keep} 个，已清理 ${removed.length} 个：`);
    for (const name of removed) console.log(`  - ${name}`);
  }
}
