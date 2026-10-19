import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUpdateReady } from '@/beta/updates';
import Colors, { Fonts } from '@/theme/colors';

// Shown when a new release has been installed in the background. Floats
// just above the tab bar so it never covers the header or the back button.
export function UpdateBanner() {
  const ready = useUpdateReady();
  const insets = useSafeAreaInsets();
  if (!ready) return null;
  return (
    <View style={[styles.bar, { bottom: insets.bottom + 76 }]} accessibilityRole="alert">
      <Ionicons name="sparkles-outline" size={18} color={Colors.textOnDark} />
      <Text style={styles.text}>A new version of Hour Keeper is ready.</Text>
      <Pressable onPress={() => window.location.reload()} accessibilityRole="button" style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}>
        <Text style={styles.btnText}>Reload</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.chrome,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: { flex: 1, fontFamily: Fonts.semibold, fontSize: 14, color: Colors.textOnDark },
  btn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { fontFamily: Fonts.bold, fontSize: 14, color: Colors.textOnDark },
});
