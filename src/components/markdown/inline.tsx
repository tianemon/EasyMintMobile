import { Linking, Platform, StyleSheet, Text } from 'react-native';
import type { ReactNode } from 'react';
import type { Token } from 'marked';
import type { ThemeColors } from '../../theme/tokens';
import { fontSize } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/theme-context';
import { decodeEntities, fadeOpacity, safeHref, splitFadeTail } from './parse';

/**
 * 行内内容渲染：把 marked 的行内 token 渲染成嵌套 `<Text>`。
 *
 * 为什么全部用 Text 而不是 View：行内元素要能跨行折行、与周围文字共享行高，
 * RN 里只有 `<Text>` 嵌套能做到；换成 View 会把行内内容切成独立块。
 * 返回值统一是 ReactNode 数组而非 Fragment——Fragment 在 Text 内部的展平行为
 * 依赖 RN 版本，数组是 Text 明确支持的子节点形态。
 */

type InlineProps = {
  tokens: Token[];
  /** 流式尾块标记：末尾字符做透明度衰减（口径见 parse.ts 的 splitFadeTail） */
  fade?: boolean;
};

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' });

/** 打不开（无对应应用 / 被系统拒绝）不静默吞掉，记日志后由用户自行处理 */
function openLink(href: string): void {
  Linking.openURL(href).catch((error: unknown) => {
    console.error('[markdown] 打开链接失败', href, error);
  });
}

export function InlineTokens({ tokens, fade }: InlineProps): ReactNode[] {
  const styles = useThemedStyles(makeStyles);
  const last = tokens.length - 1;
  return tokens.map((token, index) => renderInline(styles, token, index, !!fade && index === last));
}

/** marked 的 Token 联合含 `Tokens.Generic`（type: string），switch 窄不到具体成员，子 token 需自己兜底 */
function childTokens(token: Token): Token[] {
  return 'tokens' in token && token.tokens ? token.tokens : [];
}

/** 样式表类型：下面这些纯渲染函数不是组件（不适用 hooks），样式一律由调用方传进来 */
type InlineStyles = ReturnType<typeof makeStyles>;

/**
 * 渐隐只作用于「末尾是纯文本」的情况：末尾若是 `**粗体**` 这类嵌套元素则整体不渐隐——
 * 桌面端 tail-fade 的 HTML 定位同样找不到纯文本段落，两端口径一致。
 */
function renderInline(styles: InlineStyles, token: Token, key: number, fade: boolean): ReactNode {
  switch (token.type) {
    case 'text':
      return fade ? <FadedText key={key} text={decodeEntities(token.text)} /> : decodeEntities(token.text);
    case 'escape':
      return token.text;
    case 'strong':
      return <Text key={key} style={styles.strong}><InlineTokens tokens={childTokens(token)} /></Text>;
    case 'em':
      return <Text key={key} style={styles.em}><InlineTokens tokens={childTokens(token)} /></Text>;
    case 'del':
      return <Text key={key} style={styles.del}><InlineTokens tokens={childTokens(token)} /></Text>;
    case 'codespan':
      return <Text key={key} style={styles.codespan}>{decodeEntities(token.text)}</Text>;
    case 'br':
      return '\n';
    case 'checkbox':
      return token.checked ? '☑ ' : '☐ ';
    case 'link': {
      const href = safeHref(token.href);
      // 非白名单协议降级为纯文本：不可点、不染链接色（与桌面端 lib/markdown.ts 同口径）
      if (!href) return <Text key={key}><InlineTokens tokens={childTokens(token)} /></Text>;
      return <Text key={key} accessibilityRole="link" style={styles.link} onPress={() => openLink(href)}>
        <InlineTokens tokens={childTokens(token)} />
      </Text>;
    }
    case 'image':
      // 手机端不下载远端图片（流量与数据边界考虑），保留 alt 文本，内容不丢
      return <Text key={key} style={styles.imageAlt}>{decodeEntities(token.text)}</Text>;
    case 'html':
      // RN 无 HTML 渲染能力：标签丢弃，标签内的文本由相邻 text token 正常显示
      return null;
    default:
      // marked 新增的 token 类型：有子 token 就递归，避免内容整段消失
      return childTokens(token).length > 0 ? <Text key={key}><InlineTokens tokens={childTokens(token)} /></Text> : token.raw;
  }
}

/**
 * 末尾若干字符逐个降低不透明度——RN 没有 `background-clip: text`，
 * 用等效观感的分字符衰减替代（桌面端 CSS 是一道线性渐变，这里是同样的阶梯）。
 */
function FadedText({ text }: { text: string }): ReactNode {
  const { head, tail, trailing } = splitFadeTail(text);
  if (tail.length === 0) return text;
  return [
    head,
    ...tail.map((unit, index) => (
      <Text key={index} style={{ opacity: fadeOpacity(index, tail.length) }}>{unit}</Text>
    )),
    trailing,
  ];
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  strong: { color: colors.textPrimary, fontWeight: '600' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  // 与桌面端 prose 的行内代码一致：等宽 + 600 字重 + 13px；底色是手机端方案指定的 codeBlockBg
  codespan: { color: colors.textPrimary, backgroundColor: colors.codeBlockBg, fontFamily: monoFont, fontSize: fontSize.detail, fontWeight: '600' },
  link: { color: colors.accent },
  imageAlt: { color: colors.textMuted },
});
