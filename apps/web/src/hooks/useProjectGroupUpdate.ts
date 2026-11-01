import { AuthOrchestrationOperateScope, type ProjectIconOverride } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { useTranslation } from "react-i18next";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { appI18n } from "../i18n";
import type { SidebarProjectGroupMember } from "../sidebarProjectGrouping";
import { useProjects, useServerConfigs } from "../state/entities";
import { readEnvironment } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { readEnvironmentScope, useEnvironmentsWithScope } from "../state/session";
import { useOrchestrationCommand } from "../state/use-orchestration-command";

export type ProjectGroupUpdate = Partial<{
  title: string;
  faviconPath: string | null;
  projectIcon: ProjectIconOverride | null;
  pinned: boolean;
  archived: boolean;
}>;

type ProjectGroupMember = Pick<
  SidebarProjectGroupMember,
  "environmentId" | "id" | "environmentLabel"
>;

/**
 * Writes one update to each checkout of a project, one machine at a time, and
 * reports the first failure as a toast. Every machine must be connected first.
 */
export function useProjectGroupUpdate() {
  const { t } = useTranslation("settings");
  const serverConfigs = useServerConfigs();
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });

  const updateProjectGroup = async <TMember extends ProjectGroupMember>(
    members: ReadonlyArray<TMember>,
    input: ProjectGroupUpdate | ((member: TMember) => ProjectGroupUpdate),
    failureTitle: string,
  ): Promise<AtomCommandResult<void, unknown>> => {
    const denied = checkProjectAccess(members, failureTitle);
    if (denied) return denied;
    const unavailable = members.find((member) => {
      const environment = readEnvironment(member.environmentId);
      return environment?.connection.phase !== "connected" || !environment.serverConfig;
    });
    if (unavailable) {
      return failWith(
        failureTitle,
        t(($) => $.extra.projects.connectEnvironment, {
          environment:
            unavailable.environmentLabel ?? t(($) => $.extra.projects.selectedEnvironment),
        }),
      );
    }
    for (const member of members) {
      // Access can be revoked between writes.
      const revoked = checkProjectAccess([member], failureTitle);
      if (revoked) return revoked;
      const result = mapAtomCommandResult(
        await updateProject({
          environmentId: member.environmentId,
          input: {
            projectId: member.id,
            ...(typeof input === "function" ? input(member) : input),
          },
        }),
        () => undefined,
      );
      if (result._tag === "Failure") {
        reportProjectFailure(
          members.length > 1
            ? t(($) => $.extra.projects.failureEnvironment, {
                failure: failureTitle,
                environment:
                  member.environmentLabel ?? t(($) => $.extra.projects.currentEnvironment),
              })
            : failureTitle,
          result,
        );
        return result;
      }
    }
    return AsyncResult.success(undefined);
  };

  /** Older servers drop pin and archive, so their projects do not offer them. */
  const canOrganizeProjectGroup = (members: ReadonlyArray<ProjectGroupMember>) =>
    members.every(
      (member) =>
        serverConfigs.get(member.environmentId)?.environment.capabilities.projectOrganization ===
        true,
    );

  return { updateProjectGroup, canOrganizeProjectGroup };
}

/** Pin state for a project group, shared by every list that can pin or unpin a project. */
export function useProjectPin() {
  const { t } = useTranslation("settings");
  const { updateProjectGroup, canOrganizeProjectGroup } = useProjectGroupUpdate();
  const environments = [...new Set(useProjects().map((project) => project.environmentId))].map(
    (environmentId) => ({ environmentId }),
  );
  const operableEnvironmentIds = useEnvironmentsWithScope(
    environments,
    AuthOrchestrationOperateScope,
  );
  type PinnableGroup = {
    readonly memberProjects: ReadonlyArray<ProjectGroupMember>;
    readonly pinned: boolean;
  };
  const canPinProjectGroup = (group: PinnableGroup) =>
    canOrganizeProjectGroup(group.memberProjects) &&
    group.memberProjects.every((member) => operableEnvironmentIds.has(member.environmentId));
  const setProjectGroupPinned = (group: PinnableGroup, pinned: boolean) => {
    void updateProjectGroup(
      group.memberProjects,
      { pinned },
      pinned ? t(($) => $.extra.projects.pinFailed) : t(($) => $.extra.projects.unpinFailed),
    );
  };
  return {
    canPinProjectGroup,
    setProjectGroupPinned,
    toggleProjectGroupPin: (group: PinnableGroup) => setProjectGroupPinned(group, !group.pinned),
  };
}

/** Reports the first member this connection cannot change, and returns that failure. */
export function checkProjectAccess(
  members: ReadonlyArray<ProjectGroupMember>,
  failureTitle: string,
): AtomCommandResult<void, unknown> | null {
  const denied = members.find(
    (member) => !readEnvironmentScope(member.environmentId, AuthOrchestrationOperateScope),
  );
  if (!denied) return null;
  const t = appI18n.getFixedT(null, "settings");
  return failWith(
    failureTitle,
    t(($) => $.extra.projects.permissionEnvironment, {
      environment: denied.environmentLabel ?? t(($) => $.extra.projects.thisEnvironment),
    }),
  );
}

export function reportProjectFailure(title: string, result: AtomCommandResult<unknown, unknown>) {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
  const error = squashAtomCommandFailure(result);
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description:
        error instanceof Error
          ? error.message
          : appI18n.getFixedT(null, "settings")(($) => $.extra.projects.error),
    }),
  );
}

function failWith(title: string, message: string): AtomCommandResult<void, unknown> {
  const result = AsyncResult.failure<void, Error>(Cause.fail(new Error(message)));
  reportProjectFailure(title, result);
  return result;
}
