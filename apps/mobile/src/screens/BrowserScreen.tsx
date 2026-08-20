import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { DestinationPicker } from '@/components/DestinationPicker';
import { EmptyState } from '@/components/EmptyState';
import { FileRow } from '@/components/FileRow';
import { PromptModal, PromptState } from '@/components/PromptModal';
import { useInstances } from '@/context/InstanceContext';
import { useTransfers } from '@/context/TransferContext';
import { DriveItem, RemoteFile } from '@/types';
import { basename, classifyFile, joinRemotePath, normalizeRemotePath, parentRemotePath } from '@/lib/path';
import { formatBytes } from '@/lib/format';

type SortMode = 'name' | 'modified' | 'size' | 'type';
type DestinationAction = { type: 'copy' | 'move'; item: RemoteFile } | null;

export function BrowserScreen({ navigation }: any) {
  const { activeInstance, client, updateLastPath } = useInstances();
  const { addTransfer } = useTransfers();
  const queryClient = useQueryClient();
  const [path, setPath] = useState(activeInstance?.lastPath || '/');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [destinationAction, setDestinationAction] = useState<DestinationAction>(null);

  const query = useQuery({
    queryKey: ['files', activeInstance?.id, path],
    queryFn: () => client!.listFiles(path),
    enabled: !!client,
  });

  const drivesQuery = useQuery({
    queryKey: ['drives', activeInstance?.id],
    queryFn: () => client!.drives(),
    enabled: !!client && path === '/',
  });

  const files = useMemo(() => {
    const data = [...(query.data || [])];
    return data.sort((a, b) => {
      if (a.isDir !== b.isDir) return Number(b.isDir) - Number(a.isDir);
      if (sortMode === 'modified') return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      if (sortMode === 'size') return b.size - a.size;
      if (sortMode === 'type') return classifyFile(a.name).localeCompare(classifyFile(b.name)) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [query.data, sortMode]);

  const invalidateCurrent = () => queryClient.invalidateQueries({ queryKey: ['files', activeInstance?.id] });

  const createFolder = useMutation({
    mutationFn: (name: string) => client!.createFolder(joinRemotePath(path, name)),
    onSuccess: invalidateCurrent,
    onError: (error: any) => Alert.alert('Could not create folder', error.message),
  });

  const rename = useMutation({
    mutationFn: ({ item, name }: { item: RemoteFile; name: string }) => client!.rename(joinRemotePath(path, item.name), joinRemotePath(path, name)),
    onSuccess: invalidateCurrent,
    onError: (error: any) => Alert.alert('Could not rename', error.message),
  });

  const remove = useMutation({
    mutationFn: (item: RemoteFile) => client!.delete(joinRemotePath(path, item.name)),
    onSuccess: invalidateCurrent,
    onError: (error: any) => Alert.alert('Could not delete', error.message),
  });

  const openFolder = async (nextPath: string) => {
    const normalized = normalizeRemotePath(nextPath);
    setPath(normalized);
    await updateLastPath(normalized);
  };

  const uploadDocument = async () => {
    if (!client || !activeInstance) return;
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    for (const asset of result.assets) {
      const targetPath = joinRemotePath(path, asset.name);
      await addTransfer({
        instanceId: activeInstance.id,
        type: 'upload',
        name: asset.name,
        message: targetPath,
        run: async (update) => {
          await client.upload(asset.uri, targetPath, (progress) => update({ progress }));
          await invalidateCurrent();
        },
      });
    }
  };

  const uploadImage = async () => {
    if (!client || !activeInstance) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ImagePicker.MediaTypeOptions.All });
    if (result.canceled) return;
    for (const [index, asset] of result.assets.entries()) {
      const name = asset.fileName || `upload-${Date.now()}-${index}.jpg`;
      const targetPath = joinRemotePath(path, name);
      await addTransfer({
        instanceId: activeInstance.id,
        type: 'upload',
        name,
        message: targetPath,
        run: async (update) => {
          await client.upload(asset.uri, targetPath, (progress) => update({ progress }));
          await invalidateCurrent();
        },
      });
    }
  };

  const showActions = (item: RemoteFile) => {
    Alert.alert(item.name, item.isDir ? 'Folder actions' : `${formatBytes(item.size)} file`, [
      { text: 'Rename', onPress: () => setPrompt({ title: 'Rename', value: item.name, onSubmit: (name) => name && rename.mutate({ item, name }) }) },
      { text: 'Copy', onPress: () => setDestinationAction({ type: 'copy', item }) },
      { text: 'Move', onPress: () => setDestinationAction({ type: 'move', item }) },
      { text: 'Download / Share', onPress: () => downloadItem(item) },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(item) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const downloadItem = async (item: RemoteFile) => {
    if (!client || !activeInstance) return;
    const sourcePath = joinRemotePath(path, item.name);
    await addTransfer({
      instanceId: activeInstance.id,
      type: 'download',
      name: item.name,
      message: sourcePath,
      run: async () => {
        await client.downloadAndShare(sourcePath, item.isDir);
      },
    });
  };

  const chooseDestination = async (destinationFolder: string) => {
    if (!client || !activeInstance || !destinationAction) return;
    const { item, type } = destinationAction;
    const sourcePath = joinRemotePath(path, item.name);
    const destinationPath = joinRemotePath(destinationFolder, item.name);
    setDestinationAction(null);
    await addTransfer({
      instanceId: activeInstance.id,
      type,
      name: item.name,
      message: destinationPath,
      run: async () => {
        if (type === 'copy') await client.copy(sourcePath, destinationPath);
        else await client.move(sourcePath, destinationPath);
        await invalidateCurrent();
      },
    });
  };

  if (!client || !activeInstance) {
    return <EmptyState title="No instance selected" message="Add an HomiOS instance to start browsing." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.instanceName} numberOfLines={1}>{activeInstance.name}</Text>
            <Text style={styles.path} numberOfLines={1}>{path}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Instances')} style={styles.toolButton}><Text style={styles.toolText}>Srv</Text></Pressable>
        </View>
        <View style={styles.toolbar}>
          <Pressable disabled={path === '/'} onPress={() => openFolder(parentRemotePath(path))} style={styles.toolbarButton}><Text style={[styles.toolbarText, path === '/' && styles.disabled]}>Up</Text></Pressable>
          <Pressable onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')} style={styles.toolbarButton}><Text style={styles.toolbarText}>{viewMode === 'list' ? 'Grid' : 'List'}</Text></Pressable>
          <Pressable onPress={() => setSortMode(sortMode === 'name' ? 'modified' : sortMode === 'modified' ? 'size' : sortMode === 'size' ? 'type' : 'name')} style={styles.toolbarButton}><Text style={styles.toolbarText}>Sort {sortMode}</Text></Pressable>
          <Pressable onPress={() => setPrompt({ title: 'New Folder', placeholder: 'Folder name', submitLabel: 'Create', onSubmit: (name) => name && createFolder.mutate(name) })} style={styles.toolbarButton}><Text style={styles.toolbarText}>New</Text></Pressable>
        </View>
        <View style={styles.toolbar}>
          <Pressable onPress={uploadDocument} style={styles.secondaryButton}><Text style={styles.toolbarText}>Upload File</Text></Pressable>
          <Pressable onPress={uploadImage} style={styles.secondaryButton}><Text style={styles.toolbarText}>Upload Media</Text></Pressable>
        </View>
      </View>

      {path === '/' && drivesQuery.data?.length ? (
        <View style={styles.drives}>
          <FlatList
            horizontal
            data={drivesQuery.data.filter((drive: DriveItem) => drive.path)}
            keyExtractor={(item) => item.path || item.label}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => openFolder(item.path)} style={styles.drivePill}>
                <Text style={styles.driveName} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#60a5fa" />
      ) : query.isError ? (
        <EmptyState title="Could not load folder" message={(query.error as Error).message} />
      ) : files.length === 0 ? (
        <EmptyState title="Folder is empty" message="Upload a file or create a folder." />
      ) : viewMode === 'list' ? (
        <FlatList
          data={files}
          key="list"
          keyExtractor={(item) => item.path || item.name}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={query.refetch} tintColor="#60a5fa" />}
          renderItem={({ item }) => (
            <FileRow
              item={item}
              onPress={() => item.isDir ? openFolder(joinRemotePath(path, item.name)) : navigation.navigate('Preview', { path: joinRemotePath(path, item.name), name: item.name })}
              onLongPress={() => showActions(item)}
            />
          )}
        />
      ) : (
        <FlatList
          data={files}
          key="grid"
          numColumns={2}
          keyExtractor={(item) => item.path || item.name}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={query.refetch} tintColor="#60a5fa" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => item.isDir ? openFolder(joinRemotePath(path, item.name)) : navigation.navigate('Preview', { path: joinRemotePath(path, item.name), name: item.name })}
              onLongPress={() => showActions(item)}
              style={styles.gridItem}
            >
              <Text style={styles.gridIcon}>{item.isDir ? 'F' : classifyFile(item.name).slice(0, 1).toUpperCase()}</Text>
              <Text style={styles.gridName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.gridMeta}>{item.isDir ? 'Folder' : formatBytes(item.size)}</Text>
            </Pressable>
          )}
        />
      )}

      <PromptModal prompt={prompt} onCancel={() => setPrompt(null)} />
      {destinationAction ? (
        <DestinationPicker
          visible={!!destinationAction}
          client={client}
          startPath={path}
          onCancel={() => setDestinationAction(null)}
          onSelect={chooseDestination}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomColor: 'rgba(148, 163, 184, 0.16)', borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instanceName: { color: '#f8fafc', fontSize: 24, fontWeight: '900' },
  path: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  toolButton: { width: 44, height: 40, borderRadius: 8, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  toolText: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  toolbarButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { flex: 1, minHeight: 38, borderRadius: 8, backgroundColor: '#172554', alignItems: 'center', justifyContent: 'center' },
  toolbarText: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  disabled: { color: '#475569' },
  drives: { minHeight: 58, paddingVertical: 10, paddingLeft: 16 },
  drivePill: { minWidth: 120, maxWidth: 190, height: 38, borderRadius: 8, backgroundColor: '#12305d', justifyContent: 'center', paddingHorizontal: 12, marginRight: 8 },
  driveName: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  grid: { padding: 10 },
  gridItem: { flex: 1, minHeight: 128, margin: 6, padding: 12, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1 },
  gridIcon: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2563eb', color: '#fff', lineHeight: 40, textAlign: 'center', fontWeight: '900', marginBottom: 12 },
  gridName: { color: '#f8fafc', fontSize: 14, fontWeight: '700', minHeight: 38 },
  gridMeta: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
});
