import type { DayHours, WeeklyHours } from "@bookit/types";

const closed: DayHours = { closed: true, open: "00:00", close: "00:00" };

export function weekly(weekday: DayHours, saturday?: DayHours, sunday?: DayHours): WeeklyHours {
  return {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: saturday ?? weekday,
    sun: sunday ?? closed,
  };
}

export const day = (open: string, closeAt: string): DayHours => ({ closed: false, open, close: closeAt });

export const img = (id: string, alt: string) => ({ id, url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=80`, alt });

export function stamp(date: string, time: string): string {
  return `${date}T${time}:00`;
}
