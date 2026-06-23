import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/EmptyState';
import { useInstances } from '@/context/InstanceContext';

export function SettingsScreen() {
  const { activeInstance, client, instances, switchInstance, removeInstance } = useInstances();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me', activeInstance?.id],
    queryFn: () => client!.me(),
    enabled: !!client,
  });

  if (!activeInstance || !client) {
    return <EmptyState title="No instance selected" message="Add an instance from the Instances tab." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>{activeInstance.baseUrl}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Current Instance</Text>
        {me.isLoading ? <ActivityIndicator color="#60a5fa" /> : me.isError ? (
          <Text style={styles.error}>{(me.error as Error).message}</Text>
        ) : (
          <>
            <Text style={styles.value}>{me.data?.server.name} {me.data?.server.version}</Text>
            <Text style={styles.muted}>{me.data?.user.email}</Text>
            <Text style={styles.muted}>Role: {me.data?.user.role} · Abilities: {me.data?.user.abilities.join(', ')}</Text>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Switch Instance</Text>
      <FlatList
        data={instances}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={async () => {
              await switchInstance(item.id);
              await queryClient.invalidateQueries();
            }}
            onLongPress={() => Alert.alert('Remove instance?', item.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeInstance(item.id) },
            ])}
            style={[styles.row, item.id === activeInstance.id && styles.activeRow]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>{item.baseUrl}</Text>
            </View>
            <Text style={styles.rowPath}>{item.lastPath}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { color: '#f8fafc', fontSize: 32, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  panel: { marginHorizontal: 16, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, padding: 16, marginBottom: 18 },
  panelTitle: { color: '#cbd5e1', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  value: { color: '#f8fafc', fontSize: 17, fontWeight: '800' },
  muted: { color: '#94a3b8', fontSize: 13, marginTop: 6 },
  error: { color: '#f87171', fontSize: 13 },
  sectionTitle: { color: '#cbd5e1', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1 },
  activeRow: { borderColor: '#60a5fa', backgroundColor: '#10213d' },
  rowTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  rowSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  rowPath: { color: '#60a5fa', fontSize: 12, fontWeight: '800' },
});
