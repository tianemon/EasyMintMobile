import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

type PressableScaleProps = {
  children: ReactNode;
  onPress: () => void;
  /** 布局样式（尺寸 / 定位）放在 Pressable 上，缩放只作用于内容层 */
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  hitSlop?: number;
};

const SPRING = { speed: 42, bounciness: 0, useNativeDriver: true } as const;

/**
 * 带按压缩放的按钮容器。
 *
 * 玻璃表面不适合用透明度变化做反馈（半透明层一叠会发灰），也不适合 Android 水波纹——
 * 那会在材质上破一个洞。改用 0.96 的轻微缩放 + 弹簧回位：手感是「按下去了一点」，
 * 材质本身不变化。
 */
export function PressableScale({
  children, onPress, style, innerStyle, scaleTo = 0.96, disabled, accessibilityLabel, hitSlop,
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number): void => {
    Animated.spring(scale, { toValue: to, ...SPRING }).start();
  };
  return <Pressable disabled={disabled} onPress={onPress} hitSlop={hitSlop}
    accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    onPressIn={() => animate(scaleTo)} onPressOut={() => animate(1)} style={style}>
    <Animated.View style={[styles.inner, innerStyle, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
