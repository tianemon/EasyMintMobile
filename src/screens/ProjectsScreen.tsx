import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { ListRow } from '../components/ListRow';
import type { OpenProject } from '../protocol/types';
import { makeCommonStyles } from '../theme/commonStyles';
import type { ThemeColors } from '../theme/tokens';
import { fontSize } from '../theme/tokens';
import { useThemedStyles } from '../theme/theme-context';

type ProjectsScreenProps = {
  projects: OpenProject[];
  statusLabel: string;
  onBack: () => void;
  onOpenProject: (project: OpenProject) => void;
};

/** 电脑端打开的项目列表 */
export function ProjectsScreen({ projects, statusLabel, onBack, onOpenProject }: ProjectsScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const commonStyles = useThemedStyles(makeCommonStyles);
  return <View style={commonStyles.fill}>
    <Header title="打开的项目" onBack={onBack} right={<Text style={styles.onlineDot}>{statusLabel}</Text>} />
    {/* 与会话列表同一套：无边框 + 内缩分隔线。项目行不给右端时间——它没有「最后活动」这种语义 */}
    <FlatList style={styles.listFlex} data={projects} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={commonStyles.empty}>电脑端当前没有打开的项目</Text>}
      renderItem={({ item, index }) => <ListRow flat first={index === 0} title={item.name} subtitle={item.status} onPress={() => onOpenProject(item)} />} />
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  listFlex: { flex: 1 },
  list: { paddingTop: 4, paddingBottom: 20 },
  onlineDot: { color: colors.accent, fontSize: fontSize.caption },
});
