import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, LogOut, Check, X, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Booking, type TimeSlot } from '@/lib/supabase';
import { addDays, formatFullDate, formatTimeRange, startOfWeek } from '@/lib/datetime';
import { Calendar, type CalendarSlot } from '@/components/Calendar';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';

export function StudentDashboard() {
  const { profile, signOut } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [slotsRes, bookingsRes] = await Promise.all([
      supabase
        .from('time_slots')
        .select('*')
        .gte('start_at', weekStart.toISOString())
        .lt('start_at', weekEnd.toISOString())
        .order('start_at', { ascending: true }),
      supabase
        .from('bookings')
        .select('*, slot:time_slots(*)')
        .eq('student_id', profile?.id ?? '')
        .order('created_at', { ascending: false }),
    ]);
    if (slotsRes.data) setSlots(slotsRes.data as TimeSlot[]);
    if (bookingsRes.data) setMyBookings(bookingsRes.data as Booking[]);
    setLoading(false);
  }, [weekStart, weekEnd, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const calendarSlots = useMemo<CalendarSlot[]>(() => {
    return slots.map((s) => {
      const mine = myBookings.find((b) => b.slot_id === s.id && b.status !== 'cancelled');
      return {
        id: s.id,
        start_at: s.start_at,
        end_at: s.end_at,
        status: s.status,
        bookingStatus: mine?.status ?? null,
      };
    });
  }, [slots, myBookings]);

  async function handleBook(slotId: string, note: string) {
    if (!profile?.id) return;
    const { error } = await supabase.from('bookings').insert({
      slot_id: slotId,
      student_id: profile.id,
      status: 'pending',
      note: note || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedSlot(null);
    await loadData();
  }

  async function handleCancelBooking(bookingId: string) {
    if (!confirm('Cancel this booking?')) return;
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedSlot(null);
    await loadData();
  }

  const upcomingBookings = useMemo(
    () =>
      myBookings
        .filter((b) => b.status !== 'cancelled' && b.slot && new Date(b.slot.start_at) > new Date())
        .sort((a, b) => new Date(a.slot!.start_at).getTime() - new Date(b.slot!.start_at).getTime()),
    [myBookings]
  );

  const selectedSlotFull = useMemo(() => {
    if (!selectedSlot) return null;
    const slot = slots.find((s) => s.id === selectedSlot.id);
    if (!slot) return null;
    const myBooking = myBookings.find((b) => b.slot_id === slot.id && b.status !== 'cancelled') ?? null;
    return { slot, myBooking };
  }, [selectedSlot, slots, myBookings]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-sm font-bold text-slate-900">Book a Session</span>
              <span className="block text-xs text-slate-500">
                {profile?.display_name ?? profile?.email}
              </span>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
            <button
              onClick={() => setShowChangePassword(true)}
              aria-label="Change password"
              className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition sm:px-3"
            >
              <KeyRound className="h-4 w-4" /> <span className="hidden sm:inline">Change password</span>
            </button>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition sm:px-3"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">Available times</h1>
          <p className="text-sm text-slate-500">Pick an open slot to request a booking.</p>
        </div>

        <Calendar
          weekStart={weekStart}
          slots={calendarSlots}
          onPrev={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
          onSlotClick={setSelectedSlot}
          legend={[
            { label: 'Open', className: 'bg-sky-400' },
            { label: 'Your pending', className: 'bg-amber-400' },
            { label: 'Your confirmed', className: 'bg-emerald-400' },
            { label: 'Booked', className: 'bg-rose-400' },
          ]}
        />

        {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}

        {upcomingBookings.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-slate-800">My upcoming bookings</h2>
            <ul className="space-y-2">
              {upcomingBookings.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="text-sm">
                    <div className="font-semibold text-slate-800">
                      {formatFullDate(new Date(b.slot!.start_at))}
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTimeRange(b.slot!.start_at, b.slot!.end_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <BookingBadge status={b.status} />
                    <button
                      onClick={() => handleCancelBooking(b.id)}
                      className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {selectedSlotFull && (
        <SlotBookModal
          slot={selectedSlotFull.slot}
          existingBooking={selectedSlotFull.myBooking}
          onClose={() => setSelectedSlot(null)}
          onBook={(note) => handleBook(selectedSlotFull.slot.id, note)}
          onCancel={() =>
            selectedSlotFull.myBooking &&
            handleCancelBooking(selectedSlotFull.myBooking.id)
          }
        />
      )}

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}

function BookingBadge({ status }: { status: Booking['status'] }) {
  if (status === 'confirmed')
    return <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Confirmed</span>;
  if (status === 'pending')
    return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Pending</span>;
  return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Cancelled</span>;
}

function SlotBookModal({
  slot,
  existingBooking,
  onClose,
  onBook,
  onCancel,
}: {
  slot: TimeSlot;
  existingBooking: Booking | null;
  onClose: () => void;
  onBook: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const isMine = !!existingBooking;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-bold text-slate-900">{formatFullDate(new Date(slot.start_at))}</h3>
        <p className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
          <Clock className="h-4 w-4" /> {formatTimeRange(slot.start_at, slot.end_at)}
        </p>

        {isMine ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
              <BookingBadge status={existingBooking!.status} />
              {existingBooking!.note && (
                <p className="mt-1.5 text-slate-600">"{existingBooking!.note}"</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Close
              </button>
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                <X className="h-4 w-4" /> Cancel booking
              </button>
            </div>
          </div>
        ) : slot.status === 'open' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onBook(note.trim());
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                placeholder="Anything you'd like to share?"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Check className="h-4 w-4" /> Request booking
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">This slot is no longer available.</p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
