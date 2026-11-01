import type { ThreadReferenceCopyTarget } from "@t3tools/client-runtime/thread-reference";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  COMPOSER_CONTEXT_CLIPBOARD_MIME,
  encodeComposerContextFragment,
} from "@t3tools/shared/composerContextClipboard";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { clipboardErrorMessage, writeTextToClipboard } from "~/hooks/useCopyToClipboard";

export async function copyThreadReference(
  target: ThreadReferenceCopyTarget,
  t: TFunction<"common">,
): Promise<void> {
  const fragment = target.fragment ? encodeComposerContextFragment(target.fragment) : null;
  try {
    const didCopy = await writeTextToClipboard(
      target.value,
      target.clipboardTarget,
      fragment ? { [COMPOSER_CONTEXT_CLIPBOARD_MIME]: fragment } : undefined,
    );
    if (!didCopy) return;
    toastManager.add({
      type: "success",
      title:
        target.kind === "thread"
          ? t(($) => $.misc.clipboard.threadCopied)
          : t(($) => $.misc.clipboard.pullRequestCopied),
      description: target.description,
    });
  } catch (error) {
    console.error(error);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title:
          target.kind === "thread"
            ? t(($) => $.misc.clipboard.threadFailed)
            : t(($) => $.misc.clipboard.pullRequestFailed),
        description: clipboardErrorMessage(error, t),
      }),
    );
  }
}
