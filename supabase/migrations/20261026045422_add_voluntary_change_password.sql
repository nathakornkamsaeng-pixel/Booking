/*
# Add voluntary change_own_password RPC

Adds `public.change_own_password(p_current_password, p_new_password)` — a SECURITY
DEFINER RPC any authenticated user can call to change their own password at any time
(outside the forced first-login flow). It verifies the current password against the
stored bcrypt hash before accepting the change, enforces a 6-char minimum on the new
password, and rejects a new password identical to the current one. Unlike
complete_password_change, it does NOT require or clear must_change_password.

Revoked from PUBLIC/anon; granted to authenticated.
*/
CREATE OR REPLACE FUNCTION public.change_own_password(
  p_current_password text,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_current_hash text;
BEGIN
  SELECT encrypted_password INTO v_current_hash FROM auth.users WHERE id = auth.uid();
  IF v_current_hash IS NULL THEN
    RAISE EXCEPTION 'No account found for current user';
  END IF;
  IF crypt(p_current_password, v_current_hash) <> v_current_hash THEN
    RAISE EXCEPTION 'Current password is incorrect';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'New password must be at least 6 characters';
  END IF;
  IF crypt(p_new_password, v_current_hash) = v_current_hash THEN
    RAISE EXCEPTION 'New password must be different from the current one';
  END IF;

  UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_own_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_own_password(text, text) TO authenticated;