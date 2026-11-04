import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { parseThreadLinkHref } from "@t3tools/shared/threadLinks";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { getPatcherBridge, type PatchState } from "~/state/patcher";

export function SidebarPatchCapsule({
  state,
  onInstall,
}: {
  readonly state: PatchState;
  readonly onInstall: () => Promise<void>;
}) {
  const { t } = useTranslation("workspace");
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const failed = state.phase === "error";
  const canPostpone = ["queued", "preparing", "ready"].includes(state.phase);
  const canInstall = state.phase === "ready";
  const canRetry = failed || state.phase === "cancelled";
  const label = {
    idle: t(($) => $.updates.updateAvailable),
    queued: t(($) => $.updates.patchQueued),
    preparing: t(($) => $.updates.patchPreparing),
    ready: t(($) => $.updates.patchReady),
    authorizing: t(($) => $.updates.patchAuthorizing),
    installing: t(($) => $.updates.patchInstalling),
    installed: t(($) => $.updates.patchInstalled),
    error: t(($) => $.updates.patchFailed),
    cancelled: t(($) => $.updates.patchPostponed),
  }[state.phase];

  const act = async (action: () => Promise<void>, exclusive = false) => {
    if (exclusive && pending) return;
    if (exclusive) setPending(true);
    const result = await settlePromise(action);
    if (exclusive) setPending(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t(($) => $.updates.patchActionFailed),
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const threadLink = state.threadLink;
  const openThread = (href: string) =>
    act(async () => {
      const link = parseThreadLinkHref(href);
      if (link === null || link.environmentId === null) {
        throw new Error(t(($) => $.updates.patchThreadInvalid));
      }
      await navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: link.environmentId, threadId: link.threadId },
      });
    });

  return (
    <Popover>
      <div
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center rounded-full bg-sidebar-control-surface text-sidebar-foreground",
          failed && "text-destructive",
        )}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={label}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full py-1.5 pl-3 outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset"
            />
          }
        >
          {failed ? (
            <TriangleAlertIcon className="size-3.5 shrink-0" />
          ) : (
            <PackageCheckIcon className="size-3.5 shrink-0" />
          )}
          <span aria-live="polite" className="truncate text-xs">
            {label}
          </span>
        </PopoverTrigger>
        {threadLink === null ? null : (
          <button
            type="button"
            onClick={() => void openThread(threadLink)}
            className="shrink-0 cursor-pointer px-3 text-xs underline underline-offset-3"
          >
            {t(($) => $.updates.patchThread)}
          </button>
        )}
      </div>
      <PopoverPopup side="top" align="end" padding="compact" width="sm">
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{label}</span>
            {state.version ? (
              <span className="text-muted-foreground tabular-nums">{state.version}</span>
            ) : null}
          </div>
          {state.message ? (
            <p
              className={cn(
                "whitespace-pre-wrap",
                failed ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {state.message}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {canPostpone ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void act(async () => {
                    const bridge = getPatcherBridge();
                    if (!bridge) throw new Error(t(($) => $.updates.patchUnavailable));
                    await bridge.cancel();
                  })
                }
              >
                {t(($) => $.updates.later)}
              </Button>
            ) : null}
            {canInstall ? (
              <Button size="sm" disabled={pending} onClick={() => void act(onInstall, true)}>
                {t(($) => $.updates.patchInstall)}
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  void act(async () => {
                    const bridge = getPatcherBridge();
                    if (!bridge) throw new Error(t(($) => $.updates.patchUnavailable));
                    if (await bridge.retry()) await onInstall();
                  }, true)
                }
              >
                {t(($) => $.updates.retry)}
              </Button>
            ) : null}
            {threadLink === null ? null : (
              <Button size="sm" variant="outline" onClick={() => void openThread(threadLink)}>
                {t(($) => $.updates.openThread)}
              </Button>
            )}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
