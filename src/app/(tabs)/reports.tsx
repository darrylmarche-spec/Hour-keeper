import React from 'react';
import { View } from 'react-native';
import { CommandBar, EmptyState } from '@/components/ui';
import Colors from '@/theme/colors';

export default function ReportsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <CommandBar title="Reports" />
      <EmptyState
        icon="bar-chart-outline"
        title="Reports are on the way"
        message="Sold vs actual reports for completed jobs will open here, inside the app, with Export PDF and Share."
      />
    </View>
  );
}
