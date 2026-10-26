/*
# Add setup_admin RPC

Adds `public.setup_admin(p_email, p_password, p_display_name)` — a SECURITY DEFINER
function callable only with the service_role key (revoked from PUBLIC/anon/authenticated).
It is idempotent:
- If no admin profile exists, it creates an auth.user (with a bcrypt hash via pgcrypto,
  bypassing Supabase's password-strength check) and promotes its profile to role='admin'.
- If an admin profile already exists for the given email, it resets that admin's password.
- If any other admin exists, it raises an exception (setup is locked).

This runs entirely in SQL so it can write to auth.users, which is not reachable via
the PostgREST Data API. The edge function merely calls this RPC.
*/
CREATE OR REPLACE FUNCTION public.setup_admin(
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_existing_admin_id uuid;
  v_existing_for_email uuid;
BEGIN
  IF p_email IS NULL OR p_password IS NULL THEN
    RAISE EXCEPTION 'Email and password are required';
  END IF;

  -- Is there any admin at all?
  SELECT id INTO v_existing_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;

  IF v_existing_admin_id IS NOT NULL THEN
    -- Setup is locked unless the email matches the existing admin (password reset path).
    SELECT id INTO v_existing_for_email
    FROM public.profiles
    WHERE email = p_email AND role = 'admin'
    LIMIT 1;

    IF v_existing_for_email IS NULL THEN
      RAISE EXCEPTION 'An admin account already exists. Setup is locked.';
    END IF;

    -- Reset password on the existing admin.
    UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf')),
          updated_at = now()
      WHERE id = v_existing_for_email;

    IF p_display_name IS NOT NULL THEN
      UPDATE public.profiles SET display_name = p_display_name WHERE id = v_existing_for_email;
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Admin password updated.', 'admin_id', v_existing_for_email);
  END IF;

  -- No admin yet: create the auth user directly.
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

  -- The handle_new_user trigger already inserted a 'student' profile; promote it.
  UPDATE public.profiles
    SET role = 'admin', display_name = COALESCE(p_display_name, 'Admin')
    WHERE id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Admin account created.', 'admin_id', v_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.setup_admin(text, text, text) FROM PUBLIC, anon, authenticated;
-- service_role bypasses RLS and is the only caller (edge function uses the service key).