import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/tokens';
import type { PermissionMode } from '../protocol/types';

/** 输入卡工具栏图标：模型 / 权限 / 思考等级（内联 SVG，PC 同源 path） */
export function ComposerIcon({ kind, permission }: { kind: 'model' | 'permission' | 'thinking'; permission?: PermissionMode }) {
  const color = kind === 'permission' && permission === 'full' ? colors.permissionOn : colors.textMuted;
  if (kind === 'model') return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={5} cy={12} r={2.6} fill={color} /><Circle cx={19} cy={5.5} r={2.6} fill={color} /><Circle cx={19} cy={18.5} r={2.6} fill={color} />
    <Path d="M7.4 10.9 16.6 6.6" /><Path d="M7.4 13.1 16.6 17.4" /><Path d="M19 8.1v7.8" />
  </Svg>;
  if (kind === 'permission') return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    {permission === 'full' ? <><Path d="M12 8v4" /><Path d="M12 16h.01" /></> : permission === 'readonly' ? <><Rect x={9} y={11} width={6} height={5} rx={1} /><Path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" /></> : <Path d="m9 12 2 2 4-4" />}
  </Svg>;
  return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 18V5" /><Path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" /><Path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
    <Path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" /><Path d="M18 18a4 4 0 0 0 2-7.464" /><Path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
    <Path d="M6 18a4 4 0 0 1-2-7.464" /><Path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
  </Svg>;
}

/** 发送键图标（停止态是红方块） */
export function SendIcon({ stop }: { stop: boolean }) {
  return <Svg width={stop ? 16 : 14} height={stop ? 16 : 14} viewBox="0 0 16 16" fill="currentColor" color={stop ? colors.danger : colors.textInverse}>
    {stop ? <Rect x={3} y={3} width={10} height={10} rx={1} fill={colors.danger} /> : <Path d="M1 1l14 7-14 7 4-7-4-7z" fill={colors.textInverse} />}
  </Svg>;
}

/** 新建会话悬浮按钮图标（圆角气泡 + 加号，与桌面 SessionBar 同源） */
export function NewChatIcon() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" stroke={colors.textInverse} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><Path d="M8 12h8M12 8v8" stroke={colors.textInverse} strokeWidth={1.8} strokeLinecap="round" /></Svg>;
}
