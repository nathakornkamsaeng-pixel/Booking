import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, formatDayLabel, formatDateLabel, sameDay, startOfWeek } from '@/lib/datetime';

export interface CalendarSlot {
  id: string;
  start_at: string;
  end_at: string;
  status: 'open' | 'booked' | 'cancelled';
  bookingStatus?: 'pending' | 'confirmed' | 'cancelled' | null;
  bookingStudentName?: string | null;
}

interface CalendarProps {
  weekStart: Date;
  slots: CalendarSlot[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSlotClick?: (slot: CalendarSlot) => void;
  onDayClick?: (day: Date) => void;
  legend?: { label: string; className: string }[];
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

export function Calendar({ weekStart, slots, onPrev, onNext, onToday, onSlotClick, onDayClick, legend }: CalendarProps) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const slotsByDay = useMemo(() => {
    const map: Record<string, CalendarSlot[]> = {};
    for (const d of days) {
      map[d.toISOString()] = slots
        .filter((s) => sameDay(new Date(s.start_at), d))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return map;
  }, [days, slots]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={onNext}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={onToday}
            className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
        </div>
        <h2 className="text-base font-semibold text-slate-800">
          {formatDateLabel(days[0])} – {formatDateLabel(days[6])}
        </h2>
      </div>

      {legend && legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${l.className}`} />
              <span className="text-xs font-medium text-slate-600">{l.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day, i) => {
          const isToday = sameDay(day, new Date());
          const daySlots = slotsByDay[day.toISOString()] ?? [];
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[180px] border-b border-slate-100 md:border-b-0 md:border-r md:border-slate-100 last:border-r-0 ${
                i < 6 ? 'md:border-r' : ''
              } ${i % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}`}
            >
              <button
                onClick={() => onDayClick?.(day)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {formatDayLabel(day)}
                  </span>
                  <span className={`text-sm font-semibold ${isToday ? 'text-sky-600' : 'text-slate-700'}`}>
                    {day.getDate()}
                  </span>
                </div>
                {isToday && <span className="h-2 w-2 rounded-full bg-sky-500" />}
              </button>

              <div className="flex flex-col gap-1 px-2 pb-2">
                {daySlots.length === 0 && (
                  <span className="px-1 py-2 text-xs text-slate-300">—</span>
                )}
                {daySlots.map((slot) => (
                  <SlotPill key={slot.id} slot={slot} onClick={onSlotClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden border-t border-slate-100 bg-slate-50/40 px-4 py-1.5 md:flex">
        {HOURS.slice(0, 1).map((h) => (
          <div key={h} className="flex-1 text-center text-[10px] text-slate-300">
            {new Date().setHours(h, 0) && new Date(0, 0, 0, h, 0).toLocaleTimeString([], { hour: 'numeric' })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotPill({ slot, onClick }: { slot: CalendarSlot; onClick?: (s: CalendarSlot) => void }) {
  const start = new Date(slot.start_at);
  const end = new Date(slot.end_at);
  const timeLabel = `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  let cls = 'border-slate-200 bg-white text-slate-600';
  if (slot.status === 'cancelled') cls = 'border-slate-200 bg-slate-100 text-slate-400 line-through';
  else if (slot.status === 'booked') {
    if (slot.bookingStatus === 'confirmed') cls = 'border-emerald-200 bg-emerald-50 text-emerald-700';
    else if (slot.bookingStatus === 'pending') cls = 'border-amber-200 bg-amber-50 text-amber-700';
    else cls = 'border-rose-200 bg-rose-50 text-rose-700';
  } else {
    cls = 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100';
  }

  return (
    <button
      onClick={() => onClick?.(slot)}
      className={`rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${cls}`}
    >
      <div className="font-semibold">{timeLabel}</div>
      <div className="opacity-80">
        {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </div>
      {slot.bookingStudentName && (
        <div className="mt-0.5 truncate text-[11px] font-medium">{slot.bookingStudentName}</div>
      )}
    </button>
  );
}
