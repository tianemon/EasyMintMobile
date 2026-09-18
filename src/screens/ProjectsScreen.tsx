import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { ListRow } from '../components/ListRow';
import type { OpenProject } from '../protocol/types';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize } from '../theme/tokens';

type ProjectsScreenProps = {
  projects: OpenProject[];
  statusLabel: string;
  onBack: () => void;
  onOpenProject: (project: OpenProject) => void;
};

/** 电脑端打开的项目列表 */
export function ProjectsScreen({ projects, statusLabel, onBack, onOpenProject }: ProjectsScreenProps) {
  return <View style={commonStyles.fill}>
    <Header title="打开的项目" onBack={onBack} right={<Text style={styles.onlineDot}>{statusLabel}</Text>} />
    <FlatList data={projects} keyExtractor={(item) => item.id} contentContainerStyle={commonStyles.list}
      ListEmptyComponent={<Text style={commonStyles.empty}>电脑端当前没有打开的项目</Text>}
      renderItem={({ item }) => <ListRow title={item.name} subtitle={item.status} onPress={() => onOpenProject(item)} />} />
  </View>;
}

const styles = StyleSheet.create({
  onlineDot: { color: colors.accent, fontSize: fontSize.caption },
});
