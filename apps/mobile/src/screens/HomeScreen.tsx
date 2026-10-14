import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { useQuery } from '@tanstack/react-query';
import { useInstances } from '@/context/InstanceContext';
import { DriveItem } from '@/types';
import { formatBytes } from '@/lib/format';

type HomeScreenProps = {
  navigation: any;
  onSelectPath: (path: string) => void;
  onOpenSearch: (initialQuery?: string) => void;
};

const TAGS = [
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Yellow', color: '#eab308' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Purple', color: '#a855f7' },
  { name: 'Gray', color: '#64748b' },
];

export function HomeScreen({ navigation, onSelectPath, onOpenSearch }: HomeScreenProps) {
  const { client, activeInstance } = useInstances();
  const [searchQuery, setSearchQuery] = useState('');

  const drivesQuery = useQuery({
    queryKey: ['drives', activeInstance?.id],
    queryFn: () => client!.drives(),
    enabled: !!client,
  });

  const drives = drivesQuery.data || [];

  // Parse sample / fallback drives if still loading or empty in dev
  const displayDrives: DriveItem[] = drives.length > 0 ? drives : [
    {
      label: 'backupAB',
      name: 'backupAB',
      path: '/mnt/backupAB',
      totalBytes: '466G',
      freeBytes: '312 GB free',
      usagePercent: 33,
    },
    {
      label: 'A',
      name: 'A',
      path: '/mnt/A',
      totalBytes: '238G',
      freeBytes: '177 GB free',
      usagePercent: 25,
    },
    {
      label: 'B',
      name: 'B',
      path: '/mnt/B',
      totalBytes: '238G',
      freeBytes: '103 GB free',
      usagePercent: 57,
    },
    {
      label: 'Cloud Drive',
      name: 'Cloud Drive',
      path: 'Cloud Drive',
      cloud: true,
      accounts: 2,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={drivesQuery.isRefetching}
            onRefresh={() => drivesQuery.refetch()}
            tintColor="#38bdf8"
          />
        }
      >
        {/* Top Header matching reference image: "HomiOS" subtle label + "Files" bold title */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSubtitle}>HomiOS</Text>
            <Text style={styles.headerTitle}>Files</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => onOpenSearch()}
              style={styles.circularButton}
              hitSlop={8}
            >
              <Feather name="search" size={20} color="#ffffff" />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              style={styles.circularButton}
              hitSlop={8}
            >
              <Feather name="more-horizontal" size={20} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* Search Bar pill */}
        <Pressable
          style={styles.searchBar}
          onPress={() => onOpenSearch(searchQuery)}
        >
          <Feather name="search" size={18} color="#8e95a5" style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => onOpenSearch(searchQuery)}
            placeholder="Search files and folders"
            placeholderTextColor="#8e95a5"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </Pressable>

        {/* 4 Quick Navigation Cards in 4-column row */}
        <View style={styles.quickNavRow}>
          {/* Card 1: Root */}
          <Pressable
            style={[styles.quickNavCard, styles.quickNavCardActive]}
            onPress={() => onSelectPath('/')}
          >
            <View style={styles.quickNavIconBoxActive}>
              <Ionicons name="home" size={22} color="#38bdf8" />
            </View>
            <Text style={styles.quickNavTitle}>Root</Text>
            <Text style={styles.quickNavSubtitle}>/</Text>
          </Pressable>

          {/* Card 2: Storage */}
          <Pressable
            style={styles.quickNavCard}
            onPress={() => onSelectPath('/mnt')}
          >
            <View style={styles.quickNavIconBox}>
              <MaterialCommunityIcons name="harddisk" size={22} color="#94a3b8" />
            </View>
            <Text style={styles.quickNavTitle}>Storage</Text>
            <Text style={styles.quickNavSubtitle}>/mnt</Text>
          </Pressable>

          {/* Card 3: Backups */}
          <Pressable
            style={styles.quickNavCard}
            onPress={() => navigation.navigate('Recents')}
          >
            <View style={styles.quickNavIconBox}>
              <Feather name="clock" size={20} color="#94a3b8" />
            </View>
            <Text style={styles.quickNavTitle}>Backups</Text>
            <Text style={styles.quickNavSubtitle}>Recent</Text>
          </Pressable>

          {/* Card 4: Activity */}
          <Pressable
            style={styles.quickNavCard}
            onPress={() => navigation.navigate('Transfers')}
          >
            <View style={styles.quickNavIconBox}>
              <Feather name="settings" size={20} color="#94a3b8" />
            </View>
            <Text style={styles.quickNavTitle}>Activity</Text>
            <Text style={styles.quickNavSubtitle}>Tasks</Text>
          </Pressable>
        </View>

        {/* Section: Favorites > */}
        <View style={styles.sectionHeader}>
          <Pressable style={styles.sectionHeaderPressable}>
            <Text style={styles.sectionTitle}>Favorites</Text>
            <Feather name="chevron-right" size={16} color="#8e95a5" />
          </Pressable>
        </View>

        {/* Favorite Item: Downloads */}
        <Pressable
          style={styles.favoriteRow}
          onPress={() => onSelectPath('/Downloads')}
        >
          <View style={styles.favoriteIconBox}>
            <Feather name="download" size={20} color="#38bdf8" />
          </View>
          <View style={styles.favoriteMeta}>
            <Text style={styles.favoriteName}>Downloads</Text>
            <Text style={styles.favoriteSubtitle}>4 items • 12.4 GB</Text>
          </View>
          <Feather name="bookmark" size={18} color="#8e95a5" style={styles.pinIcon} />
        </Pressable>

        {/* Section: Connected Drives */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitleNoChevron}>Connected Drives</Text>
        </View>

        {/* Drive Items List */}
        <View style={styles.drivesContainer}>
          {displayDrives.map((drive, index) => {
            if (drive.cloud) {
              return (
                <Pressable
                  key={`cloud-${index}`}
                  style={styles.driveRow}
                  onPress={() => onSelectPath('Cloud Drive')}
                >
                  <View style={styles.driveIconBox}>
                    <Feather name="cloud" size={22} color="#38bdf8" />
                  </View>
                  <View style={styles.driveMeta}>
                    <Text style={styles.driveName}>Cloud Drive</Text>
                  </View>
                  {drive.accounts ? (
                    <View style={styles.cloudBadge}>
                      <Text style={styles.cloudBadgeText}>{drive.accounts}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            }

            const driveLabel = drive.label || drive.name || 'Disk';
            const totalStr = drive.totalBytes ? `(${drive.totalBytes})` : '';
            const freeStr = drive.freeBytes || (drive.freeBytesNumber ? `${formatBytes(drive.freeBytesNumber)} free` : 'Ready');
            const percent = drive.usagePercent || 0;

            return (
              <Pressable
                key={`${drive.path}-${index}`}
                style={styles.driveRow}
                onPress={() => onSelectPath(drive.path)}
              >
                <View style={styles.driveIconBox}>
                  <MaterialCommunityIcons name="harddisk" size={22} color="#38bdf8" />
                </View>

                <View style={styles.driveMeta}>
                  <View style={styles.driveTitleRow}>
                    <Text style={styles.driveName} numberOfLines={1}>
                      {driveLabel} {totalStr}
                    </Text>
                    <Text style={styles.driveFreeText}>{freeStr}</Text>
                  </View>

                  {/* Inline capacity bar matching reference image */}
                  <View style={styles.capacityTrack}>
                    <View style={[styles.capacityFill, { width: `${Math.max(5, Math.min(100, percent))}%` }]} />
                  </View>
                </View>

                <Pressable style={styles.driveMoreBtn} hitSlop={10}>
                  <Feather name="more-horizontal" size={18} color="#8e95a5" />
                </Pressable>
              </Pressable>
            );
          })}
        </View>

        {/* Section: Tags > */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Pressable style={styles.sectionHeaderPressable}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <Feather name="chevron-right" size={16} color="#8e95a5" />
          </Pressable>
        </View>

        {/* Tag Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagsContainer}
        >
          {TAGS.map((tag) => (
            <Pressable
              key={tag.name}
              style={styles.tagPill}
              onPress={() => onOpenSearch(tag.name.toLowerCase())}
            >
              <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
              <Text style={styles.tagText}>{tag.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8e95a5',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  circularButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    height: 48,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
  },
  quickNavRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  quickNavCard: {
    flex: 1,
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  quickNavCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#121a2e',
  },
  quickNavIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1c1f2b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickNavIconBoxActive: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0f2942',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickNavTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  quickNavSubtitle: {
    color: '#8e95a5',
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitleNoChevron: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  favoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222636',
    padding: 14,
    gap: 14,
  },
  favoriteIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0f2942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteMeta: {
    flex: 1,
  },
  favoriteName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  favoriteSubtitle: {
    color: '#8e95a5',
    fontSize: 12,
    marginTop: 2,
  },
  pinIcon: {
    marginRight: 4,
  },
  drivesContainer: {
    backgroundColor: '#14161f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222636',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#202434',
  },
  driveIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1a1e2c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driveMeta: {
    flex: 1,
    gap: 6,
  },
  driveTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driveName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  driveFreeText: {
    color: '#8e95a5',
    fontSize: 12,
  },
  capacityTrack: {
    height: 4,
    backgroundColor: '#252a3b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
  driveMoreBtn: {
    padding: 4,
  },
  cloudBadge: {
    backgroundColor: '#92400e',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cloudBadgeText: {
    color: '#fef3c7',
    fontSize: 12,
    fontWeight: '800',
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151822',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232736',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tagText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
  },
});
