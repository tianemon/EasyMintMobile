import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { Glass } from '../components/Glass';
import { ClockIcon, iconSize } from '../components/icons';
import { PressableScale } from '../components/PressableScale';
import { NewSessionFab } from '../components/NewSessionFab';
import { ProjectTitle } from '../components/ProjectTitle';
import { SessionRow } from '../components/SessionRow';
import type { OpenProject, SessionListItem } from '../protocol/types';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { chatInset } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/theme-context';
import type { ConnectionStatus } from '../types';

type SessionsScreenProps = {
  project: OpenProject | null;
  connection: ConnectionStatus;
  sessions: SessionListItem[];
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onSwitchProject: () => void;
  onOpenSession: (session: SessionListItem) => void;
  onLongPressSession: (session: SessionListItem) => void;
  onNewSession: () => void;
  onOpenArchive: () => void;
};

/**
 * 二级：某个项目的会话列表。
 *
 * 无边框列表：没有卡片底色、描边和圆角，行与行之间只有一条左右内缩的分隔线。
 * 归档会话不混在这里——右上角时钟进归档弹层（主列表只放未归档的）。
 */
export function SessionsScreen(props: SessionsScreenProps) {
  const { project, connection, sessions } = props;
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  const { colors } = useTheme();
  const visible = sessions.filter((item) => !item.archivedAt);

  return <View style={commonStyles.fill}>
    <Header
      onBack={props.onBack}
      title={<ProjectTitle name={project?.name ?? '选择项目'} status={connection} onPress={props.onSwitchProject} />}
      right={<PressableScale accessibilityLabel="归档会话" hitSlop={8} onPress={props.onOpenArchive} style={styles.headerAction}>
        <Glass variant="frosted" radius={13} style={styles.headerPill}>
          <View style={styles.headerPillInner}><ClockIcon size={19} color={colors.textSecondary} /></View>
        </Glass>
      </PressableScale>}
    />
    <FlatList
      style={styles.listFlex}
      data={visible}
      keyExtractor={(item) => item.sessionId}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh}
        tintColor={colors.textMuted} colors={[colors.textMuted]} />}
      ListEmptyComponent={<Text style={commonStyles.empty}>当前项目还没有会话</Text>}
      renderItem={({ item, index }) => <SessionRow session={item} first={index === 0}
        onPress={() => props.onOpenSession(item)} onLongPress={() => props.onLongPressSession(item)} />}
    />
    {!!project && <NewSessionFab onPress={props.onNewSession} />}
  </View>;
}

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  headerAction: { width: 40, height: 40 },
  headerPill: { width: 40, height: 40 },
  headerPillInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listFlex: { flex: 1 },
  // 底部留白给悬浮按钮，左右由每行自己的 chatInset 提供（这里不能再加，否则分隔线与文字会错开）
  list: { paddingTop: 4, paddingBottom: 96, flexGrow: 1 },
});
