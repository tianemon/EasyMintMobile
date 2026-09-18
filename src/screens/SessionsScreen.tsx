import { FlatList, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { ListRow } from '../components/ListRow';
import { NewSessionFab } from '../components/NewSessionFab';
import { ConnectionIndicator, ProjectTitle } from '../components/ProjectTitle';
import type { OpenProject, SessionListItem } from '../protocol/types';
import { commonStyles } from '../theme/commonStyles';
import type { ConnectionStatus } from '../types';

type SessionsScreenProps = {
  project: OpenProject | null;
  connection: ConnectionStatus;
  sessions: SessionListItem[];
  onBack: () => void;
  onSwitchProject: () => void;
  onOpenSession: (session: SessionListItem) => void;
  onLongPressSession: (session: SessionListItem) => void;
  onNewSession: () => void;
};

/** 某个项目下的会话列表（含归档会话） */
export function SessionsScreen(props: SessionsScreenProps) {
  const { project, connection, sessions } = props;
  return <View style={[commonStyles.fill, commonStyles.sessionsPage]}>
    <Header title={<ProjectTitle name={project?.name ?? '选择项目'} status={connection} onPress={props.onSwitchProject} />} onBack={props.onBack} right={<ConnectionIndicator status={connection} />} />
    <FlatList data={sessions} keyExtractor={(item) => item.sessionId} contentContainerStyle={commonStyles.list}
      ListEmptyComponent={<Text style={commonStyles.empty}>还没有会话，点击右下角新建</Text>}
      renderItem={({ item }) => <ListRow title={`${item.archivedAt ? '🗄 ' : item.pinnedAt ? '📌 ' : ''}${item.title}`}
        subtitle={item.lastMessage || `${item.messageCount ?? 0} 条消息`}
        titleLines={1} subtitleLines={2} onPress={() => props.onOpenSession(item)} onLongPress={() => props.onLongPressSession(item)} />} />
    <NewSessionFab onPress={props.onNewSession} />
  </View>;
}
