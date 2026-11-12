import type { TFunction } from "@t3tools/client-runtime/i18n";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  ReviewDiffPreviewSource,
  VcsStatusResult,
} from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";
import {
  changeRequestTerminologyFor,
  type DefaultBranchActionDialogCopy,
  type DefaultBranchConfirmableAction,
  type GitActionIconName,
  type GitDialogAction,
  type VcsActionState,
} from "@t3tools/client-runtime/state/vcs";

export {
  requiresDefaultBranchConfirmation,
  type DefaultBranchConfirmableAction,
  type GitActionIconName,
} from "@t3tools/client-runtime/state/vcs";

export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog";
  dialogAction?: GitDialogAction;
}

export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_publish" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
}

export interface GitActionProgressPresentation {
  readonly status: string;
  readonly output: string | null;
  readonly startedAtMs: number | null;
}

export interface GitActionResultToastTiming {
  readonly timeout: 0;
  readonly dismissAfterVisibleMs: number | null;
}

export const GIT_ACTION_SUCCESS_VISIBLE_MS = 10_000;

export function resolveGitActionResultPresentation(
  result: GitRunStackedActionResult,
  terminology: ChangeRequestTerminology,
  t: TFunction<"workspace">,
): { title: string; description: string | null } {
  if (result.pr.status === "created") {
    return {
      title: t(($) => $.git.createdRequest, { term: terminology.shortLabel }),
      description: null,
    };
  }
  const description = result.toast.description ?? null;
  if (result.pr.status === "opened_existing") {
    return {
      title:
        result.pr.number === undefined
          ? t(($) => $.git.openedRequest, { term: terminology.shortLabel })
          : t(($) => $.git.openedRequestNumber, {
              term: terminology.shortLabel,
              number: result.pr.number,
            }),
      description,
    };
  }
  const sha = result.commit.commitSha?.slice(0, 7);
  if (result.push.status === "pushed") {
    const branch = result.push.upstreamBranch ?? result.push.branch;
    return {
      title:
        sha === undefined
          ? branch === undefined
            ? t(($) => $.git.pushed)
            : t(($) => $.git.pushedToBranch, { branch })
          : branch === undefined
            ? t(($) => $.git.pushedSha, { sha })
            : t(($) => $.git.pushedShaToBranch, { sha, branch }),
      description,
    };
  }
  if (result.commit.status === "created") {
    return {
      title:
        sha === undefined
          ? t(($) => $.git.committedChanges)
          : t(($) => $.git.committedSha, { sha }),
      description,
    };
  }
  return { title: t(($) => $.git.done), description };
}

export function resolveGitActionResultToastTiming(
  type: "error" | "success",
): GitActionResultToastTiming {
  return {
    timeout: 0,
    dismissAfterVisibleMs: type === "success" ? GIT_ACTION_SUCCESS_VISIBLE_MS : null,
  };
}

export function resolveGitActionProgressPresentation(
  input: Pick<
    VcsActionState,
    | "isRunning"
    | "operation"
    | "currentPhase"
    | "hookName"
    | "lastOutputLine"
    | "phaseStartedAtMs"
    | "hookStartedAtMs"
  >,
  terminology: ChangeRequestTerminology,
  t: TFunction<"workspace">,
): GitActionProgressPresentation | null {
  if (
    !input.isRunning ||
    (input.operation !== "run_change_request" && input.operation !== "pull")
  ) {
    return null;
  }
  const output = input.lastOutputLine?.trim();
  const isPull = input.operation === "pull";
  const status = isPull
    ? t(($) => $.git.pulling)
    : input.hookName !== null
      ? t(($) => $.git.runningHook, { hook: input.hookName })
      : input.currentPhase === "branch"
        ? t(($) => $.git.preparingFeatureBranch)
        : input.currentPhase === "commit"
          ? t(($) => $.git.committing)
          : input.currentPhase === "push"
            ? t(($) => $.git.pushing)
            : input.currentPhase === "pr"
              ? t(($) => $.git.preparingRequest, { term: terminology.shortLabel })
              : t(($) => $.git.startingGitAction);
  return {
    status,
    output: !isPull && output ? output : null,
    startedAtMs: isPull
      ? input.phaseStartedAtMs
      : (input.hookStartedAtMs ?? input.phaseStartedAtMs),
  };
}

export function formatGitActionElapsed(startedAtMs: number | null, nowMs: number): string | null {
  if (startedAtMs === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
  t: TFunction<"workspace">,
): GitActionMenuItem[] {
  if (!gitStatus) return [];
  const terminology = changeRequestTerminologyFor(gitStatus);

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isBehind = gitStatus.behindCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const canPushWithoutUpstream = hasPrimaryRemote && !gitStatus.hasUpstream;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasOpenPr &&
    hasDefaultBranchDelta &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);

  const commitItem: GitActionMenuItem = {
    id: "commit",
    label: t(($) => $.git.commit),
    disabled: !canCommit,
    icon: "commit",
    kind: "open_dialog",
    dialogAction: "commit",
  };

  if (!hasPrimaryRemote) {
    return [commitItem];
  }

  const pushItem: GitActionMenuItem = {
    id: "push",
    label: t(($) => $.git.push),
    disabled: !canPush,
    icon: "push",
    kind: "open_dialog",
    dialogAction: "push",
  };

  if (hasOpenPr) {
    return [commitItem, pushItem];
  }

  return [
    commitItem,
    pushItem,
    {
      id: "pr",
      label: t(($) => $.git.createRequest, { term: terminology.shortLabel }),
      disabled: !canCreatePr,
      icon: "pr",
      kind: "open_dialog",
      dialogAction: "create_pr",
    },
  ];
}

export function hasUsableGitMenuContent(input: {
  readonly menuItems: readonly GitActionMenuItem[];
  readonly canWriteSourceControl: boolean;
  readonly canPublishRepository: boolean;
  readonly hasNotice: boolean;
}): boolean {
  return (
    input.canPublishRepository ||
    input.hasNotice ||
    (input.canWriteSourceControl && input.menuItems.some((item) => !item.disabled))
  );
}

export function resolveQuickAction(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  isDefaultRef = false,
  hasPrimaryRemote = true,
  t: TFunction<"workspace">,
): GitQuickAction {
  if (isBusy) {
    return {
      label: t(($) => $.git.commit),
      disabled: true,
      kind: "show_hint",
      hint: t(($) => $.git.gitActionInProgress),
    };
  }

  if (!gitStatus) {
    return {
      label: t(($) => $.git.commit),
      disabled: true,
      kind: "show_hint",
      hint: t(($) => $.git.gitStatusUnavailable),
    };
  }

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const isBehind = gitStatus.behindCount > 0;
  const isDiverged = isAhead && isBehind;
  const terminology = changeRequestTerminologyFor(gitStatus);

  if (!hasBranch) {
    return {
      label: t(($) => $.git.commit),
      disabled: true,
      kind: "show_hint",
      hint: t(($) => $.git.refBeforePush, { term: terminology.singular }),
    };
  }

  if (hasChanges) {
    if (isBehind || (!gitStatus.hasUpstream && !hasPrimaryRemote)) {
      return {
        label: t(($) => $.git.commit),
        disabled: false,
        kind: "run_action",
        action: "commit",
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t(($) => $.git.commitPush),
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    }
    return {
      label: t(($) => $.git.commitPushRequest, { term: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPrimaryRemote) {
      return {
        label: t(($) => $.git.publishRepository),
        disabled: false,
        kind: "open_publish",
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return {
          label: t(($) => $.git.commit),
          disabled: true,
          kind: "show_hint",
          hint: t(($) => $.git.branchUpToDate),
        };
      }
      return {
        label: t(($) => $.git.push),
        disabled: true,
        kind: "show_hint",
        hint: t(($) => $.git.noCommitsToPush),
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t(($) => $.git.push),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: t(($) => $.git.pushCreateRequest, { term: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (isDiverged) {
    return {
      label: t(($) => $.git.syncRef),
      disabled: true,
      kind: "show_hint",
      hint: t(($) => $.git.divergedBranches),
    };
  }

  if (isBehind) {
    return {
      label: t(($) => $.git.pull),
      disabled: false,
      kind: "run_pull",
    };
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t(($) => $.git.push),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: t(($) => $.git.pushCreateRequest, { term: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (hasOpenPr && gitStatus.hasUpstream) {
    return {
      label: t(($) => $.git.commit),
      disabled: true,
      kind: "show_hint",
      hint: t(($) => $.git.branchUpToDate),
    };
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: t(($) => $.git.createRequest, { term: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  return {
    label: t(($) => $.git.commit),
    disabled: true,
    kind: "show_hint",
    hint: t(($) => $.git.branchUpToDate),
  };
}

export function resolveDefaultBranchActionDialogCopy(
  input: {
    action: DefaultBranchConfirmableAction;
    branchName: string;
    includesCommit: boolean;
    terminology: ChangeRequestTerminology;
  },
  t: TFunction<"workspace">,
): DefaultBranchActionDialogCopy {
  const branchLabel = input.branchName;
  const { terminology } = input;

  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: t(($) => $.git.confirmCommitPushDefault),
        description: t(($) => $.git.commitPushDefaultDescription, { branch: branchLabel }),
        continueLabel: t(($) => $.git.commitPushToBranch, { branch: branchLabel }),
      };
    }
    return {
      title: t(($) => $.git.confirmPushDefault),
      description: t(($) => $.git.pushDefaultDescription, { branch: branchLabel }),
      continueLabel: t(($) => $.git.pushToBranch, { branch: branchLabel }),
    };
  }

  if (input.includesCommit) {
    return {
      title: t(($) => $.git.confirmCommitPushRequest, { term: terminology.shortLabel }),
      description: t(($) => $.git.commitPushRequestDefaultDescription, {
        branch: branchLabel,
        term: terminology.singular,
      }),
      continueLabel: t(($) => $.git.commitPushCreateRequest, { term: terminology.shortLabel }),
    };
  }
  return {
    title: t(($) => $.git.confirmPushCreateRequest, { term: terminology.shortLabel }),
    description: t(($) => $.git.pushRequestDefaultDescription, {
      branch: branchLabel,
      term: terminology.singular,
    }),
    continueLabel: t(($) => $.git.pushCreateRequest, { term: terminology.shortLabel }),
  };
}

/** Clean trees cannot create feature branches because the server derives names from uncommitted changes. */
export function resolveFeatureBranchUnavailableReason(
  input: {
    branchName: string;
    hasWorkingTreeChanges: boolean;
  },
  t: TFunction<"workspace">,
): string | null {
  if (input.hasWorkingTreeChanges) return null;
  return t(($) => $.git.cannotNameFeatureBranch, { branch: input.branchName });
}

export function resolveThreadBranchUpdate(
  result: GitRunStackedActionResult,
): { branch: string } | null {
  if (result.branch.status !== "created" || !result.branch.name) {
    return null;
  }

  return {
    branch: result.branch.name,
  };
}

export function resolveThreadBranchMetadataPatch(
  branch: string | null,
  expectedBranch: string | null,
): {
  branch: string | null;
  expectedBranch: string | null;
} {
  return { branch, expectedBranch };
}

export function resolveLiveThreadBranchUpdate(input: {
  threadBranch: string | null;
  gitStatus: VcsStatusResult | null;
}): { branch: string | null } | null {
  if (!input.gitStatus) {
    return null;
  }

  if (input.gitStatus.refName === null && input.threadBranch !== null) {
    return null;
  }

  if (input.threadBranch === input.gitStatus.refName) {
    return null;
  }

  if (
    input.threadBranch !== null &&
    input.gitStatus.refName !== null &&
    !isTemporaryWorktreeBranch(input.threadBranch) &&
    isTemporaryWorktreeBranch(input.gitStatus.refName)
  ) {
    return null;
  }

  return {
    branch: input.gitStatus.refName,
  };
}

export type ChangesLineTotals = {
  readonly insertions: number;
  readonly deletions: number;
  /** Ref the counts compare against; `null` means they are uncommitted changes against HEAD. */
  readonly baseRef: string | null;
};

// `branchChanges ?? workingTree` treats `{0,0}` as present, so a zero branch total hid a dirty
// working tree and the Changes row read +0 while Diff still showed the work.
// The Diff panel's branch comparison wins when it has file stats, so a remembered base or
// hidden whitespace reads the same in the row as in the panel.
export function resolveChangesTotals(
  status: VcsStatusResult | null | undefined,
  branchPreview?: ReviewDiffPreviewSource | null,
): ChangesLineTotals | null {
  if (branchPreview?.files) {
    let insertions = 0;
    let deletions = 0;
    for (const file of branchPreview.files) {
      insertions += file.additions;
      deletions += file.deletions;
    }
    return { insertions, deletions, baseRef: branchPreview.baseRef };
  }
  if (!status) return null;
  const branch = status.branchChanges;
  const tree = { ...status.workingTree, baseRef: null };
  const selected =
    branch && (branch.insertions > 0 || branch.deletions > 0)
      ? branch
      : tree.insertions > 0 || tree.deletions > 0
        ? tree
        : (branch ?? tree);
  return {
    insertions: selected.insertions,
    deletions: selected.deletions,
    baseRef: selected.baseRef,
  };
}
