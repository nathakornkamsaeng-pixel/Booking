import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type AppUser, type Profile, type UserRole } from '@/lib/supabase';

interface Session { access_token: string; user: AppUser }
interface AuthContextValue { session: Session | null; user: AppUser | null; profile: Profile | null; role: UserRole | null; mustChangePassword: boolean; loading: boolean; signIn: (email: string, password: string) => Promise<{ error: string | null }>; signOut: () => Promise<void>; changePassword: (newPassword: string) => Promise<{ error: string | null }>; changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>; }
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [profile, setProfile] = useState<Profile | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => { const next = data.session as Session | null; setSession(next); if (next) { const result = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${next.access_token}` } }); const body = await result.json(); setProfile(body.profile ?? null); } setLoading(false); }); }, []);
  async function signIn(email: string, password: string) { const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error) return { error: error.message }; setSession(data.session); setProfile(data.profile); return { error: null }; }
  async function signOut() { await supabase.auth.signOut(); setSession(null); setProfile(null); }
  async function changePassword(newPassword: string) { const { error } = await supabase.rpc('complete_password_change', { p_new_password: newPassword }); if (!error) setProfile((current) => current ? { ...current, must_change_password: false } : current); return { error: error?.message ?? null }; }
  async function changeOwnPassword(currentPassword: string, newPassword: string) { const { error } = await supabase.rpc('change_own_password', { p_current_password: currentPassword, p_new_password: newPassword }); return { error: error?.message ?? null }; }
  return <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, role: profile?.role ?? null, mustChangePassword: profile?.must_change_password ?? false, loading, signIn, signOut, changePassword, changeOwnPassword }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
