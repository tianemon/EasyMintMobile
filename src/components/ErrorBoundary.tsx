import { Component } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme/tokens';
import { fontSize, space } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * 渲染错误兜底：出错时把错误画在屏幕上，而不是留一片空白让人猜。
 * 定位期临时组件——消息区异常排查完可移除（或保留作长期兜底，由使用方决定）。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('[ErrorBoundary] 渲染失败', this.props.label ?? '', error);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback label={this.props.label} error={error} />;
  }
}

/** 错误边界必须是 class（React 至今只有 class 能承接渲染异常），故把带主题的渲染挪到函数组件里。 */
function ErrorFallback({ label, error }: { label?: string; error: Error }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.box}>
    <Text style={styles.title}>{label ?? '渲染出错'}</Text>
    <Text style={styles.msg} selectable>{error.message}</Text>
    {!!error.stack && <Text style={styles.stack} selectable numberOfLines={14}>{error.stack}</Text>}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  box: { flex: 1, padding: space.s4, gap: space.s2, backgroundColor: colors.dangerBg },
  title: { color: colors.danger, fontWeight: '700', fontSize: fontSize.base },
  msg: { color: colors.textPrimary, fontSize: fontSize.caption },
  stack: { color: colors.textSecondary, fontSize: fontSize.xxs },
});
