import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UserRole = 'admin' | 'student';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  display_name: string | null;
  must_change_password: boolean;
  created_at: string;
}

export interface TimeSlot {
  id: string;
  admin_id: string;
  start_at: string;
  end_at: string;
  status: 'open' | 'booked' | 'cancelled';
  created_at: string;
}

export interface Booking {
  id: string;
  slot_id: string;
  student_id: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  note: string | null;
  created_at: string;
  slot?: TimeSlot;
  student?: Profile;
}

export interface BookingWithSlot extends Booking {
  slot: TimeSlot;
}
