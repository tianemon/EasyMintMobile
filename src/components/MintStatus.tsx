import { StyleSheet, Text, View } from 'react-native';
import { fontSize } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { ThemeColors } from '../theme/tokens';
import { Icon, ModelGlyph, ToolIcon } from './icons';

/**
 * 运行状态行：图标 + 当前动作文案，与桌面端 `StatusBar` 同构。
 *
 * **位置**：桌面端已把状态栏移进滚动区尾部（`ChatPanel.tsx:3055-3057`，在 `chat-messages` 里、
 * 提问卡之后），跟着消息走、不再固定在输入卡上方。手机端同款——由 `MessageList` 挂在
 * 倒置列表的 `ListHeaderComponent`（视觉底部）上，横向内边距由列表内容容器统一给，这里不再加 margin。
 *
 * 图标按状态切换（桌面端 StatusBar.tsx:163-166）：有工具在跑就用该工具的图标，否则用带动效的模型图标。
 */
export function MintStatus({ text, icon }: { text: string; icon?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.row}>
    <View style={styles.glyph}>
      {icon === 'thinking' ? <Icon name="brain" size={14} color={colors.textSecondary} /> : icon
        ? <ToolIcon name={icon} size={14} color={colors.textSecondary} />
        : <ModelGlyph animated size={14} color={colors.textSecondary} />}
    </View>
    {/* 单行截断：命令类状态的文案是整条命令（`toolStatusTargeted` 的 oneLine 只压换行、不减长度），
        不截断会换行成多行、把这一行撑高；桌面端 `.statusbar` 的文本同样是 truncate */}
    <Text numberOfLines={1} style={styles.text}>{text}</Text>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // 高度与桌面端 .statusbar 的 min-height: 26px 同值；图标框宽 16（桌面是 w-[1.25em]），换图标不推文字
  row: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 7 },
  glyph: { width: 16, alignItems: 'center', justifyContent: 'center' },
  // flexShrink 必须给：Text 在 row 里默认按内容宽度，不给就截不断（会被父容器裁掉而不是出省略号）
  text: { flexShrink: 1, color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '500' },
});
