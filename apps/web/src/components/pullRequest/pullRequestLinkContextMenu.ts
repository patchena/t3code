import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { ContextMenuItem } from "@t3tools/contracts";
import {
  type SourceControlDefinition,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/client-runtime/source-control-clients";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "~/components/ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external";

export const openOnHostLabel = (
  host: SourceControlDefinition,
  t: TFunction<"workspace">,
): string =>
  host === UNKNOWN_SOURCE_CONTROL_CLIENT
    ? t(($) => $.git.openOnHost)
    : t(($) => $.git.openOnProvider, { provider: host.label });

function pullRequestLinkContextMenuItems(
  openLabel: string,
  t: TFunction<"workspace">,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "copy-link", label: t(($) => $.git.copyLink), icon: "copy" },
    { id: "open-external", label: openLabel },
  ];
}

export async function showPullRequestLinkContextMenu(
  {
    url,
    openLabel,
    position,
  }: {
    readonly url: string;
    readonly openLabel: string;
    readonly position: { readonly x: number; readonly y: number };
  },
  t: TFunction<"workspace">,
): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  const items = pullRequestLinkContextMenuItems(openLabel, t);
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(items, position);
  } catch (error) {
    toastManager.add({
      type: "error",
      title: t(($) => $.git.contextMenuFailed),
      description: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  try {
    if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title:
        action === "copy-link" ? t(($) => $.git.copyLinkFailed) : t(($) => $.git.openLinkFailed),
    });
  }
}
