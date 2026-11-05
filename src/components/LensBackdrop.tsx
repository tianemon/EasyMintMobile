import { useLayoutEffect, useState } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import { findNodeHandle, Platform, StyleSheet, View } from 'react-native';
import type { ViewProps } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';

const Lens = Platform.OS === 'android' && Number(Platform.Version) >= 33 && requireOptionalNativeModule('MintLens')
  ? requireNativeViewManager<ViewProps & { radius: number; targetTag: number }>('MintLens')
  : null;

export const hasNativeLens = Lens !== null;

export function LensBackdrop({ radius, target, children }: PropsWithChildren<{ radius: number; target?: RefObject<View | null> }>) {
  const [targetTag, setTargetTag] = useState<number | null>(null);
  useLayoutEffect(() => {
    setTargetTag(target?.current ? findNodeHandle(target.current) : null);
  }, [target]);
  return Lens && targetTag !== null
    ? <Lens pointerEvents="none" radius={radius} targetTag={targetTag} style={StyleSheet.absoluteFill} />
    : <>{children}</>;
}
