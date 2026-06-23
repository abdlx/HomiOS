import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/EmptyState';
import { useInstances } from '@/context/InstanceContext';
import { useTransfers } from '@/context/TransferContext';
import { classifyFile } from '@/lib/path';

export function PreviewScreen({ route }: any) {
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

  if (!client) return <EmptyState title="No instance selected" />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <Pressable onPress={download} style={styles.button}><Text style={styles.buttonText}>Share</Text></Pressable>
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
          <ActivityIndicator style={{ marginTop: 48 }} color="#60a5fa" />
        ) : textQuery.isError ? (
          <EmptyState title="Could not preview file" message={(textQuery.error as Error).message} />
        ) : (
          <ScrollView contentContainerStyle={styles.textWrap}>
            <Text selectable style={styles.code}>{textQuery.data}</Text>
          </ScrollView>
        )
      ) : (
        <EmptyState
          title="Preview unavailable"
          message="This file type can be opened through the native share sheet."
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomColor: 'rgba(148, 163, 184, 0.16)', borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  button: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  imageWrap: { flex: 1, backgroundColor: '#000' },
  image: { width: '100%', height: '100%' },
  textWrap: { padding: 16 },
  code: { color: '#e2e8f0', fontFamily: 'Courier', fontSize: 13, lineHeight: 20 },
});
