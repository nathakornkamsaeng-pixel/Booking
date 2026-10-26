export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMinutes(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + n);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(new Date(start))} – ${formatTime(new Date(end))}`;
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'short' });
}

export function formatDateLabel(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatFullDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDatetimeInput(value: string): Date {
  return new Date(value);
}

export function isFuture(d: Date): boolean {
  return d.getTime() > Date.now();
}
