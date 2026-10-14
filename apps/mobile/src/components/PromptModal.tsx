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

  if (!prompt) return null;

  return (
    <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{prompt.title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={prompt.placeholder}
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (value.trim()) {
                  prompt.onSubmit(value.trim());
                  onCancel();
                }
              }}
              style={[styles.primaryBtn, !value.trim() && styles.disabledBtn]}
            >
              <Text style={styles.primaryText}>{prompt.submitLabel || 'Save'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    backgroundColor: '#161820',
    borderColor: '#292d3c',
    borderWidth: 1,
    padding: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#1d212d',
    borderColor: '#2d3345',
    borderWidth: 1,
    color: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#202432',
  },
  cancelText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
