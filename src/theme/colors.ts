// Carried over from SCS Checklist — field-form palette.
// Flat, dense, high-contrast: grey ground, red chrome, green done / under,
// orange open, red over / not started, blue reserved for "selected".

const Colors = {
  primary: '#CC0000',
  primaryDark: '#990000',
  primaryLight: '#FBEDED',
  chrome: '#2B2B2B',

  background: '#D8D8D8',
  surfaceSecondary: '#CBCBCB',
  surfacePressed: '#CBCBCB',
  sectionBar: '#C2C2C2',
  field: '#FFFFFF',

  // All >= 4.5:1 on #D8D8D8
  text: '#111111',
  textSecondary: '#3A3A3A',
  textTertiary: '#5A5A5A',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255,255,255,0.72)',

  border: '#B8B8B8',
  borderStrong: '#A8A8A8',

  success: '#1E8E3E',
  successDark: '#16702F',
  successLight: '#DDEFE2',
  warning: '#F47B20',
  warningDark: '#8A4400',
  warningLight: '#FBE6D3',
  danger: '#CC2222',
  dangerLight: '#FDF0F0',
  selected: '#0B84D6',
};

export default Colors;

export const Fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
