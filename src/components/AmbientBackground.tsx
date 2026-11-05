import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme-context';

/**
 * 环境层：整页的底色 + 三团柔光。
 *
 * 玻璃材质成立的前提是「背后有东西可透」——纯灰底上做毛玻璃只会得到一块半透明色，
 * 看不出材质。这里用三团大半径径向渐变（绿 / 蓝 / 冷灰蓝）铺在页面底色上，
 * 不参与滚动、不随内容重绘，成本只有一次静态绘制。
 *
 * 挂在 App 根节点、所有页面之下；页面自身的底色要透明，否则会把这一层盖掉。
 */
export function AmbientBackground({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  const { colors } = useTheme();
  return <Svg style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
    <Defs>
      <RadialGradient id="amb-green" cx="4%" cy="-8%" rx="90%" ry="70%">
        <Stop offset="0" stopColor={colors.ambientGreen} stopOpacity={0.95} />
        <Stop offset="1" stopColor={colors.ambientGreen} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="amb-blue" cx="102%" cy="2%" rx="80%" ry="62%">
        <Stop offset="0" stopColor={colors.ambientBlue} stopOpacity={0.9} />
        <Stop offset="1" stopColor={colors.ambientBlue} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="amb-cool" cx="46%" cy="112%" rx="85%" ry="60%">
        <Stop offset="0" stopColor={colors.ambientCool} stopOpacity={0.85} />
        <Stop offset="1" stopColor={colors.ambientCool} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={colors.ambientBase} />
    <Rect width="100%" height="100%" fill="url(#amb-green)" />
    <Rect width="100%" height="100%" fill="url(#amb-blue)" />
    <Rect width="100%" height="100%" fill="url(#amb-cool)" />
  </Svg>;
}
