import { createI18n } from "@t3tools/client-runtime/i18n";
import {
  SourceControlProviderKind,
  type GitRunStackedActionResult,
  type VcsStatusResult,
} from "@t3tools/contracts";
import { EMPTY_VCS_ACTION_STATE } from "@t3tools/client-runtime/state/vcs";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { resolveAutoFeatureBranchName } from "@t3tools/shared/git";
import { assert, describe, it } from "vite-plus/test";
import {
  buildMenuItems,
  hasUsableGitMenuContent,
  requiresDefaultBranchConfirmation,
  resolveChangesTotals,
  resolveDefaultBranchActionDialogCopy,
  resolveLiveThreadBranchUpdate,
  resolveQuickAction,
  resolveGitActionResultPresentation,
  resolveGitActionProgressPresentation,
} from "~/components/GitActionsControl.logic";

const t = createI18n("en").getFixedT(null, "workspace");

it("localizes structured Git results and phases without changing diagnostic text", async () => {
  const instance = createI18n("en");
  const translate = instance.getFixedT(null, "workspace");
  const terminology = sourceControlClients.get(
    SourceControlProviderKind.make("github"),
  ).changeRequest;
  const result: GitRunStackedActionResult = {
    action: "commit_push",
    branch: { status: "skipped_not_requested" },
    commit: { status: "created", commitSha: "abcdef012345", subject: "Unchanged subject" },
    push: { status: "pushed", branch: "feature/ref" },
    pr: { status: "skipped_not_requested" },
    toast: {
      title: "Server presentation text",
      description: "Unchanged subject",
      cta: { kind: "none" },
    },
  };
  expectResult("Pushed abcdef0 to feature/ref");
  await instance.changeLanguage("de");
  expectResult("abcdef0 nach feature/ref gepusht");
  assert.deepEqual(
    resolveGitActionProgressPresentation(
      {
        ...EMPTY_VCS_ACTION_STATE,
        isRunning: true,
        operation: "run_change_request",
        currentPhase: "commit",
        lastOutputLine: "Unchanged diagnostic",
      },
      terminology,
      translate,
    ),
    { status: "Commit wird erstellt...", output: "Unchanged diagnostic", startedAtMs: null },
  );

  function expectResult(title: string) {
    assert.deepEqual(resolveGitActionResultPresentation(result, terminology, translate), {
      title,
      description: "Unchanged subject",
    });
  }
});

function status(overrides: Partial<VcsStatusResult> = {}): VcsStatusResult {
  return {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: false,
    refName: "feature/test",
    hasWorkingTreeChanges: false,
    workingTree: {
      files: [],
      insertions: 0,
      deletions: 0,
    },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ...overrides,
  };
}

describe("when: ref is clean, ahead, and has an open PR", () => {
  it("resolveQuickAction prefers push", () => {
    const quick = resolveQuickAction(
      status({
        aheadCount: 3,
        pr: {
          number: 13,
          title: "Open PR",
          url: "https://example.com/pr/13",
          baseRef: "main",
          headRef: "feature/test",
          state: "open",
        },
      }),
      false,
      false,
      true,
      t,
    );
    assert.deepInclude(quick, { kind: "run_action", action: "push", label: "Push" });
  });
});

describe("when: ref is clean, up to date, and has no open PR", () => {
  it("enables create PR when synced with upstream but ahead of default, even with local changes", () => {
    const syncedFeature = status({
      aheadCount: 0,
      behindCount: 0,
      aheadOfDefaultCount: 1,
      pr: null,
    });

    const quick = resolveQuickAction(syncedFeature, false, false, true, t);
    assert.deepInclude(quick, {
      label: "Create PR",
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    });

    const items = buildMenuItems(syncedFeature, false, true, t);
    assert.equal(items.find((item) => item.id === "pr")?.disabled, false);

    const dirtyFeature = { ...syncedFeature, hasWorkingTreeChanges: true };
    assert.equal(
      buildMenuItems(dirtyFeature, false, true, t).find((item) => item.id === "pr")?.disabled,
      false,
    );
  });

  it("offers the actions menu only when something in it is usable", () => {
    const hasContent = (
      gitStatus: VcsStatusResult,
      overrides: Partial<Parameters<typeof hasUsableGitMenuContent>[0]> = {},
    ) =>
      hasUsableGitMenuContent({
        menuItems: buildMenuItems(gitStatus, false, gitStatus.hasPrimaryRemote, t),
        canWriteSourceControl: true,
        canPublishRepository: false,
        hasNotice: false,
        ...overrides,
      });
    const clean = status();
    const dirty = status({ hasWorkingTreeChanges: true });

    assert.isFalse(hasContent(clean));
    assert.isTrue(hasContent(dirty));
    assert.isTrue(hasContent(status({ aheadCount: 1 })));
    assert.isFalse(hasContent(dirty, { canWriteSourceControl: false }));
    assert.isTrue(hasContent(status({ hasPrimaryRemote: false }), { canPublishRepository: true }));
    assert.isTrue(hasContent(clean, { hasNotice: true }));
  });
});

describe("when: on default ref without open PR", () => {
  it("resolveQuickAction returns commit and push when local changes exist", () => {
    const quick = resolveQuickAction(
      status({ refName: "main", hasWorkingTreeChanges: true }),
      false,
      true,
      true,
      t,
    );
    assert.deepInclude(quick, {
      kind: "run_action",
      action: "commit_push",
      label: "Commit & push",
      disabled: false,
    });
  });
});

describe("when: local changes are behind upstream", () => {
  it("keeps the commit action available without pushing, with or without an open PR", () => {
    const behind = status({ hasWorkingTreeChanges: true, behindCount: 2 });
    const commit = {
      label: "Commit",
      disabled: false,
      kind: "run_action",
      action: "commit",
    } as const;
    assert.deepEqual(resolveQuickAction(behind, false, false, true, t), commit);
    assert.deepEqual(
      resolveQuickAction(
        {
          ...behind,
          pr: {
            number: 13,
            title: "Open PR",
            url: "https://example.com/pr/13",
            baseRef: "main",
            headRef: "feature/test",
            state: "open",
          },
        },
        false,
        false,
        true,
        t,
      ),
      commit,
    );
  });
});

describe("when: ref has no upstream configured", () => {
  it("resolveQuickAction runs push and create PR when no upstream and commits are ahead", () => {
    const quick = resolveQuickAction(
      status({
        hasUpstream: false,
        aheadCount: 2,
        pr: null,
      }),
      false,
      false,
      true,
      t,
    );
    assert.deepInclude(quick, {
      kind: "run_action",
      action: "create_pr",
      label: "Push & create PR",
      disabled: false,
    });
  });

  it("resolveQuickAction publishes when no origin remote exists", () => {
    const quick = resolveQuickAction(
      status({
        hasUpstream: false,
        aheadCount: 2,
        pr: null,
      }),
      false,
      false,
      false,
      t,
    );
    assert.deepEqual(quick, {
      kind: "open_publish",
      label: "Publish repository",
      disabled: false,
    });
  });
});

describe("when: the ref is on GitLab", () => {
  const gitLab = {
    sourceControlProvider: {
      kind: SourceControlProviderKind.make("gitlab"),
      name: "GitLab",
      baseUrl: "https://gitlab.com",
    },
  };

  it("names merge requests in actions and the default-ref dialog", () => {
    const ahead = status({ ...gitLab, hasUpstream: false, aheadCount: 2 });
    assert.equal(resolveQuickAction(ahead, false, false, true, t).label, "Push & create MR");
    assert.equal(
      resolveQuickAction(status({ ...gitLab, hasWorkingTreeChanges: true }), false, false, true, t)
        .label,
      "Commit, push & MR",
    );
    assert.equal(
      buildMenuItems(ahead, false, true, t).find((item) => item.id === "pr")?.label,
      "Create MR",
    );

    const copy = resolveDefaultBranchActionDialogCopy(
      {
        action: "create_pr",
        branchName: "main",
        includesCommit: false,
        terminology: sourceControlClients.get("gitlab").changeRequest,
      },
      t,
    );
    assert.equal(copy.title, "Push & create MR from default ref?");
    assert.include(copy.description, "create a merge request on");
  });
});

describe("requiresDefaultBranchConfirmation", () => {
  it("requires confirmation for push actions on default ref", () => {
    assert.isFalse(requiresDefaultBranchConfirmation("commit", true));
    assert.isTrue(requiresDefaultBranchConfirmation("push", true));
    assert.isTrue(requiresDefaultBranchConfirmation("create_pr", true));
    assert.isTrue(requiresDefaultBranchConfirmation("commit_push", true));
    assert.isTrue(requiresDefaultBranchConfirmation("commit_push_pr", true));
    assert.isFalse(requiresDefaultBranchConfirmation("commit_push", false));
    assert.isFalse(requiresDefaultBranchConfirmation("push", false));
  });
});

describe("resolveLiveThreadBranchUpdate", () => {
  it("returns a branch update when live git status differs from stored thread metadata", () => {
    const update = resolveLiveThreadBranchUpdate({
      threadBranch: "feature/old-ref",
      gitStatus: status({ refName: "effect-atom" }),
    });

    assert.deepEqual(update, {
      branch: "effect-atom",
    });
  });

  it("returns null when git status is detached HEAD but the thread already has a ref", () => {
    const update = resolveLiveThreadBranchUpdate({
      threadBranch: "effect-atom",
      gitStatus: status({ refName: null }),
    });

    assert.equal(update, null);
  });

  it("does not regress a semantic thread ref back to a temporary worktree ref", () => {
    const update = resolveLiveThreadBranchUpdate({
      threadBranch: "t3code/github-query-rate-limit",
      gitStatus: status({ refName: "t3code/bda76797" }),
    });

    assert.equal(update, null);
  });
});

describe("resolveAutoFeatureBranchName", () => {
  it("increments suffix when the preferred ref name already exists", () => {
    const ref = resolveAutoFeatureBranchName(
      ["main", "feature/fix-toast-copy", "feature/fix-toast-copy-2"],
      "fix toast copy",
    );
    assert.equal(ref, "feature/fix-toast-copy-3");
  });

  it("treats existing ref names as case-insensitive for collision checks", () => {
    const ref = resolveAutoFeatureBranchName(["Feature/Ticket-1"], "feature/ticket-1");
    assert.equal(ref, "feature/ticket-1-2");
  });
});

describe("resolveChangesTotals", () => {
  it("does not let an empty branchChanges hide a dirty working tree", () => {
    assert.deepInclude(
      resolveChangesTotals(
        status({
          hasWorkingTreeChanges: true,
          branchChanges: { baseRef: "main", insertions: 0, deletions: 0 },
          workingTree: {
            files: [{ path: "a.ts", insertions: 5, deletions: 1 }],
            insertions: 5,
            deletions: 1,
          },
        }),
      ),
      { insertions: 5, deletions: 1 },
    );
  });

  it("keeps non-zero branchChanges over the working tree", () => {
    assert.deepEqual(
      resolveChangesTotals(
        status({
          branchChanges: { baseRef: "origin/master", insertions: 20, deletions: 3 },
          workingTree: {
            files: [{ path: "a.ts", insertions: 1, deletions: 0 }],
            insertions: 1,
            deletions: 0,
          },
        }),
      ),
      { insertions: 20, deletions: 3, baseRef: "origin/master" },
    );
  });

  it("uses the panel's branch comparison when it has file stats", () => {
    const dirty = status({
      branchChanges: { baseRef: "main", insertions: 20, deletions: 3 },
    });
    const source = {
      id: "branch-range",
      kind: "branch-range",
      title: "Changes vs release",
      baseRef: "release",
      headRef: "feature/test",
      diff: "",
      diffHash: "hash",
      truncated: false,
    } as const;
    assert.deepEqual(
      resolveChangesTotals(dirty, {
        ...source,
        files: [
          { path: "a.ts", previousPath: null, additions: 4, deletions: 1 },
          { path: "b.ts", previousPath: null, additions: 2, deletions: 0 },
        ],
      }),
      { insertions: 6, deletions: 1, baseRef: "release" },
    );
    assert.deepEqual(resolveChangesTotals(dirty, source), {
      insertions: 20,
      deletions: 3,
      baseRef: "main",
    });
  });

  it("falls back to the working tree when branchChanges is omitted", () => {
    assert.deepInclude(
      resolveChangesTotals(
        status({
          workingTree: {
            files: [{ path: "a.ts", insertions: 2, deletions: 0 }],
            insertions: 2,
            deletions: 0,
          },
        }),
      ),
      { insertions: 2, deletions: 0 },
    );
  });
});
