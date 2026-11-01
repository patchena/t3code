import type { TFunction } from "@t3tools/client-runtime/i18n";

export type BrowserMicrophone = Pick<MediaDeviceInfo, "deviceId" | "label">;

export async function listBrowserMicrophones(t: TFunction<"voice">): Promise<BrowserMicrophone[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map(({ deviceId, label }, index) => ({
      deviceId,
      label: label || t(($) => $.microphone.fallbackLabel, { number: index + 1 }),
    }));
}
