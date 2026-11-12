import { DownloadIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { RelayClientInstallProgressStage } from "@t3tools/contracts";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";

import {
  completeRelayClientInstallDialogClose,
  readRelayClientInstallDialogState,
  respondToRelayClientInstallConfirmation,
  subscribeRelayClientInstallDialog,
} from "../../cloud/relayClientInstallDialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogAction,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
const installSteps = (
  t: TFunction<"connect">,
): ReadonlyArray<{
  readonly stage: RelayClientInstallProgressStage;
  readonly label: string;
}> => [
  { stage: "checking", label: t(($) => $.install.checking) },
  { stage: "waiting_for_lock", label: t(($) => $.install.waiting) },
  { stage: "downloading", label: t(($) => $.install.downloading) },
  { stage: "verifying", label: t(($) => $.install.verifying) },
  { stage: "installing", label: t(($) => $.install.installing) },
  { stage: "validating", label: t(($) => $.install.validating) },
  { stage: "activating", label: t(($) => $.install.activating) },
];

export function RelayClientInstallDialog() {
  const { t } = useTranslation("connect");
  const steps = installSteps(t);
  const state = useSyncExternalStore(
    subscribeRelayClientInstallDialog,
    readRelayClientInstallDialogState,
    readRelayClientInstallDialogState,
  );
  const view = state.status === "closing" ? state.view : state;
  const isConfirming = view.status === "confirming";
  const isInstalling = view.status === "installing";
  const activeStepIndex = isInstalling ? steps.findIndex(({ stage }) => stage === view.stage) : -1;
  const activeStep = steps[activeStepIndex];

  return (
    <Dialog
      open={state.status === "confirming" || state.status === "installing"}
      onOpenChange={(open) => {
        if (!open && isConfirming) {
          respondToRelayClientInstallConfirmation(false);
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          completeRelayClientInstallDialogClose();
        }
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={isConfirming}>
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60">
            <DownloadIcon aria-hidden className="size-4.5 text-muted-foreground" />
          </div>
          <DialogTitle>
            {isInstalling ? t(($) => $.install.installing) : t(($) => $.install.confirm)}
          </DialogTitle>
          <DialogDescription>
            {isInstalling
              ? t(($) => $.install.progressDescription)
              : t(($) => $.install.description)}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          {isInstalling ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p aria-live="polite" className="font-medium text-foreground">
                  {activeStep?.label}
                </p>
                <p className="shrink-0 tabular-nums text-muted-foreground">
                  {t(($) => $.install.step, { current: activeStepIndex + 1, total: steps.length })}
                </p>
              </div>
              <progress
                aria-label={t(($) => $.install.progress)}
                className="h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                max={steps.length}
                value={activeStepIndex + 1}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t(($) => $.install.keepOpen)}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">{t(($) => $.install.managed)}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t(($) => $.install.version, {
                  version: view.status === "confirming" ? view.version : "",
                })}
              </p>
            </div>
          )}
        </DialogPanel>
        {isConfirming ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => respondToRelayClientInstallConfirmation(false)}
            >
              {t(($) => $.actions.cancel)}
            </Button>
            <DialogAction onClick={() => respondToRelayClientInstallConfirmation(true)}>
              {t(($) => $.install.download)}
            </DialogAction>
          </DialogFooter>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
