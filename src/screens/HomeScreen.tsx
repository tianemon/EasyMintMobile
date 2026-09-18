import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Header, headerStyles } from '../components/Header';
import { ListRow } from '../components/ListRow';
import { LoadingView } from '../components/LoadingView';
import { NewSessionFab } from '../components/NewSessionFab';
import { ProjectTitle } from '../components/ProjectTitle';
import { Button } from '../components/Button';
import type { OpenProject, PcCredential, SessionListItem } from '../protocol/types';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius, space } from '../theme/tokens';
import type { ConnectionStatus } from '../types';

type HomeScreenProps = {
  credential: PcCredential | null;
  pairCode: string;
  error: string;
  homeLoading: boolean;
  connection: ConnectionStatus;
  project: OpenProject | null;
  sessions: SessionListItem[];
  onOpenScanner: () => void;
  onOpenSettings: () => void;
  onSwitchProject: () => void;
  onRefresh: () => void;
  onRetryConnect: () => void;
  onOpenSession: (session: SessionListItem) => void;
  onLongPressSession: (session: SessionListItem) => void;
  onNewSession: () => void;
};

/** 首页：未配对时是配对引导，已配对时是当前项目的会话列表 */
export function HomeScreen(props: HomeScreenProps) {
  const { credential, pairCode, error, homeLoading, connection, project, sessions } = props;
  if (!credential || pairCode) {
    return <View style={commonStyles.center}>
      <Text style={styles.logo}>EasyMint</Text><Text style={styles.subtitle}>局域网移动终端</Text>
      {pairCode ? <View style={styles.codeCard}><Text style={commonStyles.muted}>请在电脑上核对并确认</Text><Text style={styles.code}>{pairCode}</Text></View>
        : <View style={commonStyles.card}><Text style={commonStyles.help}>在电脑端打开「设备互联」，生成二维码后扫描。</Text><Button label="扫描二维码配对" onPress={props.onOpenScanner} /></View>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>;
  }
  if (homeLoading) return <LoadingView spinner title={`正在连接 ${credential.pcName}`} subtitle="同步打开的项目和会话" />;
  if (connection !== 'connected') return <LoadingView title="暂时无法连接电脑" action={<Button label="重试连接" secondary onPress={props.onRetryConnect} />} />;
  return <View style={[commonStyles.fill, commonStyles.sessionsPage]}>
    <Header title={<ProjectTitle name={project?.name ?? '选择项目'} status={connection} onPress={props.onSwitchProject} />} right={<Pressable onPress={props.onOpenSettings}><Text style={headerStyles.headerAction}>设置</Text></Pressable>} />
    <FlatList data={sessions.filter((item) => !item.archivedAt)} keyExtractor={(item) => item.sessionId} contentContainerStyle={commonStyles.list}
      onRefresh={props.onRefresh} refreshing={homeLoading}
      ListEmptyComponent={<View style={styles.emptyState}><Text style={commonStyles.empty}>当前项目还没有会话</Text></View>}
      renderItem={({ item }) => <ListRow title={`${item.pinnedAt ? '📌 ' : ''}${item.title}`} subtitle={item.lastMessage || `${item.messageCount ?? 0} 条消息`}
        titleLines={1} subtitleLines={1} onPress={() => props.onOpenSession(item)} onLongPress={() => props.onLongPressSession(item)} />} />
    {!!project && <NewSessionFab onPress={props.onNewSession} />}
  </View>;
}

const styles = StyleSheet.create({
  logo: { fontSize: fontSize.display, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
  subtitle: { fontSize: fontSize.md, color: colors.textMuted, marginTop: -10 },
  codeCard: { width: '100%', maxWidth: 420, borderRadius: radius.lg, backgroundColor: colors.successBg, padding: 28, alignItems: 'center', gap: space.s2 },
  code: { fontSize: fontSize.display, fontWeight: '800', letterSpacing: 7, color: colors.accent },
  error: { color: colors.danger, textAlign: 'center' },
  emptyState: { alignItems: 'center', gap: 14 },
  projectShortcut: { marginBottom: space.s1, paddingHorizontal: space.s1, paddingVertical: space.s2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  projectShortcutText: { color: colors.shortcutText, fontSize: fontSize.sm },
  projectShortcutAction: { color: colors.shortcutAction, fontSize: fontSize.sm, fontWeight: '700' },
});
