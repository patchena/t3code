import type { UsageProviderKind } from "@t3tools/contracts";
import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { UsageContractMismatch } from "@t3tools/shared/usageMerge";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, options]);
  let value = formatters.get(key);
  if (value === undefined) {
    value = new Intl.DateTimeFormat(locale, options);
    if (formatters.size >= 32) formatters.clear();
    formatters.set(key, value);
  }
  return value;
}

export function formatDayShort(day: string, locale: string) {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : formatter(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function formatHourShort(
  instant: string,
  timeZone: string | undefined,
  hour12: boolean,
  locale: string,
) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  const zone = timeZone === undefined ? {} : { timeZone };
  const wallHour = formatter("en-CA", {
    ...zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const repeated = [-3_600_000, 3_600_000].some(
    (offset) => wallHour.format(date) === wallHour.format(new Date(date.getTime() + offset)),
  );
  return formatter(locale, {
    ...zone,
    hour: hour12 ? "numeric" : "2-digit",
    ...(hour12 ? { hour12 } : { hourCycle: "h23" }),
    ...(repeated ? { timeZoneName: "short" } : {}),
  })
    .formatToParts(date)
    .map((part) => (part.type === "hour" && !hour12 ? `${part.value}:00` : part.value))
    .join("");
}

export function formatDateTimeShort(
  instant: string,
  timeZone: string | undefined,
  hour12: boolean,
  locale: string,
) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return formatter(locale, {
    ...(timeZone === undefined ? {} : { timeZone }),
    month: "short",
    day: "numeric",
    hour: hour12 ? "numeric" : "2-digit",
    ...(hour12 ? { hour12 } : { hourCycle: "h23" }),
  })
    .formatToParts(date)
    .map((part) => (part.type === "hour" && !hour12 ? `${part.value}:00` : part.value))
    .join("");
}

export function formatRelativeHourShort(
  instant: string,
  relativeTo: string,
  timeZone: string | undefined,
  hour12: boolean,
  locale: string,
  t: TFunction<"files">,
) {
  const date = new Date(instant);
  const reference = new Date(relativeTo);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime()))
    return formatDateTimeShort(instant, timeZone, hour12, locale);
  const day = formatter("en-CA", {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const elapsed = Math.round(
    (Date.parse(`${day.format(reference)}T00:00:00Z`) -
      Date.parse(`${day.format(date)}T00:00:00Z`)) /
      86_400_000,
  );
  const hour = formatHourShort(instant, timeZone, hour12, locale);
  if (elapsed === 0) return t(($) => $.usage.hourToday, { hour });
  if (elapsed === 1) return t(($) => $.usage.hourYesterday, { hour });
  return formatDateTimeShort(instant, timeZone, hour12, locale);
}

export function formatDuration(ms: number, t: TFunction<"files">) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return t(($) => $.usage.durationDays, { days, hours: hours % 24 });
  if (hours > 0) return t(($) => $.usage.durationHours, { hours, minutes: minutes % 60 });
  return t(($) => $.usage.durationMinutes, { minutes });
}

export function formatResetsIn(
  window: ServerProviderUsageWindow,
  now: number,
  t: TFunction<"files">,
) {
  if (!window.resetsAt) return null;
  const reset = Date.parse(window.resetsAt);
  if (!Number.isFinite(reset)) return null;
  if (reset <= now) return t(($) => $.usage.resetsNow);
  if (reset - now < 60_000) return t(($) => $.usage.resetsMomentarily);
  return t(($) => $.usage.resetsIn, { duration: formatDuration(reset - now, t) });
}

export function formatUsageContractMismatch(
  environment: string,
  mismatch: Pick<UsageContractMismatch, "direction">,
  t: TFunction<"files">,
) {
  return mismatch.direction === "serverBehind"
    ? t(($) => $.usage.serverBehind, { environment })
    : t(($) => $.usage.clientBehind, { environment });
}

export function updatingProvidersLabel(
  providers: readonly UsageProviderKind[],
  providerLabel: (provider: UsageProviderKind) => string,
  t: TFunction<"files">,
) {
  const provider = providers[0];
  return providers.length === 1 && provider !== undefined
    ? t(($) => $.usage.updatingProvider, { provider: providerLabel(provider) })
    : t(($) => $.usage.updatingProviders, { count: providers.length });
}
