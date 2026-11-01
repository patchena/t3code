import type { TFunction } from "@t3tools/client-runtime/i18n";
import { EraserIcon } from "lucide-react";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/** Shown while `/clear` is armed; dismissing it keeps the current conversation. */
export function freshSessionBannerItem(
  onUndo: () => void,
  t: TFunction<"chat">,
): ComposerBannerStackItem {
  return {
    id: "fresh-session",
    variant: "info",
    icon: <EraserIcon />,
    title: t(($) => $.composer.freshSessionTitle),
    description: t(($) => $.composer.freshSessionDescription),
    dismissLabel: t(($) => $.composer.freshSessionKeep),
    onDismiss: onUndo,
  };
}
