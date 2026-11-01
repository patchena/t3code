import type { LinkedPrompt } from "@t3tools/shared/promptLinks";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import { type ComposerThreadTarget, useComposerDraftStore } from "~/composerDraftStore";

import { toastManager } from "../ui/toast";

export function warnAboutHiddenCharacters(prompt: LinkedPrompt, t: TFunction<"chat">): void {
  if (prompt.hiddenCharacters === 0) return;
  toastManager.add({
    type: "warning",
    title: t(($) => $.links.prompt.hiddenTitle),
    description: t(($) => $.links.prompt.hiddenDescription, { count: prompt.hiddenCharacters }),
    timeout: 0,
  });
}

export function placeLinkedPrompt(
  target: ComposerThreadTarget,
  prompt: LinkedPrompt,
  t: TFunction<"chat">,
  notes: ReadonlyArray<string> = [],
): void {
  warnAboutHiddenCharacters(prompt, t);
  const place = () => {
    useComposerDraftStore.getState().setPrompt(target, prompt.text);
    toastManager.add({
      type: "info",
      title: t(($) => $.links.prompt.added),
      description: [t(($) => $.links.prompt.review), ...notes].join(" "),
    });
  };
  const existing = useComposerDraftStore.getState().getComposerDraft(target)?.prompt ?? "";
  if (existing.trim().length === 0 || existing === prompt.text) {
    place();
    return;
  }
  const id = toastManager.add({
    type: "info",
    title: t(($) => $.links.prompt.ready),
    description: t(($) => $.links.prompt.replaceDescription),
    timeout: 0,
    actionProps: {
      children: t(($) => $.links.prompt.replace),
      onClick: () => {
        toastManager.close(id);
        place();
      },
    },
  });
}
