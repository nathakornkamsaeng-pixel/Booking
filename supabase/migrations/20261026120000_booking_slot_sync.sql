-- Keep slot availability consistent with bookings in the database. This avoids
-- relying on student clients to update time_slots, which RLS correctly forbids.

-- Preserve cancelled bookings as history while allowing the slot to be booked again.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_slot_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_active_per_slot
  ON public.bookings (slot_id)
  WHERE status <> 'cancelled';

-- Students may only create pending requests. Admins can confirm them later.
DROP POLICY IF EXISTS "bookings_insert_student" ON public.bookings;
CREATE POLICY "bookings_insert_student"
ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.time_slots s
    WHERE s.id = slot_id
      AND s.status = 'open'
      AND s.start_at > now()
  )
);

-- A student may cancel their own booking, but cannot change its owner, slot, or
-- promote it to confirmed. Admins can still update its status.
REVOKE UPDATE ON public.bookings FROM authenticated;
GRANT UPDATE (status, note) ON public.bookings TO authenticated;

DROP POLICY IF EXISTS "bookings_update_admin_or_owner" ON public.bookings;
CREATE POLICY "bookings_update_admin_or_owner"
ON public.bookings FOR UPDATE TO authenticated
USING (public.is_admin() OR auth.uid() = student_id)
WITH CHECK (
  public.is_admin()
  OR (auth.uid() = student_id AND status = 'cancelled')
);

CREATE OR REPLACE FUNCTION public.sync_time_slot_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.time_slots AS s
  SET status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.slot_id = NEW.slot_id
        AND b.status <> 'cancelled'
    ) THEN 'booked'
    ELSE 'open'
  END
  WHERE s.id = NEW.slot_id
    AND s.status <> 'cancelled';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_time_slot_booking_status ON public.bookings;
CREATE TRIGGER sync_time_slot_booking_status
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_time_slot_booking_status();

-- Repair any slot statuses left stale by earlier client-side update attempts.
UPDATE public.time_slots AS s
SET status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.slot_id = s.id
      AND b.status <> 'cancelled'
  ) THEN 'booked'
  ELSE 'open'
END
WHERE s.status <> 'cancelled';
