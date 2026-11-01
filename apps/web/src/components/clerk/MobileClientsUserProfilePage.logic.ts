import type { RelayClientDeviceRecord } from "@t3tools/contracts/relay";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { interfaceDateLocale } from "~/timestampFormat";

const updatedAtFormatters = new Map<string, Intl.DateTimeFormat>();

export function mobileClientPlatformLabel(device: RelayClientDeviceRecord): string {
  const platform =
    device.platform === "android"
      ? "Android"
      : device.iosMajorVersion === null
        ? "iOS"
        : `iOS ${device.iosMajorVersion}`;
  return `${platform}${device.appVersion ? ` · T3 Code ${device.appVersion}` : ""}`;
}

export function mobileClientNotificationDetail(
  device: RelayClientDeviceRecord,
  t: TFunction<"connect">,
): string {
  if (!device.notifications.enabled) {
    return t(($) => $.profile.notificationsDisabled);
  }

  const preferences = [
    ["notifyOnApproval", t(($) => $.profile.approvals)],
    ["notifyOnInput", t(($) => $.profile.inputRequests)],
    ["notifyOnCompletion", t(($) => $.profile.completions)],
    ["notifyOnFailure", t(($) => $.profile.failures)],
  ] as const;
  const enabledPreferences = preferences.flatMap(([preference, label]) =>
    device.notifications[preference] ? [label] : [],
  );
  return enabledPreferences.length > 0
    ? t(($) => $.profile.alertsEnabled, { alerts: enabledPreferences.join(", ") })
    : t(($) => $.profile.noAlertTypes);
}

export function mobileClientUpdatedAtLabel(
  updatedAt: string,
  t: TFunction<"connect">,
  language: string,
): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return t(($) => $.profile.updateUnavailable);
  const locale = interfaceDateLocale(language);
  let formatter = updatedAtFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    updatedAtFormatters.set(locale, formatter);
  }
  return t(($) => $.profile.updated, { date: formatter.format(date) });
}
