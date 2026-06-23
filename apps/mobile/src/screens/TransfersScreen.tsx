import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { useTransfers } from '@/context/TransferContext';

export function TransfersScreen() {
  const { transfers, clearFinished } = useTransfers();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transfers</Text>
        <Pressable onPress={clearFinished} style={styles.button}><Text style={styles.buttonText}>Clear</Text></Pressable>
      </View>
      {transfers.length === 0 ? (
        <EmptyState title="No transfers" message="Uploads, downloads, copies, and moves appear here." />
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.type} · {item.status} · {item.message}</Text>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${item.progress}%` }]} /></View>
              </View>
              <Text style={[styles.status, item.status === 'failed' && styles.failed]}>{item.status === 'completed' ? 'Done' : item.status === 'failed' ? 'Fail' : `${item.progress}%`}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { color: '#f8fafc', fontSize: 32, fontWeight: '900' },
  button: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#1e293b', justifyContent: 'center' },
  buttonText: { color: '#cbd5e1', fontSize: 13, fontWeight: '800' },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomColor: 'rgba(148, 163, 184, 0.14)', borderBottomWidth: StyleSheet.hairlineWidth },
  name: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  meta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  progressTrack: { height: 5, borderRadius: 5, backgroundColor: '#1e293b', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: 5, backgroundColor: '#60a5fa' },
  status: { color: '#93c5fd', fontSize: 12, fontWeight: '900' },
  failed: { color: '#f87171' },
});
