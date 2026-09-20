import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

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
/** 只选文档：图片改由系统相册选（见 pickImages），所以这里不再列图片类型 */
const DOCUMENT_TYPES = [
  'application/pdf', 'text/*', 'application/json', 'application/xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function newAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 按 base64 的实际内容定图片类型（实测各格式的前缀：JPEG `/9j/`、PNG `iVBOR`、GIF `R0lG`、WEBP `UklGR`）。
 * 不能只信 asset.mimeType：iOS 选相册里的 HEIC 时系统会把数据转成 JPEG，而 mimeType 可能仍报原类型，
 * 声明与实际不符会让手机端的预览和桌面端的 Pi 都按错误类型处理。
 */
function sniffImageMime(data: string): string | undefined {
  if (data.startsWith('/9j/')) return 'image/jpeg';
  if (data.startsWith('iVBOR')) return 'image/png';
  if (data.startsWith('R0lG')) return 'image/gif';
  if (data.startsWith('UklGR')) return 'image/webp';
  return undefined;
}

/**
 * 选图走**系统相册**：iOS 是 PHPicker、Android 是系统 Photo Picker/相册。
 * 不能用 DocumentPicker —— 那条路打开的是 iOS「文件」App 与 Android 的 SAF 文件浏览器，里面看不到相册照片。
 * base64 由系统直接给出（iOS 上 HEIC 会被转成 JPEG），不需要我们自己读文件，也不落盘。
 */
async function pickImages(): Promise<DraftAttachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    // 不传 quality（默认 1.0）：iOS 选 PNG 本来就不重编码、照片保持原质量；体积交给下面的 15 MB 上限兜底
    base64: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    const label = asset.fileName ?? '图片';
    const data = asset.base64;
    if (!data) throw new Error(`${label} 读取失败`);
    // 判据用实际要发出去的那串 base64 解出的字节数（桌面端是按解码后的 buffer 判 15 MB 的，判据要对齐）
    const bytes = Math.floor(data.length * 0.75);
    if (bytes > MAX_FILE_BYTES) throw new Error(`${label} 超过 15 MB`);
    return {
      id: newAttachmentId(),
      name: asset.fileName ?? `image-${Date.now()}.jpg`,
      kind: 'image',
      mimeType: sniffImageMime(data) ?? asset.mimeType ?? 'image/jpeg',
      size: bytes,
      data,
    };
  });
}

/** 系统文件选择器 → 内存 base64；读取后立即删除 DocumentPicker 创建的临时副本。 */
async function pickDocuments(): Promise<DraftAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOCUMENT_TYPES,
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
        id: newAttachmentId(),
        name: asset.name,
        kind: 'doc',
        mimeType: asset.mimeType ?? 'application/octet-stream',
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

/** 图片走系统相册，文档走系统文件选择器 */
export async function pickAttachments(kind: AttachmentKind): Promise<DraftAttachment[]> {
  return kind === 'image' ? pickImages() : pickDocuments();
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
