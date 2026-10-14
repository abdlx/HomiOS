import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useInstances } from '@/context/InstanceContext';
import { useTransfers } from '@/context/TransferContext';
import { RemoteFile } from '@/types';
import { basename, classifyFile, joinRemotePath, normalizeRemotePath, parentRemotePath } from '@/lib/path';
import { formatBytes } from '@/lib/format';
import { ContextMenuModal } from '@/components/ContextMenuModal';
import { FileInfoModal } from '@/components/FileInfoModal';
import { PromptModal, PromptState } from '@/components/PromptModal';
import { DestinationPicker } from '@/components/DestinationPicker';

type FolderExplorerScreenProps = {
  initialPath?: string;
  onBack?: () => void;
  navigation: any;
};

type SortMode = 'name' | 'modified' | 'size' | 'type';

export function FolderExplorerScreen({ initialPath = '/', onBack, navigation }: FolderExplorerScreenProps) {
  const { client, activeInstance, updateLastPath } = useInstances();
  const { addTransfer } = useTransfers();
  const queryClient = useQueryClient();

  const [currentPath, setCurrentPath] = useState(normalizeRemotePath(initialPath));
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Modals state
  const [selectedItem, setSelectedItem] = useState<RemoteFile | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [destinationAction, setDestinationAction] = useState<{ type: 'copy' | 'move'; item: RemoteFile } | null>(null);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  const query = useQuery({
    queryKey: ['files', activeInstance?.id, currentPath],
    queryFn: () => client!.listFiles(currentPath),
    enabled: !!client,
  });

  const invalidateCurrent = () => queryClient.invalidateQueries({ queryKey: ['files', activeInstance?.id] });

  // Filter & sort files
  const files = useMemo(() => {
    let list = [...(query.data || [])];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }

    return list.sort((a, b) => {
      if (a.isDir !== b.isDir) return Number(b.isDir) - Number(a.isDir);
      let comp = 0;
      if (sortMode === 'modified') {
        comp = new Date(b.modified).getTime() - new Date(a.modified).getTime();
      } else if (sortMode === 'size') {
        comp = b.size - a.size;
      } else if (sortMode === 'type') {
        comp = classifyFile(a.name).localeCompare(classifyFile(b.name));
      } else {
        comp = a.name.localeCompare(b.name);
      }
      return sortAsc ? comp : -comp;
    });
  }, [query.data, searchQuery, sortMode, sortAsc]);

  // Mutations
  const createFolder = useMutation({
    mutationFn: (name: string) => client!.createFolder(joinRemotePath(currentPath, name)),
    onSuccess: invalidateCurrent,
    onError: (err: any) => Alert.alert('Could not create folder', err.message),
  });

  const renameMutation = useMutation({
    mutationFn: ({ item, newName }: { item: RemoteFile; newName: string }) =>
      client!.rename(joinRemotePath(currentPath, item.name), joinRemotePath(currentPath, newName)),
    onSuccess: invalidateCurrent,
    onError: (err: any) => Alert.alert('Could not rename', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: RemoteFile) => client!.delete(joinRemotePath(currentPath, item.name)),
    onSuccess: invalidateCurrent,
    onError: (err: any) => Alert.alert('Could not delete', err.message),
  });

  const compressMutation = useMutation({
    mutationFn: (item: RemoteFile) => client!.compress(joinRemotePath(currentPath, item.name)),
    onSuccess: () => {
      invalidateCurrent();
      Alert.alert('Compressed', 'Zip archive created successfully.');
    },
    onError: (err: any) => Alert.alert('Compression failed', err.message),
  });

  const navigateTo = async (nextPath: string) => {
    const normalized = normalizeRemotePath(nextPath);
    setCurrentPath(normalized);
    setSearchQuery('');
    await updateLastPath(normalized);
  };

  const handleOpenItem = (item: RemoteFile) => {
    if (item.isDir) {
      navigateTo(item.path || joinRemotePath(currentPath, item.name));
    } else {
      navigation.navigate('Preview', { path: item.path || joinRemotePath(currentPath, item.name), name: item.name });
    }
  };

  // Breadcrumbs parsing
  const breadcrumbSegments = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length === 0) return [{ name: 'Root', path: '/' }];

    const result = [{ name: 'Root', path: '/' }];
    let acc = '';
    for (const part of parts) {
      acc = `${acc}/${part}`;
      result.push({ name: part, path: acc });
    }
    return result;
  }, [currentPath]);

  // FAB Upload handlers
  const handlePickDocument = async () => {
    setIsFabMenuOpen(false);
    if (!client || !activeInstance) return;

    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;

    for (const asset of result.assets) {
      const targetPath = joinRemotePath(currentPath, asset.name);
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

  const handlePickImage = async () => {
    setIsFabMenuOpen(false);
    if (!client || !activeInstance) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Needed', 'Allow photo library access to upload media.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return;

    for (const asset of result.assets) {
      const name = asset.fileName || `media-${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
      const targetPath = joinRemotePath(currentPath, name);
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

  const handlePromptNewFolder = () => {
    setIsFabMenuOpen(false);
    setPrompt({
      title: 'New Folder',
      placeholder: 'Folder name',
      submitLabel: 'Create',
      onSubmit: (name) => createFolder.mutate(name),
    });
  };

  const currentFolderDisplayName = basename(currentPath);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header matching reference image: Back button, Breadcrumb trail, More button */}
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => {
            if (currentPath !== '/') {
              navigateTo(parentRemotePath(currentPath));
            } else if (onBack) {
              onBack();
            }
          }}
          style={styles.backButton}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={26} color="#ffffff" />
        </Pressable>

        {/* Breadcrumb Trail */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbsContainer}
        >
          {breadcrumbSegments.map((seg, idx) => (
            <Pressable
              key={seg.path}
              onPress={() => navigateTo(seg.path)}
              style={styles.breadcrumbItem}
            >
              <Text
                style={[
                  styles.breadcrumbText,
                  idx === breadcrumbSegments.length - 1 && styles.breadcrumbActiveText,
                ]}
              >
                {seg.name}
              </Text>
              {idx < breadcrumbSegments.length - 1 && (
                <Feather name="chevron-right" size={14} color="#64748b" style={styles.breadcrumbChevron} />
              )}
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={() => setIsFabMenuOpen(true)}
          style={styles.headerMoreBtn}
          hitSlop={8}
        >
          <Feather name="more-horizontal" size={20} color="#ffffff" />
        </Pressable>
      </View>

      {/* Search in Current Folder */}
      <View style={styles.searchBar}>
        <Feather name="search" size={18} color="#8e95a5" style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Search in ${currentFolderDisplayName}`}
          placeholderTextColor="#8e95a5"
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#8e95a5" />
          </Pressable>
        )}
      </View>

      {/* Subheader / Controls Bar matching reference image */}
      <View style={styles.controlsBar}>
        <Text style={styles.itemsCountText}>
          {query.isLoading ? 'Loading...' : `${files.length} items`}
        </Text>

        <View style={styles.controlsRight}>
          {/* Sort Selector Pill */}
          <Pressable
            style={styles.sortPill}
            onPress={() => {
              const modes: SortMode[] = ['name', 'modified', 'size', 'type'];
              const nextIndex = (modes.indexOf(sortMode) + 1) % modes.length;
              setSortMode(modes[nextIndex]);
            }}
          >
            <Text style={styles.sortPillText}>
              {sortMode.charAt(0).toUpperCase() + sortMode.slice(1)}
            </Text>
            <MaterialCommunityIcons name="swap-vertical" size={16} color="#ffffff" />
          </Pressable>

          {/* View Mode Toggle Icons */}
          <View style={styles.viewToggleGroup}>
            <Pressable
              onPress={() => setViewMode('list')}
              style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
            >
              <Feather
                name="list"
                size={18}
                color={viewMode === 'list' ? '#38bdf8' : '#8e95a5'}
              />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('grid')}
              style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
            >
              <Feather
                name="grid"
                size={18}
                color={viewMode === 'grid' ? '#38bdf8' : '#8e95a5'}
              />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Files List / Grid */}
      {query.isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open-outline" size={56} color="#2b3144" />
          <Text style={styles.emptyTitle}>This folder is empty</Text>
          <Text style={styles.emptySubtitle}>Tap + to upload files or create subfolders.</Text>
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={files}
          keyExtractor={(item) => item.path || item.name}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor="#38bdf8"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const dateStr = item.modified ? item.modified.slice(0, 10) : '';
            const subtitle = item.isDir
              ? `${item.itemCount !== undefined && item.itemCount !== null ? `${item.itemCount} items` : 'Folder'} • ${dateStr}`
              : `${formatBytes(item.size)} • ${dateStr}`;

            return (
              <Pressable
                style={styles.fileRow}
                onPress={() => handleOpenItem(item)}
                onLongPress={() => {
                  setSelectedItem(item);
                  setIsContextMenuOpen(true);
                }}
              >
                <View style={[styles.itemIconBox, item.isDir ? styles.folderIconBox : styles.regularFileBox]}>
                  {item.isDir ? (
                    <Ionicons name="folder" size={26} color="#38bdf8" />
                  ) : (
                    <Ionicons
                      name={classifyFile(item.name) === 'image' ? 'image' : 'document-text'}
                      size={24}
                      color="#60a5fa"
                    />
                  )}
                </View>

                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>

                {/* More options button (...) matching Screen 2 */}
                <Pressable
                  style={styles.rowMoreBtn}
                  hitSlop={10}
                  onPress={() => {
                    setSelectedItem(item);
                    setIsContextMenuOpen(true);
                  }}
                >
                  <Feather name="more-horizontal" size={18} color="#8e95a5" />
                </Pressable>
              </Pressable>
            );
          }}
        />
      ) : (
        /* Grid Mode */
        <FlatList
          data={files}
          numColumns={2}
          key="grid-view"
          keyExtractor={(item) => item.path || item.name}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor="#38bdf8"
            />
          }
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.gridCard}
              onPress={() => handleOpenItem(item)}
              onLongPress={() => {
                setSelectedItem(item);
                setIsContextMenuOpen(true);
              }}
            >
              <View style={styles.gridCardHeader}>
                <View style={[styles.gridIconBox, item.isDir ? styles.folderIconBox : styles.regularFileBox]}>
                  {item.isDir ? (
                    <Ionicons name="folder" size={32} color="#38bdf8" />
                  ) : (
                    <Ionicons
                      name={classifyFile(item.name) === 'image' ? 'image' : 'document-text'}
                      size={30}
                      color="#60a5fa"
                    />
                  )}
                </View>
                <Pressable
                  onPress={() => {
                    setSelectedItem(item);
                    setIsContextMenuOpen(true);
                  }}
                  hitSlop={10}
                >
                  <Feather name="more-horizontal" size={18} color="#8e95a5" />
                </Pressable>
              </View>

              <Text style={styles.gridFileName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.gridFileSubtitle} numberOfLines={1}>
                {item.isDir
                  ? item.itemCount !== undefined && item.itemCount !== null ? `${item.itemCount} items` : 'Folder'
                  : formatBytes(item.size)}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* Floating Action Button (FAB) matching reference image Screen 2 */}
      <Pressable
        style={styles.fabButton}
        onPress={() => setIsFabMenuOpen(true)}
      >
        <Feather name="plus" size={26} color="#ffffff" />
      </Pressable>

      {/* FAB Actions Menu Modal */}
      <Modal visible={isFabMenuOpen} transparent animationType="fade" onRequestClose={() => setIsFabMenuOpen(false)}>
        <Pressable style={styles.fabBackdrop} onPress={() => setIsFabMenuOpen(false)}>
          <View style={styles.fabSheet}>
            <Text style={styles.fabSheetTitle}>Actions</Text>

            <Pressable style={styles.fabMenuRow} onPress={handlePromptNewFolder}>
              <View style={styles.fabIconCircle}>
                <Feather name="folder-plus" size={20} color="#38bdf8" />
              </View>
              <Text style={styles.fabMenuText}>New Folder</Text>
            </Pressable>

            <Pressable style={styles.fabMenuRow} onPress={handlePickImage}>
              <View style={styles.fabIconCircle}>
                <Feather name="image" size={20} color="#38bdf8" />
              </View>
              <Text style={styles.fabMenuText}>Upload Photos & Videos</Text>
            </Pressable>

            <Pressable style={styles.fabMenuRow} onPress={handlePickDocument}>
              <View style={styles.fabIconCircle}>
                <Feather name="file-plus" size={20} color="#38bdf8" />
              </View>
              <Text style={styles.fabMenuText}>Upload Documents</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Context Menu Modal (Screen 3 in reference image!) */}
      <ContextMenuModal
        visible={isContextMenuOpen}
        item={selectedItem}
        onClose={() => setIsContextMenuOpen(false)}
        onOpen={(item) => handleOpenItem(item)}
        onDownload={async (item) => {
          if (!client) return;
          try {
            await client.downloadAndShare(item.path || joinRemotePath(currentPath, item.name), item.isDir);
          } catch (err: any) {
            Alert.alert('Download failed', err.message);
          }
        }}
        onShare={async (item) => {
          if (!client) return;
          try {
            await client.downloadAndShare(item.path || joinRemotePath(currentPath, item.name), item.isDir);
          } catch (err: any) {
            Alert.alert('Share failed', err.message);
          }
        }}
        onRename={(item) => {
          setPrompt({
            title: `Rename "${item.name}"`,
            value: item.name,
            submitLabel: 'Rename',
            onSubmit: (newName) => renameMutation.mutate({ item, newName }),
          });
        }}
        onMove={(item) => setDestinationAction({ type: 'move', item })}
        onCopy={(item) => setDestinationAction({ type: 'copy', item })}
        onDelete={(item) => {
          Alert.alert('Delete', `Are you sure you want to delete "${item.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteMutation.mutate(item),
            },
          ]);
        }}
        onCompress={(item) => compressMutation.mutate(item)}
        onGetInfo={(item) => {
          setSelectedItem(item);
          setIsInfoModalOpen(true);
        }}
      />

      {/* Get Info Modal */}
      <FileInfoModal
        visible={isInfoModalOpen}
        item={selectedItem}
        onClose={() => setIsInfoModalOpen(false)}
      />

      {/* Prompt Modal for input (New Folder, Rename) */}
      <PromptModal prompt={prompt} onCancel={() => setPrompt(null)} />

      {/* Move / Copy Destination Picker */}
      {destinationAction && client && (
        <DestinationPicker
          visible={!!destinationAction}
          client={client}
          startPath={currentPath}
          onCancel={() => setDestinationAction(null)}
          onSelect={async (targetFolder) => {
            const { type, item } = destinationAction;
            setDestinationAction(null);
            const source = item.path || joinRemotePath(currentPath, item.name);
            const dest = joinRemotePath(targetFolder, item.name);

            try {
              if (type === 'move') {
                await client.move(source, dest);
              } else {
                await client.copy(source, dest);
              }
              await invalidateCurrent();
            } catch (err: any) {
              Alert.alert('Operation failed', err.message);
            }
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  backButton: {
    padding: 2,
  },
  breadcrumbsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbText: {
    color: '#8e95a5',
    fontSize: 16,
    fontWeight: '600',
  },
  breadcrumbActiveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  breadcrumbChevron: {
    marginHorizontal: 6,
  },
  headerMoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1b1d26',
    borderWidth: 1,
    borderColor: '#292d3b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151720',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242838',
    paddingHorizontal: 14,
    height: 46,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  itemsCountText: {
    color: '#8e95a5',
    fontSize: 13,
    fontWeight: '500',
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1d28',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292e40',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  sortPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242838',
    padding: 2,
  },
  viewToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: '#202434',
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
    fontSize: 17,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#8e95a5',
    fontSize: 13,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
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
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIconBox: {
    backgroundColor: '#0f2942',
  },
  regularFileBox: {
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
  rowMoreBtn: {
    padding: 6,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 90,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    padding: 14,
    margin: 4,
  },
  gridCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  gridIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridFileName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  gridFileSubtitle: {
    color: '#8e95a5',
    fontSize: 11,
  },
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  fabSheet: {
    backgroundColor: '#161820',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#272b3a',
    padding: 18,
    gap: 8,
  },
  fabSheetTitle: {
    color: '#8e95a5',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  fabMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 14,
  },
  fabIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0f2942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabMenuText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
