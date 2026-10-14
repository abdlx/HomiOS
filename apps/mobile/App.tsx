import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { InstanceProvider, useInstances } from '@/context/InstanceContext';
import { TransferProvider } from '@/context/TransferContext';
import { SharedMediaProvider } from '@/context/SharedMediaContext';

import { ConnectScreen } from '@/screens/ConnectScreen';
import { FilesScreen } from '@/screens/FilesScreen';
import { SharedScreen } from '@/screens/SharedScreen';
import { RecentsScreen } from '@/screens/RecentsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { PreviewScreen } from '@/screens/PreviewScreen';
import { TransfersScreen } from '@/screens/TransfersScreen';
import { UploadSharedMediaModal } from '@/components/UploadSharedMediaModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const darkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0a0a0c',
    card: '#14161f',
    text: '#ffffff',
    border: '#1e2230',
    primary: '#38bdf8',
  },
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f1118',
          borderTopColor: '#1e2230',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: any = 'folder';
          if (route.name === 'Files') {
            iconName = focused ? 'folder' : 'folder-outline';
          } else if (route.name === 'Shared') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Recents') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings-sharp' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size || 22} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Files" component={FilesScreen} />
      <Tabs.Screen name="Shared" component={SharedScreen} />
      <Tabs.Screen name="Recents" component={RecentsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

function RootNavigator() {
  const { isAuthenticated, loading } = useInstances();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <ConnectScreen />;
  }

  return (
    <>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0c' },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Preview" component={PreviewScreen} />
        <Stack.Screen name="Transfers" component={TransfersScreen} />
      </Stack.Navigator>

      {/* Global Upload Shared Media Modal when phone shares files into HomiFiles */}
      <UploadSharedMediaModal />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <InstanceProvider>
          <TransferProvider>
            <SharedMediaProvider>
              <NavigationContainer theme={darkTheme}>
                <StatusBar style="light" />
                <RootNavigator />
              </NavigationContainer>
            </SharedMediaProvider>
          </TransferProvider>
        </InstanceProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
