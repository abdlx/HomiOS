import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/EmptyState';
import { useInstances } from '@/context/InstanceContext';
import { basename } from '@/lib/path';

export function SearchScreen({ navigation }: any) {
  const { client, activeInstance } = useInstances();
  const [query, setQuery] = useState('');
  const search = useQuery({
    queryKey: ['search', activeInstance?.id, query],
    queryFn: () => client!.search(query),
    enabled: !!client && query.trim().length >= 2,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find files..."
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          style={styles.input}
        />
      </View>
      {!client ? (
        <EmptyState title="No instance selected" />
      ) : query.trim().length < 2 ? (
        <EmptyState title="Start typing" message="Search names and indexed file content." />
      ) : search.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#60a5fa" />
      ) : search.isError ? (
        <EmptyState title="Search failed" message={(search.error as Error).message} />
      ) : !search.data?.length ? (
        <EmptyState title="No results" />
      ) : (
        <FlatList
          data={search.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                const targetPath = item.path || item.id;
                if (item.kind === 'folder') navigation.navigate('Files');
                else navigation.navigate('Preview', { path: targetPath, name: item.name || basename(targetPath) });
              }}
            >
              <Text style={styles.kind}>{item.kind}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.path} numberOfLines={1}>{item.path || item.snippet}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { color: '#f8fafc', fontSize: 32, fontWeight: '900', marginBottom: 12 },
  input: { minHeight: 48, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, color: '#f8fafc', paddingHorizontal: 12, fontSize: 16 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomColor: 'rgba(148, 163, 184, 0.14)', borderBottomWidth: StyleSheet.hairlineWidth },
  kind: { width: 52, color: '#60a5fa', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  name: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  path: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
});
