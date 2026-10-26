/*
# Add hash_password helper RPC

Adds a SECURITY DEFINER function `public.hash_password(p_password text)` returning a
bcrypt hash via pgcrypto's crypt/gen_salt (located in the `extensions` schema). The
function's search_path includes `extensions` so the helpers resolve. Used by edge
functions to write auth.users.encrypted_password directly, bypassing password-strength
checks. Revoked from PUBLIC/anon; granted to authenticated and service_role.
*/
CREATE OR REPLACE FUNCTION public.hash_password(p_password text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT crypt(p_password, extensions.gen_salt('bf'));
$$;

REVOKE EXECUTE ON FUNCTION public.hash_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hash_password(text) TO authenticated, service_role;