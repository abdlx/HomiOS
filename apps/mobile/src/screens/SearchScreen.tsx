import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useInstances } from '@/context/InstanceContext';
import { basename, classifyFile } from '@/lib/path';

export function SearchScreen({ navigation, route }: any) {
  const { client, activeInstance } = useInstances();
  const [query, setQuery] = useState(route?.params?.initialQuery || '');

  useEffect(() => {
    if (route?.params?.initialQuery) {
      setQuery(route.params.initialQuery);
    }
  }, [route?.params?.initialQuery]);

  const search = useQuery({
    queryKey: ['search', activeInstance?.id, query],
    queryFn: () => client!.search(query),
    enabled: !!client && query.trim().length >= 1,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="chevron-left" size={26} color="#ffffff" />
          </Pressable>
          <Text style={styles.title}>Search</Text>
        </View>

        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#8e95a5" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search files and folders..."
            placeholderTextColor="#8e95a5"
            autoCapitalize="none"
            autoFocus={!route?.params?.initialQuery}
            style={styles.input}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#8e95a5" />
            </Pressable>
          )}
        </View>
      </View>

      {!client ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No instance connected</Text>
        </View>
      ) : query.trim().length < 1 ? (
        <View style={styles.emptyContainer}>
          <Feather name="search" size={48} color="#252a3b" />
          <Text style={styles.emptyTitle}>Find anything on your server</Text>
          <Text style={styles.emptySubtitle}>Search files, folders, and indexed content.</Text>
        </View>
      ) : search.isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : search.isError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.emptyTitle}>Search failed</Text>
          <Text style={styles.emptySubtitle}>{(search.error as Error).message}</Text>
        </View>
      ) : !search.data?.length ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={48} color="#252a3b" />
          <Text style={styles.emptyTitle}>No matches found</Text>
          <Text style={styles.emptySubtitle}>Try checking the spelling or use another keyword.</Text>
        </View>
      ) : (
        <FlatList
          data={search.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isDir = item.kind === 'folder';
            return (
              <Pressable
                style={styles.row}
                onPress={() => {
                  const targetPath = item.path || item.id;
                  if (isDir) {
                    navigation.navigate('Files');
                  } else {
                    navigation.navigate('Preview', {
                      path: targetPath,
                      name: item.name || basename(targetPath),
                    });
                  }
                }}
              >
                <View style={[styles.iconBox, isDir ? styles.folderBox : styles.fileBox]}>
                  {isDir ? (
                    <Ionicons name="folder" size={24} color="#38bdf8" />
                  ) : (
                    <Ionicons
                      name={classifyFile(item.name) === 'image' ? 'image' : 'document-text'}
                      size={22}
                      color="#60a5fa"
                    />
                  )}
                </View>

                <View style={styles.itemMeta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.path} numberOfLines={1}>
                    {item.path || item.snippet}
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
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  backBtn: {
    padding: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151720',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242838',
    paddingHorizontal: 14,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  row: {
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
  iconBox: {
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
  itemMeta: {
    flex: 1,
  },
  name: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  path: {
    color: '#8e95a5',
    fontSize: 12,
    marginTop: 2,
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
    gap: 10,
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
});
