import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  codexFeedbackNotice,
  type CodexFeedbackSubmission,
} from "@t3tools/client-runtime/state/threads";
import { MessageSquareIcon } from "lucide-react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function feedbackBannerItem(
  submission: CodexFeedbackSubmission,
  onDismiss: () => void,
  t: TFunction<"chat">,
): ComposerBannerStackItem | null {
  const notice = codexFeedbackNotice(submission, t);
  if (!notice) return null;
  return {
    id: `feedback:${submission.id}`,
    variant:
      submission.status === "failed" ? "error" : submission.status === "sent" ? "success" : "info",
    icon: <MessageSquareIcon />,
    ...notice,
    actions:
      submission.status === "sent" ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void writeTextToClipboard(
              submission.feedbackId,
              t(($) => $.composer.feedbackThreadId),
            ).catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: t(($) => $.composer.copyThreadIdFailed),
                description:
                  error instanceof Error ? error.message : t(($) => $.composer.errorOccurred),
              });
            });
          }}
        >
          {t(($) => $.composer.copyId)}
        </Button>
      ) : undefined,
    ...(submission.status !== "uploading"
      ? { dismissLabel: t(($) => $.composer.dismissFeedback), onDismiss }
      : {}),
  };
}
