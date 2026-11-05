import { useId, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { hasNativeLens, LensBackdrop } from './LensBackdrop';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme-context';

type GlassVariant = 'liquid' | 'frosted';

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * liquid：高透 + 渐变光学边框 + 左上高光，只给输入卡这类浮层。
   * frosted：更实的底 + 1px 淡边，给容器层（列表面板、设置分组、按钮）。
   */
  variant?: GlassVariant;
  /** 是否做背景模糊。默认关：容器背景是平滑环境色，模糊它没有收益，只有每帧取景的成本 */
  blur?: boolean;
  intensity?: number;
  radius?: number;
  fill?: string;
  /** Android 必需：BlurView 只能模糊显式指定的 BlurTargetView，不传会静默退化为不模糊 */
  blurTarget?: RefObject<View | null>;
  /** 是否抬升。背景层必须 false：Android elevation 会改变绘制顺序，画到同级内容之上并吃掉触摸 */
  elevated?: boolean;
  /** 透镜环（边缘发亮）。小尺寸控件上会显脏，滑块选中块这类关掉 */
  lens?: boolean;
  /**
   * 边框做法。gradient = 渐变光学边（大面板）；hairline = 一条淡边；none = 不画边。
   * 小控件（滑块选中块）用 none + topSheen，接近模板里「只有一条顶部高光」的做法。
   */
  rim?: 'gradient' | 'hairline' | 'none';
  /** 顶部 1px 高光：小控件上比整圈描边更接近真实受光 */
  topSheen?: boolean;
  /** 整面高光渐变。输入卡要「无色底」时关掉，只留边框与透镜环 */
  sheen?: boolean;
  /** 内容内边距。**不要用 style.padding**：那会把玻璃面本身缩小，文字反而贴到玻璃边缘被圆角切掉 */
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * 玻璃容器。
 *
 * 材质分两层实现：
 * - **填充**：一层半透明色 + 一层左上入射光渐变（大的面才有渐变，小控件几乎看不出来）
 * - **光学边框**：用 Svg 画 1px 圆角矩形描边，描边本身是渐变（左上最亮 → 右下回光），
 *   再叠一圈内描边表示玻璃厚度。RN 没有 mask-composite，渐变描边是这里能拿到的最接近模板的做法；
 *   用 View 的 border 只能得到一条均匀白线，在深色下尤其像贴了个塑料框。
 *
 * 所有材质层都 pointerEvents="none"，点击仍落在 children 上。
 */
export function Glass({
  children, style, variant = 'frosted', blur = false, intensity = 44, radius = 20,
  fill, blurTarget, elevated = true, lens = true, rim = 'gradient', topSheen = false, contentStyle, sheen = true,
}: GlassProps) {
  const { colors, effectiveMode } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const tint = effectiveMode === 'dark' ? 'dark' : 'light';
  const dark = effectiveMode === 'dark';
  const background = fill ?? (variant === 'liquid' ? colors.liquidFill : colors.glassFillStrong);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The native shader supplies the reflection and thickness from one surface.
  // Keep the SVG rim for platforms using the blur-only fallback.
  const opticalRim = blur && blurTarget && hasNativeLens ? 'none' : rim;


  return <View
    onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      if (Math.abs(width - size.width) > 0.5 || Math.abs(height - size.height) > 0.5) setSize({ width, height });
    }}
    style={[
      styles.outer,
      {
        borderRadius: radius,
        shadowColor: colors.glassShadow,
        shadowOpacity: elevated ? (variant === 'liquid' ? 0.20 : 0.07) : 0,
        shadowRadius: variant === 'liquid' ? 16 : 6,
        shadowOffset: { width: 0, height: variant === 'liquid' ? 8 : 3 },
        elevation: elevated ? (variant === 'liquid' ? 7 : 2) : 0,
      },
      style,
    ]}>
    <View style={[styles.clip, { borderRadius: radius }]}>
      {/* 材质层都不接触摸 */}
      {blur && <LensBackdrop radius={variant === 'liquid' ? radius : 0} target={blurTarget}>
        <BlurView pointerEvents="none" tint={tint} intensity={intensity} blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
      </LensBackdrop>}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />

      {variant === 'frosted' && opticalRim !== 'none' && <View pointerEvents="none"
        style={[styles.border, { borderRadius: radius, borderColor: colors.glassRim, opacity: 0.5 }]} />}

      {variant === 'liquid' && <>
        {/*
         * 光学层照桌面端模板（private_docs/design/liquid-glass-comparison-2026-10-24 的
         * `.ios-optic` / `:before` / `.ios-optic-light`）逐条复制。模板是纯 CSS，但那几层都是
         * 渐变 + mask-composite 裁出的环 —— 在 SVG 里「环」就是一条描边，不需要 mask，所以能一比一还原：
         *
         *   ① 主体高光   linear-gradient(115deg, #ffffff24, transparent 30% 66%, #ffffff0a)
         *   ② 厚度环     linear-gradient(180deg, #ffffff30, transparent 19% 72%, #10223816 95%, #ffffff20)
         *                padding 5px + mask exclude → 外侧 5px 的环
         *   ③ 受光边     radial-gradient(ellipse at 24% -20%, #ffffffbd, transparent 55%)
         *                padding .75px + mask exclude → 最外 1px 的环
         *
         * 唯一无等价物的是 `saturate(1.12) contrast(1.04)`：那是对**背景像素**做的色彩运算，
         * BlurView 只提供模糊，没有这张图。（要做得上 Skia 的 RuntimeShader，代价是另一个量级。）
         *
         * 另一个硬约束：所有渐变与用它们的形状必须在**同一个 Svg** 里。
         * react-native-svg 的定义挂在 SvgView 上（`SvgView.getDefinedTemplate`），跨 Svg 的
         * `url(#id)` 解析不到，描边会退回默认 Paint —— 也就是黑色（淡色模式下输入卡那圈黑边）。
         */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            {sheen && <LinearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0.906" y2="0.423">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.10 : 0.14} />
              <Stop offset="30%" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="66%" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={dark ? 0.03 : 0.04} />
            </LinearGradient>}
            {/* ④ 斜面光带：模板里最外 10px 是「斜面」，折射、反射都在这个带子里发生。
                以前手机端只有 1px 亮边 + 2px 厚度环，边缘没有「体」——像贴了一张纸。
                取值不是手调的：按桌面端光学引擎在 361×112 / r24 / bezel10 上采样，
                上边 t=1px 反射率 0.067、t=3px 0.032、t=6px 0.030、t=10px 归零，
                左边 0.049、右/下 0.015 —— 单向光源，上面最亮、下面最暗。 */}
            {opticalRim === 'gradient' && size.width > 0 && <LinearGradient id={`${uid}-bezel`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.075 : 0.067} />
              <Stop offset="45%" stopColor="#ffffff" stopOpacity={dark ? 0.038 : 0.030} />
              <Stop offset="88%" stopColor="#ffffff" stopOpacity={dark ? 0.024 : 0.016} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={dark ? 0.020 : 0.012} />
            </LinearGradient>}
            {opticalRim === 'gradient' && size.width > 0 && <LinearGradient id={`${uid}-thick`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.10 : 0.12} />
              <Stop offset="19%" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="72%" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="95%" stopColor="#102238" stopOpacity={dark ? 0.22 : 0.06} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={dark ? 0.12 : 0.125} />
            </LinearGradient>}
            {opticalRim === 'gradient' && lens && size.width > 0 && <RadialGradient id={`${uid}-rim`} cx={0.24} cy={-0.2} r={0.8}>
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.55 : 0.74} />
              <Stop offset="55%" stopColor="#ffffff" stopOpacity={dark ? 0.12 : 0.2} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </RadialGradient>}
          </Defs>

          {sheen && <Rect width="100%" height="100%" fill={`url(#${uid}-sheen)`} />}

          {opticalRim === 'gradient' && size.width > 0 && <>
            {/* 斜面光带：贴边 8px，描边以 inset=4 为中心 → 覆盖 0–8。要在厚度环之前画 */}
            <Rect x={1} y={1} width={Math.max(0, size.width - 2)} height={Math.max(0, size.height - 2)}
              rx={Math.max(0, radius - 1)} ry={Math.max(0, radius - 1)}
              fill="none" stroke={`url(#${uid}-bezel)`} strokeWidth={2} />
            {/* 厚度环：模板是 5px，但那是在 400px 的卡片上；到输入卡这个尺度 5px 会变成倒角。
                统一收到 2px，保留「上亮下暗」的光向，去掉塑料倒角的观感 */}
            <Rect x={1} y={1} width={size.width - 2} height={size.height - 2}
              rx={Math.max(0, radius - 1)} ry={Math.max(0, radius - 1)}
              fill="none" stroke={`url(#${uid}-thick)`} strokeWidth={2} />
            {/* 1px 受光边：点光源在左上外侧，只照亮靠近光源的那一段弧 */}
            {lens && <Rect x={0.5} y={0.5} width={size.width - 1} height={size.height - 1}
              rx={Math.max(0, radius - 0.5)} ry={Math.max(0, radius - 0.5)}
              fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={1} />}
          </>}
        </Svg>

        {opticalRim === 'hairline' && <View pointerEvents="none"
          style={[styles.border, { borderRadius: radius, borderColor: colors.glassRim, opacity: 0.6 }]} />}
        {topSheen && <View pointerEvents="none"
          style={[styles.topSheen, { backgroundColor: colors.glassSheen, marginHorizontal: Math.max(10, radius * 0.8) }]} />}
      </>}

      {contentStyle ? <View style={[styles.content, contentStyle]}>{children}</View> : children}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  outer: { backgroundColor: 'transparent' },
  // flexBasis auto + grow：外层 auto 高度时按内容撑开，外层 flex:1 时又能填满
  clip: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', overflow: 'hidden' },
  border: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 1 },
  topSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, opacity: 0.85 },
  content: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
});
