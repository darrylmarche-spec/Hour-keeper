import { StyleSheet } from 'react-native';
import Colors, { Fonts } from '@/theme/colors';

export const authStyles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: 20, alignItems: 'center', gap: 20, backgroundColor: Colors.background },
  brandBlock: { alignItems: 'center', gap: 6 },
  brand: { fontFamily: Fonts.bold, fontSize: 30, color: Colors.primary },
  tag: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.textSecondary, textAlign: 'center' },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 16,
  },
  footer: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.textSecondary },
  link: { fontFamily: Fonts.semibold, color: Colors.primary },
});

