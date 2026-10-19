import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDataMaybe, useSyncState } from '@/data/DataProvider';
import Colors, { Fonts } from '@/theme/colors';

// ── Navigation ─────────────────────────────────────────────────

// Always leads somewhere: back if there's history, otherwise home. This is
// what keeps a deep link, a refresh, or a home-screen web app from leaving
// someone stuck on a screen with no way out.
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function BackButton({ label = 'Back', onPress = goBackOrHome }: { label?: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="chevron-back" size={22} color={Colors.textOnDark} />
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );
}

// ── Red command bar (screen header) ────────────────────────────

export function CommandBar({
  title,
  subtitle,
  back,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      {back ? <BackButton label={typeof back === 'string' ? back : 'Back'} onPress={onBack} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.barTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.barSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      <SyncBadge />
    </View>
  );
}

// ── Sync status ────────────────────────────────────────────────

// Always visible in the header so nobody has to wonder whether their hours
// were saved. Tapping it opens the sync details.
export function SyncBadge() {
  const data = useDataMaybe();
  if (!data) return null;
  return <SyncBadgeInner />;
}

function SyncBadgeInner() {
  const s = useSyncState();
  let icon: keyof typeof Ionicons.glyphMap = 'cloud-done-outline';
  let text = 'Synced';
  let tone: 'ok' | 'warn' | 'bad' = 'ok';
  if (s.rejected > 0) {
    icon = 'alert-circle';
    text = `${s.rejected} not saved`;
    tone = 'bad';
  } else if (s.phase === 'signed-out') {
    icon = 'log-in-outline';
    text = 'Sign in again';
    tone = 'bad';
  } else if (s.phase === 'offline') {
    icon = 'cloud-offline-outline';
    text = s.pending ? `Offline · ${s.pending} waiting` : 'Offline';
    tone = 'warn';
  } else if (s.pending > 0) {
    icon = 'cloud-upload-outline';
    text = `${s.pending} to send`;
    tone = 'warn';
  } else if (s.phase === 'syncing') {
    icon = 'sync-outline';
    text = 'Syncing';
  }
  return (
    <Pressable
      onPress={() => router.push('/sync')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${text}`}
      style={({ pressed }) => [
        styles.syncBadge,
        tone === 'warn' && { backgroundColor: Colors.warningDark },
        tone === 'bad' && { backgroundColor: Colors.chrome },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Ionicons name={icon} size={15} color={Colors.textOnDark} />
      <Text style={styles.syncText}>{text}</Text>
    </Pressable>
  );
}

// ── Building blocks ────────────────────────────────────────────

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const v = buttonVariants[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !off && { opacity: 0.85 },
        off && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
          <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: Colors.primary, border: Colors.primary, fg: Colors.textOnDark },
  secondary: { bg: Colors.field, border: Colors.borderStrong, fg: Colors.text },
  danger: { bg: Colors.field, border: Colors.danger, fg: Colors.danger },
  ghost: { bg: 'transparent', border: 'transparent', fg: Colors.primary },
};

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.textTertiary}
        {...props}
        style={[styles.input, props.style]}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SectionBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionBar}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'dark' }) {
  const t = pillTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const pillTones = {
  neutral: { bg: Colors.field, border: Colors.border, fg: Colors.textSecondary },
  ok: { bg: Colors.successLight, border: Colors.success, fg: Colors.successDark },
  warn: { bg: Colors.warningLight, border: Colors.warning, fg: Colors.warningDark },
  bad: { bg: Colors.dangerLight, border: Colors.danger, fg: Colors.danger },
  dark: { bg: Colors.chrome, border: Colors.chrome, fg: Colors.textOnDark },
};

export function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={Colors.textTertiary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'ok'; children: React.ReactNode }) {
  const t = pillTones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderLeftColor: t.border }]}>
      <Text style={[styles.noticeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  barTitle: { color: Colors.textOnDark, fontFamily: Fonts.bold, fontSize: 18 },
  barSubtitle: { color: Colors.textOnDarkMuted, fontFamily: Fonts.medium, fontSize: 12.5, marginTop: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: -6, paddingVertical: 4, paddingRight: 4 },
  backText: { color: Colors.textOnDark, fontFamily: Fonts.semibold, fontSize: 15 },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
  },
  syncText: { color: Colors.textOnDark, fontFamily: Fonts.semibold, fontSize: 11.5 },
  button: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  buttonText: { fontFamily: Fonts.semibold, fontSize: 16 },
  fieldLabel: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.2 },
  input: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  hint: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary },
  sectionBar: {
    backgroundColor: Colors.sectionBar,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  pillText: { fontFamily: Fonts.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: 18, color: Colors.text, textAlign: 'center' },
  emptyMessage: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.textSecondary, textAlign: 'center', maxWidth: 360 },
  notice: { borderLeftWidth: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 4 },
  noticeText: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20 },
});

export const ui = styles;
