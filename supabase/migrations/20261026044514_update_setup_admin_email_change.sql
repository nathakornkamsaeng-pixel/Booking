/*
# Update setup_admin: support email change + force-change flag

Replaces public.setup_admin so it:
- Accepts p_must_change (boolean, default true) and sets must_change_password on the
  admin profile accordingly.
- If an admin already exists but the requested email differs from the existing admin's
  email, it updates the existing admin's auth.users.email to the new value (admin rename)
  instead of refusing. This lets the operator switch the admin email at bootstrap time.
- Keeps the password reset + bcrypt-hash path (bypasses strength checks).
*/
CREATE OR REPLACE FUNCTION public.setup_admin(
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL,
  p_must_change boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_email text;
BEGIN
  IF p_email IS NULL OR p_password IS NULL THEN
    RAISE EXCEPTION 'Email and password are required';
  END IF;

  SELECT id, email INTO v_admin_id, v_admin_email FROM public.profiles WHERE role = 'admin' LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    -- Admin exists: update email if changed, reset password, set force flag.
    IF v_admin_email <> p_email THEN
      UPDATE auth.users SET email = p_email, updated_at = now() WHERE id = v_admin_id;
      UPDATE public.profiles SET email = p_email WHERE id = v_admin_id;
    END IF;

    UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf')),
          updated_at = now()
      WHERE id = v_admin_id;

    UPDATE public.profiles
      SET must_change_password = p_must_change,
          display_name = COALESCE(p_display_name, display_name)
      WHERE id = v_admin_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Admin updated.', 'admin_id', v_admin_id);
  END IF;

  -- No admin yet: create it.
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
  RETURNING id INTO v_admin_id;

  UPDATE public.profiles
    SET role = 'admin',
        email = p_email,
        display_name = COALESCE(p_display_name, 'Admin'),
        must_change_password = p_must_change
    WHERE id = v_admin_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Admin account created.', 'admin_id', v_admin_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.setup_admin(text, text, text, boolean) FROM PUBLIC, anon, authenticated;