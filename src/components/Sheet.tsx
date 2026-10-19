import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors, { Fonts } from '@/theme/colors';

// A panel that slides up over the current screen (choose a phase, name a
// template…). Tapping outside or "Cancel" always closes it.
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetOption({ label, detail, onPress, selected }: { label: string; detail?: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.optionLabel, selected && { color: Colors.textOnDark }]}>{label}</Text>
      {detail ? <Text style={[styles.optionDetail, selected && { color: Colors.textOnDarkMuted }]}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.text },
  cancel: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.primary },
  option: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  optionSelected: { backgroundColor: Colors.selected, borderColor: Colors.selected },
  optionLabel: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text },
  optionDetail: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textSecondary },
});
