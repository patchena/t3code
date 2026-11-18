import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import type { DesktopBridge } from "@t3tools/contracts";
import { msg } from "gt-react";

import {
  getDesktopUpdateActionError,
  shouldToastDesktopUpdateActionResult,
} from "~/components/desktopUpdate.logic";
import { showDesktopUpdateDownloadedToast } from "~/components/desktopUpdate.toast";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { m } from "~/i18n/messages";
import { getPatcherBridge } from "~/state/patcher";

export type ReportLocalUpdateError = (title: string, description: string) => void;

export const toastUpdateError: ReportLocalUpdateError = (title, description) => {
  toastManager.add(stackedThreadToast({ type: "error", title, description }));
};

export async function downloadLocalUpdate(
  bridge: DesktopBridge,
  {
    notifyDownloaded,
    reportError = toastUpdateError,
  }: { readonly notifyDownloaded: boolean; readonly reportError?: ReportLocalUpdateError },
): Promise<boolean> {
  try {
    const result = await bridge.downloadUpdate();
    if (result.completed && notifyDownloaded) {
      const patcher = getPatcherBridge();
      if (patcher) {
        if (await patcher.waitReady()) {
          await installLocalUpdate(
            bridge,
            reportError,
            result.state.downloadedVersion ?? undefined,
          );
        }
      } else {
        showDesktopUpdateDownloadedToast(bridge, result.state);
      }
    }
    const actionError = shouldToastDesktopUpdateActionResult(result)
      ? getDesktopUpdateActionError(result)
      : null;
    if (actionError) reportError(m(msg("Could not download update")), actionError);
    return result.completed;
  } catch (error) {
    reportError(
      m(msg("Could not start update download")),
      thrownErrorMessage(error, m) ?? m(msg("An unexpected error occurred.")),
    );
    return false;
  }
}

export async function installLocalUpdate(
  bridge: DesktopBridge,
  reportError: ReportLocalUpdateError = toastUpdateError,
  expectedVersion?: string,
): Promise<boolean> {
  try {
    const result = await bridge.installUpdate(expectedVersion);
    if (!result.accepted) {
      showDesktopUpdateDownloadedToast(bridge, result.state);
      return false;
    }
    const actionError = shouldToastDesktopUpdateActionResult(result)
      ? getDesktopUpdateActionError(result)
      : null;
    if (!actionError) return true;
    reportError(m(msg("Could not install update")), actionError);
    return false;
  } catch (error) {
    reportError(
      m(msg("Could not install update")),
      thrownErrorMessage(error, m) ?? m(msg("An unexpected error occurred.")),
    );
    return false;
  }
}
