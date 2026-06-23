import 'react-native-gesture-handler';
import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BrowserScreen } from '@/screens/BrowserScreen';
import { InstancesScreen } from '@/screens/InstancesScreen';
import { PreviewScreen } from '@/screens/PreviewScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TransfersScreen } from '@/screens/TransfersScreen';
import { InstanceProvider } from '@/context/InstanceContext';
import { TransferProvider } from '@/context/TransferContext';

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

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#020617',
    card: '#0f172a',
    text: '#f8fafc',
    border: '#1e293b',
    primary: '#60a5fa',
  },
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ color: focused ? '#60a5fa' : '#94a3b8', fontWeight: '900', fontSize: 11 }}>{label}</Text>;
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
        tabBarActiveTintColor: '#60a5fa',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="Files" component={BrowserScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="F" focused={focused} /> }} />
      <Tabs.Screen name="Search" component={SearchScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="S" focused={focused} /> }} />
      <Tabs.Screen name="Transfers" component={TransfersScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="T" focused={focused} /> }} />
      <Tabs.Screen name="Instances" component={InstancesScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="I" focused={focused} /> }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="G" focused={focused} /> }} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <InstanceProvider>
          <TransferProvider>
            <NavigationContainer theme={theme}>
              <StatusBar style="light" />
              <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020617' } }}>
                <Stack.Screen name="Main" component={MainTabs} />
                <Stack.Screen name="Preview" component={PreviewScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          </TransferProvider>
        </InstanceProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
