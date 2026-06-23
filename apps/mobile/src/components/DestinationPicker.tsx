import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { OpenFinderClient } from '@/api/OpenFinderClient';
import { EmptyState } from '@/components/EmptyState';
import { basename, joinRemotePath, normalizeRemotePath, parentRemotePath } from '@/lib/path';
import { RemoteFile } from '@/types';

export function DestinationPicker({
  visible,
  client,
  startPath,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  client: OpenFinderClient;
  startPath: string;
  onCancel: () => void;
  onSelect: (path: string) => void;
}) {
  const [path, setPath] = useState(normalizeRemotePath(startPath));
  const query = useQuery({
    queryKey: ['destination', client.baseUrl, path],
    queryFn: () => client.listFiles(path),
    enabled: visible,
  });
  const folders = (query.data || []).filter((item: RemoteFile) => item.isDir);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerButton}><Text style={styles.buttonText}>Cancel</Text></Pressable>
          <Text style={styles.title} numberOfLines={1}>{basename(path)}</Text>
          <Pressable onPress={() => onSelect(path)} style={styles.headerButton}><Text style={styles.primaryText}>Choose</Text></Pressable>
        </View>
        <View style={styles.pathBar}>
          <Pressable disabled={path === '/'} onPress={() => setPath(parentRemotePath(path))} style={styles.upButton}>
            <Text style={[styles.buttonText, path === '/' && styles.disabled]}>Up</Text>
          </Pressable>
          <Text style={styles.pathText} numberOfLines={1}>{path}</Text>
        </View>
        {query.isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color="#60a5fa" />
        ) : query.isError ? (
          <EmptyState title="Could not load folders" message={(query.error as Error).message} />
        ) : folders.length === 0 ? (
          <EmptyState title="No folders here" message="Choose this folder or go up." />
        ) : (
          <FlatList
            data={folders}
            keyExtractor={(item) => item.path}
            renderItem={({ item }) => (
              <Pressable style={styles.folderRow} onPress={() => setPath(joinRemotePath(path, item.name))}>
                <Text style={styles.folderIcon}>F</Text>
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomColor: 'rgba(148, 163, 184, 0.18)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    minWidth: 72,
    minHeight: 44,
    justifyContent: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  buttonText: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryText: {
    color: '#60a5fa',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  disabled: {
    color: '#475569',
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  upButton: {
    minWidth: 42,
  },
  pathText: {
    color: '#94a3b8',
    flex: 1,
    fontSize: 13,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 16,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2563eb',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 34,
    fontWeight: '800',
  },
  folderName: {
    color: '#f8fafc',
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
