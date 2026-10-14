import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useInstances } from '@/context/InstanceContext';
import { useTransfers } from '@/context/TransferContext';
import { classifyFile } from '@/lib/path';

export function PreviewScreen({ route, navigation }: any) {
  const { path, name } = route.params;
  const { client, activeInstance } = useInstances();
  const { addTransfer } = useTransfers();
  const kind = classifyFile(name);

  const textQuery = useQuery({
    queryKey: ['preview-text', activeInstance?.id, path],
    queryFn: () => client!.previewText(path),
    enabled: !!client && kind === 'text',
  });

  const download = async () => {
    if (!client || !activeInstance) return;
    await addTransfer({
      instanceId: activeInstance.id,
      type: 'download',
      name,
      message: path,
      run: async () => {
        await client.downloadAndShare(path);
      },
    });
  };

  if (!client) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color="#ffffff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {name}
        </Text>
        <Pressable onPress={download} style={styles.shareButton} hitSlop={8}>
          <Feather name="share-2" size={18} color="#ffffff" />
        </Pressable>
      </View>

      {kind === 'image' ? (
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: client.rawFileUrl(path), headers: client.imageHeaders() }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>
      ) : kind === 'text' ? (
        textQuery.isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#38bdf8" />
          </View>
        ) : textQuery.isError ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
            <Text style={styles.emptyTitle}>Could not load preview</Text>
            <Text style={styles.emptySubtitle}>{(textQuery.error as Error).message}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.textWrap}>
            <Text selectable style={styles.code}>
              {textQuery.data}
            </Text>
          </ScrollView>
        )
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={56} color="#2b3144" />
          <Text style={styles.emptyTitle}>Preview unavailable</Text>
          <Text style={styles.emptySubtitle}>
            Tap the share button at top-right to download and open this file.
          </Text>
          <Pressable onPress={download} style={styles.openWithBtn}>
            <Feather name="download" size={18} color="#ffffff" />
            <Text style={styles.openWithBtnText}>Download & Open</Text>
          </Pressable>
        </View>
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
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#1e2230',
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 2,
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  shareButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textWrap: {
    padding: 16,
  },
  code: {
    color: '#e2e8f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
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
    lineHeight: 18,
  },
  openWithBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  openWithBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
