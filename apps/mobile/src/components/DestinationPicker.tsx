import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { HomiOSClient } from '@/api/HomiOSClient';
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
  client: HomiOSClient;
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{basename(path)}</Text>
          <Pressable onPress={() => onSelect(path)} style={styles.headerButton}>
            <Text style={styles.primaryText}>Choose</Text>
          </Pressable>
        </View>

        <View style={styles.pathBar}>
          <Pressable
            disabled={path === '/'}
            onPress={() => setPath(parentRemotePath(path))}
            style={[styles.upButton, path === '/' && styles.disabledButton]}
          >
            <Feather name="arrow-left" size={16} color={path === '/' ? '#475569' : '#38bdf8'} />
            <Text style={[styles.upText, path === '/' && styles.disabledText]}>Back</Text>
          </Pressable>
          <Text style={styles.pathText} numberOfLines={1}>{path}</Text>
        </View>

        {query.isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color="#38bdf8" />
        ) : query.isError ? (
          <EmptyState title="Could not load folders" message={(query.error as Error).message} />
        ) : folders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color="#475569" />
            <Text style={styles.emptyTitle}>No subfolders here</Text>
            <Text style={styles.emptySubtitle}>Tap 'Choose' to select this directory.</Text>
          </View>
        ) : (
          <FlatList
            data={folders}
            keyExtractor={(item) => item.path}
            renderItem={({ item }) => (
              <Pressable
                style={styles.folderRow}
                onPress={() => setPath(item.path || joinRemotePath(path, item.name))}
              >
                <View style={styles.folderIconBadge}>
                  <Ionicons name="folder" size={22} color="#38bdf8" />
                </View>
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
                <Feather name="chevron-right" size={18} color="#64748b" />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomColor: '#1e2230',
    borderBottomWidth: 1,
  },
  headerButton: {
    minWidth: 70,
    minHeight: 40,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  cancelText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryText: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#12151e',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2230',
  },
  upButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#1b1f2b',
  },
  disabledButton: {
    opacity: 0.4,
  },
  upText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledText: {
    color: '#475569',
  },
  pathText: {
    color: '#8e95a5',
    flex: 1,
    fontSize: 13,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderBottomColor: '#161924',
    borderBottomWidth: 1,
  },
  folderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0f2942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    color: '#ffffff',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#8e95a5',
    fontSize: 13,
  },
});
