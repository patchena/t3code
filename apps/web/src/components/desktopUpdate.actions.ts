import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { DesktopBridge } from "@t3tools/contracts";

import {
  getDesktopUpdateActionError,
  shouldToastDesktopUpdateActionResult,
} from "~/components/desktopUpdate.logic";
import { showDesktopUpdateDownloadedToast } from "~/components/desktopUpdate.toast";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
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
  t: TFunction<"workspace">,
): Promise<boolean> {
  try {
    const result = await bridge.downloadUpdate();
    if (result.completed && notifyDownloaded) {
      const patcher = getPatcherBridge();
      if (patcher) {
        if (await patcher.waitReady()) {
          await installLocalUpdate(
            bridge,
            t,
            reportError,
            result.state.downloadedVersion ?? undefined,
          );
        }
      } else {
        showDesktopUpdateDownloadedToast(bridge, result.state, t);
      }
    }
    const actionError = shouldToastDesktopUpdateActionResult(result)
      ? getDesktopUpdateActionError(result)
      : null;
    if (actionError)
      reportError(
        t(($) => $.updates.couldNotDownloadUpdate),
        actionError,
      );
    return result.completed;
  } catch (error) {
    reportError(
      t(($) => $.updates.couldNotStartUpdateDownload),
      error instanceof Error ? error.message : t(($) => $.updates.anUnexpectedErrorOccurred),
    );
    return false;
  }
}

export async function installLocalUpdate(
  bridge: DesktopBridge,
  t: TFunction<"workspace">,
  reportError: ReportLocalUpdateError = toastUpdateError,
  expectedVersion?: string,
): Promise<boolean> {
  try {
    const result = await bridge.installUpdate(expectedVersion);
    if (!result.accepted) {
      showDesktopUpdateDownloadedToast(bridge, result.state, t);
      return false;
    }
    const actionError = shouldToastDesktopUpdateActionResult(result)
      ? getDesktopUpdateActionError(result)
      : null;
    if (!actionError) return true;
    reportError(
      t(($) => $.updates.couldNotInstallUpdate),
      actionError,
    );
    return false;
  } catch (error) {
    reportError(
      t(($) => $.updates.couldNotInstallUpdate),
      error instanceof Error ? error.message : t(($) => $.updates.anUnexpectedErrorOccurred),
    );
    return false;
  }
}
