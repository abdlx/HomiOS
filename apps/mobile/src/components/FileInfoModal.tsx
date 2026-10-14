import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { RemoteFile } from '@/types';
import { formatBytes } from '@/lib/format';
import { classifyFile } from '@/lib/path';

type FileInfoModalProps = {
  visible: boolean;
  item: RemoteFile | null;
  onClose: () => void;
};

export function FileInfoModal({ visible, item, onClose }: FileInfoModalProps) {
  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Ionicons
                name={item.isDir ? 'folder' : 'document-text'}
                size={28}
                color="#38bdf8"
              />
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.kindLabel}>
              {item.isDir ? 'Directory' : `${classifyFile(item.name).toUpperCase()} File`}
            </Text>
          </View>

          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Full Path</Text>
              <Text style={styles.infoVal} numberOfLines={2}>
                {item.path || `/${item.name}`}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Size</Text>
              <Text style={styles.infoVal}>
                {item.isDir
                  ? item.itemCount !== undefined && item.itemCount !== null
                    ? `${item.itemCount} items`
                    : '--'
                  : formatBytes(item.size)}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Modified</Text>
              <Text style={styles.infoVal}>
                {item.modified ? new Date(item.modified).toLocaleString() : '--'}
              </Text>
            </View>
          </View>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#161820',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#292d3c',
    padding: 20,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#13283c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  kindLabel: {
    color: '#8e95a5',
    fontSize: 13,
    marginTop: 4,
  },
  infoList: {
    backgroundColor: '#1d202b',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  infoRow: {
    paddingVertical: 8,
  },
  infoKey: {
    color: '#8e95a5',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoVal: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2c3144',
  },
  closeButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
