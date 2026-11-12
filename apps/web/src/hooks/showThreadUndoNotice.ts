import type { TFunction } from "@t3tools/client-runtime/i18n";
import { appI18n } from "~/i18n";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { create } from "zustand";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { shortcutLabelForCommand } from "../keybindings";
import { announce, cancelAnnouncement } from "../lib/announce";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryServerKeybindingsAtom } from "../state/server";
import * as ThreadUndo from "@t3tools/client-runtime/state/thread-undo";

type UndoOptions = {
  action: "Settled" | "Snoozed" | "Unpinned" | "Archived" | "Discarded";
  undo: () => Promise<AtomCommandResult<unknown, unknown>>;
  claim: ReturnType<typeof ThreadUndo.begin>;
  commit?: () => void;
};

type UndoNotice = {
  action: UndoOptions["action"];
  count: number;
  undo: () => Promise<void>;
};

export const useThreadUndoNotice = create<{ notice: UndoNotice | null }>(() => ({ notice: null }));

export function threadUndoActionLabel(
  action: UndoOptions["action"],
  t: TFunction<"workspace">,
): string {
  switch (action) {
    case "Settled":
      return t(($) => $.undo.settled);
    case "Snoozed":
      return t(($) => $.undo.snoozed);
    case "Unpinned":
      return t(($) => $.undo.unpinned);
    case "Archived":
      return t(($) => $.undo.archived);
    case "Discarded":
      return t(($) => $.undo.discarded);
  }
}

function threadUndoNoticeSummary(
  notice: Pick<UndoNotice, "action" | "count">,
  t: TFunction<"workspace">,
): string {
  const { count } = notice;
  switch (notice.action) {
    case "Settled":
      return t(($) => $.undo.settledCount, { count });
    case "Snoozed":
      return t(($) => $.undo.snoozedCount, { count });
    case "Unpinned":
      return t(($) => $.undo.unpinnedCount, { count });
    case "Archived":
      return t(($) => $.undo.archivedCount, { count });
    case "Discarded":
      return t(($) => $.undo.discardedCount, { count });
  }
}

function threadUndoDoneSummary(
  action: UndoOptions["action"],
  count: number,
  t: TFunction<"workspace">,
): string {
  switch (action) {
    case "Settled":
      return t(($) => $.undo.undidSettleCount, { count });
    case "Snoozed":
      return t(($) => $.undo.undidSnoozeCount, { count });
    case "Unpinned":
      return t(($) => $.undo.undidUnpinCount, { count });
    case "Archived":
      return t(($) => $.undo.undidArchiveCount, { count });
    case "Discarded":
      return t(($) => $.undo.undidDiscardCount, { count });
  }
}

export function threadUndoLabel(
  keybindings: Parameters<typeof shortcutLabelForCommand>[0],
  t: TFunction<"workspace">,
) {
  const shortcut = shortcutLabelForCommand(keybindings, "thread.undo");
  return shortcut ? t(($) => $.undo.shortcut, { shortcut }) : t(($) => $.undo.label);
}

function threadUndoFailureTitle(action: UndoOptions["action"], t: TFunction<"workspace">): string {
  switch (action) {
    case "Settled":
      return t(($) => $.undo.settleFailed);
    case "Snoozed":
      return t(($) => $.sidebar.wakeFailed);
    case "Unpinned":
      return t(($) => $.undo.unpinFailed);
    case "Archived":
      return t(($) => $.undo.archiveFailed);
    case "Discarded":
      return t(($) => $.undo.draftFailed);
  }
}

let announcedSummary: string | null = null;

// A live region that mounts already filled is skipped by screen readers, and settling
// usually moves focus to the next thread at the same moment, so the notice is announced
// separately from the alert that shows it.
function setNotice(notice: UndoNotice | null) {
  const t = appI18n.getFixedT(null, "workspace");
  useThreadUndoNotice.setState({ notice });
  const summary = notice ? threadUndoNoticeSummary(notice, t) : null;
  if (summary === announcedSummary) return;
  announcedSummary = summary;
  if (summary) {
    const label = threadUndoLabel(appAtomRegistry.get(primaryServerKeybindingsAtom), t);
    announce(
      t(($) => $.undo.announcement, { summary, undo: label }),
      "thread-undo-notice",
    );
  } else {
    cancelAnnouncement("thread-undo-notice");
  }
}

let liveUndos: UndoOptions[] = [];
let expiry: ReturnType<typeof setTimeout> | undefined;
// A new notice owns mod+z even inside a text field, until the user presses
// another key or edits text. After that, mod+z is the field's own undo again.
let shortcutClaimed = false;

function refreshNotice() {
  const stale = liveUndos.filter(({ claim }) => !claim.isCurrent());
  liveUndos = liveUndos.filter((entry) => !stale.includes(entry));
  for (const entry of stale) entry.commit?.();
  const latest = liveUndos.at(-1);
  if (!latest) {
    clearTimeout(expiry);
    setNotice(null);
    return;
  }
  const group: UndoOptions[] = [];
  for (let index = liveUndos.length - 1; index >= 0; index--) {
    const entry = liveUndos[index]!;
    if (entry.action !== latest.action) break;
    group.push(entry);
  }
  setNotice({
    action: latest.action,
    count: group.length,
    undo: async () => {
      const current = group.filter((entry) => liveUndos.includes(entry) && entry.claim.isCurrent());
      liveUndos = liveUndos.filter((entry) => !group.includes(entry));
      // Claim before awaiting to prevent repeated actions restoring a group twice.
      for (const entry of current) entry.claim.finish();
      refreshNotice();
      let undone = 0;
      await Promise.all(
        current.map(async ({ undo, action }) => {
          const reportFailure = (error: unknown) => {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: threadUndoFailureTitle(action, appI18n.getFixedT(null, "workspace")),
                description:
                  error instanceof Error
                    ? error.message
                    : appI18n.t(($) => $.palette.error, { ns: "workspace" }),
              }),
            );
          };
          try {
            const result = await undo();
            if (result._tag === "Success") undone++;
            else if (!isAtomCommandInterrupted(result)) {
              reportFailure(squashAtomCommandFailure(result));
            }
          } catch (error) {
            reportFailure(error);
          }
        }),
      );
      // Failures already raise a toast, so only what was actually restored is spoken.
      if (undone > 0) {
        announce(
          threadUndoDoneSummary(latest.action, undone, appI18n.getFixedT(null, "workspace")),
        );
      }
    },
  });
}

ThreadUndo.subscribe(refreshNotice);

export function undoLatestThreadAction(): boolean {
  const notice = useThreadUndoNotice.getState().notice;
  if (!notice) return false;
  void notice.undo();
  return true;
}

/** Whether mod+z should undo the notice's actions even while a text field is focused. */
export function threadUndoClaimsShortcut(): boolean {
  return shortcutClaimed && useThreadUndoNotice.getState().notice !== null;
}

/** Called on any other keypress or text edit; hands mod+z back to text fields. */
export function releaseThreadUndoShortcut() {
  shortcutClaimed = false;
}

/** Shows one compact confirmation for the currently undoable thread actions. */
export function showThreadUndoNotice(options: UndoOptions) {
  if (!options.claim.isCurrent()) return;
  liveUndos.push(options);
  shortcutClaimed = true;
  refreshNotice();
  clearTimeout(expiry);
  expiry = setTimeout(() => {
    const expired = liveUndos;
    liveUndos = [];
    for (const { claim, commit } of expired) {
      claim.finish();
      commit?.();
    }
    refreshNotice();
  }, 5_000);
}
