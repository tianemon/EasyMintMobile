import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import type { ThemeMode } from '../theme/theme-preference';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, radius } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import { AmbientBackground } from './AmbientBackground';
import { Glass } from './Glass';
import { AppearanceIcon } from './icons';

const ITEMS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: '浅色' },
  { mode: 'dark', label: '深色' },
  { mode: 'auto', label: '自动' },
];

const PADDING = 4;
const HEIGHT = 54;

/**
 * 外观切换：三段式滑动选择器。
 *
 * 轨道和选中块统一使用磨砂表面，保留原来的滑动交互：
 * 轨道内的选中块，位移带一点回弹
 * （模板是 `cubic-bezier(.18,1.35,.32,1)`，这里用 spring 近似）。
 *
 * 交互：
 * - 点某一档：选中块滑过去
 * - 按住左右拖：块**实时跟手**，松手吸附到最近一档（模板的 tab 只支持点击，这里必须可拖）
 * - 读屏：每段仍是 button + selected
 */
export function AppearanceSlider() {
  const { mode, setMode, colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const trackTarget = useRef<View>(null);
  const index = Math.max(0, ITEMS.findIndex((item) => item.mode === mode));
  const scale = (width - PADDING * 2) / 3;

  /** 以「档位」为单位的位置（0–2），拖动时是小数，松手吸附成整数 */
  const position = useRef(new Animated.Value(index)).current;
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(index);
  const segmentRef = useRef(scale);
  const modeRef = useRef(mode);
  const startRef = useRef(index);
  indexRef.current = index;
  segmentRef.current = scale;
  modeRef.current = mode;

  // 外部切换（点按 / 系统变更）时滑过去；拖动中不抢位置
  useEffect(() => {
    if (dragging) return;
    Animated.spring(position, { toValue: index, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [dragging, index, position]);

  const settle = (value: number): void => {
    Animated.spring(position, { toValue: value, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  };

  const responder = useRef(PanResponder.create({
    // 只有明显横向拖动才接管，轻点仍然落到各段的 Pressable 上。
    // 必须用 Capture：每段是 Pressable，按下就拿到 responder，不抢在前面的话拖不动
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      position.stopAnimation();
      startRef.current = indexRef.current;
      setDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const segment = segmentRef.current;
      if (!segment) return;
      const next = Math.max(0, Math.min(2, startRef.current + gesture.dx / segment));
      position.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const segment = segmentRef.current;
      setDragging(false);
      if (!segment) { settle(indexRef.current); return; }
      const next = Math.max(0, Math.min(2, Math.round(startRef.current + gesture.dx / segment)));
      if (ITEMS[next].mode !== modeRef.current) setMode(ITEMS[next].mode);
      else settle(next);
    },
    onPanResponderTerminate: () => {
      setDragging(false);
      settle(indexRef.current);
    },
  })).current;

  const translateX = position.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, segmentRef.current, segmentRef.current * 2],
    extrapolate: 'clamp',
  });

  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} {...responder.panHandlers}>
    <Glass variant="frosted" radius={HEIGHT / 2} elevated={false} style={styles.track}>
      <View style={styles.trackInner}>
        <BlurTargetView ref={trackTarget} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.ambientBase }]}>
          <AmbientBackground />
        </BlurTargetView>
        {width > 0 && <Animated.View style={[styles.thumb, { width: Math.max(0, scale), transform: [{ translateX }] }]}>
          <Glass variant="frosted" radius={(HEIGHT - PADDING * 2) / 2} blur blurTarget={trackTarget} intensity={46} fill={colors.frostedSelection} elevated={false} style={styles.thumbFill} />
        </Animated.View>}
        <View style={styles.items}>
          {ITEMS.map((item) => {
            const selected = item.mode === mode;
            return <Pressable key={item.mode} accessibilityRole="button" accessibilityState={{ selected }}
              onPress={() => setMode(item.mode)} style={styles.segment}>
              <AppearanceIcon mode={item.mode} size={17} color={selected ? colors.accent : colors.textSecondary} />
              <Text style={[styles.label, selected && styles.labelActive]}>{item.label}</Text>
            </Pressable>;
          })}
        </View>
      </View>
    </Glass>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  track: { height: HEIGHT },
  trackInner: { flex: 1, padding: PADDING },
  // 选中块：与轨道内容盒齐平（模板 .ios-tab-selection 的 top/bottom 就等于 tabbar 的 padding）
  thumb: { position: 'absolute', left: PADDING, top: PADDING, bottom: PADDING },
  thumbFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  items: { flex: 1, flexDirection: 'row', zIndex: 1 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radius.lg },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  labelActive: { color: colors.accent, fontWeight: '600' },
});
