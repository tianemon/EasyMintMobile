import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export type AttachmentKind = 'image' | 'doc';

/** 只存在于当前进程内；不会写入 AsyncStorage/SecureStore。 */
export type DraftAttachment = {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  size: number;
  data: string;
};

// 三项上限逐条镜像桌面端 app/main/services/remote-command-router.ts 的 attachmentSchema
// 与 saveRemoteAttachments：单文件 15 MB、单次总量 15 MB、单次最多 10 个
// （桌面端是 z.array(attachmentSchema).max(10)，超了整条命令会被拒）。
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 10;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
const DOCUMENT_TYPES = [
  'application/pdf', 'text/*', 'application/json', 'application/xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** 系统文件选择器 → 内存 base64；读取后立即删除 DocumentPicker 创建的临时副本。 */
export async function pickAttachments(kind: AttachmentKind): Promise<DraftAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: kind === 'image' ? IMAGE_TYPES : DOCUMENT_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const picked: DraftAttachment[] = [];
  for (const asset of result.assets) {
    if ((asset.size ?? 0) > MAX_FILE_BYTES) throw new Error(`${asset.name} 超过 15 MB`);
    const file = new File(asset.uri);
    try {
      const data = asset.base64 ?? await file.base64();
      // 先用 asset.size 短路（避免为超大文件读 base64），读完再按解出的内容复核一遍：
      // 部分 Android provider 不给 size，而桌面端是按解码后的 buffer 判 15 MB 的，判据要对齐。
      const bytes = asset.size ?? Math.floor(data.length * 0.75);
      if (bytes > MAX_FILE_BYTES) throw new Error(`${asset.name} 超过 15 MB`);
      picked.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: asset.name,
        kind,
        mimeType: asset.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'),
        size: bytes,
        data,
      });
    } finally {
      // copyToCacheDirectory=true 保证这里是应用临时副本，不会删除用户的原文件。
      try { file.delete(); } catch { /* 系统可能已回收临时文件 */ }
    }
  }
  return picked;
}

/**
 * 把新选中的附件并入待发列表，上限与桌面端一致（见文件头注释）。
 * 超限在「选中的那一刻」就暴露，而不是发出去被桌面端 zod 整条拒掉。
 * 数量超限时保留能装下的前几个（丢弃整批对用户更不友好），总量超限则整批不收——
 * 因为总量约束下"收哪几个"没有自然答案，静默截断会让用户以为附件都带上了。
 */
export function appendAttachments(current: DraftAttachment[], picked: DraftAttachment[]): { next: DraftAttachment[]; notice?: string } {
  const room = MAX_ATTACHMENT_COUNT - current.length;
  if (room <= 0) return { next: current, notice: `单次最多发送 ${MAX_ATTACHMENT_COUNT} 个附件` };
  const dropped = Math.max(0, picked.length - room);
  const next = [...current, ...(dropped ? picked.slice(0, room) : picked)];
  if (next.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { next: current, notice: '单次发送的附件总量不能超过 15 MB' };
  }
  return { next, notice: dropped ? `单次最多发送 ${MAX_ATTACHMENT_COUNT} 个附件，已忽略 ${dropped} 个` : undefined };
}
