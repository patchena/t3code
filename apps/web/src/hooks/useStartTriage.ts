import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { currentClientMetadata } from "~/connection/platform";
import { projectEnvironment } from "~/state/projects";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { writeTextToClipboard } from "./useCopyToClipboard";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useScratchProject } from "./useScratchProject";

export const TRIAGE_CLI_COMMAND = "npx t3 triage";

const copyTriageCliCommand = (t: TFunction<"common">) =>
  writeTextToClipboard(TRIAGE_CLI_COMMAND, "command").catch(() =>
    toastManager.add({
      type: "error",
      title: t(($) => $.operations.triageCopyFailed, { command: TRIAGE_CLI_COMMAND }),
    }),
  );

/**
 * In-app `t3 triage`: the server writes the session files and starts cloning
 * the matching source, then a No project draft opens with the playbook linked.
 * The draft hero explains the rest; the user picks a provider and describes
 * the problem.
 */
export function useStartTriage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { scratchWorkspaceRootFor } = useScratchProject();
  const handleNewThread = useNewThreadHandler();
  const prepare = useAtomCommand(serverEnvironment.prepareTriage, { reportFailure: false });
  const openScratch = useAtomCommand(projectEnvironment.openScratch, { reportFailure: false });

  // With no draft to show, a toast is the only place to point at the CLI.
  const fail = (description: string) =>
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: t(($) => $.operations.triageFailed),
        description: t(($) => $.operations.triageRetry, {
          error: description,
          command: TRIAGE_CLI_COMMAND,
        }),
        timeout: 0,
        actionProps: {
          children: t(($) => $.operations.copyCommand),
          onClick: () => void copyTriageCliCommand(t),
        },
        // "Copy command" is the copy that helps here, not the error text.
        data: { hideCopyButton: true },
      }),
    );
  const failWith = (
    result: Extract<AtomCommandResult<unknown, unknown>, { readonly _tag: "Failure" }>,
  ) => {
    if (isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    fail(error instanceof Error ? error.message : t(($) => $.operations.error));
  };

  // `routeChanged` tells the steps the user went elsewhere while they waited;
  // the draft then stays closed instead of pulling them away.
  const openTriageDraft = async (environmentId: EnvironmentId, routeChanged: () => boolean) => {
    const prepared = await prepare({
      environmentId,
      input: { client: currentClientMetadata() },
    });
    if (prepared._tag === "Failure") return failWith(prepared);
    const project = await openScratch({ environmentId, input: {} });
    if (project._tag === "Failure") return failWith(project);
    if (routeChanged()) return;
    // A null result means the user went elsewhere; only a throw is a failure.
    await handleNewThread(scopeProjectRef(project.value.environmentId, project.value.id), {
      prompt: prepared.value.prompt,
    }).catch(() => fail(t(($) => $.operations.triageOpenFailed)));
  };

  return async (environmentId: EnvironmentId) => {
    if (scratchWorkspaceRootFor(environmentId) === null) {
      fail(t(($) => $.operations.triageUnsupported));
      return;
    }
    const requestingRouteHref = router.state.location.href;
    // The palette is already closed, and a slow network can hold up the source
    // lookup, so say something when the draft does not open at once.
    let pendingToastId: ReturnType<typeof toastManager.add> | undefined;
    const pendingTimer = setTimeout(() => {
      pendingToastId = toastManager.add({
        type: "loading",
        title: t(($) => $.operations.triageStarting),
        timeout: 0,
      });
    }, 400);
    await openTriageDraft(
      environmentId,
      () => router.state.location.href !== requestingRouteHref,
    ).finally(() => {
      clearTimeout(pendingTimer);
      if (pendingToastId !== undefined) toastManager.close(pendingToastId);
    });
  };
}
