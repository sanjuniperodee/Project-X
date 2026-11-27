const TZ = 'Asia/Almaty';

const dayFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short' });
const dayYearFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "12 дек." (with the year when it is not the current one). */
export function formatDay(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00+05:00` : value);
  return (date.getFullYear() === new Date().getFullYear() ? dayFormat : dayYearFormat).format(date);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** Whole days from today (Almaty) to an ISO date; negative when it has passed. */
export function daysUntil(isoDate: string): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86_400_000);
}

/** "5 мин", "3 ч", "2 дн" ago. */
export function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.round(hours / 24)} дн`;
}

/** wa.me link for a phone in any format. */
export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

/** "+7 701 234 56 78" for Kazakh numbers, the digits as they are otherwise. */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('7')) return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return phone.startsWith('+') ? phone : `+${d}`;
}

export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}
