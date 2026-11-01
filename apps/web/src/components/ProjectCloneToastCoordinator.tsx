import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  projectCloneDisplayName,
  type EnvironmentId,
  type ProjectCloneSnapshot,
  type ProjectId,
} from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useRemoveClonedProject } from "~/hooks/useRemoveClonedProject";
import { useEnvironments } from "~/state/environments";
import {
  isProjectCloneToastSilenced,
  silenceProjectCloneToasts,
  useEnvironmentProjectClones,
} from "~/state/projectClones";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";
import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { toastManager } from "~/components/ui/toast";
import { stackedThreadToast } from "~/components/ui/toastHelpers";

export function ProjectCloneToastCoordinator() {
  const { environments } = useEnvironments();
  return environments.map((environment) => (
    <EnvironmentCloneToasts
      key={environment.environmentId}
      environmentId={environment.environmentId}
    />
  ));
}

interface TrackedToast {
  readonly toastId: ReturnType<typeof toastManager.add>;
  readonly renderedKey: string;
  readonly phase: ProjectCloneSnapshot["phase"];
}

function renderKey(clone: ProjectCloneSnapshot): string {
  return `${clone.phase}:${clone.stage}:${clone.percent ?? ""}:${clone.detail ?? ""}:${clone.stalled === true}:${clone.error ?? ""}`;
}

function cloneProgress(clone: ProjectCloneSnapshot, t: TFunction<"workspace">): string {
  const stages = {
    connecting: t(($) => $.updates.cloneConnecting),
    counting: t(($) => $.updates.cloneCounting),
    receiving: t(($) => $.updates.cloneReceiving),
    resolving: t(($) => $.updates.cloneResolving),
    checkout: t(($) => $.updates.cloneCheckout),
  };
  return [
    stages[clone.stage],
    ...(clone.percent === null ? [] : [`${clone.percent}%`]),
    ...(clone.stalled ? [t(($) => $.updates.cloneStalled)] : clone.detail ? [clone.detail] : []),
  ].join(" · ");
}

async function runCloneAction(
  title: string,
  action: () => Promise<AtomCommandResult<unknown, unknown>>,
  t: TFunction<"workspace">,
) {
  const result = await action();
  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : t(($) => $.updates.anErrorOccurred),
      }),
    );
  }
}

function EnvironmentCloneToasts({ environmentId }: { environmentId: EnvironmentId }) {
  const { t, i18n } = useTranslation("workspace");
  const clones = useEnvironmentProjectClones(environmentId);
  const handleNewThread = useNewThreadHandler();
  const { draftId: routeDraftId } = useParams({ strict: false });
  const cancelClone = useAtomCommand(sourceControlEnvironment.cancelProjectClone, {
    reportFailure: false,
  });
  const retryClone = useAtomCommand(sourceControlEnvironment.retryProjectClone, {
    reportFailure: false,
  });
  const removeClonedProject = useRemoveClonedProject();
  const toasts = useRef(new Map<ProjectId, TrackedToast>());

  const isViewingProjectDraft = (projectId: ProjectId) => {
    if (!routeDraftId) return false;
    const draft = useComposerDraftStore.getState().getDraftSession(routeDraftId as DraftId);
    return draft?.environmentId === environmentId && draft.projectId === projectId;
  };

  const openProject = (projectId: ProjectId) => {
    void handleNewThread(scopeProjectRef(environmentId, projectId));
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens, updates and closes imperative toastManager toasts to match the current project clones
  useEffect(() => {
    const seen = new Set<ProjectId>();
    for (const clone of clones) {
      seen.add(clone.projectId);
      const key = `${i18n.resolvedLanguage}:${renderKey(clone)}`;
      const tracked = toasts.current.get(clone.projectId);
      const name = projectCloneDisplayName(clone);
      const closeToast = () => {
        const current = toasts.current.get(clone.projectId);
        if (!current) return;
        toastManager.close(current.toastId);
        toasts.current.delete(clone.projectId);
      };
      const ref = { environmentId, projectId: clone.projectId };
      if (isViewingProjectDraft(clone.projectId)) {
        silenceProjectCloneToasts(ref);
        closeToast();
        continue;
      }
      if (tracked?.renderedKey === key) continue;
      if (
        isProjectCloneToastSilenced(ref) &&
        (clone.phase === "running" || clone.phase === "done")
      ) {
        closeToast();
        continue;
      }

      if (clone.phase === "running") {
        const options = stackedThreadToast({
          type: "loading",
          title: t(($) => $.updates.cloning, { project: name }),
          description: cloneProgress(clone, t),
          timeout: 0,
          actionProps: {
            children: t(($) => $.updates.cancel),
            onClick: () => {
              void runCloneAction(
                t(($) => $.updates.failedToCancelClone),
                () => cancelClone({ environmentId, input: { projectId: clone.projectId } }),
                t,
              );
            },
          },
          data: { hideCopyButton: true },
        });
        if (tracked) {
          toastManager.update(tracked.toastId, options);
          toasts.current.set(clone.projectId, { ...tracked, renderedKey: key, phase: "running" });
        } else {
          const toastId = toastManager.add(options);
          toasts.current.set(clone.projectId, { toastId, renderedKey: key, phase: "running" });
        }
        continue;
      }

      if (clone.phase === "done") {
        const options = stackedThreadToast({
          type: "success",
          title: t(($) => $.updates.cloned, { project: name }),
          description: clone.destinationPath,
          timeout: 8_000,
          actionProps: {
            children: t(($) => $.updates.openProject),
            onClick: () => {
              closeToast();
              openProject(clone.projectId);
            },
          },
          data: { hideCopyButton: true },
        });
        if (tracked) {
          toastManager.update(tracked.toastId, options);
          toasts.current.set(clone.projectId, { ...tracked, renderedKey: key, phase: "done" });
        } else {
          const toastId = toastManager.add(options);
          toasts.current.set(clone.projectId, { toastId, renderedKey: key, phase: "done" });
        }
        continue;
      }

      const cancelled = clone.phase === "cancelled";
      const options = stackedThreadToast({
        type: cancelled ? "info" : "error",
        title: cancelled
          ? t(($) => $.updates.cloneCancelled, { project: name })
          : t(($) => $.updates.cloneFailed, { project: name }),
        description: cancelled
          ? clone.destinationPath
          : (clone.error ?? t(($) => $.updates.theCloneFailed)),
        timeout: 0,
        actionProps: {
          children: t(($) => $.updates.retry),
          onClick: () => {
            void runCloneAction(
              t(($) => $.updates.failedToRetryClone),
              () => retryClone({ environmentId, input: { projectId: clone.projectId } }),
              t,
            );
          },
        },
        data: {
          ...(cancelled ? { hideCopyButton: true } : {}),
          secondaryActionProps: {
            children: t(($) => $.updates.removeProject),
            onClick: () => {
              void removeClonedProject({ environmentId, projectId: clone.projectId });
            },
          },
        },
      });
      if (tracked) {
        toastManager.update(tracked.toastId, options);
        toasts.current.set(clone.projectId, { ...tracked, renderedKey: key, phase: clone.phase });
      } else {
        const toastId = toastManager.add(options);
        toasts.current.set(clone.projectId, { toastId, renderedKey: key, phase: clone.phase });
      }
    }

    for (const [projectId, tracked] of toasts.current) {
      if (seen.has(projectId)) continue;
      if (tracked.phase !== "done") toastManager.close(tracked.toastId);
      toasts.current.delete(projectId);
    }
  }, [
    cancelClone,
    clones,
    t,
    i18n,
    environmentId,
    isViewingProjectDraft,
    openProject,
    removeClonedProject,
    retryClone,
  ]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closes every tracked clone toast in toastManager when the coordinator unmounts
  useEffect(
    () => () => {
      for (const tracked of toasts.current.values()) toastManager.close(tracked.toastId);
      toasts.current.clear();
    },
    [],
  );

  return null;
}
