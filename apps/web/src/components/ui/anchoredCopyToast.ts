import type { RefObject } from "react";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { clipboardErrorMessage } from "~/hooks/useCopyToClipboard";
import { anchoredToastManager } from "~/components/ui/toast";

export const ANCHORED_COPY_TOAST_TIMEOUT_MS = 1000;

export function showAnchoredCopySuccessToast(
  ref: RefObject<HTMLButtonElement | null>,
  t: TFunction<"common">,
) {
  if (!ref.current) return;
  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
    title: t(($) => $.misc.copied),
  });
}

export function showAnchoredCopyErrorToast(
  ref: RefObject<HTMLButtonElement | null>,
  error: Error,
  t: TFunction<"common">,
) {
  if (!ref.current) return;
  anchoredToastManager.add({
    type: "error",
    positionerProps: {
      anchor: ref.current,
    },
    title: t(($) => $.misc.copyFailed),
    description: clipboardErrorMessage(error, t),
  });
}
