import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Field, Notice } from '@/components/ui';
import { authStyles as styles } from '@/components/authStyles';

export default function SignUp() {
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError('Fill in your name, email and a password.');
      return;
    }
    if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      setError('Use at least 10 characters for your password, with letters and numbers.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signUp(name, email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.needsConfirm) setSent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Hour Keeper</Text>
          <Text style={styles.tag}>Request an account. An admin will approve it.</Text>
        </View>
        <View style={styles.card}>
          {sent ? (
            <Notice tone="ok">
              Check your email for a confirmation link, then come back and sign in. An admin will approve your
              account.
            </Notice>
          ) : (
            <>
              {error ? <Notice tone="bad">{error}</Notice> : null}
              <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                hint="At least 10 characters, with letters and numbers."
                onSubmitEditing={submit}
              />
              <Button title="Request account" onPress={submit} loading={busy} />
            </>
          )}
        </View>
        <Text style={styles.footer}>
          Already have an account?{' '}
          <Link href="/sign-in" replace style={styles.link}>
            Sign in
          </Link>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
