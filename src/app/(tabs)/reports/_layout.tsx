import { Stack } from 'expo-router';
import React from 'react';
import Colors from '@/theme/colors';

// Reports open inside the Reports tab, so the tab bar stays underneath and
// there's always a way to the rest of the app.
export default function ReportsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
