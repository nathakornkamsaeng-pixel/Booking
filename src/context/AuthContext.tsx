import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile, type UserRole } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  mustChangePassword: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        (async () => {
          await loadProfile(newSession.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, display_name, must_change_password, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[v0] Failed to load profile:', error.message);
      setProfile(null);
      return false;
    }
    setProfile(data as Profile | null);
    return Boolean(data);
  }

  async function signIn(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (!error) return { error: null };
    if (error.message.toLowerCase().includes('database error querying schema')) {
      console.error('[v0] Supabase Auth schema error:', error);
      return { error: 'The authentication service is unavailable. Please contact your administrator.' };
    }
    return { error: error.message };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function changePassword(newPassword: string) {
    const { error } = await supabase.rpc('complete_password_change', { p_new_password: newPassword });
    if (error) return { error: error.message };
    if (profile) setProfile({ ...profile, must_change_password: false });
    return { error: null };
  }

  async function changeOwnPassword(currentPassword: string, newPassword: string) {
    const { error } = await supabase.rpc('change_own_password', {
      p_current_password: currentPassword,
      p_new_password: newPassword,
    });
    return { error: error ? error.message : null };
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    mustChangePassword: profile?.must_change_password ?? false,
    loading,
    signIn,
    signOut,
    changePassword,
    changeOwnPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
