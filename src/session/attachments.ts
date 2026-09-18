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

const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
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
      picked.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: asset.name,
        kind,
        mimeType: asset.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'),
        size: asset.size ?? Math.floor(data.length * 0.75),
        data,
      });
    } finally {
      // copyToCacheDirectory=true 保证这里是应用临时副本，不会删除用户的原文件。
      try { file.delete(); } catch { /* 系统可能已回收临时文件 */ }
    }
  }
  return picked;
}
