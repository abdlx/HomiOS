import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useInstances } from '@/context/InstanceContext';
import { useSharedMedia } from '@/context/SharedMediaContext';

export function SettingsScreen({ navigation }: any) {
  const {
    activeInstance,
    instances,
    switchInstance,
    removeInstance,
    logout,
  } = useInstances();
  const { openShareModal } = useSharedMedia();

  const handleTestShare = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      openShareModal(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName || `media-${Date.now()}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
          type: a.type || 'image',
          size: a.fileSize,
        }))
      );
    }
  };

  const handleClearCache = async () => {
    try {
      if (FileSystem.cacheDirectory) {
        const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
        for (const file of files) {
          await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${file}`, { idempotent: true });
        }
      }
      Alert.alert('Cache Cleared', 'Temporary downloaded files have been cleared.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not clear cache.');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      `Are you sure you want to sign out from ${activeInstance?.name || 'this server'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>Preferences</Text>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Current Instance Card */}
        {activeInstance ? (
          <View style={styles.instanceCard}>
            <View style={styles.instanceCardHeader}>
              <View style={styles.serverIconBox}>
                <MaterialCommunityIcons name="server-network" size={26} color="#38bdf8" />
              </View>
              <View style={styles.instanceCardMeta}>
                <Text style={styles.instanceName} numberOfLines={1}>
                  {activeInstance.name}
                </Text>
                <Text style={styles.instanceUrl} numberOfLines={1}>
                  {activeInstance.baseUrl}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.statusRow}>
              <View style={styles.onlinePill}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Connected</Text>
              </View>
              {activeInstance.userEmail ? (
                <Text style={styles.userEmailText}>{activeInstance.userEmail}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Saved Instances Section */}
        {instances.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Saved Servers</Text>
            <View style={styles.savedCard}>
              {instances.map((inst) => (
                <Pressable
                  key={inst.id}
                  style={[
                    styles.instanceRow,
                    activeInstance?.id === inst.id && styles.activeInstanceRow,
                  ]}
                  onPress={() => switchInstance(inst.id)}
                  onLongPress={() => {
                    if (instances.length > 1) {
                      Alert.alert('Remove Server', `Remove ${inst.name}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeInstance(inst.id),
                        },
                      ]);
                    }
                  }}
                >
                  <View style={styles.instanceRowLeft}>
                    <Ionicons
                      name={activeInstance?.id === inst.id ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={activeInstance?.id === inst.id ? '#38bdf8' : '#64748b'}
                    />
                    <View>
                      <Text style={styles.rowName}>{inst.name}</Text>
                      <Text style={styles.rowUrl}>{inst.baseUrl}</Text>
                    </View>
                  </View>
                  {activeInstance?.id === inst.id ? (
                    <Text style={styles.activeTag}>ACTIVE</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Actions & Utilities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Media Sharing</Text>
          <View style={styles.groupCard}>
            <Pressable style={styles.actionRow} onPress={handleTestShare}>
              <View style={styles.actionLeft}>
                <Feather name="share-2" size={18} color="#38bdf8" />
                <Text style={styles.actionText}>Test Share Media Flow</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#64748b" />
            </Pressable>
          </View>
        </View>

        {/* Storage & Cache */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage & Cache</Text>
          <View style={styles.groupCard}>
            <Pressable style={styles.actionRow} onPress={handleClearCache}>
              <View style={styles.actionLeft}>
                <Feather name="trash" size={18} color="#94a3b8" />
                <Text style={styles.actionText}>Clear Download Cache</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#64748b" />
            </Pressable>
          </View>
        </View>

        {/* Sign Out Button */}
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Feather name="log-out" size={18} color="#ef4444" />
          <Text style={styles.signOutText}>Sign Out from Server</Text>
        </Pressable>

        <Text style={styles.versionText}>HomiFiles v1.0.0 • Native File Manager</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 20,
  },
  header: {
    marginBottom: 4,
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
  instanceCard: {
    backgroundColor: '#14161f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222636',
    padding: 16,
  },
  instanceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  serverIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0f2942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instanceCardMeta: {
    flex: 1,
  },
  instanceName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  instanceUrl: {
    color: '#8e95a5',
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#232738',
    marginVertical: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#132822',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  onlineText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  userEmailText: {
    color: '#8e95a5',
    fontSize: 12,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: '#8e95a5',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  savedCard: {
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    overflow: 'hidden',
  },
  instanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#202434',
  },
  activeInstanceRow: {
    backgroundColor: '#111a2c',
  },
  instanceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  rowUrl: {
    color: '#8e95a5',
    fontSize: 12,
  },
  activeTag: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  groupCard: {
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2d1418',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#541c24',
    minHeight: 50,
    gap: 10,
    marginTop: 8,
  },
  signOutText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '700',
  },
  versionText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
});
