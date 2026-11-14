import {
  executeAtomQuery,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  ProjectCloneSnapshot,
  ProjectId,
  ScopedProjectRef,
} from "@t3tools/contracts";
import { create } from "zustand";
import { useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { suggestAppAccessForRemote } from "../components/sourceControlAppAccessToast";
import { environmentProjectClonesAtom, silenceProjectCloneToasts } from "../state/projectClones";
import { projectEnvironment } from "../state/projects";
import { sourceControlEnvironment } from "../state/sourceControl";

/** Matches the server's read cap: a larger file would arrive truncated. */
export const COPYABLE_FILE_MAX_BYTES = 1024 * 1024;

/** The server lists at most this many ignored files, so one pick never exceeded it. */
export const COPIED_FILES_MAX_COUNT = 200;

const DEFAULT_COPIED_FILE_NAME = /^(?:\.env(?:\..+)?|\.envrc|\.dev\.vars)$/;

/** Env files are the ignored files people almost always want on a new machine. */
export function isDefaultCopiedFile(path: string): boolean {
  const name = path.split("/").at(-1) ?? path;
  return DEFAULT_COPIED_FILE_NAME.test(name);
}

export interface AddProjectToMachineInput {
  readonly source: { readonly environmentId: EnvironmentId; readonly cwd: string };
  /** Where the source project sits below its repository root, or "". */
  readonly subdirectory: string;
  readonly target: { readonly environmentId: EnvironmentId; readonly label: string };
  readonly projectId: ProjectId;
  readonly title: string;
  readonly remoteUrl: string;
  readonly destinationPath: string;
  readonly files: ReadonlyArray<string>;
}

function failureMessage(result: Parameters<typeof squashAtomCommandFailure>[0]): string {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves when the clone finishes, or null once it is removed. A failed or
 * cancelled clone keeps waiting, since the composer offers a retry.
 */
function waitForClone(environmentId: EnvironmentId, projectId: ProjectId) {
  return new Promise<ProjectCloneSnapshot | null>((resolve) => {
    const atom = environmentProjectClonesAtom(environmentId);
    let seen = false;
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const check = (clones: ReadonlyArray<ProjectCloneSnapshot>) => {
      if (settled) return;
      const clone = clones.find((candidate) => candidate.projectId === projectId);
      if (clone) seen = true;
      const result = clone?.phase === "done" ? clone : !clone && seen ? null : undefined;
      if (result === undefined) return;
      settled = true;
      unsubscribe?.();
      resolve(result);
    };
    unsubscribe = appAtomRegistry.subscribe(atom, check);
    check(appAtomRegistry.get(atom));
  });
}

export type ProjectFileCopy =
  | { readonly phase: "copying" }
  | { readonly phase: "failed"; readonly title: string; readonly failures: ReadonlyArray<string> };

type CopyFailure = { readonly path: string } & (
  | { readonly reason: "tooLarge" }
  | { readonly reason: "diagnostic"; readonly message: string }
);

type FileCopyState =
  | { readonly phase: "copying" }
  | {
      readonly phase: "failed";
      readonly machine: string;
      readonly failures: ReadonlyArray<CopyFailure>;
    };

/** Ignored-file copies still owed to a cloned project, keyed by its scoped project key. */
const useFileCopies = create<{ copies: Readonly<Record<string, FileCopyState>> }>(() => ({
  copies: {},
}));

function setFileCopy(key: string, copy: FileCopyState | null) {
  useFileCopies.setState(({ copies }) => {
    const { [key]: _previous, ...rest } = copies;
    return { copies: copy === null ? rest : { ...rest, [key]: copy } };
  });
}

/** The composer holds sends until the copy lands, and shows a failed copy until dismissed. */
export function useProjectFileCopy(ref: ScopedProjectRef | null): ProjectFileCopy | null {
  const { t } = useTranslation("common");
  const copy = useFileCopies((state) =>
    ref ? (state.copies[scopedProjectKey(ref)] ?? null) : null,
  );
  if (copy?.phase !== "failed") return copy;
  return {
    phase: "failed",
    title: t(($) => $.misc.machine.copyFailed, {
      count: copy.failures.length,
      machine: copy.machine,
    }),
    failures: copy.failures.map(
      (failure) =>
        `${failure.path}: ${failure.reason === "tooLarge" ? t(($) => $.misc.machine.tooLarge) : failure.message}`,
    ),
  };
}

export function dismissProjectFileCopy(ref: ScopedProjectRef) {
  setFileCopy(scopedProjectKey(ref), null);
}

/**
 * Clones onto another machine, then relays the chosen ignored files, since the
 * two servers never talk. Resolves with the cloning project once it starts; the
 * caller opens it, and its composer shows progress, so nothing toasts.
 */
export async function addProjectToMachine(
  input: AddProjectToMachineInput,
  t: TFunction<"common">,
  tWorkspace: TFunction<"workspace">,
): Promise<ProjectId> {
  // Read first, so the copy reflects the files as they were when the user asked.
  const reads = await Promise.all(
    input.files.map(async (relativePath) => {
      const result = await executeAtomQuery(
        appAtomRegistry,
        projectEnvironment.readFile({
          environmentId: input.source.environmentId,
          input: { cwd: input.source.cwd, relativePath },
        }),
        { label: t(($) => $.misc.machine.readFile), reportFailure: false, refresh: true },
      );
      if (result._tag === "Failure") return { relativePath, error: failureMessage(result) };
      if (result.value.truncated) return { relativePath, tooLarge: true };
      return { relativePath, contents: result.value.contents };
    }),
  );

  const requestedRef = { environmentId: input.target.environmentId, projectId: input.projectId };
  const requestedKey = scopedProjectKey(requestedRef);
  // Marked before the start request, since the clone list can arrive before its reply.
  silenceProjectCloneToasts(requestedRef);
  if (reads.length > 0) setFileCopy(requestedKey, { phase: "copying" });
  const started = await runAtomCommand(
    appAtomRegistry,
    sourceControlEnvironment.startProjectClone,
    {
      environmentId: input.target.environmentId,
      input: {
        projectId: input.projectId,
        title: input.title,
        createdAt: new Date().toISOString(),
        remoteUrl: input.remoteUrl,
        destinationPath: input.destinationPath,
      },
    },
    { label: t(($) => $.misc.machine.addProject), reportFailure: false },
  );
  if (started._tag === "Failure") {
    setFileCopy(requestedKey, null);
    throw new Error(failureMessage(started));
  }
  // The server clones for the existing project when one already owns the empty destination.
  const { projectId } = started.value;
  const targetRef = { environmentId: input.target.environmentId, projectId };
  const copyKey = scopedProjectKey(targetRef);
  if (projectId !== input.projectId) {
    silenceProjectCloneToasts(targetRef);
    if (reads.length > 0) {
      setFileCopy(copyKey, { phase: "copying" });
      setFileCopy(requestedKey, null);
    }
  }
  void suggestAppAccessForRemote(input.target.environmentId, input.remoteUrl, tWorkspace);
  if (reads.length === 0) return projectId;

  void (async () => {
    const clone = await waitForClone(input.target.environmentId, projectId);
    if (!clone) {
      setFileCopy(copyKey, null);
      return;
    }
    const failed: CopyFailure[] = [];
    for (const read of reads) {
      if (!("contents" in read)) {
        failed.push(
          "tooLarge" in read
            ? { path: read.relativePath, reason: "tooLarge" }
            : { path: read.relativePath, reason: "diagnostic", message: read.error },
        );
        continue;
      }
      const written = await runAtomCommand(
        appAtomRegistry,
        projectEnvironment.writeFile,
        {
          environmentId: input.target.environmentId,
          input: {
            cwd: started.value.cwd,
            relativePath: input.subdirectory
              ? `${input.subdirectory}/${read.relativePath}`
              : read.relativePath,
            contents: read.contents,
          },
        },
        { label: t(($) => $.misc.machine.copyFile), reportFailure: false },
      );
      if (written._tag === "Failure")
        failed.push({
          path: read.relativePath,
          reason: "diagnostic",
          message: failureMessage(written),
        });
    }
    setFileCopy(
      copyKey,
      failed.length === 0
        ? null
        : {
            phase: "failed",
            machine: input.target.label,
            failures: failed,
          },
    );
  })();
  return projectId;
}
