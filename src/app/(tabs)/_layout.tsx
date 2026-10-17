import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ColorValue, StyleSheet, View } from 'react-native';
import { useMe } from '@/data/DataProvider';
import Colors, { Fonts } from '@/theme/colors';

// Charcoal tab bar with a red top marker on the active tab — flat, no blur,
// so it reads the same on every device in the field (as in SCS Checklist).
export default function TabLayout() {
  const me = useMe();

  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    function Icon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <TabIcon name={name} color={color} focused={focused} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.textOnDark,
        tabBarInactiveTintColor: Colors.textOnDarkMuted,
        tabBarStyle: { backgroundColor: Colors.chrome, borderTopWidth: 0, elevation: 0, paddingTop: 4 },
        tabBarLabelStyle: { fontFamily: Fonts.semibold, fontSize: 11, letterSpacing: 0.2 },
        sceneStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Jobs', tabBarIcon: icon('briefcase') }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: icon('bar-chart') }} />
      <Tabs.Screen
        name="admin"
        options={{ title: 'Admin', href: me?.role === 'admin' ? '/admin' : null, tabBarIcon: icon('shield-checkmark') }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
    </Tabs>
  );
}

function TabIcon({ name, color, focused }: { name: keyof typeof Ionicons.glyphMap; color: ColorValue; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={21} color={color as string} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    paddingTop: 6,
  },
  iconWrapActive: { borderTopColor: Colors.primary },
});
