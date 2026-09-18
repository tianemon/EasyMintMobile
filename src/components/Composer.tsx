import { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ModelCapabilities, PermissionMode } from '../protocol/types';
import type { AttachmentKind, DraftAttachment } from '../session/attachments';
import { THINKING_LABELS } from '../session/thinking';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius, shadow, space } from '../theme/tokens';
import type { ComposerControl } from '../types';
import { AttachmentKindIcon, ComposerIcon, Icon, SendIcon, iconSize } from './icons';

export type ModelProvider = ModelCapabilities['providers'][number];

export type ComposerProps = {
  draft: string;
  running: boolean;
  /** 是否已绑定会话（决定发送键是「发送」还是「中止」） */
  hasSession: boolean;
  permission: PermissionMode;
  permissionLabel: string;
  thinking: string;
  thinkingOptions: string[];
  model: string;
  provider: ModelProvider | null;
  contextPercent: number | null;
  /** 上下文窗口大小（token）；未知时悬浮只报百分比 */
  contextWindow: number | null;
  control: ComposerControl;
  attachments: DraftAttachment[];
  onDraftChange: (value: string) => void;
  onControlChange: (control: ComposerControl) => void;
  onSend: () => void;
  onStop: () => void;
  onSelectModel: (modelId: string, providerId: string | undefined) => void;
  onSelectPermission: (mode: PermissionMode) => void;
  onSelectThinking: (level: string) => void;
  onPickAttachments: (kind: AttachmentKind) => void;
  onRemoveAttachment: (id: string) => void;
};

const PERMISSION_OPTIONS = [['readonly', '只读'], ['standard', '标准'], ['full', '完全访问']] as const;

/** 附件菜单两项，顺序即上下排布：图片在上、文档在下（与 PC 附件菜单同序） */
const ATTACHMENT_OPTIONS = [['image', '图片'], ['doc', '文档']] as const;

// ── 上下文使用率环（几何与 PC 的 .ctx-ring 一致）────────────────
/** PC：svg 20×20 / r=8 / stroke 2.5 / 从 12 点起画（svg 整体旋转 -90°） */
const RING_SIZE = 20;
const RING_R = 8;
const RING_STROKE = 2.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R; // 50.27

/** 与 PC 的 ctxTip 同口径 */
function contextTip(percent: number | null, windowTokens: number | null): string {
  if (windowTokens === null) return percent === null ? '上下文使用率' : `上下文使用率 ${Math.round(percent)}%`;
  const windowLabel = formatTokenWindow(windowTokens);
  return percent === null ? `上下文窗口 ${windowLabel}` : `上下文窗口 ${windowLabel} · 已用 ${Math.round(percent)}%`;
}

/** 与 PC 的 formatTokenWindow 同口径（十进制优先：128000 同时是 125×1024，先判 1024 会显示成 125K） */
function formatTokenWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(2))}M`;
  if (tokens % 1000 === 0) return `${tokens / 1000}K`;
  if (tokens % 1024 === 0) return `${tokens / 1024}K`;
  return `${Math.floor(tokens / 1000)}K`;
}

/**
 * 输入卡片：多行输入 + 工具栏（模型/权限/思考/上下文占用/发送）+ 工具菜单。
 * memo：流式期间 App 每帧重渲染，props 未变时跳过整块输入卡（调用方需传稳定 props，见 App 的 composer）。
 */
export const Composer = memo(function Composer(props: ComposerProps) {
  const { draft, running, hasSession, permission, permissionLabel, thinking, thinkingOptions, model, provider, contextPercent, contextWindow, control, attachments } = props;
  const [showContextTip, setShowContextTip] = useState(false);
  const contextTipText = contextTip(contextPercent, contextWindow);
  const sendDisabled = running && !hasSession ? true : (!running && !draft.trim() && attachments.length === 0);
  return <View style={[styles.composerCard, shadow.sm]}>
    {!!attachments.length && <View style={styles.attachmentPreview}>{attachments.map((attachment) => <View key={attachment.id} style={styles.attachmentItem}>
      {attachment.kind === 'image'
        ? <Image source={{ uri: `data:${attachment.mimeType};base64,${attachment.data}` }} style={styles.attachmentImage} resizeMode="contain" />
        : <Text numberOfLines={2} style={styles.attachmentName}>{attachment.name}</Text>}
      <Pressable accessibilityLabel={`移除 ${attachment.name}`} onPress={() => props.onRemoveAttachment(attachment.id)} style={styles.attachmentRemove}>
        <Icon name="cross" size={10} color={colors.textSecondary} />
      </Pressable>
    </View>)}</View>}
    <TextInput value={draft} onChangeText={props.onDraftChange} placeholder={running ? '输入以引导当前任务…' : '给 EasyMint 发送消息…'} multiline style={styles.composerInput} />
    <View style={styles.composerToolbar}>
      {/* 回形针：与模型/权限/思考共用 control 槽位，展开互斥（打开附件菜单会收起另三个） */}
      <Pressable accessibilityLabel="添加附件" accessibilityState={{ expanded: control === 'attachment' }}
        style={[styles.composerIconButton, control === 'attachment' && styles.composerControlActive]}
        onPress={() => props.onControlChange(control === 'attachment' ? null : 'attachment')}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={control === 'attachment' ? colors.textSecondary : colors.textMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </Svg>
      </Pressable>
      <View style={styles.toolbarSpacer} />
      <Pressable accessibilityLabel={`选择权限，当前 ${permissionLabel}`} style={[styles.composerIconButton, control === 'permission' && styles.composerControlActive]} onPress={() => props.onControlChange(control === 'permission' ? null : 'permission')}>
        <ComposerIcon kind="permission" permission={permission} />
      </Pressable>
      <Pressable accessibilityLabel={`选择模型，当前 ${model || provider?.currentModel || '默认'}`} style={[styles.composerIconButton, control === 'model' && styles.composerControlActive]} onPress={() => props.onControlChange(control === 'model' ? null : 'model')}>
        <ComposerIcon kind="model" />
      </Pressable>
      <Pressable accessibilityLabel={`选择思考等级，当前 ${THINKING_LABELS[thinking] ?? thinking}`} style={[styles.composerIconButton, control === 'thinking' && styles.composerControlActive]} onPress={() => props.onControlChange(control === 'thinking' ? null : 'thinking')}>
        <ComposerIcon kind="thinking" />
      </Pressable>
      {/* 上下文使用率环：点击浮出具体数值（PC 是同位置 hover 悬浮，手机无 hover 改点击） */}
      <Pressable accessibilityLabel={contextTipText} onPress={() => setShowContextTip((value) => !value)} style={styles.contextUsage}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={styles.contextRingSvg}>
          <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke={colors.surfaceHover} strokeWidth={RING_STROKE} />
          <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke={colors.accent} strokeWidth={RING_STROKE} strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={contextPercent === null ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - contextPercent / 100)} />
        </Svg>
        {showContextTip && <View style={styles.contextTip}><Text numberOfLines={1} style={styles.contextTipText}>{contextTipText}</Text></View>}
      </Pressable>
      <Pressable disabled={sendDisabled} onPress={() => running && hasSession ? props.onStop() : props.onSend()}
        style={({ pressed }) => [styles.sendButton, (pressed || sendDisabled) && commonStyles.dim, running && styles.stopButton]}>
        <SendIcon stop={running && hasSession} />
      </Pressable>
    </View>
    {/* 附件菜单：两个整行按钮上下排布（图片在上、文档在下），不套列表行的样式——
        选中后先收起菜单再唤系统选择器，避免选择器盖在菜单上 */}
    {control === 'attachment' && <View style={styles.attachmentMenu}>
      {ATTACHMENT_OPTIONS.map(([kind, label]) => <Pressable key={kind} accessibilityLabel={`选择${label}`}
        style={({ pressed }) => [styles.attachmentOption, pressed && styles.attachmentOptionPressed]}
        onPress={() => { props.onControlChange(null); props.onPickAttachments(kind); }}>
        <AttachmentKindIcon kind={kind} />
        <Text style={styles.attachmentOptionText}>{label}</Text>
      </Pressable>)}
    </View>}
    {control === 'model' && <View style={styles.composerMenu}>
      <Text style={styles.composerMenuTitle}>{provider?.name ?? '当前供应商'}</Text>
      {(provider?.models ?? []).map((item) => <Pressable key={item.id} style={styles.composerOption} onPress={() => { props.onSelectModel(item.id, provider?.id); props.onControlChange(null); }}>
        <Text style={styles.composerOptionText}>{item.name}</Text>{model === item.id && <Icon name="check" size={iconSize.nav} color={colors.accent} />}
      </Pressable>)}
    </View>}
    {control === 'permission' && <View style={styles.composerMenu}>
      {PERMISSION_OPTIONS.map(([value, label]) => <Pressable key={value} style={styles.composerOption} onPress={() => { props.onSelectPermission(value); props.onControlChange(null); }}>
        <Text style={styles.composerOptionText}>{label}</Text>{permission === value && <Icon name="check" size={iconSize.nav} color={colors.accent} />}
      </Pressable>)}
    </View>}
    {control === 'thinking' && <View style={styles.composerMenu}>
      {thinkingOptions.map((item) => <Pressable key={item} style={styles.composerOption} onPress={() => { props.onSelectThinking(item); props.onControlChange(null); }}>
        <Text style={styles.composerOptionText}>{THINKING_LABELS[item] ?? item}</Text>{thinking === item && <Icon name="check" size={iconSize.nav} color={colors.accent} />}
      </Pressable>)}
    </View>}
  </View>;
});

const styles = StyleSheet.create({
  composerCard: { margin: space.s4, marginTop: 6, marginBottom: 26, padding: space.s1, borderRadius: radius.lg, backgroundColor: colors.elevated },
  composerInput: { minHeight: 52, maxHeight: 130, paddingHorizontal: space.s3, paddingTop: 10, paddingBottom: 6, color: colors.textPrimary, fontSize: fontSize.base, lineHeight: 22, textAlignVertical: 'top' },
  composerToolbar: { minHeight: 38, paddingHorizontal: space.s1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolbarSpacer: { flex: 1 },
  composerIconButton: { width: 26, height: 26, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  composerControlActive: { backgroundColor: colors.surfaceHover },
  contextUsage: { marginLeft: 2, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  // PC 的 .ctx-ring svg：整体旋转 -90°，让进度从 12 点方向起画
  contextRingSvg: { transform: [{ rotate: '-90deg' }] },
  // 锚在左侧向右生长：圆环左边只剩约 100px，靠右锚定会把文字撩出屏幕外
  contextTip: { position: 'absolute', bottom: 32, left: -8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.elevated, ...shadow.sm },
  contextTipText: { color: colors.textPrimary, fontSize: fontSize.caption, fontWeight: '600' },
  sendButton: { marginLeft: 2, marginRight: 6, width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stopButton: { backgroundColor: colors.dangerBg },
  sendButtonText: { color: colors.textInverse, fontSize: fontSize.title, lineHeight: 18, fontWeight: '800' },
  composerMenu: { margin: space.s1, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, paddingTop: space.s1, maxHeight: 200 },
  composerMenuTitle: { paddingHorizontal: space.s2, paddingVertical: 6, color: colors.textMuted, fontSize: fontSize.caption, fontWeight: '600' },
  composerOption: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  composerOptionText: { color: colors.textPrimary, fontSize: fontSize.body },
  // 附件菜单：容器不带分隔线（PC 的浮层也没有），靠两个按钮自带的描边区分
  attachmentMenu: { margin: space.s1, marginTop: 2, gap: 6 },
  // minHeight 44 是移动端最小触控高度（PC 该行约 31px，手机上照搬会难点中）
  attachmentOption: { minHeight: 44, paddingHorizontal: space.s3, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentOptionPressed: { backgroundColor: colors.surfaceHover },
  attachmentOptionText: { color: colors.textPrimary, fontSize: fontSize.xs },
  modelRow: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.elevated, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedRow: { backgroundColor: colors.selectedRowBg, borderWidth: 1, borderColor: colors.selectedRowBorder },
  attachmentPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: space.s2, paddingTop: space.s2 },
  attachmentItem: { width: 58, height: 58, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  attachmentImage: { width: 58, height: 58 },
  attachmentName: { padding: 5, color: colors.textPrimary, fontSize: fontSize.ui11, textAlign: 'center' },
  attachmentRemove: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderBottomLeftRadius: radius.lg, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
});
