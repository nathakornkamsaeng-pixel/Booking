/*
# Booking System Schema — Admin/Student Calendar

## Overview
A scheduling app with two roles:
- **Admin** (you): signs in, opens a calendar, marks time slots as available, creates student accounts, approves/cancels bookings.
- **Student**: signs in to the account the admin created, sees available slots, books a slot, views their own bookings.

Only the admin can create student accounts (via a SECURITY DEFINER RPC). Students cannot self-register.

## 1. New Tables
### public.profiles — id (uuid PK refs auth.users), email, role ('admin'|'student', default 'student'), display_name, created_at.
### public.time_slots — id, admin_id (default auth.uid()), start_at, end_at (>start_at), status ('open'|'booked'|'cancelled'), created_at.
### public.bookings — id, slot_id (UNIQUE FK), student_id (default auth.uid()), status ('pending'|'confirmed'|'cancelled'), note, created_at.

## 2. Functions
### public.is_admin() — SECURITY INVOKER; true if current user's profile role is 'admin'.
### public.create_student(email, password, display_name) — SECURITY DEFINER; admin-only; creates auth user + student profile.
### public.handle_new_user() — trigger fn inserting a 'student' profile for each new auth user.

## 3. Trigger — on_auth_user_created AFTER INSERT on auth.users.

## 4. Security
- profiles: RLS. SELECT own-or-admin. UPDATE own (display_name only via column grant).
- time_slots: RLS. SELECT all. INSERT/UPDATE/DELETE admin-only via is_admin().
- bookings: RLS. SELECT admin-or-owner. INSERT student-for-open-future-slot. UPDATE admin-or-owner.
- create_student revoked from PUBLIC/anon; granted to authenticated and gated by is_admin().
*/

-- ============================================================
-- 1. profiles table (must exist before is_admin())
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin','student')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. is_admin() helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- 3. profiles RLS + grants + policies
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- 4. time_slots table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slots_chrono CHECK (end_at > start_at)
);

ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_slots TO authenticated;

DROP POLICY IF EXISTS "slots_select_all" ON public.time_slots;
CREATE POLICY "slots_select_all"
ON public.time_slots FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "slots_insert_admin" ON public.time_slots;
CREATE POLICY "slots_insert_admin"
ON public.time_slots FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "slots_update_admin" ON public.time_slots;
CREATE POLICY "slots_update_admin"
ON public.time_slots FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "slots_delete_admin" ON public.time_slots;
CREATE POLICY "slots_delete_admin"
ON public.time_slots FOR DELETE TO authenticated
USING (public.is_admin());

-- ============================================================
-- 5. bookings table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.time_slots(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id)
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;

DROP POLICY IF EXISTS "bookings_select_admin_or_owner" ON public.bookings;
CREATE POLICY "bookings_select_admin_or_owner"
ON public.bookings FOR SELECT TO authenticated
USING (public.is_admin() OR auth.uid() = student_id);

DROP POLICY IF EXISTS "bookings_insert_student" ON public.bookings;
CREATE POLICY "bookings_insert_student"
ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND EXISTS (
    SELECT 1 FROM public.time_slots s
    WHERE s.id = slot_id
      AND s.status = 'open'
      AND s.start_at > now()
  )
);

DROP POLICY IF EXISTS "bookings_update_admin_or_owner" ON public.bookings;
CREATE POLICY "bookings_update_admin_or_owner"
ON public.bookings FOR UPDATE TO authenticated
USING (public.is_admin() OR auth.uid() = student_id)
WITH CHECK (public.is_admin() OR auth.uid() = student_id);

-- ============================================================
-- 6. create_student(email, password, display_name) — admin-only RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_student(
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create student accounts';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  INSERT INTO auth.users (
    instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')),
    now(), '{}'::jsonb, '{}'::jsonb, now(), now(), ''
  )
  RETURNING id INTO v_user_id;

  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (v_user_id, p_email, 'student', p_display_name)
  ON CONFLICT (id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_student(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student(text, text, text) TO authenticated;

-- ============================================================
-- 7. Trigger: handle_new_user -> profiles row
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'student')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;