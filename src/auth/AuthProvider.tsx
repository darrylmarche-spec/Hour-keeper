import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(fullName: string, email: string, password: string): Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const SESSION_WAIT_MS = 5000;

function friendlyAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered/i.test(msg)) return 'An account with that email already exists. Try signing in.';
  if (/fetch|network/i.test(msg)) return 'No connection. Signing in for the first time needs signal.';
  return msg;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // The saved session is read from the device, so this works offline.
    // If reading it fails or hangs, carry on signed out rather than waiting
    // forever; a valid session still arrives via onAuthStateChange.
    let settled = false;
    const settle = (s: Session | null) => {
      if (settled) return;
      settled = true;
      setSession(s);
      setReady(true);
    };
    const fallback = setTimeout(() => settle(null), SESSION_WAIT_MS);
    supabase.auth
      .getSession()
      .then(({ data }) => settle(data.session))
      .catch(() => settle(null))
      .finally(() => clearTimeout(fallback));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      clearTimeout(fallback);
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendlyAuthError(error.message) : null;
  }, []);

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (error) return { error: friendlyAuthError(error.message), needsConfirm: false };
    return { error: null, needsConfirm: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    // 'local' clears this device even with no signal.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ ready, session, userId: session?.user.id ?? null, signIn, signUp, signOut }),
    [ready, session, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
