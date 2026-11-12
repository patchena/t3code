import { isTranslationError } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";
import { PermissionChecklist, PermissionContinueButton } from "../permissions/PermissionChecklist";
import { usePermissionStatus } from "../permissions/usePermissionStatus";
import type { BrowserImportSource } from "@t3tools/contracts";
import type { BrowserImportFailureReason } from "@t3tools/contracts";
import { ArrowDownIcon, ArrowRightIcon, CheckIcon, HardDriveIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn, randomUUID } from "~/lib/utils";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogAction,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Spinner } from "../ui/spinner";
import {
  browserImportFailureMessage,
  initialWizardStep,
  initialTargetSelection,
  canCloseWizard,
  isRetryableReason,
  formatSkippedDomains,
  fullDiskAccessRecheckStep,
  outcomeToStep,
  refreshedSourceProfileDirectory,
  refreshedSourceStep,
  resolveWizardTarget,
  type ImportOutcome,
  type WizardTarget,
  type WizardTargetProfile,
  type WizardTargetSelection,
  type WizardStep,
} from "./browserImportWizard.logic";

export type { WizardTarget } from "./browserImportWizard.logic";

const numberFormatter = new Intl.NumberFormat(
  typeof window === "undefined"
    ? undefined
    : (window.desktopBridge?.getSystemLocale() ?? undefined),
);

interface BrowserImportWizardProps {
  readonly source: BrowserImportSource;
  readonly destinationEnvironmentName: string;
  readonly targetProfiles: ReadonlyArray<WizardTargetProfile>;
  readonly canCreateProfile: boolean;
  readonly onImport: (input: {
    readonly sourceProfileDirectory: string;
    readonly target: WizardTarget;
  }) => Promise<ImportOutcome>;
  readonly onRefreshSource: () => Promise<BrowserImportSource | undefined>;
  readonly onOpenFullDiskAccessSettings: () => void | Promise<void>;
  readonly onCheckFullDiskAccess?: (() => Promise<boolean>) | undefined;
  readonly onClose: () => void;
}

export function BrowserImportWizard({
  source: initialSource,
  destinationEnvironmentName,
  targetProfiles,
  canCreateProfile,
  onImport,
  onRefreshSource,
  onOpenFullDiskAccessSettings,
  onCheckFullDiskAccess,
  onClose,
}: BrowserImportWizardProps) {
  const { t } = useTranslation("tools");
  const [source, setSource] = useState(initialSource);
  const [step, setStep] = useState<WizardStep>(() => initialWizardStep(initialSource));
  const [sourceProfileDirectory, setSourceProfileDirectory] = useState(
    () => initialSource.profiles[0]?.directory ?? "",
  );
  const [target, setTarget] = useState<WizardTargetSelection>(() =>
    initialTargetSelection(canCreateProfile, targetProfiles),
  );
  const [targetMissing, setTargetMissing] = useState(false);
  const newProfileId = useRef(`profile-${randomUUID()}`);
  // Guard synchronously so a second click's refusal cannot leave the importing step during the first write.
  const importInFlight = useRef(false);

  const runImport = () => {
    if (importInFlight.current) return;
    const chosen = resolveWizardTarget(target, newProfileId.current, targetProfiles);
    if (chosen === undefined) {
      setTargetMissing(true);
      setStep({ step: "configure" });
      return;
    }
    setTargetMissing(false);
    importInFlight.current = true;
    setStep({ step: "importing" });
    void onImport({ sourceProfileDirectory, target: chosen })
      .then((outcome) => setStep(outcomeToStep(outcome)))
      .catch((cause: unknown) => {
        if (isTranslationError(cause)) throw cause;
        setStep({ step: "blocked", reason: "readFailed" });
      })
      .finally(() => {
        importInFlight.current = false;
      });
  };

  const recheckSource = (
    check: "browser" | "fullDiskAccess",
    nextStep: (refreshed: BrowserImportSource | undefined) => WizardStep,
  ) => {
    setStep({ step: "checking", check });
    void onRefreshSource()
      .then((refreshed) => {
        if (refreshed) {
          setSource(refreshed);
          setSourceProfileDirectory((current) =>
            refreshedSourceProfileDirectory(current, refreshed),
          );
        }
        setStep(nextStep(refreshed));
      })
      .catch((cause: unknown) => {
        if (isTranslationError(cause)) throw cause;
        setStep({ step: "blocked", reason: "readFailed" });
      });
  };
  const recheckAfterQuit = () => recheckSource("browser", refreshedSourceStep);
  const recheckFullDiskAccess = () => recheckSource("fullDiskAccess", fullDiskAccessRecheckStep);

  return (
    <Dialog open onOpenChange={(open) => (open || !canCloseWizard(step) ? undefined : onClose())}>
      <DialogPopup className="max-w-lg" showCloseButton={canCloseWizard(step)}>
        {step.step === "quit" ? (
          <QuitStep source={source} onCancel={onClose} onRechecked={recheckAfterQuit} />
        ) : step.step === "fullDiskAccess" ? (
          <FullDiskAccessStep
            source={source}
            onCancel={onClose}
            onOpenSettings={onOpenFullDiskAccessSettings}
            onCheck={
              onCheckFullDiskAccess ??
              (async () => {
                const refreshed = await onRefreshSource();
                return refreshed !== undefined && refreshed.unavailable === undefined;
              })
            }
            onGranted={step.resume === "import" ? runImport : recheckFullDiskAccess}
            stillRequired={step.checked === true}
          />
        ) : step.step === "importing" ? (
          <ImportingStep />
        ) : step.step === "checking" ? (
          <CheckingStep sourceName={source.name} check={step.check} />
        ) : step.step === "done" ? (
          <DoneStep
            {...step}
            destinationEnvironmentName={destinationEnvironmentName}
            onClose={onClose}
          />
        ) : step.step === "blocked" ? (
          <BlockedStep
            source={source}
            reason={step.reason}
            message={step.message}
            onClose={onClose}
            onRetry={
              step.message === undefined && isRetryableReason(step.reason) ? runImport : undefined
            }
          />
        ) : (
          <ConfigureStep
            source={source}
            destinationEnvironmentName={destinationEnvironmentName}
            targetProfiles={targetProfiles}
            canCreateProfile={canCreateProfile}
            sourceProfileDirectory={sourceProfileDirectory}
            onSourceProfileChange={setSourceProfileDirectory}
            target={target}
            onTargetChange={(selection) => {
              setTarget(selection);
              setTargetMissing(false);
            }}
            targetError={targetMissing ? t(($) => $.browserImport.profileMissing) : undefined}
            onCancel={onClose}
            onImport={runImport}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function QuitStep({
  source,
  onCancel,
  onRechecked,
}: {
  readonly source: BrowserImportSource;
  readonly onCancel: () => void;
  readonly onRechecked: () => void;
}) {
  const { t } = useTranslation("tools");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(($) => $.browserImport.quitTitle, { source: source.name })}</DialogTitle>
        <DialogDescription>
          {t(($) => $.browserImport.quitDescription, { source: source.name })}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t(($) => $.browserImport.cancel)}
        </Button>
        <DialogAction onClick={onRechecked}>{t(($) => $.browserImport.quitConfirmed)}</DialogAction>
      </DialogFooter>
    </>
  );
}

type ConfigureStepProps = {
  readonly source: BrowserImportSource;
  readonly destinationEnvironmentName: string;
  readonly targetProfiles: ReadonlyArray<WizardTargetProfile>;
  readonly canCreateProfile: boolean;
  readonly sourceProfileDirectory: string;
  readonly onSourceProfileChange: (directory: string) => void;
  readonly target: WizardTargetSelection;
  readonly targetError: string | undefined;
  readonly onTargetChange: (target: WizardTargetSelection) => void;
  readonly onCancel: () => void;
  readonly onImport: () => void;
};

function FullDiskAccessStep({
  source,
  onCancel,
  onOpenSettings,
  onGranted,
  stillRequired,
  onCheck,
}: {
  readonly source: BrowserImportSource;
  readonly onCancel: () => void;
  readonly onOpenSettings: () => void | Promise<void>;
  readonly onCheck: () => Promise<boolean>;
  readonly onGranted: () => void;
  readonly stillRequired: boolean;
}) {
  const { t } = useTranslation("tools");
  const [opening, setOpening] = useState(false);
  const [openingFailed, setOpeningFailed] = useState(false);
  const permission = usePermissionStatus(async () => ({ fullDiskAccess: await onCheck() }), {
    fullDiskAccess: false,
  });
  const allow = () => {
    if (opening) return;
    setOpening(true);
    setOpeningFailed(false);
    void Promise.resolve()
      .then(onOpenSettings)
      .catch((cause: unknown) => {
        if (isTranslationError(cause)) throw cause;
        setOpeningFailed(true);
      })
      .finally(() => setOpening(false));
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(($) => $.browserImport.diskAccessTitle, { source: source.name })}
        </DialogTitle>
        <DialogDescription>
          {t(($) => $.browserImport.diskAccessDescription, { source: source.name })}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <PermissionChecklist
          busy={opening}
          permissions={[
            {
              id: "fullDiskAccess",
              icon: (
                <HardDriveIcon
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ),
              title: t(($) => $.browserImport.fullDiskAccess),
              description: t(($) => $.browserImport.readCookies, { source: source.name }),
              granted: permission.status.fullDiskAccess,
              onAllow: () => void allow(),
            },
          ]}
        />
        {openingFailed || permission.error ? (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            {openingFailed ? t(($) => $.browserImport.settingsOpenFailed) : permission.error}
          </p>
        ) : null}
        {!permission.isReady(["fullDiskAccess"]) ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {stillRequired
              ? t(($) => $.browserImport.accessStillRequired)
              : t(($) => $.browserImport.accessNotUpdated)}
          </p>
        ) : null}
      </DialogPanel>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t(($) => $.browserImport.cancel)}
        </Button>
        <PermissionContinueButton
          ready={permission.isReady(["fullDiskAccess"])}
          busy={opening}
          onClick={onGranted}
        >
          {t(($) => $.browserImport.continue)}
        </PermissionContinueButton>
      </DialogFooter>
    </>
  );
}
function ConfigureStep({
  source,
  destinationEnvironmentName,
  targetProfiles,
  canCreateProfile,
  sourceProfileDirectory,
  onSourceProfileChange,
  target,
  targetError,
  onTargetChange,
  onCancel,
  onImport,
}: ConfigureStepProps) {
  const { t } = useTranslation("tools");
  const targetMissing =
    target.kind === "existing" &&
    !targetProfiles.some((profile) => profile.id === target.profileId);
  const targetUncreatable = target.kind === "new" && !canCreateProfile;
  const targetFeedback =
    targetError ??
    (targetMissing
      ? t(($) => $.browserImport.profileMissing)
      : targetUncreatable
        ? t(($) => $.browserImport.profileLimit)
        : undefined);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(($) => $.browserImport.configureTitle, { source: source.name })}
        </DialogTitle>
        <DialogDescription>
          {t(($) => $.browserImport.configureDescription, {
            environment: destinationEnvironmentName,
          })}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <section className="flex-1 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(($) => $.browserImport.from)}
            </p>
            {source.profiles.map((profile) => (
              <SelectableTile
                key={profile.directory}
                selected={sourceProfileDirectory === profile.directory}
                title={profile.name}
                subtitle={
                  profile.cookieCount === undefined
                    ? undefined
                    : profile.cookieCount === 0
                      ? t(($) => $.browserImport.noCookies)
                      : t(($) => $.browserImport.cookies, {
                          count: profile.cookieCount,
                          amount: numberFormatter.format(profile.cookieCount),
                        })
                }
                onSelect={() => onSourceProfileChange(profile.directory)}
              />
            ))}
          </section>
          <div className="flex shrink-0 items-center justify-center text-muted-foreground">
            <ArrowDownIcon className="size-4 sm:hidden" />
            <ArrowRightIcon className="hidden size-4 sm:block" />
          </div>
          <section className="flex-1 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(($) => $.browserImport.into)}
            </p>
            {canCreateProfile ? (
              <SelectableTile
                selected={target.kind === "new"}
                title={t(($) => $.browserImport.newProfile)}
                subtitle={t(($) => $.browserImport.newProfileDescription)}
                onSelect={() => onTargetChange({ kind: "new" })}
              />
            ) : null}
            {targetProfiles.map((profile) => (
              <SelectableTile
                key={profile.id}
                selected={target.kind === "existing" && target.profileId === profile.id}
                title={profile.name}
                subtitle={t(($) => $.browserImport.existingProfile)}
                onSelect={() => onTargetChange({ kind: "existing", profileId: profile.id })}
              />
            ))}
          </section>
        </div>
        {targetFeedback ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {targetFeedback}
          </p>
        ) : null}
      </DialogPanel>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t(($) => $.browserImport.cancel)}
        </Button>
        <Button
          disabled={sourceProfileDirectory === "" || targetMissing || targetUncreatable}
          onClick={onImport}
        >
          {t(($) => $.browserImport.import)}
        </Button>
      </DialogFooter>
    </>
  );
}

function SelectableTile({
  selected,
  title,
  subtitle,
  onSelect,
}: {
  readonly selected: boolean;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selected
          ? "border-primary bg-primary/8"
          : "border-border/60 hover:border-border hover:bg-muted/40",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs tabular-nums text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {selected ? <CheckIcon className="size-2.5" /> : null}
      </span>
    </button>
  );
}

function ImportingStep() {
  const { t } = useTranslation("tools");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(($) => $.browserImport.importingTitle)}</DialogTitle>
        <DialogDescription>{t(($) => $.browserImport.moment)}</DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex items-center gap-3 py-2">
          <Spinner size="md" tone="muted" />
          <span className="text-sm text-muted-foreground">
            {t(($) => $.browserImport.importing)}
          </span>
        </div>
      </DialogPanel>
    </>
  );
}

function CheckingStep({
  sourceName,
  check,
}: {
  readonly sourceName: string;
  readonly check: "browser" | "fullDiskAccess";
}) {
  const { t } = useTranslation("tools");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(($) => $.browserImport.checkingTitle, { source: sourceName })}</DialogTitle>
        <DialogDescription>
          {check === "fullDiskAccess"
            ? t(($) => $.browserImport.checkingDiskAccess)
            : t(($) => $.browserImport.checkingClosed)}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex items-center gap-3 py-2">
          <Spinner size="md" tone="muted" />
          <span className="text-sm text-muted-foreground">
            {check === "fullDiskAccess"
              ? t(($) => $.browserImport.checkingAccess)
              : t(($) => $.browserImport.checking)}
          </span>
        </div>
      </DialogPanel>
    </>
  );
}

function DoneStep({
  imported,
  skipped,
  skippedDomains,
  targetName,
  destinationEnvironmentName,
  onClose,
}: {
  readonly imported: number;
  readonly skipped: number;
  readonly skippedDomains: ReadonlyArray<string>;
  readonly targetName: string;
  readonly destinationEnvironmentName: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation("tools");
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {imported > 0
            ? t(($) => $.browserImport.imported, {
                count: imported,
                amount: numberFormatter.format(imported),
              })
            : skipped > 0
              ? t(($) => $.browserImport.skippedCount, {
                  count: skipped,
                  amount: numberFormatter.format(skipped),
                })
              : t(($) => $.browserImport.noCookiesFound)}
        </DialogTitle>
        <DialogDescription>
          {imported > 0
            ? skipped > 0
              ? t(($) => $.browserImport.addedWithSkipped, {
                  profile: targetName,
                  environment: destinationEnvironmentName,
                  count: skipped,
                  amount: numberFormatter.format(skipped),
                })
              : t(($) => $.browserImport.added, {
                  profile: targetName,
                  environment: destinationEnvironmentName,
                })
            : skipped > 0
              ? t(($) => $.browserImport.noneImported, { environment: destinationEnvironmentName })
              : t(($) => $.browserImport.noneToImport, { environment: destinationEnvironmentName })}
        </DialogDescription>
      </DialogHeader>
      {skippedDomains.length > 0 ? (
        <DialogPanel>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(($) => $.browserImport.skipped)}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {formatSkippedDomains(skippedDomains, t, numberFormatter.format)}
          </p>
        </DialogPanel>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button />} onClick={onClose}>
          {t(($) => $.browserImport.done)}
        </DialogClose>
      </DialogFooter>
    </>
  );
}

function BlockedStep({
  source,
  reason,
  message,
  onClose,
  onRetry,
}: {
  readonly source: BrowserImportSource;
  readonly reason: BrowserImportFailureReason;
  readonly message: string | undefined;
  readonly onClose: () => void;
  readonly onRetry: (() => void) | undefined;
}) {
  const { t } = useTranslation("tools");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(($) => $.browserImport.blockedTitle, { source: source.name })}</DialogTitle>
        <DialogDescription>{message ?? browserImportFailureMessage(reason, t)}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t(($) => $.browserImport.close)}
        </Button>
        {onRetry ? (
          <DialogAction onClick={onRetry}>{t(($) => $.browserImport.tryAgain)}</DialogAction>
        ) : null}
      </DialogFooter>
    </>
  );
}
