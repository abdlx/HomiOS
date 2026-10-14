import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTransfers } from '@/context/TransferContext';

export function TransfersScreen({ navigation }: any) {
  const { transfers, clearFinished } = useTransfers();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          {navigation.canGoBack() && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
              <Feather name="chevron-left" size={26} color="#ffffff" />
            </Pressable>
          )}
          <Text style={styles.title}>Transfers</Text>
        </View>

        {transfers.length > 0 && (
          <Pressable onPress={clearFinished} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear Done</Text>
          </Pressable>
        )}
      </View>

      {transfers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="activity" size={48} color="#252a3b" />
          <Text style={styles.emptyTitle}>No active transfers</Text>
          <Text style={styles.emptySubtitle}>Uploads and downloads will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.itemMeta}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.type.toUpperCase()} • {item.status} • {item.message}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
                </View>
              </View>
              <Text
                style={[
                  styles.status,
                  item.status === 'completed' && styles.statusCompleted,
                  item.status === 'failed' && styles.statusFailed,
                ]}
              >
                {item.status === 'completed'
                  ? 'Done'
                  : item.status === 'failed'
                  ? 'Failed'
                  : `${item.progress}%`}
              </Text>
            </View>
          )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1b1d26',
    borderWidth: 1,
    borderColor: '#292d3b',
  },
  clearBtnText: {
    color: '#8e95a5',
    fontSize: 12,
    fontWeight: '700',
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
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  itemMeta: {
    flex: 1,
  },
  name: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: '#8e95a5',
    fontSize: 12,
    marginTop: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#202434',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  status: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
  },
  statusCompleted: {
    color: '#34d399',
  },
  statusFailed: {
    color: '#f87171',
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
