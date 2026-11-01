import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";
import type { TFunction } from "@t3tools/client-runtime/i18n";

export type ThreadSyncPhase = "loading" | "syncing";

export function resolveThreadSyncPhase(input: {
  readonly detailExists: boolean;
  readonly shellExists: boolean;
  readonly status: EnvironmentThreadStatus;
}): ThreadSyncPhase | null {
  if (!input.shellExists) {
    return null;
  }

  switch (input.status) {
    case "empty":
    case "cached":
    case "synchronizing":
      return input.detailExists ? "syncing" : "loading";
    case "deleted":
    case "live":
      return null;
  }
}

export function threadSyncLabel(phase: ThreadSyncPhase, t: TFunction<"chat">): string {
  return phase === "loading"
    ? t(($) => $.thread.loadingMessages)
    : t(($) => $.thread.syncingMessages);
}
