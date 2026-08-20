import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useInstances } from '@/context/InstanceContext';

export function InstancesScreen() {
  const { instances, activeInstance, addInstance, switchInstance, removeInstance, loading } = useInstances();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!baseUrl.trim() || !token.trim()) {
      Alert.alert('Missing details', 'Enter an HomiOS URL and API token.');
      return;
    }
    setSaving(true);
    try {
      await addInstance({ name: name.trim() || 'HomiOS', baseUrl, token });
      setName('');
      setBaseUrl('');
      setToken('');
      await queryClient.invalidateQueries();
    } catch (error: any) {
      Alert.alert('Could not connect', error?.message || 'Check the URL and token.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Instances</Text>
        <Text style={styles.subtitle}>Connect every HomiOS server you want in one files app.</Text>
      </View>

      <View style={styles.form}>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="#64748b" style={styles.input} />
        <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="https://server.example.com" placeholderTextColor="#64748b" autoCapitalize="none" keyboardType="url" style={styles.input} />
        <TextInput value={token} onChangeText={setToken} placeholder="of_ API token" placeholderTextColor="#64748b" autoCapitalize="none" secureTextEntry style={styles.input} />
        <Pressable disabled={saving} onPress={submit} style={[styles.primaryButton, saving && styles.disabledButton]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Add Instance</Text>}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Saved</Text>
      {loading ? <ActivityIndicator color="#60a5fa" /> : (
        <FlatList
          data={instances}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No instances saved yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={async () => {
                await switchInstance(item.id);
                await queryClient.invalidateQueries();
              }}
              onLongPress={() => Alert.alert('Remove instance?', item.name, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeInstance(item.id) },
              ])}
              style={[styles.instanceRow, activeInstance?.id === item.id && styles.activeInstance]}
            >
              <View style={styles.instanceMeta}>
                <Text style={styles.instanceName}>{item.name}</Text>
                <Text style={styles.instanceUrl} numberOfLines={1}>{item.baseUrl}</Text>
              </View>
              <Text style={styles.instancePath}>{item.lastPath}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { color: '#f8fafc', fontSize: 34, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginTop: 6 },
  form: { gap: 10, paddingHorizontal: 16, paddingBottom: 18 },
  input: { minHeight: 48, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, color: '#f8fafc', paddingHorizontal: 12, fontSize: 15 },
  primaryButton: { minHeight: 48, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.65 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sectionTitle: { color: '#cbd5e1', fontSize: 13, fontWeight: '800', paddingHorizontal: 20, paddingBottom: 8, textTransform: 'uppercase' },
  empty: { color: '#64748b', paddingHorizontal: 20, paddingTop: 12 },
  instanceRow: { marginHorizontal: 16, marginBottom: 10, borderRadius: 8, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, padding: 14 },
  activeInstance: { borderColor: '#60a5fa', backgroundColor: '#10213d' },
  instanceMeta: { marginBottom: 10 },
  instanceName: { color: '#f8fafc', fontSize: 17, fontWeight: '800' },
  instanceUrl: { color: '#94a3b8', fontSize: 12, marginTop: 3 },
  instancePath: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
});
