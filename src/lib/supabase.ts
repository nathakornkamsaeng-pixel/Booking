/* eslint-disable @typescript-eslint/no-explicit-any */
export type UserRole = 'admin' | 'student';
export interface Profile { id: string; email: string; role: UserRole; display_name: string | null; must_change_password: boolean; created_at: string; }
export interface TimeSlot { id: string; admin_id: string; start_at: string; end_at: string; status: 'open' | 'booked' | 'cancelled'; created_at: string; }
export interface Booking { id: string; slot_id: string; student_id: string; status: 'pending' | 'confirmed' | 'cancelled'; note: string | null; created_at: string; slot?: TimeSlot; student?: Profile; }
export interface BookingWithSlot extends Booking { slot: TimeSlot; }
export interface AppUser { id: string; email: string; }

let authToken: string | null = sessionStorage.getItem('booking_token');
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const request = async (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (authToken) headers.set('authorization', `Bearer ${authToken}`);
  try {
    const response = await fetch(`${apiBase}/api/${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await response.json() : {};
    if (!response.ok) return { data: body, error: { message: body.error ?? (response.status === 404 ? 'The Postgres API route is unavailable. Start the app with the worker API or deploy the worker.' : `API request failed (${response.status}).`) } };
    return { data: body, error: null };
  } catch {
    return { data: {}, error: { message: 'Unable to reach the Postgres API. Start the worker preview or deploy the worker before signing in.' } };
  }
};
const chain = (table: string) => { const state: any = { table, filters: {} }; const api: any = { select: () => api, eq: (key: string, value: unknown) => { state.filters[key] = value; return api; }, gte: (_key: string, value: unknown) => { state.gte = value; return api; }, lt: (_key: string, value: unknown) => { state.lt = value; return api; }, order: () => api, insert: async (values: unknown) => request('data', { method: 'POST', body: JSON.stringify({ action: 'insert', table, values }) }), update: (values: unknown) => ({ eq: async (key: string, value: unknown) => request('data', { method: 'POST', body: JSON.stringify({ action: 'update', table, values, key, id: value }) }) }), delete: () => ({ eq: async (key: string, value: unknown) => request('data', { method: 'POST', body: JSON.stringify({ action: 'delete', table, key, id: value }) }) }), then: (resolve: (result: any) => void) => request('data', { method: 'POST', body: JSON.stringify({ action: 'select', table, ...state }) }).then((result) => resolve({ data: result.data.data ?? null, error: result.error })) }; return api; };
export const supabase: any = { auth: { getSession: async () => { if (!authToken) return { data: { session: null } }; const result = await request('auth/me'); if (result.error) { authToken = null; sessionStorage.removeItem('booking_token'); return { data: { session: null } }; } return { data: { session: { access_token: authToken, user: result.data.user } } }; }, signInWithPassword: async ({ email, password }: { email: string; password: string }) => { const result = await request('auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) }); if (result.error) return { error: result.error }; authToken = result.data.token as string; sessionStorage.setItem('booking_token', authToken); return { data: { session: { access_token: authToken, user: result.data.user } }, error: null }; }, signOut: async () => { authToken = null; sessionStorage.removeItem('booking_token'); }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), updateUser: async ({ password }: { password: string }) => request('auth/change-password', { method: 'POST', body: JSON.stringify({ newPassword: password }) }), }, from: chain, rpc: async (name: string, args: Record<string, unknown>) => { if (name === 'complete_password_change') return request('auth/change-password', { method: 'POST', body: JSON.stringify({ newPassword: args.p_new_password }) }); if (name === 'change_own_password') return request('auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: args.p_current_password, newPassword: args.p_new_password }) }); return { data: null, error: { message: 'This operation is not available.' } }; } };
