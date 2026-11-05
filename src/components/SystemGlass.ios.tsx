import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { SystemGlassMode, SystemGlassProps } from './SystemGlass';

// Check the compiled app as well as the running OS. Version numbers alone are insufficient.
const available = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

export function useSystemGlass(enabled: boolean): SystemGlassMode {
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true;
      setReduceTransparency(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active && !changed) setReduceTransparency(value);
    }).catch(() => {
      // An unavailable preference query retains the readable blur fallback.
    });
    return () => { active = false; subscription.remove(); };
  }, [enabled]);
  if (!enabled) return 'custom';
  if (reduceTransparency) return 'opaque';
  return available && reduceTransparency === false ? 'native' : 'blur';
}

/** Background only: RN owns input, accessibility and press targets in the foreground. */
export function SystemGlassBackdrop({ radius, colorScheme }: SystemGlassProps) {
  return <GlassView accessible={false} pointerEvents="none" glassEffectStyle="clear"
    colorScheme={colorScheme} isInteractive={false}
    style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />;
}
