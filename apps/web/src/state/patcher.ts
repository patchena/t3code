import { useSyncExternalStore } from "react";

export interface PatchState {
  readonly phase:
    | "idle"
    | "queued"
    | "preparing"
    | "ready"
    | "authorizing"
    | "installing"
    | "installed"
    | "error"
    | "cancelled";
  readonly job: string | null;
  readonly version: string | null;
  readonly message: string;
  readonly threadLink: string | null;
}

export interface PatcherBridge {
  readonly getState: () => Promise<PatchState>;
  readonly onState: (listener: (state: PatchState) => void) => () => void;
  readonly waitReady: () => Promise<boolean>;
  readonly cancel: () => Promise<void>;
  readonly retry: () => Promise<boolean>;
}

declare global {
  interface Window {
    t3codePatcher?: PatcherBridge;
  }
}

export function getPatcherBridge(): PatcherBridge | undefined {
  return window.t3codePatcher;
}

let state: PatchState | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;
let subscription = 0;

function publish(next: PatchState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const bridge = getPatcherBridge();
  if (listeners.size === 1 && bridge) {
    const current = ++subscription;
    let received = false;
    unsubscribe = bridge.onState((next) => {
      if (subscription !== current) return;
      received = true;
      publish(next);
    });
    void bridge.getState().then(
      (next) => {
        if (subscription === current && !received) publish(next);
      },
      (error: unknown) => {
        if (subscription !== current) return;
        publish({
          phase: "error",
          job: state?.job ?? null,
          version: state?.version ?? null,
          message: error instanceof Error ? error.message : String(error),
          threadLink: state?.threadLink ?? null,
        });
      },
    );
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription += 1;
      unsubscribe?.();
      unsubscribe = null;
    }
  };
}

export function usePatchState(): PatchState | null {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );
}
