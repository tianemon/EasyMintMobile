import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ModelCapabilities, PermissionMode } from '../protocol/types';
import { THINKING_LABELS } from '../session/thinking';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius, shadow, space } from '../theme/tokens';
import type { ComposerControl } from '../types';
import { ComposerIcon, SendIcon } from './icons';

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
  control: ComposerControl;
  onDraftChange: (value: string) => void;
  onControlChange: (control: ComposerControl) => void;
  onSend: () => void;
  onStop: () => void;
  onSelectModel: (modelId: string, providerId: string | undefined) => void;
  onSelectPermission: (mode: PermissionMode) => void;
  onSelectThinking: (level: string) => void;
};

const PERMISSION_OPTIONS = [['readonly', '只读'], ['standard', '标准'], ['full', '完全访问']] as const;

/** 输入卡片：多行输入 + 工具栏（模型/权限/思考/上下文占用/发送）+ 工具菜单 */
export function Composer(props: ComposerProps) {
  const { draft, running, hasSession, permission, permissionLabel, thinking, thinkingOptions, model, provider, contextPercent, control } = props;
  const sendDisabled = running && !hasSession ? true : (!running && !draft.trim());
  return <View style={[styles.composerCard, shadow.sm]}>
    <TextInput value={draft} onChangeText={props.onDraftChange} placeholder={running ? '输入以引导当前任务…' : '给 EasyMint 发送消息…'} multiline style={styles.composerInput} />
    <View style={styles.composerToolbar}>
      <Pressable accessibilityLabel={`选择模型，当前 ${model || provider?.currentModel || '默认'}`} style={[styles.composerIconButton, control === 'model' && styles.composerControlActive]} onPress={() => props.onControlChange(control === 'model' ? null : 'model')}>
        <ComposerIcon kind="model" />
      </Pressable>
      <Pressable accessibilityLabel={`选择权限，当前 ${permissionLabel}`} style={[styles.composerIconButton, control === 'permission' && styles.composerControlActive]} onPress={() => props.onControlChange(control === 'permission' ? null : 'permission')}>
        <ComposerIcon kind="permission" permission={permission} />
      </Pressable>
      <Pressable accessibilityLabel={`选择思考等级，当前 ${THINKING_LABELS[thinking] ?? thinking}`} style={[styles.composerIconButton, control === 'thinking' && styles.composerControlActive]} onPress={() => props.onControlChange(control === 'thinking' ? null : 'thinking')}>
        <ComposerIcon kind="thinking" />
      </Pressable>
      <View accessibilityLabel={`上下文使用率 ${contextPercent === null ? '未知' : `${Math.round(contextPercent)}%`}`} style={styles.contextUsage}><View style={styles.contextRing}><Text style={styles.contextUsageText}>{contextPercent === null ? '—' : `${Math.round(contextPercent)}%`}</Text></View></View>
      <Pressable disabled={sendDisabled} onPress={() => running && hasSession ? props.onStop() : props.onSend()}
        style={({ pressed }) => [styles.sendButton, (pressed || sendDisabled) && commonStyles.dim, running && styles.stopButton]}>
        <SendIcon stop={running && hasSession} />
      </Pressable>
    </View>
    {control === 'model' && <View style={styles.composerMenu}>
      <Text style={styles.composerMenuTitle}>{provider?.name ?? '当前供应商'}</Text>
      {(provider?.models ?? []).map((item) => <Pressable key={item.id} style={styles.composerOption} onPress={() => { props.onSelectModel(item.id, provider?.id); props.onControlChange(null); }}>
        <Text style={styles.composerOptionText}>{item.name}</Text>{model === item.id && <Text style={styles.check}>✓</Text>}
      </Pressable>)}
    </View>}
    {control === 'permission' && <View style={styles.composerMenu}>
      {PERMISSION_OPTIONS.map(([value, label]) => <Pressable key={value} style={styles.composerOption} onPress={() => { props.onSelectPermission(value); props.onControlChange(null); }}>
        <Text style={styles.composerOptionText}>{label}</Text>{permission === value && <Text style={styles.check}>✓</Text>}
      </Pressable>)}
    </View>}
    {control === 'thinking' && <View style={styles.composerMenu}>
      {thinkingOptions.map((item) => <Pressable key={item} style={styles.composerOption} onPress={() => { props.onSelectThinking(item); props.onControlChange(null); }}>
        <Text style={styles.composerOptionText}>{THINKING_LABELS[item] ?? item}</Text>{thinking === item && <Text style={styles.check}>✓</Text>}
      </Pressable>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  composerCard: { margin: space.s4, marginTop: 6, marginBottom: 26, padding: space.s1, borderRadius: radius.lg, backgroundColor: colors.elevated },
  composerInput: { minHeight: 52, maxHeight: 130, paddingHorizontal: space.s3, paddingTop: 10, paddingBottom: 6, color: colors.textPrimary, fontSize: fontSize.base, lineHeight: 22, textAlignVertical: 'top' },
  composerToolbar: { minHeight: 38, paddingLeft: space.s1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  composerIconButton: { width: 26, height: 26, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  composerControlActive: { backgroundColor: colors.surfaceHover },
  contextUsage: { marginLeft: 2, minWidth: 42, height: 30, alignItems: 'center', justifyContent: 'center' },
  contextRing: { minWidth: 38, height: 24, paddingHorizontal: 5, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputField },
  contextUsageText: { color: colors.textSecondary, fontSize: fontSize.xxs, fontWeight: '700' },
  sendButton: { marginLeft: 'auto', marginRight: 10, width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stopButton: { backgroundColor: colors.dangerBg },
  sendButtonText: { color: colors.textInverse, fontSize: fontSize.title, lineHeight: 18, fontWeight: '800' },
  composerMenu: { margin: space.s1, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, paddingTop: space.s1, maxHeight: 200 },
  composerMenuTitle: { paddingHorizontal: space.s2, paddingVertical: 6, color: colors.textMuted, fontSize: fontSize.caption, fontWeight: '600' },
  composerOption: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  composerOptionText: { color: colors.textPrimary, fontSize: fontSize.body },
  check: { color: colors.accent, fontWeight: '800' },
  modelRow: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.elevated, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedRow: { backgroundColor: colors.selectedRowBg, borderWidth: 1, borderColor: colors.selectedRowBorder },
});
