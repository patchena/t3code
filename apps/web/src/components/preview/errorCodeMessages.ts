import type { TFunction } from "@t3tools/client-runtime/i18n";
import { PREVIEW_ERROR_CODE_MESSAGES } from "~/components/preview/previewConstants";

export function describePreviewError(description: string, t: TFunction<"tools">): string {
  const friendly = PREVIEW_ERROR_CODE_MESSAGES.get(description);
  if (friendly) return friendly(t);
  if (description.length > 0) return description;
  return t(($) => $.previewNetworkError);
}
