/**
 * Reminders to a customer who went silent after the bot's message (the MyBooks ladder): a warm lead — prices or an order
 * already discussed — gets 20 min, 3 h and next day; a cold one 3 h and next day. Only in working hours (Almaty),
 * never to customers whose order is already moving (deposit paid or later).
 */
export const WORK_HOURS = { from: 10, to: 20 } as const;
const TZ_OFFSET_H = 5; // Asia/Almaty, no DST

const almatyHour = (d: Date) => (d.getUTCHours() + TZ_OFFSET_H) % 24;

export function isWorkTime(now: Date) {
  const h = almatyHour(now);
  return h >= WORK_HOURS.from && h < WORK_HOURS.to;
}

/** Next working-hours start after `now` (or now itself when already open). */
export function nextWorkStart(now: Date): Date {
  if (isWorkTime(now)) return now;
  const d = new Date(now);
  const h = almatyHour(d);
  const addDays = h >= WORK_HOURS.to ? 1 : 0;
  d.setUTCDate(d.getUTCDate() + addDays);
  d.setUTCHours(WORK_HOURS.from - TZ_OFFSET_H, 0, 0, 0);
  return d;
}

export function followUpDelayMs(step: number, warm: boolean): number | null {
  const ladder = warm ? [20 * 60_000, 3 * 3600_000, 22 * 3600_000] : [3 * 3600_000, 20 * 3600_000];
  return ladder[step] ?? null;
}

export interface FollowUpInput {
  followUps: number;
  /** When our last message went out (the customer has not answered since). */
  lastOurMessageAt: Date;
  warm: boolean;
  now: Date;
}

/** Whether a reminder is due now. */
export function followUpDue(f: FollowUpInput): boolean {
  const delay = followUpDelayMs(f.followUps, f.warm);
  if (delay === null || !isWorkTime(f.now)) return false;
  return f.now.getTime() - f.lastOurMessageAt.getTime() >= delay;
}

/** Plain words for the model: when the studio answers in person. */
export function studioHoursNote(now: Date): string {
  if (isWorkTime(now)) return `Сейчас рабочее время студии (${WORK_HOURS.from}:00–${WORK_HOURS.to}:00 по Алматы): менеджер ответит в течение часа.`;
  const next = nextWorkStart(now);
  const when = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(next);
  return `Сейчас нерабочее время студии: менеджер ответит лично ${when}.`;
}

/** Two weeks of dates with weekdays: the model takes days of the week from here instead of counting. */
export function calendar(now: Date, days = 14): string {
  const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'long', weekday: 'short' });
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(now.getTime() + i * 86_400_000))).join('; ');
}
