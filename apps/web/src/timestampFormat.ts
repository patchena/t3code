import { InterfaceLanguage, type TimestampFormat } from "@t3tools/contracts/settings";
import type { TFunction } from "@t3tools/client-runtime/i18n";

function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") {
    return baseOptions;
  }

  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}

function resolveTimestampLocale(systemLocale: string | null | undefined): string | undefined {
  const tag = systemLocale?.trim();
  if (!tag) return undefined;

  try {
    // Reject structurally invalid tags; let ICU fall back for valid tags it lacks data for.
    Intl.DateTimeFormat.supportedLocalesOf([tag]);
    return tag;
  } catch {
    return undefined;
  }
}

function readHostSystemLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.getSystemLocale() ?? null;
}

const timestampLocale = resolveTimestampLocale(readHostSystemLocale());
export const systemLocale = timestampLocale;
const systemDateOptions = new Intl.DateTimeFormat(timestampLocale, {
  hour: "numeric",
}).resolvedOptions();
const interfaceLocaleCache = new Map<string, string>();

export function interfaceDateLocale(language: string): string {
  if (!InterfaceLanguage.literals.some((supported) => supported === language)) {
    throw new Error(`Unsupported interface language: ${language}.`);
  }
  const cached = interfaceLocaleCache.get(language);
  if (cached) return cached;
  const locale = new Intl.Locale(timestampLocale ?? systemDateOptions.locale, {
    language,
    calendar: systemDateOptions.calendar,
    numberingSystem: systemDateOptions.numberingSystem,
    ...(systemDateOptions.hourCycle ? { hourCycle: systemDateOptions.hourCycle } : {}),
  }).toString();
  interfaceLocaleCache.set(language, locale);
  return locale;
}

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
type WeekdayIndex = (typeof WEEKDAY_INDEXES)[number];

type LocaleWithWeekInfo = Intl.Locale & {
  readonly weekInfo?: { readonly firstDay: number };
  getWeekInfo?: () => { readonly firstDay: number };
};

/**
 * First weekday of a locale as a `Date#getDay` index (0 is Sunday), or
 * `undefined` when the runtime has no week data, so callers keep their own
 * default.
 */
function resolveWeekStartsOn(locale: string | undefined): WeekdayIndex | undefined {
  try {
    const resolved: LocaleWithWeekInfo = new Intl.Locale(
      locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
    );
    // Week info counts Monday as 1 and Sunday as 7.
    const firstDay = resolved.getWeekInfo?.().firstDay ?? resolved.weekInfo?.firstDay;
    return firstDay === undefined ? undefined : WEEKDAY_INDEXES[firstDay % 7];
  } catch {
    return undefined;
  }
}

export const weekStartsOn = resolveWeekStartsOn(timestampLocale);

const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
  timeZone?: string,
): Intl.DateTimeFormat {
  const cacheKey = `${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}:${timeZone ?? ""}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(timestampLocale, {
    ...getTimestampFormatOptions(timestampFormat, includeSeconds),
    ...(timeZone ? { timeZone } : {}),
  });
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function resolveHour12(timestampFormat: TimestampFormat): boolean {
  return getTimestampFormatter(timestampFormat, false).resolvedOptions().hour12 ?? false;
}

export function parseTimestampDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

const monthNameFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function formatChatTimestampTooltip(
  isoDate: string,
  timestampFormat: TimestampFormat,
  t: TFunction<"common">,
  language: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = formatShortTimestamp(isoDate, timestampFormat);
  const day = date.getDate();
  const locale = interfaceDateLocale(language);
  let monthNameFormatter = monthNameFormatterCache.get(locale);
  if (!monthNameFormatter) {
    monthNameFormatter = new Intl.DateTimeFormat(locale, { month: "long", calendar: "gregory" });
    monthNameFormatterCache.set(locale, monthNameFormatter);
  }
  const month = monthNameFormatter.format(date);
  const year = date.getFullYear();
  return t(($) => $.time.tooltip, { ordinal: true, count: day, time, day, month, year });
}

export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, false).format(date);
}

const numericDateOptions: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric" };
const numericDateWithYearOptions: Intl.DateTimeFormatOptions = {
  ...numericDateOptions,
  year: "numeric",
};
const numericDateFormatter = new Intl.DateTimeFormat(timestampLocale, numericDateOptions);
const numericDateWithYearFormatter = new Intl.DateTimeFormat(
  timestampLocale,
  numericDateWithYearOptions,
);

interface CalendarDay {
  year: number;
  /** Days since the epoch, so differences are whole days across DST shifts. */
  index: number;
}

function calendarDay(date: Date, timeZone: string | undefined): CalendarDay {
  if (!timeZone) {
    const year = date.getFullYear();
    return { year, index: Date.UTC(year, date.getMonth(), date.getDate()) / 86_400_000 };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  return { year, index: Date.UTC(year, part("month") - 1, part("day")) / 86_400_000 };
}

function formatNumericDate(date: Date, sameYear: boolean, timeZone: string | undefined): string {
  if (!timeZone) {
    return (sameYear ? numericDateFormatter : numericDateWithYearFormatter).format(date);
  }
  return new Intl.DateTimeFormat(timestampLocale, {
    ...(sameYear ? numericDateOptions : numericDateWithYearOptions),
    timeZone,
  }).format(date);
}

export function formatDayAwareTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
  timeZone?: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false, timeZone).format(date);

  const today = calendarDay(new Date(nowMs), timeZone);
  const messageDay = calendarDay(date, timeZone);
  const dayDiff = today.index - messageDay.index;

  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return t(($) => $.time.yesterdayAt, { time });
  return t(($) => $.time.dateTime, {
    date: formatNumericDate(date, messageDay.year === today.year, timeZone),
    time,
  });
}

/** `timeZone` overrides the zone the formatters cached when they were built. */
export function formatUpcomingTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
  timeZone?: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false, timeZone).format(date);

  const today = calendarDay(new Date(nowMs), timeZone);
  const targetDay = calendarDay(date, timeZone);
  const dayDiff = targetDay.index - today.index;

  if (dayDiff < 0) return formatDayAwareTimestamp(isoDate, timestampFormat, t, nowMs, timeZone);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return t(($) => $.time.tomorrowAt, { time });
  return t(($) => $.time.dateTime, {
    date: formatNumericDate(date, targetDay.year === today.year, timeZone),
    time,
  });
}

export type RelativeTimeState =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "relative"; label: string };

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function relativeTimeUnitMs(elapsedMs: number): number {
  if (elapsedMs < HOUR_MS) return MINUTE_MS;
  if (elapsedMs < DAY_MS) return HOUR_MS;
  return DAY_MS;
}

/** Elapsed time floored to formatRelativeTime precision; equal labels yield equal values. */
export function relativeTimeElapsedMs(isoDate: string, nowMs: number = Date.now()): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  return Math.floor(elapsedMs / unitMs) * unitMs;
}

export function msUntilRelativeTimeChange(
  isoDate: string,
  nowMs: number = Date.now(),
): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  const nextChangeMs = date.getTime() + (Math.floor(elapsedMs / unitMs) + 1) * unitMs;
  // Delays above 2^31-1 fire immediately; cap safely and let callers reschedule.
  return Math.min(nextChangeMs - nowMs, DAY_MS);
}

export function formatRelativeElapsed(elapsedMs: number, t: TFunction<"common">): string {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return t(($) => $.time.justNow);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t(($) => $.time.minutesAgo, { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(($) => $.time.hoursAgo, { count: hours });
  const days = Math.floor(hours / 24);
  return t(($) => $.time.daysAgo, { count: days });
}

export function formatRelativeTime(
  isoDate: string,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
): string | null {
  const elapsedMs = relativeTimeElapsedMs(isoDate, nowMs);
  return elapsedMs === null ? null : formatRelativeElapsed(elapsedMs, t);
}

export function formatRelativeTimeLabel(
  isoDate: string,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
): string {
  return formatRelativeTime(isoDate, t, nowMs) ?? "";
}

export function formatCompactRelativeTimeLabel(
  isoDate: string,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
): string {
  const elapsedMs = relativeTimeElapsedMs(isoDate, nowMs);
  if (elapsedMs === null) return "";
  if (elapsedMs < MINUTE_MS) return t(($) => $.time.now);
  if (elapsedMs < HOUR_MS) return t(($) => $.time.minutes, { count: elapsedMs / MINUTE_MS });
  if (elapsedMs < DAY_MS) return t(($) => $.time.hours, { count: elapsedMs / HOUR_MS });
  return t(($) => $.time.days, { count: elapsedMs / DAY_MS });
}

export function formatElapsedDurationLabel(
  isoDate: string,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = nowMs - date.getTime();
  if (diffMs <= 0) return t(($) => $.time.justNow);

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return t(($) => $.time.justNow);
  if (seconds < 60) return t(($) => $.time.seconds, { count: seconds });

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t(($) => $.time.minutes, { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(($) => $.time.hours, { count: hours });

  const days = Math.floor(hours / 24);
  return t(($) => $.time.days, { count: days });
}

/** Pass nowMs to match a parent-driven render tick. */
export function formatExpiresInLabel(
  isoDate: string,
  t: TFunction<"common">,
  nowMs: number = Date.now(),
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = date.getTime() - nowMs;
  if (diffMs <= 0) return t(($) => $.time.expired);

  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return t(($) => $.time.expiresSoon);
  if (totalSeconds < 60) return t(($) => $.time.expiresSeconds, { seconds: totalSeconds });

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0
      ? t(($) => $.time.expiresMinutes, { minutes })
      : t(($) => $.time.expiresMinutesSeconds, { minutes, seconds });
  }

  if (totalSeconds < 86_400) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const minutes = Math.floor(rem / 60);
    const seconds = rem % 60;
    if (minutes > 0 && seconds > 0) {
      return t(($) => $.time.expiresHoursMinutesSeconds, { hours, minutes, seconds });
    }
    if (minutes > 0) return t(($) => $.time.expiresHoursMinutes, { hours, minutes });
    if (seconds > 0) return t(($) => $.time.expiresHoursSeconds, { hours, seconds });
    return t(($) => $.time.expiresHours, { hours });
  }

  const days = Math.floor(totalSeconds / 86_400);
  const remAfterDays = totalSeconds % 86_400;
  if (remAfterDays === 0) return t(($) => $.time.expiresDays, { days });
  const hours = Math.floor(remAfterDays / 3600);
  const rem = remAfterDays % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;
  if (hours > 0 && minutes > 0 && seconds > 0) {
    return t(($) => $.time.expiresDaysHoursMinutesSeconds, { days, hours, minutes, seconds });
  }
  if (hours > 0 && minutes > 0) {
    return t(($) => $.time.expiresDaysHoursMinutes, { days, hours, minutes });
  }
  if (hours > 0 && seconds > 0) {
    return t(($) => $.time.expiresDaysHoursSeconds, { days, hours, seconds });
  }
  if (minutes > 0 && seconds > 0) {
    return t(($) => $.time.expiresDaysMinutesSeconds, { days, minutes, seconds });
  }
  if (hours > 0) return t(($) => $.time.expiresDaysHours, { days, hours });
  if (minutes > 0) return t(($) => $.time.expiresDaysMinutes, { days, minutes });
  return t(($) => $.time.expiresDaysSeconds, { days, seconds });
}
