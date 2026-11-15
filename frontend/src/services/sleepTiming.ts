export interface SleepTiming { startUtc: string; wakeUtc: string; timeBasis: 'UTC'; windowMinutes: number }
// Sleep timing inputs use explicit UTC wall time strings (YYYY-MM-DDTHH:MM). Do not
// let Date.parse interpret them using the browser's local zone or DST rules.
const pad2 = (value: number) => String(value).padStart(2, '0');

export function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function formatUtcTime(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

export function formatUtcDateTime(date: Date): string {
  return `${formatUtcDate(date)}T${formatUtcTime(date)}`;
}

export function shiftUtcDays(dateStr: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match.map(Number);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + deltaDays)));
}

export function utcPresetWindow(hours: number, now = new Date()): { sleepStartUtc: string; wakeUtc: string } {
  const wakeMs = Math.floor(now.getTime() / 60000) * 60000;
  const startMs = wakeMs - Math.round(hours * 60) * 60000;
  return {
    sleepStartUtc: formatUtcDateTime(new Date(startMs)),
    wakeUtc: formatUtcDateTime(new Date(wakeMs)),
  };
}

export const UTC_TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? 0 : 30;
  return `${pad2(hour)}:${pad2(minute)}`;
});

export function parseUtcInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const result = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(result);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? result : null;
}

export function applyUtcTimeSelection(params: {
  role: 'start' | 'wake';
  timePart: string;
  currentValue: string;
  otherValue?: string;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const todayUtc = formatUtcDate(now);
  const yesterdayUtc = shiftUtcDays(todayUtc, -1);

  if (!/^\d{2}:\d{2}$/.test(params.timePart)) return params.currentValue;
  const existingDate = params.currentValue.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(existingDate)) {
    if (params.role === 'wake' && params.otherValue) {
      const startMs = parseUtcInput(params.otherValue);
      const sameDayCandidate = `${existingDate}T${params.timePart}`;
      const candMs = parseUtcInput(sameDayCandidate);
      if (startMs !== null && candMs !== null && candMs <= startMs) {
        const nextDay = `${shiftUtcDays(existingDate, 1)}T${params.timePart}`;
        const nextMs = parseUtcInput(nextDay);
        if (nextMs !== null && nextMs - startMs <= 24 * 60 * 60 * 1000) return nextDay;
      }
    }
    return `${existingDate}T${params.timePart}`;
  }

  if (params.role === 'start') {
    const hour = Number(params.timePart.slice(0, 2));
    return `${hour >= 16 ? yesterdayUtc : todayUtc}T${params.timePart}`;
  }

  if (params.otherValue && /^\d{4}-\d{2}-\d{2}$/.test(params.otherValue.slice(0, 10))) {
    const startDate = params.otherValue.slice(0, 10);
    const sameDay = `${startDate}T${params.timePart}`;
    const startMs = parseUtcInput(params.otherValue);
    const candMs = parseUtcInput(sameDay);
    if (startMs !== null && candMs !== null && candMs <= startMs) {
      return `${shiftUtcDays(startDate, 1)}T${params.timePart}`;
    }
    return sameDay;
  }
  return `${todayUtc}T${params.timePart}`;
}

export function sleepTiming(start: string, wake: string): SleepTiming | null {
  const first = parseUtcInput(start), last = parseUtcInput(wake);
  if (first === null || last === null || last <= first || last - first > 24 * 60 * 60 * 1000) return null;
  return { startUtc: new Date(first).toISOString(), wakeUtc: new Date(last).toISOString(), timeBasis: 'UTC', windowMinutes: (last - first) / 60000 };
}
export const utcClockMinutes = (iso: string) => { const date = new Date(iso); return date.getUTCHours() * 60 + date.getUTCMinutes(); };
export function averageBedtimeShift(timings: SleepTiming[]): number | null {
  if (timings.length < 2) return null;
  const sorted = [...timings].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const differences = sorted.slice(1).map((entry, index) => { const delta = Math.abs(utcClockMinutes(entry.startUtc) - utcClockMinutes(sorted[index].startUtc)); return Math.min(delta, 1440 - delta); });
  return differences.reduce((sum, value) => sum + value, 0) / differences.length;
}
