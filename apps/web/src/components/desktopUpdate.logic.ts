import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";

export type DesktopUpdateButtonAction = "download" | "install" | "none";

const DEFAULT_DESKTOP_RELEASE_REPOSITORY = "pingdotgg/t3code";
const GITHUB_REPOSITORY_SEGMENT = /^[A-Za-z0-9._-]+$/u;

function isValidRepositorySegment(value: string | undefined): value is string {
  return (
    value !== undefined && value !== "." && value !== ".." && GITHUB_REPOSITORY_SEGMENT.test(value)
  );
}

function desktopReleaseRepositoryUrl(repository: string | undefined): string {
  const configuredRepository = repository?.trim() ?? "";
  const [owner, name, ...extra] = configuredRepository.split("/");
  const releaseRepository =
    isValidRepositorySegment(owner) && isValidRepositorySegment(name) && extra.length === 0
      ? configuredRepository
      : DEFAULT_DESKTOP_RELEASE_REPOSITORY;
  return `https://github.com/${releaseRepository}/releases`;
}

/** The download RPC can beat the updater's downloadedVersion event; fall back to the requested version. */
export function getDesktopUpdateDownloadedVersion(state: DesktopUpdateState): string | null {
  return state.downloadedVersion ?? state.availableVersion;
}

export function getDesktopUpdateReleaseUrl(
  version: string | null,
  repository: string | undefined = import.meta.env.T3CODE_DESKTOP_UPDATE_REPOSITORY,
): string | null {
  const normalizedVersion = version?.trim();
  if (!normalizedVersion) return null;
  return `${desktopReleaseRepositoryUrl(repository)}/tag/v${encodeURIComponent(normalizedVersion)}`;
}

export function getDesktopUpdateReleaseHistoryUrl(
  repository: string | undefined = import.meta.env.T3CODE_DESKTOP_UPDATE_REPOSITORY,
): string {
  return desktopReleaseRepositoryUrl(repository);
}

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (
    state.downloadedVersion &&
    (state.status === "downloaded" ||
      (state.status === "error" &&
        (state.errorContext === null || state.errorContext === "install")))
  ) {
    return "install";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading";
}

export function getArm64IntelBuildWarningDescription(
  state: DesktopUpdateState,
  t: TFunction<"workspace">,
): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return t(($) => $.updates.thisInstallIsUsingTheCorrectArchitecture);
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return t(($) => $.updates.thisMacHasAppleSiliconButT3CodeIs);
  }
  if (action === "install") {
    return t(($) => $.updates.thisMacHasAppleSiliconButT3CodeIsLabel);
  }
  return t(($) => $.updates.thisMacHasAppleSiliconButT3CodeIsLabelLabel);
}

export function getDesktopUpdateButtonTooltip(
  state: DesktopUpdateState,
  t: TFunction<"workspace">,
): string {
  if (
    state.notAppliedVersion !== undefined &&
    (state.status === "available" || state.status === "downloaded") &&
    getDesktopUpdateDownloadedVersion(state) === state.notAppliedVersion
  )
    return t(($) => $.updates.updateNotApplied, { version: state.notAppliedVersion });
  if (state.status === "available")
    return state.availableVersion !== null
      ? t(($) => $.updates.downloadReady, { version: state.availableVersion })
      : t(($) => $.updates.downloadReadyUnknown);
  if (state.status === "downloading")
    return typeof state.downloadPercent === "number"
      ? t(($) => $.updates.downloadingUpdatePercent, { percent: Math.floor(state.downloadPercent) })
      : t(($) => $.updates.downloadingUpdate);
  if (state.status === "downloaded") {
    const version = state.downloadedVersion ?? state.availableVersion;
    return version !== null
      ? t(($) => $.updates.downloadedVersion, { version })
      : t(($) => $.updates.downloadedUnknown);
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion)
      return t(($) => $.updates.downloadFailedVersion, { version: state.availableVersion });
    if (state.errorContext === "install" && state.downloadedVersion)
      return t(($) => $.updates.installFailedVersion, { version: state.downloadedVersion });
    if (state.downloadedVersion)
      return t(($) => $.updates.downloadedVersion, { version: state.downloadedVersion });
    return state.message ?? t(($) => $.updates.updateFailed);
  }
  return t(($) => $.updates.upToDate);
}

export function getDesktopUpdateInstallConfirmationMessage(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
  t: TFunction<"workspace">,
): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  return version
    ? t(($) => $.updates.installConfirmVersion, { version })
    : t(($) => $.updates.installConfirm);
}

export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return getDesktopUpdateActionError(result) !== null;
}

export function canCheckForUpdate(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return false;
  return (
    state.status !== "checking" && state.status !== "downloading" && state.status !== "disabled"
  );
}

/** `managedDenial` is this machine's policy refusing updates (`managedUpdatesDenial`); it wins. */
export function getDesktopUpdateDisabledReason(
  state: Pick<DesktopUpdateState, "enabled" | "status" | "message"> | null,
  t: TFunction<"workspace">,
  managedDenial?: string,
): string | null {
  if (managedDenial !== undefined) return managedDenial;
  if (!state || (state.enabled && state.status !== "disabled")) return null;
  return state.message?.trim() || t(($) => $.updates.automaticUpdatesAreNotAvailableInThisBuild);
}

export function getDesktopUpdateIdleTooltip(
  state: Pick<DesktopUpdateState, "enabled" | "status" | "message"> | null,
  t: TFunction<"workspace">,
  managedDenial?: string,
) {
  const disabledReason = getDesktopUpdateDisabledReason(state, t, managedDenial);
  return disabledReason
    ? { title: t(($) => $.updates.updatesUnavailable), detail: disabledReason }
    : { title: t(($) => $.updates.checkForUpdates), detail: null };
}
