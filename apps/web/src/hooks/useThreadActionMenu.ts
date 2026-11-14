import { useTranslation } from "react-i18next";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { requestCustomSnooze } from "../components/CustomSnoozeDialog";
import { openGuestShareDialog } from "../components/chat/guestShareDialogState";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { canSnooze, effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import {
  AuthOrchestrationOperateScope,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";

import { pickSnoozePreset, resolveSnoozePresets } from "../components/Sidebar.snooze";
import {
  buildThreadActionMenuItems,
  threadActionRequiresOperate,
  type ThreadActionMenuId,
} from "../components/threadActionMenu.logic";
import { titleRegenerationToast } from "../components/threadTitleRegenerationToast";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { copyThreadReference } from "../lib/copyThreadReference";
import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { readEnvironmentScope } from "../state/session";
import {
  readEnvironmentServerConfigLoaded,
  readEnvironmentSupportsAutoSettleOptOut,
  readThreadShell,
  useProjects,
} from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { readLocalApi } from "../localApi";
import { configuredHostedAppUrl } from "../hostedPairing";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKey,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { buildPhysicalToLogicalProjectKeyMap } from "../sidebarProjectGrouping";
import { threadRuntimeCanArchive } from "@t3tools/client-runtime/state/models";
import { clipboardErrorMessage, useCopyToClipboard } from "./useCopyToClipboard";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useClientSettings } from "./useSettings";
import {
  threadActionErrorMessage,
  canTurnThreadIntoProject,
  useThreadActions,
} from "./useThreadActions";

function failureToast(title: string, description: string) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description,
    }),
  );
}

export function useThreadActionMenu(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly projectCwd: string | null;
  readonly onStartRename: () => void;
  readonly onFind?: ((threadRef: ScopedThreadRef) => void) | undefined;
  readonly canShareWithGuest: boolean;
}) {
  const { t } = useTranslation("workspace");
  const { t: tCommon } = useTranslation("common");
  const { threadRef, projectCwd, onStartRename, onFind, canShareWithGuest } = input;
  const router = useRouter();
  const projects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const logicalProjectKeyByPhysicalKey = buildPhysicalToLogicalProjectKeyMap({
    projects,
    settings: projectGroupingSettings,
    primaryEnvironmentId,
  });
  const {
    settleThread,
    unsettleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    confirmAndUnpinThread,
    setThreadAutoSettle,
    archiveThread,
    deleteThread,
    markThreadUnread,
    turnThreadIntoProject,
  } = useThreadActions();
  const regenerateThreadTitle = useOrchestrationCommand(threadEnvironment.regenerateTitle, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();
  const confirmThreadDelete = useClientSettings((s) => s.confirmThreadDelete);
  const confirmThreadArchive = useClientSettings((s) => s.confirmThreadArchive);
  const timestampFormat = useClientSettings((s) => s.timestampFormat);
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({
        type: "success",
        title: t(($) => $.sidebar.pathCopied),
        description: path,
      });
    },
    onError: (error) =>
      failureToast(
        t(($) => $.sidebar.copyPathFailed),
        clipboardErrorMessage(error, tCommon),
      ),
  });
  const { copyToClipboard: copyBranchToClipboard } = useCopyToClipboard<{ branch: string }>({
    target: "branch name",
    onCopy: ({ branch }) => {
      toastManager.add({
        type: "success",
        title: t(($) => $.sidebar.branchCopied),
        description: branch,
      });
    },
    onError: (error) =>
      failureToast(
        t(($) => $.sidebar.copyBranchFailed),
        clipboardErrorMessage(error, tCommon),
      ),
  });
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{ threadId: ThreadId }>({
    onCopy: ({ threadId }) => {
      toastManager.add({
        type: "success",
        title: t(($) => $.sidebar.threadIdCopied),
        description: threadId,
      });
    },
    onError: (error) =>
      failureToast(
        t(($) => $.sidebar.copyIdFailed),
        clipboardErrorMessage(error, tCommon),
      ),
  });

  const openMenu = (position: { x: number; y: number }) => {
    if (threadRef === null) return;
    void (async () => {
      const api = readLocalApi();
      if (!api) return;
      const thread = readThreadShell(threadRef);
      if (!thread) {
        failureToast(
          t(($) => $.sidebar.unavailable),
          t(($) => $.threadActions.notLoaded),
        );
        return;
      }
      const now = new Date();
      const configLoaded = readEnvironmentServerConfigLoaded(threadRef.environmentId);
      const supports = {
        settlement: configLoaded,
        autoSettleOptOut: readEnvironmentSupportsAutoSettleOptOut(threadRef.environmentId),
        snooze: configLoaded,
        pinning: configLoaded,
        titleRegeneration: configLoaded,
      };
      const isRegeneratingTitle = thread.titleRegeneration != null;
      const snoozePresets = resolveSnoozePresets(
        now,
        timestampFormat,
        threadRef.environmentId,
        tCommon,
      );
      const items = buildThreadActionMenuItems(
        {
          canOperate: readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope),
          canFind: onFind !== undefined,
          branch: thread.branch ?? null,
          projectFilter: null,
          isPinned: thread.pinnedAt != null,
          isSettled: supports.settlement && thread.settledOverride === "settled",
          autoSettleEnabled: thread.autoSettleDisabledAt == null,
          isSnoozed: supports.snooze && effectiveSnoozed(thread, { now: now.toISOString() }),
          canSnoozeNow: canSnooze(thread, { now: now.toISOString() }),
          isRegeneratingTitle,
          isRunning: !threadRuntimeCanArchive(thread.runtime),
          supports,
          snoozePresets,
          canShareWithGuest,
          canTurnIntoProject: canTurnThreadIntoProject(threadRef),
        },
        t,
      );
      const clicked = await settlePromise(() => api.contextMenu.show(items, position));
      if (clicked._tag === "Failure" || clicked.value === null) return;
      const action: ThreadActionMenuId = clicked.value;
      if (
        threadActionRequiresOperate(action) &&
        !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)
      ) {
        failureToast(
          t(($) => $.sidebar.unavailable),
          t(($) => $.threadActions.cannotChange),
        );
        return;
      }
      if (action.startsWith("snooze:")) {
        const preset =
          action === "snooze:custom"
            ? await requestCustomSnooze()
            : pickSnoozePreset(
                snoozePresets,
                action.slice("snooze:".length),
                timestampFormat,
                threadRef.environmentId,
                tCommon,
              );
        if (!preset) return;
        const result = await snoozeThread(threadRef, preset.snoozedUntil);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          failureToast(
            t(($) => $.sidebar.snoozeFailed),
            threadActionErrorMessage(squashAtomCommandFailure(result), t),
          );
        }
        return;
      }
      const reportFailure = async (
        title: string,
        run: () => Promise<AtomCommandResult<unknown, unknown>>,
      ) => {
        const result = await run();
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          failureToast(title, threadActionErrorMessage(squashAtomCommandFailure(result), t));
        }
      };
      switch (action) {
        case "find":
          onFind?.(threadRef);
          return;
        case "project-settings": {
          const project = projects.find(
            (candidate) =>
              candidate.environmentId === thread.environmentId && candidate.id === thread.projectId,
          );
          if (!project) return;
          const projectKey =
            logicalProjectKeyByPhysicalKey.get(derivePhysicalProjectKey(project)) ??
            deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings);
          void router.navigate({
            to: "/projects/$projectKey",
            params: { projectKey },
          });
          return;
        }
        case "new-thread-on-branch": {
          const result = await settlePromise(() =>
            handleNewThread(scopeProjectRef(threadRef.environmentId, thread.projectId), {
              branch: thread.branch,
              worktreePath: thread.worktreePath,
              envMode: thread.worktreePath ? "worktree" : "local",
              startFromOrigin: false,
            }),
          );
          if (result._tag === "Failure") {
            failureToast(
              t(($) => $.sidebar.createThreadFailed),
              threadActionErrorMessage(squashAtomCommandFailure(result), t),
            );
          }
          return;
        }
        case "settle":
          await reportFailure(
            t(($) => $.sidebar.settleFailed),
            () => settleThread(threadRef),
          );
          return;
        case "unsettle":
          await reportFailure(
            t(($) => $.sidebar.unsettleFailed),
            () => unsettleThread(threadRef),
          );
          return;
        case "unsnooze":
          await reportFailure(
            t(($) => $.sidebar.wakeFailed),
            () => unsnoozeThread(threadRef),
          );
          return;
        case "pin":
          await reportFailure(
            t(($) => $.sidebar.pinFailed),
            () => pinThread(threadRef),
          );
          return;
        case "unpin": {
          await reportFailure(
            t(($) => $.sidebar.unpinFailed),
            () => confirmAndUnpinThread(threadRef),
          );
          return;
        }
        case "auto-settle:enabled":
        case "auto-settle:disabled":
          await reportFailure(
            t(($) => $.sidebar.autoSettleFailed),
            () => setThreadAutoSettle(threadRef, action === "auto-settle:enabled"),
          );
          return;
        case "rename":
          onStartRename();
          return;
        case "regenerate-title": {
          if (isRegeneratingTitle) return;
          const toast = titleRegenerationToast(t, [
            await regenerateThreadTitle({
              environmentId: threadRef.environmentId,
              input: { threadId: threadRef.threadId },
            }),
          ]);
          if (toast) toastManager.add(toast);
          return;
        }
        case "mark-unread":
          markThreadUnread(threadRef);
          return;
        case "share-guest":
          openGuestShareDialog(threadRef);
          return;
        case "turn-into-project": {
          const result = await turnThreadIntoProject(threadRef);
          if (result._tag === "Success") {
            toastManager.add({
              type: "success",
              title: t(($) => $.sidebar.projectCreated),
              description: thread.title,
            });
          } else if (!isAtomCommandInterrupted(result)) {
            failureToast(
              t(($) => $.sidebar.promoteFailed),
              threadActionErrorMessage(squashAtomCommandFailure(result), t),
            );
          }
          return;
        }
        case "copy-path": {
          const workspacePath = thread.worktreePath ?? projectCwd;
          if (!workspacePath) {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: t(($) => $.sidebar.pathUnavailable),
                description: t(($) => $.sidebar.noPath),
              }),
            );
            return;
          }
          copyPathToClipboard(workspacePath, { path: workspacePath });
          return;
        }
        case "copy-branch":
          if (thread.branch) {
            copyBranchToClipboard(thread.branch, { branch: thread.branch });
          }
          return;
        case "copy-thread":
          void copyThreadReference(
            threadChipCopyTarget(threadRef, thread.title, configuredHostedAppUrl()),
            tCommon,
          );
          return;
        case "copy-thread-id":
          copyThreadIdToClipboard(thread.id, { threadId: thread.id });
          return;
        case "archive": {
          if (confirmThreadArchive) {
            const confirmed = await settlePromise(() =>
              api.dialogs.confirm(t(($) => $.sidebar.archiveThread, { title: thread.title })),
            );
            if (confirmed._tag === "Failure" || !confirmed.value) return;
          }
          let didArchive = false;
          const result = await archiveThread(threadRef, {
            onArchived: () => {
              didArchive = true;
            },
          });
          if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
            failureToast(
              didArchive
                ? t(($) => $.sidebar.archivedNavigationFailed)
                : t(($) => $.sidebar.archiveFailed),
              threadActionErrorMessage(squashAtomCommandFailure(result), t),
            );
          }
          return;
        }
        case "delete": {
          if (confirmThreadDelete) {
            const confirmed = await settlePromise(() =>
              api.dialogs.confirm(
                [
                  t(($) => $.sidebar.deleteThread, { title: thread.title }),
                  t(($) => $.sidebar.deleteThreadDescription),
                ].join("\n"),
                { variant: "destructive" },
              ),
            );
            if (confirmed._tag === "Failure" || !confirmed.value) return;
          }
          const deleted = await deleteThread(threadRef);
          if (
            deleted._tag === "Failure" &&
            !isAtomCommandInterrupted(deleted) &&
            // A missing thread means cleanup failed after deletion; deleteThread already toasted that failure.
            readThreadShell(threadRef) !== null
          ) {
            failureToast(
              t(($) => $.sidebar.deleteThreadFailed),
              threadActionErrorMessage(squashAtomCommandFailure(deleted), t),
            );
          }
          return;
        }
        default:
          return;
      }
    })();
  };

  const closeMenu = () => {
    void readLocalApi()?.contextMenu.close();
  };

  return { openMenu, closeMenu };
}
