import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export type PromptState = {
  title: string;
  placeholder?: string;
  value?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
};

export function PromptModal({ prompt, onCancel }: { prompt: PromptState | null; onCancel: () => void }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(prompt?.value || '');
  }, [prompt]);

  return (
    <Modal visible={!!prompt} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{prompt?.title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={prompt?.placeholder}
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.button}><Text style={styles.cancel}>Cancel</Text></Pressable>
            <Pressable
              onPress={() => {
                prompt?.onSubmit(value.trim());
                onCancel();
              }}
              style={[styles.button, styles.primary]}
            >
              <Text style={styles.primaryText}>{prompt?.submitLabel || 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#020617',
    borderColor: '#334155',
    borderWidth: 1,
    color: '#f8fafc',
    paddingHorizontal: 12,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  button: {
    minHeight: 42,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  primary: {
    backgroundColor: '#2563eb',
  },
  cancel: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
  },
});
