import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RemoteFile } from '@/types';
import { formatBytes, formatDate } from '@/lib/format';
import { classifyFile } from '@/lib/path';

export function FileRow({
  item,
  selected,
  onPress,
  onLongPress,
}: {
  item: RemoteFile;
  selected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const kind = item.isDir ? 'folder' : classifyFile(item.name);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={[styles.icon, item.isDir ? styles.folderIcon : styles.fileIcon]}>
        <Text style={styles.iconText}>{item.isDir ? 'F' : kind.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {item.isDir ? 'Folder' : formatBytes(item.size)}{item.modified ? `  ·  ${formatDate(item.modified)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selected: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
  },
  pressed: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIcon: {
    backgroundColor: '#2563eb',
  },
  fileIcon: {
    backgroundColor: '#334155',
  },
  iconText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  detail: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
});
