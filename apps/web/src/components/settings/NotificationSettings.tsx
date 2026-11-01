import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  hasDesktopNotifications,
  hasNotificationSound,
  unlockNotificationAudio,
} from "../../threadNotifications";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function NotificationSettings() {
  const { t } = useTranslation("settings");
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionError, setPermissionError] = useState<
    "unsupported" | "unavailable" | "permission" | null
  >(null);
  const [requesting, setRequesting] = useState(false);
  const labels = {
    off: t(($) => $.extra.notifications.off),
    notifications: t(($) => $.extra.notifications.notifications),
    sound: t(($) => $.extra.notifications.sound),
    "notifications-and-sound": t(($) => $.extra.notifications.both),
  };
  const errors = {
    unsupported: t(($) => $.extra.notifications.unsupported),
    unavailable: t(($) => $.extra.notifications.unavailable),
    permission: t(($) => $.extra.notifications.permission),
  };

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications", t)}
      description={
        permissionError === null
          ? t(($) => $.extra.notifications.description)
          : errors[permissionError]
      }
      control={
        <Select
          value={mode}
          disabled={requesting}
          onValueChange={async (value) => {
            if (
              value !== "off" &&
              value !== "notifications" &&
              value !== "sound" &&
              value !== "notifications-and-sound"
            )
              return;
            setPermissionError(null);
            if (hasNotificationSound(value)) unlockNotificationAudio();
            if (hasDesktopNotifications(value)) {
              if (typeof Notification === "undefined" || !window.isSecureContext) {
                setPermissionError("unsupported");
                return;
              }
              setRequesting(true);
              const permission = await settlePromise(() => Notification.requestPermission());
              setRequesting(false);
              if (permission._tag === "Failure") {
                setPermissionError("unavailable");
                return;
              }
              if (permission.value !== "granted") {
                setPermissionError("permission");
                return;
              }
            }
            updateSettings({ notificationMode: value });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-56"
            aria-label={t(($) => $.extra.notifications.label)}
          >
            <SelectValue>{labels[mode]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(labels).map(([value, label]) => (
              <SelectItem key={value} hideIndicator value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
