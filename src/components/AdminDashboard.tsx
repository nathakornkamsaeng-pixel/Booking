import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Plus, Trash2, UserPlus, Check, X, Clock, Users, LogOut, KeyRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type TimeSlot, type Booking } from '@/lib/supabase';
import {
  addDays, formatFullDate, formatTimeRange, fromLocalDatetimeInput,
  startOfWeek, toLocalDatetimeInput,
} from '@/lib/datetime';
import { Calendar, type CalendarSlot } from '@/components/Calendar';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';

interface StudentRow {
  id: string;
  email: string;
  display_name: string | null;
  must_change_password: boolean;
  created_at: string;
}

export function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<Date | null>(null);
  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [resetTarget, setResetTarget] = useState<StudentRow | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [tab, setTab] = useState<'calendar' | 'students'>('calendar');

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [slotsRes, bookingsRes, studentsRes] = await Promise.all([
      supabase
        .from('time_slots')
        .select('*')
        .gte('start_at', weekStart.toISOString())
        .lt('start_at', weekEnd.toISOString())
        .order('start_at', { ascending: true }),
      supabase
        .from('bookings')
        .select('*, slot:time_slots(*)')
        .gte('created_at', addDays(weekStart, -30).toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, email, display_name, must_change_password, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false }),
    ]);

    if (slotsRes.data) setSlots(slotsRes.data as TimeSlot[]);
    if (bookingsRes.data) setBookings(bookingsRes.data as Booking[]);
    if (studentsRes.data) setStudents(studentsRes.data as StudentRow[]);
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const calendarSlots = useMemo<CalendarSlot[]>(() => {
    return slots.map((s) => {
      const booking = bookings.find((b) => b.slot_id === s.id && b.status !== 'cancelled');
      return {
        id: s.id,
        start_at: s.start_at,
        end_at: s.end_at,
        status: s.status,
        bookingStatus: booking?.status ?? null,
        bookingStudentName: students.find((st) => st.id === booking?.student_id)?.display_name ?? null,
      };
    });
  }, [slots, bookings, students]);

  async function handleCreateSlot(start: Date, end: Date) {
    if (!profile?.id) return;
    const { error } = await supabase.from('time_slots').insert({
      admin_id: profile.id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: 'open',
    });
    if (error) {
      alert(error.message);
      return;
    }
    setShowCreateSlot(false);
    await loadData();
  }

  async function handleDeleteSlot(slotId: string) {
    if (!confirm('Delete this time slot? Any booking on it will also be removed.')) return;
    const { error } = await supabase.from('time_slots').delete().eq('id', slotId);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedSlot(null);
    await loadData();
  }

  async function handleConfirmBooking(bookingId: string) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId);
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

  async function handleCreateStudent(email: string, password: string, name: string, mustChange: boolean) {
    const { data, error } = await supabase.rpc('create_student', {
      p_email: email,
      p_password: password,
      p_display_name: name || null,
      p_must_change: mustChange,
    });
    if (error) {
      alert(error.message);
      return null;
    }
    setShowCreateStudent(false);
    await loadData();
    return data as string;
  }

  async function handleResetStudentPassword(studentId: string, newPassword: string, mustChange: boolean) {
    const { error } = await supabase.rpc('reset_student_password', {
      p_student_id: studentId,
      p_new_password: newPassword,
      p_must_change: mustChange,
    });
    if (error) {
      alert(error.message);
      return false;
    }
    setResetTarget(null);
    await loadData();
    return true;
  }

  const selectedSlotFull = useMemo(() => {
    if (!selectedSlot) return null;
    const slot = slots.find((s) => s.id === selectedSlot.id);
    if (!slot) return null;
    const booking = bookings.find((b) => b.slot_id === slot.id && b.status !== 'cancelled') ?? null;
    const student = booking ? students.find((st) => st.id === booking.student_id) : null;
    return { slot, booking, student };
  }, [selectedSlot, slots, bookings, students]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader
        displayName={profile?.display_name ?? 'Admin'}
        onSignOut={signOut}
        onChangePassword={() => setShowChangePassword(true)}
        tab={tab}
        onTabChange={setTab}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'calendar' && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Availability Calendar</h1>
                <p className="text-sm text-slate-500">Add time slots students can book.</p>
              </div>
              <button
                onClick={() => { setActiveDay(new Date()); setShowCreateSlot(true); }}
                className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" /> Add availability
              </button>
            </div>

            <Calendar
              weekStart={weekStart}
              slots={calendarSlots}
              onPrev={() => setWeekStart(addDays(weekStart, -7))}
              onNext={() => setWeekStart(addDays(weekStart, 7))}
              onToday={() => setWeekStart(startOfWeek(new Date()))}
              onSlotClick={setSelectedSlot}
              onDayClick={(d) => { setActiveDay(d); setShowCreateSlot(true); }}
              legend={[
                { label: 'Open', className: 'bg-sky-400' },
                { label: 'Pending', className: 'bg-amber-400' },
                { label: 'Confirmed', className: 'bg-emerald-400' },
                { label: 'Cancelled', className: 'bg-slate-300' },
              ]}
            />

            {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}

            <PendingBookingsPanel
              bookings={bookings}
              students={students}
              onConfirm={handleConfirmBooking}
              onCancel={handleCancelBooking}
            />
          </>
        )}

        {tab === 'students' && (
          <StudentsPanel
            students={students}
            loading={loading}
            onCreate={() => setShowCreateStudent(true)}
            onResetPassword={(s) => setResetTarget(s)}
          />
        )}
      </main>

      {showCreateSlot && (
        <CreateSlotModal
          defaultDay={activeDay ?? new Date()}
          onClose={() => setShowCreateSlot(false)}
          onCreate={handleCreateSlot}
        />
      )}

      {showCreateStudent && (
        <CreateStudentModal
          onClose={() => setShowCreateStudent(false)}
          onCreate={handleCreateStudent}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          student={resetTarget}
          onClose={() => setResetTarget(null)}
          onReset={handleResetStudentPassword}
        />
      )}

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {selectedSlotFull && (
        <SlotDetailModal
          slot={selectedSlotFull.slot}
          booking={selectedSlotFull.booking ?? null}
          studentName={selectedSlotFull.student?.display_name ?? selectedSlotFull.student?.email ?? null}
          onClose={() => setSelectedSlot(null)}
          onDeleteSlot={() => handleDeleteSlot(selectedSlotFull.slot.id)}
          onConfirmBooking={() => selectedSlotFull.booking && handleConfirmBooking(selectedSlotFull.booking.id)}
          onCancelBooking={() => selectedSlotFull.booking && handleCancelBooking(selectedSlotFull.booking.id)}
        />
      )}
    </div>
  );
}

function AdminHeader({
  displayName, onSignOut, onChangePassword, tab, onTabChange,
}: {
  displayName: string; onSignOut: () => void; onChangePassword: () => void;
  tab: 'calendar' | 'students'; onTabChange: (t: 'calendar' | 'students') => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-sm font-bold text-slate-900">Admin Console</span>
            <span className="block text-xs text-slate-500">{displayName}</span>
          </div>
        </div>
        <div className="order-3 flex w-full items-center justify-center gap-1 rounded-xl bg-slate-100 p-1 sm:order-none sm:w-auto">
          <button
            onClick={() => onTabChange('calendar')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === 'calendar' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="h-4 w-4" /> Calendar
          </button>
          <button
            onClick={() => onTabChange('students')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === 'students' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="h-4 w-4" /> Students
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onChangePassword}
            aria-label="Change password"
            className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition sm:px-3"
          >
            <KeyRound className="h-4 w-4" /> <span className="hidden sm:inline">Change password</span>
          </button>
          <button
            onClick={onSignOut}
            aria-label="Sign out"
            className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition sm:px-3"
          >
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function PendingBookingsPanel({
  bookings, students, onConfirm, onCancel,
}: {
  bookings: Booking[]; students: StudentRow[];
  onConfirm: (id: string) => void; onCancel: (id: string) => void;
}) {
  const pending = bookings.filter((b) => b.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">Pending booking requests</h3>
      </div>
      <ul className="space-y-2">
        {pending.map((b) => {
          const student = students.find((s) => s.id === b.student_id);
          return (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2"
            >
              <div className="text-sm">
                <span className="font-semibold text-slate-800">
                  {student?.display_name ?? student?.email ?? 'Unknown student'}
                </span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="text-slate-600">
                  {b.slot ? formatTimeRange(b.slot.start_at, b.slot.end_at) : ''}
                </span>
                {b.note && <span className="ml-2 text-slate-400">"{b.note}"</span>}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onConfirm(b.id)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" /> Confirm
                </button>
                <button
                  onClick={() => onCancel(b.id)}
                  className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <X className="h-3.5 w-3.5" /> Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StudentsPanel({
  students, loading, onCreate, onResetPassword,
}: {
  students: StudentRow[]; loading: boolean; onCreate: () => void;
  onResetPassword: (s: StudentRow) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500">Create accounts that students use to book time with you.</p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          <UserPlus className="h-4 w-4" /> New student
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No students yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.email}</td>
                  <td className="px-4 py-3">
                    {s.must_change_password ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        <KeyRound className="h-3 w-3" /> Must change
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onResetPassword(s)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateSlotModal({
  defaultDay, onClose, onCreate,
}: {
  defaultDay: Date; onClose: () => void;
  onCreate: (start: Date, end: Date) => void;
}) {
  const initial = new Date(defaultDay);
  initial.setHours(9, 0, 0, 0);
  const [start, setStart] = useState(toLocalDatetimeInput(initial));
  const [end, setEnd] = useState(toLocalDatetimeInput(new Date(initial.getTime() + 60 * 60 * 1000)));
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = fromLocalDatetimeInput(start);
    const en = fromLocalDatetimeInput(end);
    if (en <= s) {
      setError('End time must be after start time.');
      return;
    }
    onCreate(s, en);
  }

  return (
    <Modal title="Add available time" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Start</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">End</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              required
            />
          </label>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            <Plus className="h-4 w-4" /> Add slot
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateStudentModal({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (email: string, password: string, name: string, mustChange: boolean) => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const id = await onCreate(email.trim(), password, name.trim(), mustChange);
    setBusy(false);
    if (!id && !error) setError('Could not create student.');
  }

  return (
    <Modal title="Create student account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Display name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            placeholder="Jane Doe"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            placeholder="student@example.com"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Temporary password</span>
          <input
            type="text"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            placeholder="At least 6 characters"
          />
          <span className="mt-1 block text-xs text-slate-400">Share this with the student so they can sign in.</span>
        </label>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={mustChange}
            onChange={(e) => setMustChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Require password change on first login</span>
            <span className="block text-xs text-slate-400">The student will be asked to set their own password before reaching the calendar.</span>
          </span>
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" /> {busy ? 'Creating…' : 'Create student'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  student, onClose, onReset,
}: {
  student: StudentRow;
  onClose: () => void;
  onReset: (studentId: string, newPassword: string, mustChange: boolean) => Promise<boolean>;
}) {
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const ok = await onReset(student.id, password, mustChange);
    setBusy(false);
    if (!ok && !error) setError('Could not reset password.');
  }

  return (
    <Modal title={`Reset password — ${student.display_name ?? student.email}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">New temporary password</span>
          <input
            type="text"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            placeholder="At least 6 characters"
            autoFocus
          />
        </label>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={mustChange}
            onChange={(e) => setMustChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Require password change on next login</span>
            <span className="block text-xs text-slate-400">Uncheck if you want the student to keep this password.</span>
          </span>
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" /> {busy ? 'Saving…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SlotDetailModal({
  slot, booking, studentName, onClose, onDeleteSlot, onConfirmBooking, onCancelBooking,
}: {
  slot: TimeSlot; booking: Booking | null; studentName: string | null;
  onClose: () => void;
  onDeleteSlot: () => void; onConfirmBooking: () => void; onCancelBooking: () => void;
}) {
  return (
    <Modal title={formatFullDate(new Date(slot.start_at))} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="font-semibold">{formatTimeRange(slot.start_at, slot.end_at)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge slot={slot} booking={booking} />
          </div>
        </div>

        {booking && booking.status !== 'cancelled' && studentName && (
          <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            <div className="text-slate-500">Booked by</div>
            <div className="font-semibold text-slate-800">{studentName}</div>
            {booking.note && <div className="mt-1 text-slate-600">"{booking.note}"</div>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {booking && booking.status === 'pending' && (
            <button onClick={onConfirmBooking} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <Check className="h-4 w-4" /> Confirm booking
            </button>
          )}
          {booking && booking.status !== 'cancelled' && (
            <button onClick={onCancelBooking} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              <X className="h-4 w-4" /> Cancel booking
            </button>
          )}
          <button onClick={onDeleteSlot} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <Trash2 className="h-4 w-4" /> Delete slot
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StatusBadge({ slot, booking }: { slot: TimeSlot; booking: Booking | null }) {
  if (slot.status === 'cancelled') return <Badge className="bg-slate-100 text-slate-500">Cancelled</Badge>;
  if (!booking || booking.status === 'cancelled') return <Badge className="bg-sky-50 text-sky-700">Open</Badge>;
  if (booking.status === 'confirmed') return <Badge className="bg-emerald-50 text-emerald-700">Confirmed</Badge>;
  return <Badge className="bg-amber-50 text-amber-700">Pending</Badge>;
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-slate-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}
