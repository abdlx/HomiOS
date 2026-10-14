import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { HomeScreen } from '@/screens/HomeScreen';
import { FolderExplorerScreen } from '@/screens/FolderExplorerScreen';

export function FilesScreen({ navigation }: any) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const handleOpenSearch = (initialQuery?: string) => {
    navigation.navigate('Search', { initialQuery });
  };

  if (selectedPath !== null) {
    return (
      <FolderExplorerScreen
        initialPath={selectedPath}
        onBack={() => setSelectedPath(null)}
        navigation={navigation}
      />
    );
  }

  return (
    <HomeScreen
      navigation={navigation}
      onSelectPath={(path) => setSelectedPath(path)}
      onOpenSearch={handleOpenSearch}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
});
