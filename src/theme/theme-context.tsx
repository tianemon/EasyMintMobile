import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, darkShadow, lightColors, lightShadow } from './tokens';
import type { ThemeColors, ThemeShadow } from './tokens';
import { loadThemeMode, saveThemeMode } from './theme-preference';
import type { ThemeMode } from './theme-preference';

export type { ThemeMode };

export type ThemeValue = {
  colors: ThemeColors;
  shadow: ThemeShadow;
  /** 用户偏好（可能是 auto） */
  mode: ThemeMode;
  /** 实际生效的明暗（auto 已按系统解析） */
  effectiveMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  /** 偏好是否已从存储读出——false 时不要渲染主题化界面，否则会先亮后暗闪一下 */
  ready: boolean;
};

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * 主题提供者。挂在 App 最外层；偏好读取完成前 `ready=false`，
 * 由 App 的启动门控等它（首帧就是正确主题，不会闪）。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadThemeMode().then((stored) => {
      if (cancelled) return;
      setModeState(stored);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void saveThemeMode(next);
  }, []);

  // system 为 null（平台未上报）时按亮色处理
  const effectiveMode: 'light' | 'dark' = mode === 'auto' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const dark = effectiveMode === 'dark';
  const value = useMemo<ThemeValue>(() => ({
    colors: dark ? darkColors : lightColors,
    shadow: dark ? darkShadow : lightShadow,
    mode,
    effectiveMode,
    setMode,
    ready,
  }), [dark, effectiveMode, mode, ready, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return value;
}

/**
 * 样式表按 (factory, 配色表) 缓存：factory 是模块级稳定引用，配色表只有亮/深两个对象，
 * 所以每个组件每种主题只会 StyleSheet.create 一次——列表里成百上千个实例共享同一份。
 */
const styleCache = new WeakMap<object, WeakMap<object, unknown>>();

function cachedStyles<T>(factory: (colors: ThemeColors) => T, colors: ThemeColors): T {
  let byPalette = styleCache.get(factory);
  if (!byPalette) {
    byPalette = new WeakMap<object, unknown>();
    styleCache.set(factory, byPalette);
  }
  const hit = byPalette.get(colors);
  if (hit !== undefined) return hit as T;
  const value = factory(colors);
  byPalette.set(colors, value);
  return value;
}

/**
 * 按当前主题取样式表。factory 必须是**模块级稳定引用**
 * （如 `const makeStyles = (colors: ThemeColors) => StyleSheet.create({...})`）。
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return cachedStyles(factory, colors);
}
