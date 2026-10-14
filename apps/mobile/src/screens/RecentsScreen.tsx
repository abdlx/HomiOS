import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useInstances } from '@/context/InstanceContext';
import { RemoteFile } from '@/types';
import { formatBytes } from '@/lib/format';
import { classifyFile } from '@/lib/path';

export function RecentsScreen({ navigation }: any) {
  const { client, activeInstance } = useInstances();

  // Search or fetch recent files from /api/search?q=&limit=30
  const query = useQuery({
    queryKey: ['recents', activeInstance?.id],
    queryFn: async () => {
      if (!client) return [];
      try {
        const results = await client.search('');
        if (results && results.length > 0) {
          return results.map((r) => ({
            name: r.name,
            isDir: r.kind === 'folder',
            size: 0,
            modified: r.modified || new Date().toISOString(),
            path: r.path || `/${r.name}`,
          })) as RemoteFile[];
        }
      } catch {}

      // Fallback: list root files sorted by modified
      const rootFiles = await client.listFiles('/');
      return rootFiles.sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );
    },
    enabled: !!client,
  });

  const files: RemoteFile[] = query.data || [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Activity & History</Text>
        <Text style={styles.title}>Recents</Text>
      </View>

      {query.isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={56} color="#272b3c" />
          <Text style={styles.emptyTitle}>No recent files</Text>
          <Text style={styles.emptySubtitle}>
            Files you open, upload or modify will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item, index) => `${item.path || item.name}-${index}`}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor="#38bdf8"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const dateStr = item.modified ? new Date(item.modified).toLocaleDateString() : '';
            return (
              <Pressable
                style={styles.fileRow}
                onPress={() => {
                  if (item.isDir) {
                    navigation.navigate('Files');
                  } else {
                    navigation.navigate('Preview', { path: item.path, name: item.name });
                  }
                }}
              >
                <View style={[styles.itemIconBox, item.isDir ? styles.folderBox : styles.fileBox]}>
                  {item.isDir ? (
                    <Ionicons name="folder" size={24} color="#38bdf8" />
                  ) : (
                    <Ionicons
                      name={classifyFile(item.name) === 'image' ? 'image' : 'document-text'}
                      size={22}
                      color="#60a5fa"
                    />
                  )}
                </View>

                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileSubtitle} numberOfLines={1}>
                    {item.isDir ? 'Folder' : formatBytes(item.size)} • {dateStr}
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color="#64748b" />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  subtitle: {
    color: '#8e95a5',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#8e95a5',
    fontSize: 13,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  itemIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderBox: {
    backgroundColor: '#0f2942',
  },
  fileBox: {
    backgroundColor: '#17223b',
  },
  fileMeta: {
    flex: 1,
  },
  fileName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  fileSubtitle: {
    color: '#8e95a5',
    fontSize: 12,
    marginTop: 2,
  },
});
