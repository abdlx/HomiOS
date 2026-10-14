import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useInstances } from '@/context/InstanceContext';
import { useSharedMedia } from '@/context/SharedMediaContext';
import { RemoteFile, SharedMediaItem } from '@/types';
import { formatBytes } from '@/lib/format';
import { joinRemotePath, normalizeRemotePath, parentRemotePath } from '@/lib/path';
import { useQueryClient } from '@tanstack/react-query';

export function UploadSharedMediaModal() {
  const { isShareModalVisible, sharedItems, closeShareModal, clearSharedItems } = useSharedMedia();
  const { client, activeInstance } = useInstances();
  const queryClient = useQueryClient();

  const [currentBrowsePath, setCurrentBrowsePath] = useState('/');
  const [selectedFolder, setSelectedFolder] = useState('/');
  const [browsing, setBrowsing] = useState(false);
  const [folders, setFolders] = useState<RemoteFile[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Uploading state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Fetch folders in currentBrowsePath
  useEffect(() => {
    if (!browsing || !client) return;

    let mounted = true;
    setLoadingFolders(true);
    client
      .listFiles(currentBrowsePath)
      .then((items) => {
        if (mounted) {
          setFolders(items.filter((i) => i.isDir));
        }
      })
      .catch((err) => {
        console.warn('Failed to load folders:', err);
      })
      .finally(() => {
        if (mounted) setLoadingFolders(false);
      });

    return () => {
      mounted = false;
    };
  }, [browsing, currentBrowsePath, client]);

  const handleStartUpload = async () => {
    if (!client || sharedItems.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    let successCount = 0;
    try {
      for (let i = 0; i < sharedItems.length; i++) {
        setCurrentFileIndex(i);
        const item = sharedItems[i];
        const targetPath = joinRemotePath(selectedFolder, item.name);

        await client.upload(item.uri, targetPath, (p) => {
          setUploadProgress(Math.round(((i + p / 100) / sharedItems.length) * 100));
        });
        successCount++;
      }

      await queryClient.invalidateQueries({ queryKey: ['files', activeInstance?.id] });
      Alert.alert(
        'Upload Complete',
        `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''} to ${selectedFolder}.`,
        [{ text: 'OK', onPress: clearSharedItems }]
      );
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Failed to upload shared media.');
    } finally {
      setUploading(false);
    }
  };

  if (!isShareModalVisible || sharedItems.length === 0) return null;

  return (
    <Modal
      visible={isShareModalVisible}
      transparent
      animationType="slide"
      onRequestClose={closeShareModal}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Upload to HomiFiles</Text>
              <Text style={styles.subtitle}>
                {sharedItems.length} file{sharedItems.length > 1 ? 's' : ''} ready to upload
              </Text>
            </View>
            <Pressable
              disabled={uploading}
              onPress={closeShareModal}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="#94a3b8" />
            </Pressable>
          </View>

          {/* Files Preview Carousel / List */}
          <View style={styles.itemsPreviewBox}>
            <FlatList
              horizontal
              data={sharedItems}
              keyExtractor={(item, index) => `${item.uri}-${index}`}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.itemBadge}>
                  <Ionicons name="document-attach" size={20} color="#38bdf8" />
                  <View style={styles.itemBadgeMeta}>
                    <Text style={styles.itemBadgeName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.size ? (
                      <Text style={styles.itemBadgeSize}>{formatBytes(item.size)}</Text>
                    ) : null}
                  </View>
                </View>
              )}
            />
          </View>

          {/* Destination Selection */}
          <View style={styles.destinationSection}>
            <Text style={styles.sectionLabel}>Select Destination Folder</Text>

            {/* Current Target Pill */}
            <View style={styles.targetFolderPill}>
              <Ionicons name="folder-open" size={20} color="#38bdf8" />
              <Text style={styles.targetFolderPath} numberOfLines={1}>
                {selectedFolder}
              </Text>
              <Pressable
                onPress={() => setBrowsing(!browsing)}
                style={styles.browseButton}
              >
                <Text style={styles.browseButtonText}>
                  {browsing ? 'Done' : 'Browse'}
                </Text>
              </Pressable>
            </View>

            {/* Quick Folder Shortcuts */}
            {!browsing && (
              <View style={styles.shortcutsRow}>
                {['/', '/Downloads', '/mnt', '/home'].map((path) => (
                  <Pressable
                    key={path}
                    onPress={() => setSelectedFolder(path)}
                    style={[
                      styles.shortcutChip,
                      selectedFolder === path && styles.shortcutChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.shortcutText,
                        selectedFolder === path && styles.shortcutTextActive,
                      ]}
                    >
                      {path === '/' ? 'Root (/)' : path.replace('/', '')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Interactive Folder Browser */}
            {browsing && (
              <View style={styles.browserContainer}>
                <View style={styles.browserHeader}>
                  {currentBrowsePath !== '/' && (
                    <Pressable
                      onPress={() => setCurrentBrowsePath(parentRemotePath(currentBrowsePath))}
                      style={styles.upBtn}
                    >
                      <Feather name="arrow-left" size={16} color="#38bdf8" />
                      <Text style={styles.upBtnText}>Back</Text>
                    </Pressable>
                  )}
                  <Text style={styles.browserPathText} numberOfLines={1}>
                    {currentBrowsePath}
                  </Text>
                </View>

                {loadingFolders ? (
                  <ActivityIndicator color="#38bdf8" style={{ padding: 20 }} />
                ) : (
                  <FlatList
                    data={folders}
                    keyExtractor={(item) => item.path}
                    style={{ maxHeight: 180 }}
                    ListEmptyComponent={
                      <Text style={styles.emptyText}>No subfolders here.</Text>
                    }
                    renderItem={({ item }) => (
                      <Pressable
                        style={styles.folderRow}
                        onPress={() => {
                          const target = item.path || joinRemotePath(currentBrowsePath, item.name);
                          setCurrentBrowsePath(target);
                          setSelectedFolder(target);
                        }}
                      >
                        <Ionicons name="folder" size={20} color="#38bdf8" />
                        <Text style={styles.folderRowText}>{item.name}</Text>
                        <Feather name="chevron-right" size={16} color="#64748b" />
                      </Pressable>
                    )}
                  />
                )}
              </View>
            )}
          </View>

          {/* Upload Progress Bar if running */}
          {uploading && (
            <View style={styles.progressBox}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>
                  Uploading file {currentFileIndex + 1} of {sharedItems.length}...
                </Text>
                <Text style={styles.progressPercent}>{uploadProgress}%</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
              </View>
            </View>
          )}

          {/* Action Button */}
          <Pressable
            disabled={uploading}
            onPress={handleStartUpload}
            style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
          >
            {uploading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.uploadButtonText}>Uploading Media...</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Feather name="upload-cloud" size={20} color="#ffffff" />
                <Text style={styles.uploadButtonText}>Upload Here</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#14161f',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: '#262a38',
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8e95a5',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e2230',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemsPreviewBox: {
    paddingVertical: 4,
  },
  itemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1f2c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292e40',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    gap: 8,
    maxWidth: 220,
  },
  itemBadgeMeta: {
    flex: 1,
  },
  itemBadgeName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  itemBadgeSize: {
    color: '#8e95a5',
    fontSize: 11,
  },
  destinationSection: {
    gap: 8,
  },
  sectionLabel: {
    color: '#8e95a5',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  targetFolderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c202d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2c3246',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  targetFolderPath: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  browseButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  shortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  shortcutChip: {
    backgroundColor: '#1b1f2c',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#272b3c',
  },
  shortcutChipActive: {
    backgroundColor: '#0f2942',
    borderColor: '#38bdf8',
  },
  shortcutText: {
    color: '#8e95a5',
    fontSize: 12,
    fontWeight: '600',
  },
  shortcutTextActive: {
    color: '#38bdf8',
  },
  browserContainer: {
    backgroundColor: '#191d29',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#272b3a',
    padding: 10,
    marginTop: 6,
  },
  browserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#272b3a',
    gap: 8,
  },
  upBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  browserPathText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    padding: 16,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 10,
  },
  folderRowText: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  progressBox: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    color: '#8e95a5',
    fontSize: 12,
  },
  progressPercent: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#202434',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 3,
  },
  uploadButton: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  uploadButtonDisabled: {
    opacity: 0.65,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
