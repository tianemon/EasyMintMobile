import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import type { SessionListItem } from '../protocol/types';
import { commonStyles } from '../theme/commonStyles';
import { colors, fontSize, radius } from '../theme/tokens';

type SessionMenuModalProps = {
  visible: boolean;
  session: SessionListItem | null;
  renameTitle: string;
  onRenameTitleChange: (value: string) => void;
  /** 点遮罩关闭：同时清掉选中的会话 */
  onDismiss: () => void;
  /** 系统返回键关闭：只关弹层 */
  onRequestClose: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
};

/** 长按会话行弹出的会话操作弹层（重命名 / 置顶 / 归档） */
export function SessionMenuModal(props: SessionMenuModalProps) {
  const { session, renameTitle } = props;
  return <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onRequestClose}>
    <View style={styles.menuOverlay}><Pressable style={StyleSheet.absoluteFill} onPress={props.onDismiss} />
      <View style={styles.messageMenu}>
        <Text style={styles.messageMenuTitle}>会话操作</Text>
        {!!session && <>
          <TextInput style={commonStyles.answerInput} value={renameTitle} onChangeText={props.onRenameTitleChange} placeholder="会话标题" />
          <Button label="保存标题" secondary disabled={!renameTitle.trim() || renameTitle.trim() === session.title} onPress={props.onRename} />
          <Button label={session.pinnedAt ? '取消置顶' : '置顶会话'} secondary onPress={props.onTogglePin} />
          <Button label={session.archivedAt ? '恢复会话' : '归档会话'} danger={!session.archivedAt} secondary={!!session.archivedAt} onPress={props.onToggleArchive} />
        </>}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  messageMenu: { padding: 18, gap: 10, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.sheetBg },
  messageMenuTitle: { color: colors.sheetText, fontSize: fontSize.title, fontWeight: '700', marginBottom: 2 },
});
