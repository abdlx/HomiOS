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
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useInstances } from '@/context/InstanceContext';
import { SharedItem } from '@/types';

export function SharedScreen({ navigation }: any) {
  const { client, activeInstance } = useInstances();

  const query = useQuery({
    queryKey: ['shares', activeInstance?.id],
    queryFn: () => client!.shares(),
    enabled: !!client,
  });

  const shares: SharedItem[] = query.data || [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Network & Samba</Text>
        <Text style={styles.title}>Shared Folders</Text>
      </View>

      {query.isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : shares.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={56} color="#272b3c" />
          <Text style={styles.emptyTitle}>No shared folders found</Text>
          <Text style={styles.emptySubtitle}>
            Configure Samba shares on your HomiOS server to see network shares here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={shares}
          keyExtractor={(item) => String(item.id || item.name)}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor="#38bdf8"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.shareCard}
              onPress={() => {
                navigation.navigate('Files');
              }}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="folder-open" size={24} color="#38bdf8" />
              </View>

              <View style={styles.shareMeta}>
                <View style={styles.shareTitleRow}>
                  <Text style={styles.shareName}>{item.name}</Text>
                  {item.readOnly || item.read_only ? (
                    <View style={styles.readOnlyBadge}>
                      <Text style={styles.readOnlyText}>Read Only</Text>
                    </View>
                  ) : (
                    <View style={styles.readWriteBadge}>
                      <Text style={styles.readWriteText}>Read / Write</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.sharePath} numberOfLines={1}>
                  {item.path}
                </Text>

                {item.comment ? (
                  <Text style={styles.shareComment} numberOfLines={1}>
                    {item.comment}
                  </Text>
                ) : null}
              </View>

              <Feather name="chevron-right" size={18} color="#64748b" />
            </Pressable>
          )}
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
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0f2942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareMeta: {
    flex: 1,
    gap: 4,
  },
  shareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  readOnlyBadge: {
    backgroundColor: '#27201c',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  readOnlyText: {
    color: '#fb923c',
    fontSize: 10,
    fontWeight: '700',
  },
  readWriteBadge: {
    backgroundColor: '#132822',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  readWriteText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
  sharePath: {
    color: '#8e95a5',
    fontSize: 12,
  },
  shareComment: {
    color: '#64748b',
    fontSize: 11,
  },
});
