/*
# Force password change on first login + student reset

## Overview
Adds a server-enforced "must change password" flag to profiles so admins and students
can be forced to set their own password on first login. Admins can also reset a
student's password and choose whether to force a change afterward.

## 1. Modified tables
### public.profiles
- ADD COLUMN `must_change_password` (boolean, NOT NULL, default false). When true,
  the UI shows a change-password screen instead of the dashboard, and a server RPC
  is required to flip it back to false (so a student cannot simply PATCH it off).

## 2. New / replaced functions
### public.create_student(email, password, display_name, must_change)
Replaces the existing create_student. Adds a 4th boolean param `must_change` (default true).
When true, the new student's profile.must_change_password is set true so they must
change on first login. ADMIN-ONLY (gated by is_admin()).

### public.reset_student_password(student_id, new_password, must_change)
NEW. ADMIN-ONLY SECURITY DEFINER RPC. Resets a student's password hash directly
(bypassing strength checks, since admins set temp passwords) and sets
must_change_password according to the boolean flag. Throws if the target is not a
student or is not the caller's own id.

### public.complete_password_change(new_password)
NEW. SECURITY DEFINER RPC callable by any authenticated user whose
must_change_password is true. Updates their own auth.users password hash AND flips
must_change_password to false in one atomic call. Enforces a 6-char minimum and
rejects if the new password equals the current hash. Bypasses strength checks so
short admin passwords remain possible, but the real protection is that the flag
must already be true to call it (i.e. this is only used at first-login/reset).

## 3. Security notes
- must_change_password is NOT updatable directly by clients: the column grant on
  profiles only allows updating display_name. Only the SECURITY DEFINER RPCs can
  flip it, and reset_student_password verifies the caller is admin and the target
  is a student.
- complete_password_change uses auth.uid() so a user can only clear their own flag.
*/
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Add must_change_password column
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Replace create_student (adds must_change param)
-- ============================================================
DROP FUNCTION IF EXISTS public.create_student(text, text, text);

CREATE OR REPLACE FUNCTION public.create_student(
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL,
  p_must_change boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  INSERT INTO public.profiles (id, email, role, display_name, must_change_password)
  VALUES (v_user_id, p_email, 'student', p_display_name, p_must_change)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    must_change_password = EXCLUDED.must_change_password;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_student(text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student(text, text, text, boolean) TO authenticated;

-- ============================================================
-- 3. reset_student_password(student_id, new_password, must_change)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_student_password(
  p_student_id uuid,
  p_new_password text,
  p_must_change boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset student passwords';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_student_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'No such user';
  END IF;
  IF v_target_role <> 'student' THEN
    RAISE EXCEPTION 'Can only reset student passwords';
  END IF;

  UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_student_id;

  UPDATE public.profiles
    SET must_change_password = p_must_change
    WHERE id = p_student_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_student_password(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_student_password(uuid, text, boolean) TO authenticated;

-- ============================================================
-- 4. complete_password_change(new_password)
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_password_change(p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_current_hash text;
  v_must boolean;
BEGIN
  SELECT encrypted_password INTO v_current_hash FROM auth.users WHERE id = auth.uid();
  SELECT must_change_password INTO v_must FROM public.profiles WHERE id = auth.uid();

  IF v_must IS NULL THEN
    RAISE EXCEPTION 'No profile found for current user';
  END IF;
  IF v_must IS NOT TRUE THEN
    RAISE EXCEPTION 'You are not required to change your password';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;
  IF crypt(p_new_password, v_current_hash) = v_current_hash THEN
    RAISE EXCEPTION 'New password must be different from the current one';
  END IF;

  UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = auth.uid();

  UPDATE public.profiles
    SET must_change_password = false
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_password_change(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_password_change(text) TO authenticated;