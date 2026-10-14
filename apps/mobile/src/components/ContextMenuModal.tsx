import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { RemoteFile } from '@/types';
import { formatBytes } from '@/lib/format';
import { classifyFile } from '@/lib/path';

type ContextMenuModalProps = {
  visible: boolean;
  item: RemoteFile | null;
  onClose: () => void;
  onOpen: (item: RemoteFile) => void;
  onDownload: (item: RemoteFile) => void;
  onShare: (item: RemoteFile) => void;
  onRename: (item: RemoteFile) => void;
  onMove: (item: RemoteFile) => void;
  onCopy: (item: RemoteFile) => void;
  onDelete: (item: RemoteFile) => void;
  onToggleFavorite?: (item: RemoteFile) => void;
  onCompress: (item: RemoteFile) => void;
  onGetInfo: (item: RemoteFile) => void;
};

export function ContextMenuModal({
  visible,
  item,
  onClose,
  onOpen,
  onDownload,
  onShare,
  onRename,
  onMove,
  onCopy,
  onDelete,
  onToggleFavorite,
  onCompress,
  onGetInfo,
}: ContextMenuModalProps) {
  if (!item) return null;

  const dateStr = item.modified ? item.modified.slice(0, 10) : '';
  const subtitle = item.isDir
    ? `${item.itemCount !== undefined && item.itemCount !== null ? `${item.itemCount} items` : 'Folder'} • ${dateStr}`
    : `${formatBytes(item.size)} • ${dateStr}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          {/* Header Preview of Selected Item */}
          <View style={styles.headerCard}>
            <View style={[styles.itemIconBadge, item.isDir ? styles.folderBadge : styles.fileBadge]}>
              {item.isDir ? (
                <Ionicons name="folder" size={28} color="#38bdf8" />
              ) : (
                <Ionicons
                  name={classifyFile(item.name) === 'image' ? 'image' : 'document-text'}
                  size={26}
                  color="#60a5fa"
                />
              )}
            </View>
            <View style={styles.headerMeta}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>

          {/* Action List Card */}
          <View style={styles.menuCard}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {/* Group 1: Open, Download, Share */}
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpen(item);
                }}
              >
                <Feather name="folder" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Open</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpen(item);
                }}
              >
                <Feather name="external-link" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Open in New Tab</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onDownload(item);
                }}
              >
                <Feather name="download" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Download</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onShare(item);
                }}
              >
                <Feather name="share-2" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Share</Text>
              </Pressable>

              {/* Separator 1 */}
              <View style={styles.divider} />

              {/* Group 2: Rename, Move, Copy, Delete */}
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onRename(item);
                }}
              >
                <Feather name="edit-2" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Rename</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onMove(item);
                }}
              >
                <MaterialCommunityIcons name="folder-move-outline" size={20} color="#e2e8f0" />
                <Text style={styles.menuText}>Move</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onCopy(item);
                }}
              >
                <Feather name="copy" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Copy</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onDelete(item);
                }}
              >
                <Feather name="trash-2" size={19} color="#ef4444" />
                <Text style={[styles.menuText, styles.deleteText]}>Delete</Text>
              </Pressable>

              {/* Separator 2 */}
              <View style={styles.divider} />

              {/* Group 3: Add to Favorites, Compress */}
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onToggleFavorite?.(item);
                }}
              >
                <Feather name="bookmark" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Add to Favorites</Text>
              </Pressable>

              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onCompress(item);
                }}
              >
                <MaterialCommunityIcons name="zip-box-outline" size={20} color="#e2e8f0" />
                <Text style={styles.menuText}>Compress</Text>
              </Pressable>

              {/* Separator 3 */}
              <View style={styles.divider} />

              {/* Group 4: Get Info */}
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onGetInfo(item);
                }}
              >
                <Feather name="info" size={19} color="#e2e8f0" />
                <Text style={styles.menuText}>Get Info</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 12,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1d24',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2b2f3d',
    padding: 14,
    gap: 14,
  },
  itemIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderBadge: {
    backgroundColor: '#0f2942',
  },
  fileBadge: {
    backgroundColor: '#17223b',
  },
  headerMeta: {
    flex: 1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8e95a5',
    fontSize: 13,
    marginTop: 2,
  },
  menuCard: {
    backgroundColor: '#16181f',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#272b3a',
    paddingVertical: 6,
    overflow: 'hidden',
    maxHeight: 460,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    gap: 14,
  },
  menuText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '500',
  },
  deleteText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#272b38',
    marginVertical: 4,
    marginHorizontal: 16,
  },
});
