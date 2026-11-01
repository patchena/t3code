import { useTranslation } from "react-i18next";
import { useStableCallback } from "../../hooks/useStableCallback";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { DownloadIcon } from "lucide-react";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { useRemoveClonedProject } from "../../hooks/useRemoveClonedProject";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { useProjectClone } from "../../state/projectClones";
import { projectCloneDisplayName, type ScopedProjectRef } from "@t3tools/contracts";
import { dismissProjectFileCopy, useProjectFileCopy } from "../../lib/addProjectToMachine";
import { type ComposerBannerStackItem } from "./ComposerBannerStack";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
/**
 * A project still being cloned or copied into place: the composer banner with its cancel,
 * retry, and remove actions, and the reason sending waits until it is done.
 */
export function useProjectCloneBanner(activeProjectRef: ScopedProjectRef | null) {
  const { t } = useTranslation("chat");
  const activeProjectClone = useProjectClone(activeProjectRef);
  const cancelProjectClone = useAtomCommand(sourceControlEnvironment.cancelProjectClone, {
    reportFailure: false,
  });
  const retryProjectClone = useAtomCommand(sourceControlEnvironment.retryProjectClone, {
    reportFailure: false,
  });
  const removeClonedProject = useRemoveClonedProject();
  const runProjectCloneAction = async (
    title: string,
    action: () => Promise<AtomCommandResult<unknown, unknown>>,
  ): Promise<void> => {
    const result = await action();
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title,
          description: error instanceof Error ? error.message : t(($) => $.composer.errorOccurred),
        }),
      );
    }
  };
  const runProjectCloneActionStable = useStableCallback(runProjectCloneAction);
  const activeProjectFileCopy = useProjectFileCopy(activeProjectRef);
  const projectCloneSendBlockReason =
    activeProjectClone?.phase === "running"
      ? t(($) => $.composer.cloningRepo)
      : activeProjectClone !== null && activeProjectClone.phase !== "done"
        ? t(($) => $.composer.repoNotCloned)
        : activeProjectFileCopy?.phase === "copying"
          ? t(($) => $.composer.copyingFiles)
          : null;
  const projectCloneBannerItem = (() => {
    if (activeProjectFileCopy?.phase === "failed" && activeProjectRef) {
      return {
        id: `project-file-copy:${activeProjectRef.projectId}`,
        variant: "error",
        icon: <DownloadIcon />,
        title: activeProjectFileCopy.title,
        description: activeProjectFileCopy.failures.join("\n"),
        onDismiss: () => dismissProjectFileCopy(activeProjectRef),
      };
    }
    if (!activeProjectClone || !activeProjectRef || activeProjectClone.phase === "done") {
      return null;
    }
    const name = projectCloneDisplayName(activeProjectClone);
    const { environmentId, projectId } = activeProjectRef;
    if (activeProjectClone.phase === "running") {
      return {
        id: `project-clone:${projectId}`,
        variant: "info",
        icon: <DownloadIcon />,
        title: t(($) => $.composer.cloningProject, { name }),
        description: [
          {
            connecting: t(($) => $.composer.cloneConnecting),
            counting: t(($) => $.composer.countingObjects),
            receiving: t(($) => $.composer.receivingObjects),
            resolving: t(($) => $.composer.resolvingDeltas),
            checkout: t(($) => $.composer.checkingOutFiles),
          }[activeProjectClone.stage],
          ...(activeProjectClone.percent !== null ? [`${activeProjectClone.percent}%`] : []),
          ...(activeProjectClone.stalled
            ? [t(($) => $.composer.stalled)]
            : activeProjectClone.detail
              ? [activeProjectClone.detail]
              : []),
        ].join(" · "),
        actions: (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              void runProjectCloneActionStable(
                t(($) => $.composer.cancelCloneFailed),
                () => cancelProjectClone({ environmentId, input: { projectId } }),
              )
            }
          >
            {t(($) => $.composer.cancel)}
          </Button>
        ),
      };
    }
    const cancelled = activeProjectClone.phase === "cancelled";
    return {
      id: `project-clone:${projectId}`,
      variant: cancelled ? "warning" : "error",
      icon: <DownloadIcon />,
      title: cancelled
        ? t(($) => $.composer.cancelledCloning, { name })
        : t(($) => $.composer.cloneFailed, { name }),
      description: cancelled ? t(($) => $.composer.retryClone) : activeProjectClone.error,
      actions: (
        <>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void removeClonedProject({ environmentId, projectId })}
          >
            {t(($) => $.composer.removeProject)}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              void runProjectCloneActionStable(
                t(($) => $.composer.retryCloneFailed),
                () => retryProjectClone({ environmentId, input: { projectId } }),
              )
            }
          >
            {t(($) => $.composer.retry)}
          </Button>
        </>
      ),
    };
  })() as ComposerBannerStackItem | null;
  return {
    projectCloneBannerItem,
    projectCloneSendBlockReason,
  };
}
