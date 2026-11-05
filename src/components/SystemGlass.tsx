/** Metro replaces this file with SystemGlass.ios.tsx on iOS. */
export type SystemGlassMode = 'custom' | 'native' | 'blur' | 'opaque';
export type SystemGlassProps = { radius: number; colorScheme: 'light' | 'dark' };

export function useSystemGlass(_enabled: boolean): SystemGlassMode {
  return 'custom';
}

export function SystemGlassBackdrop(_props: SystemGlassProps) {
  return null;
}
