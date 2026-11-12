import { downloadLocalUpdate, installLocalUpdate } from "~/components/desktopUpdate.actions";
import { useTranslation } from "react-i18next";
import type { SettingsTranslation } from "~/components/settings/settingsSearch";
import {
  persistClientSettingsUpdate,
  useClientSettings,
  useClientSettingsHydrated,
} from "~/hooks/useSettings";
import { useAtomValue } from "@effect/atom-react";
import { NotificationSettings } from "~/components/settings/NotificationSettings";
import { PRIVACY_POLICY_URL } from "~/legalLinks";
import { CheckIcon } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  type DesktopUpdateChannel,
  IDLE_COMPACTION_MODES,
  globalIdleCompaction,
  managedUpdatesDenial,
  managedUpdatesMessage,
  ProviderDriverKind,
  type ProviderInstanceId,
  type SidebarProjectGroupingMode,
} from "@t3tools/contracts";
import {
  DEFAULT_UNIFIED_SETTINGS,
  InterfaceLanguage,
  type DiffLayout,
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  type ResponseStreamingMode,
  type QuitConfirmationMode,
  SidebarProjectSortOrder,
} from "@t3tools/contracts/settings";
import { desktopUpdateChannelOf } from "@t3tools/shared/cliRelease";
import { createModelSelection } from "@t3tools/shared/model";
import { resolvePastedPath } from "@t3tools/shared/path";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import { APP_VERSION, HOSTED_APP_CHANNEL, HOSTED_APP_CHANNEL_LABEL } from "~/branding";
import { AboutVersionTitle } from "~/components/settings/AboutVersionTitle";
import { CliCommandSettingsRow } from "~/components/settings/CliCommandSettingsRow";
import { MobileAppSettingsRow } from "~/components/settings/MobileAppSettingsRow";
import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateDisabledReason,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
} from "~/components/desktopUpdate.logic";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { TraitsPicker } from "~/components/chat/TraitsPicker";
import { isElectron } from "~/env";
import { buildHostedChannelSelectionUrl, type HostedAppChannel } from "~/hostedPairing";
import {
  readAppearanceModePreference,
  readThemeHalves,
  readThemePreference,
  useTheme,
} from "~/hooks/useTheme";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "~/components/settings/useScopedSettings";
import { useScopedModelDisabledReason } from "~/components/settings/useScopedModelAvailability";
import {
  useOptionalSettingsScope,
  useSettingsScope,
} from "~/components/settings/SettingsScopeContext";
import { scopedIdleCompaction } from "~/components/settings/scopedSettings";
import { ProjectDefaultsSettings } from "~/components/settings/ProjectDefaultsSettings";
import { ThreadTitleInstructionsSettings } from "~/components/settings/ThreadTitleInstructionsSettings";
import { SnoozePresetsRow } from "~/components/settings/SnoozePresetsSettings";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import { managedTelemetryOffMessage, usePrimaryManagedPolicy } from "~/state/managedPolicy";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
  selectsPlanAgent,
} from "~/modelSelection";
import { providerInstanceEntriesFor } from "~/providerInstances";
import { ensureLocalApi, readLocalApi } from "~/localApi";
import { isMacPlatform } from "~/lib/utils";
import { useEnvironmentProviders, useEnvironments } from "~/state/environments";
import { EMPTY_SERVER_PROVIDERS } from "~/state/server";
import { Button } from "~/components/ui/button";
import { DraftInput } from "~/components/ui/draft-input";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { ScopedSwitch } from "~/components/settings/ScopedSwitch";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  getChangedBrowserSettingLabels,
  getChangedTypographySettingLabels,
  hasChangedBackgroundActivitySettings,
  isProjectGroupingEnabled,
  projectGroupingModeFromToggle,
  readLastEnabledProjectGroupingMode,
  rememberEnabledProjectGroupingMode,
} from "~/components/settings/SettingsPanels.logic";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";
import { searchableSetting } from "~/components/settings/settingsSearch";
import { BackgroundActivitySettingsRow } from "~/components/settings/BackgroundActivitySettings";
import { AdvancedSettings } from "~/components/settings/AdvancedSettings";
import { PullRequestLinksOpenInAppSetting } from "~/components/settings/IntegrationsSettings";
import { StorageCleanupSections } from "~/components/settings/StorageSettings";
import { UpdateTrackSwitchDialog } from "~/components/settings/UpdateTrackSwitchDialog";
import { environmentIdsKey } from "~/state/environmentAtomList";
import { environmentSessionStatesAtom } from "~/state/session";
import { canUpdateServer } from "~/components/ServerUpdateAction";
import { useUpdateEverythingRun } from "~/components/sidebar/updateEverythingRun";
import { awaitsTrackSwitch, channelSwitchLabel } from "~/components/sidebar/updateEverything.logic";
import { isHostedByThisApp } from "~/components/sidebar/useUpdateEverything";

function responseStreamingModeLabels(
  t: SettingsTranslation,
): Record<ResponseStreamingMode, string> {
  return {
    turn: t(($) => $.panels.waitForTheFullResponse),
    paragraph: t(($) => $.panels.showFinishedParagraphs),
  };
}

function responseStreamingModeDescriptions(
  t: SettingsTranslation,
): Record<ResponseStreamingMode, string> {
  return {
    turn: t(($) => $.panels.textAppearsOnceTheAgentFinishesItsTurn),
    paragraph: t(($) => $.panels.eachParagraphOrCodeBlockAppearsAsSoon),
  };
}

function sidebarProjectSortOrderLabels(
  t: SettingsTranslation,
): Record<SidebarProjectSortOrder, string> {
  return {
    updated_at: t(($) => $.panels.lastUserMessage),
    created_at: t(($) => $.panels.createdAt),
    manual: t(($) => $.panels.manual),
  };
}
const isSidebarProjectSortOrder = Schema.is(SidebarProjectSortOrder);

function timestampFormatLabels(t: SettingsTranslation) {
  return {
    locale: t(($) => $.panels.systemDefault),
    "12-hour": t(($) => $.panels.twelveHour),
    "24-hour": t(($) => $.panels.twentyFourHour),
  } as const;
}

function diffLayoutLabels(t: SettingsTranslation): Record<DiffLayout, string> {
  return {
    stacked: t(($) => $.panels.stacked),
    split: t(($) => $.panels.split),
  };
}

function quitConfirmationModeLabels(t: SettingsTranslation): Record<QuitConfirmationMode, string> {
  return {
    direct: t(($) => $.panels.direct),
    hold: t(($) => $.panels.hold),
    "double-click": t(($) => $.panels.doublePress),
  };
}

const DEFAULT_DRIVER_KIND = ProviderDriverKind.make("codex");
function AboutVersionSection() {
  const { t } = useTranslation("settings");
  const { t: tWorkspace } = useTranslation("workspace");
  const updateState = useDesktopUpdateState();
  const [switchChannel, setSwitchChannel] = useState<DesktopUpdateChannel | null>(null);
  const [isUpdateActionPending, setIsUpdateActionPending] = useState(false);
  const { environments } = useEnvironments();
  const sessionStates = useAtomValue(
    environmentSessionStatesAtom(
      environmentIdsKey(environments.map(({ environmentId }) => environmentId)),
    ),
  );
  // A second run would replace the first run's progress and local download.
  const updateRun = useUpdateEverythingRun();

  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.desktopBridge);
  const selectedUpdateChannel = updateState?.channel ?? "latest";
  // The desktop updates this machine, whose policy the primary environment reports.
  const primaryPolicy = usePrimaryManagedPolicy();
  const updatesDenial = hasDesktopBridge ? managedUpdatesDenial(primaryPolicy) : undefined;
  const nightlyDeniedBy =
    hasDesktopBridge && primaryPolicy?.limits?.updates?.allowNightly === false
      ? primaryPolicy.organization
      : undefined;
  const selectedHostedAppChannel = hasDesktopBridge ? null : HOSTED_APP_CHANNEL;
  // A switch that failed part way leaves this app or a server on the other track.
  // With its updater off, a switch cannot move this app, so it is not counted.
  const appOffTrack =
    updateState?.enabled !== false && desktopUpdateChannelOf(APP_VERSION) !== selectedUpdateChannel;
  const unswitchedMachines =
    (appOffTrack ? 1 : 0) +
    environments.filter(
      (environment, index) =>
        environment.connection.phase === "connected" &&
        canUpdateServer(sessionStates[index]!) &&
        awaitsTrackSwitch(
          {
            serverConfig: environment.serverConfig,
            hostedByThisApp: isHostedByThisApp(environment),
          },
          selectedUpdateChannel,
        ),
    ).length;

  const handleButtonClick = async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;

    const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";

    if (action === "download") {
      if (isUpdateActionPending) return;
      setIsUpdateActionPending(true);
      void downloadLocalUpdate(bridge, { notifyDownloaded: true }, tWorkspace).finally(() =>
        setIsUpdateActionPending(false),
      );
      return;
    }

    if (action === "install") {
      if (isUpdateActionPending) return;
      setIsUpdateActionPending(true);
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(
            updateState ?? { availableVersion: null, downloadedVersion: null },
            tWorkspace,
          ),
        );
      } catch (error) {
        setIsUpdateActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t(($) => $.panels.couldNotConfirmUpdate),
            description:
              error instanceof Error ? error.message : t(($) => $.panels.updateConfirmationFailed),
          }),
        );
        return;
      }
      if (!confirmed) {
        setIsUpdateActionPending(false);
        return;
      }
      void installLocalUpdate(bridge, tWorkspace).finally(() => setIsUpdateActionPending(false));
      return;
    }

    if (typeof bridge.checkForUpdate !== "function") return;
    void bridge
      .checkForUpdate()
      .then((result) => {
        if (!result.checked) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t(($) => $.panels.couldNotCheckForUpdates),
              description:
                updatesDenial ??
                result.state.message ??
                t(($) => $.panels.automaticUpdatesAreNotAvailableInThisBuild),
            }),
          );
        }
      })
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t(($) => $.panels.couldNotCheckForUpdates),
            description:
              error instanceof Error ? error.message : t(($) => $.panels.updateCheckFailed),
          }),
        );
      });
  };

  const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";
  const buttonTooltip = updateState ? getDesktopUpdateButtonTooltip(updateState, tWorkspace) : null;
  const buttonDisabled =
    action === "none"
      ? !canCheckForUpdate(updateState)
      : isDesktopUpdateButtonDisabled(updateState);

  const actionLabel: Record<string, string> = {
    download: t(($) => $.panels.download),
    install: t(($) => $.panels.install),
  };
  const statusLabel: Record<string, string> = {
    checking: t(($) => $.panels.checking),
    downloading: t(($) => $.panels.downloading),
    // Off its track, "up to date" only means no switch is pending; Review moves it.
    ...(appOffTrack ? {} : { "up-to-date": t(($) => $.panels.upToDateLabel) }),
  };
  const buttonLabel =
    actionLabel[action] ??
    statusLabel[updateState?.status ?? ""] ??
    t(($) => $.panels.checkForUpdates);
  const description =
    action === "download" || action === "install"
      ? t(($) => $.panels.updateAvailable)
      : (getDesktopUpdateDisabledReason(updateState, tWorkspace, updatesDenial) ??
        t(($) => $.panels.currentVersionOfTheApplication));

  return (
    <>
      <SettingsRow
        id={searchableSetting("app-version", t).id}
        title={<AboutVersionTitle />}
        description={description}
        managed={updatesDenial}
        control={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={buttonDisabled || isUpdateActionPending}
                  onClick={handleButtonClick}
                >
                  {buttonLabel}
                </Button>
              }
            />
            {buttonTooltip ? <TooltipPopup>{buttonTooltip}</TooltipPopup> : null}
          </Tooltip>
        }
      />
      {hasDesktopBridge ? (
        <SettingsRow
          {...searchableSetting("update-track", t)}
          description={
            nightlyDeniedBy !== undefined ? (
              selectedUpdateChannel === "nightly" ? (
                t(($) => $.panels.nightlyDeniedSwitchToStable, {
                  message: managedUpdatesMessage(nightlyDeniedBy),
                })
              ) : (
                t(($) => $.panels.nightlyDenied, {
                  message: managedUpdatesMessage(nightlyDeniedBy),
                })
              )
            ) : unswitchedMachines > 0 ? (
              <>
                {t(($) => $.panels.pendingMachines, {
                  count: unswitchedMachines,
                  channel: channelSwitchLabel(
                    selectedUpdateChannel === "nightly" ? "latest" : "nightly",
                    tWorkspace,
                  ),
                })}{" "}
                {/* The dialog moves what it can and says why it skips the rest. */}
                <Button
                  size="xs"
                  variant="link"
                  disabled={updateRun !== null}
                  onClick={() => setSwitchChannel(selectedUpdateChannel)}
                >
                  {t(($) => $.panels.review)}
                </Button>
              </>
            ) : (
              t(($) => $.panels.switchesThisAppAndEveryConnectedMachineWhose)
            )
          }
          managed={updatesDenial}
          control={
            <Select
              value={selectedUpdateChannel}
              onValueChange={(value) => {
                if (value !== selectedUpdateChannel) {
                  setSwitchChannel(value as DesktopUpdateChannel);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t(($) => $.panels.updateTrack)}
                disabled={switchChannel !== null || updateRun !== null}
              >
                <SelectValue>{channelSwitchLabel(selectedUpdateChannel, tWorkspace)}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  {t(($) => $.panels.stable)}
                </SelectItem>
                <SelectItem
                  hideIndicator
                  value="nightly"
                  disabled={nightlyDeniedBy !== undefined && selectedUpdateChannel !== "nightly"}
                >
                  {t(($) => $.panels.nightly)}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : selectedHostedAppChannel ? (
        <SettingsRow
          {...searchableSetting("update-track", t)}
          description={t(($) => $.panels.switchesTheHostedAppReleaseChannel)}
          control={
            <Select
              value={selectedHostedAppChannel}
              onValueChange={(value) => {
                if (value === selectedHostedAppChannel) return;
                window.location.assign(
                  buildHostedChannelSelectionUrl({ channel: value as HostedAppChannel }),
                );
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t(($) => $.panels.updateTrack)}
              >
                <SelectValue>{HOSTED_APP_CHANNEL_LABEL}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  {t(($) => $.panels.latest)}
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  {t(($) => $.panels.nightly)}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
      {hasDesktopBridge ? <CliCommandSettingsRow /> : null}
      {switchChannel === null ? null : (
        <UpdateTrackSwitchDialog channel={switchChannel} onClose={() => setSwitchChannel(null)} />
      )}
    </>
  );
}

export function useSettingsRestore(onRestored?: () => void) {
  const { t } = useTranslation("settings");
  const {
    theme,
    setTheme,
    followSystem,
    setFollowSystem,
    setThemeHalf,
    clearThemeHalves,
    themeHalves,
  } = useTheme();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const isBackgroundActivityDirty = hasChangedBackgroundActivitySettings(settings);

  const changedSettingLabels = [
    ...(settings.interfaceLanguage !== DEFAULT_UNIFIED_SETTINGS.interfaceLanguage
      ? [t(($) => $.search.interfaceLanguage)]
      : []),
    ...(theme !== "system" ? [t(($) => $.panels.theme)] : []),
    ...(!followSystem ? [t(($) => $.panels.followSystem)] : []),
    ...(themeHalves !== null ? [t(($) => $.panels.themeMix)] : []),
    ...(settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast
      ? [t(($) => $.panels.contrast)]
      : []),
    ...(settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity
      ? [t(($) => $.panels.glassOpacity)]
      : []),
    ...(settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme
      ? [t(($) => $.panels.diffColors)]
      : []),
    ...(settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth
      ? [t(($) => $.panels.chatWidth)]
      : []),
    ...(settings.effortDisplay !== DEFAULT_UNIFIED_SETTINGS.effortDisplay
      ? [t(($) => $.panels.effortDisplay)]
      : []),
    ...(settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled
      ? [t(($) => $.panels.renderMath)]
      : []),
    ...(settings.panelAnimationDurationMs !== DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs
      ? [t(($) => $.panels.panelAnimations)]
      : []),
    ...(settings.environmentIdentificationMode !==
    DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode
      ? [t(($) => $.panels.environmentIdentification)]
      : []),
    ...(settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat
      ? [t(($) => $.panels.timeFormat)]
      : []),
    ...(settings.notificationMode !== DEFAULT_UNIFIED_SETTINGS.notificationMode
      ? [t(($) => $.panels.threadNotifications)]
      : []),
    ...(settings.inAppNotificationsEnabled !== DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled
      ? [t(($) => $.panels.inAppNotifications)]
      : []),
    ...(settings.sidebarProjectGroupingMode !== DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode
      ? [t(($) => $.panels.projectGrouping)]
      : []),
    ...(settings.sidebarProjectSortOrder !== DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder
      ? [t(($) => $.panels.projectOrder)]
      : []),
    ...(settings.sidebarWorkingShelfEnabled !== DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled
      ? [t(($) => $.panels.workingSection)]
      : []),
    ...(settings.sidebarAutoSettleAfterDays !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays
      ? [t(($) => $.panels.autoSettleInactiveThreads)]
      : []),
    ...(settings.sidebarAutoSettleKeepPullRequests !==
    DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleKeepPullRequests
      ? [t(($) => $.panels.keepThreadsWithAPR)]
      : []),
    ...(settings.sidebarAutoSettleOnMerge !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge
      ? [t(($) => $.panels.autoSettleMergedThreads)]
      : []),
    ...(settings.autoResumeLimitedThreads !== DEFAULT_UNIFIED_SETTINGS.autoResumeLimitedThreads
      ? [t(($) => $.panels.resumeAfterUsageLimits)]
      : []),
    ...(settings.snoozeLimitedThreads !== DEFAULT_UNIFIED_SETTINGS.snoozeLimitedThreads
      ? [t(($) => $.panels.snoozeUntilLimitsReset)]
      : []),
    ...(!Equal.equals(settings.snoozePresets, DEFAULT_UNIFIED_SETTINGS.snoozePresets)
      ? [t(($) => $.panels.snoozeOptions)]
      : []),
    ...(settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap
      ? [t(($) => $.panels.wordWrap)]
      : []),
    ...(settings.persistComposerContextStrip !==
    DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip
      ? [t(($) => $.panels.composerContext)]
      : []),
    ...getChangedTypographySettingLabels(settings, t),
    ...(settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed
      ? [t(($) => $.panels.defaultDiffFileState)]
      : []),
    ...(settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace
      ? [t(($) => $.panels.diffWhitespaceChanges)]
      : []),
    ...(settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout
      ? [t(($) => $.panels.diffLayout)]
      : []),
    ...(settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled
      ? [t(($) => $.panels.proactivePanels)]
      : []),
    ...(settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu
      ? [t(($) => $.panels.showSkillsInSlashMenu)]
      : []),
    ...(settings.composerRichTextEnabled !== DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled
      ? [t(($) => $.panels.richTextComposer)]
      : []),
    ...(settings.composerSpellCheckEnabled !== DEFAULT_UNIFIED_SETTINGS.composerSpellCheckEnabled
      ? [t(($) => $.panels.composerSpellCheck)]
      : []),
    ...(settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut
      ? [t(($) => $.panels.sendShortcut)]
      : []),
    ...(settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior
      ? [t(($) => $.panels.followUpBehavior)]
      : []),
    ...(settings.contextWindowMeterEnabled !== DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled
      ? [t(($) => $.panels.contextWindowIndicator)]
      : []),
    ...(settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode
      ? [t(($) => $.panels.responseStreaming)]
      : []),
    ...(settings.enableProviderUpdateChecks !== DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks
      ? [t(($) => $.panels.providerUpdateChecks)]
      : []),
    ...(settings.continueThreadsAfterServerUpdate !==
    DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate
      ? [t(($) => $.panels.continueThreadsAfterRestarts)]
      : []),
    ...(isBackgroundActivityDirty ? [t(($) => $.panels.backgroundActivity)] : []),
    ...(settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode
      ? [t(($) => $.panels.newThreadMode)]
      : []),
    ...(settings.newWorktreesStartFromOrigin !==
    DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin
      ? [t(($) => $.panels.newWorktreesStartFromRemote)]
      : []),
    ...(settings.addProjectBaseDirectory !== DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory
      ? [t(($) => $.panels.addProjectBaseDirectory)]
      : []),
    ...(settings.ghqCloneLayout !== DEFAULT_UNIFIED_SETTINGS.ghqCloneLayout
      ? [t(($) => $.panels.cloneIntoHostFolders)]
      : []),
    ...(settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin
      ? [t(($) => $.panels.unpinConfirmation)]
      : []),
    ...(settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive
      ? [t(($) => $.panels.archiveConfirmation)]
      : []),
    ...(settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete
      ? [t(($) => $.panels.deleteConfirmation)]
      : []),
    ...(settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit
      ? [t(($) => $.panels.quitShortcut)]
      : []),
    ...(isTextGenerationModelDirty ? [t(($) => $.panels.textGenerationModel)] : []),
    ...(settings.threadTitleInstructions !== DEFAULT_UNIFIED_SETTINGS.threadTitleInstructions
      ? [t(($) => $.panels.threadTitleInstructions)]
      : []),
    ...getChangedBrowserSettingLabels(settings, t),
    ...(settings.enableAgentBrowserAccess !== DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess
      ? [t(($) => $.panels.agentBrowserAccess)]
      : []),
  ];

  const restoreDefaults = async () => {
    if (changedSettingLabels.length === 0) return;
    const api = readLocalApi();
    const confirmed = await (api ?? ensureLocalApi()).dialogs.confirm(
      [
        t(($) => $.panels.restoreDefaultSettings),
        t(($) => $.panels.resetNotice, { settings: changedSettingLabels.join(", ") }),
      ].join("\n"),
      { variant: "destructive" },
    );
    if (!confirmed) return;
    if (settings.interfaceLanguage !== DEFAULT_UNIFIED_SETTINGS.interfaceLanguage) {
      try {
        await persistClientSettingsUpdate((current) => ({
          ...current,
          interfaceLanguage: DEFAULT_UNIFIED_SETTINGS.interfaceLanguage,
        }));
      } catch (error) {
        toastManager.add({
          type: "error",
          title: t(($) => $.panels.languageNotSaved),
          description: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    // Reset only dirty theme keys so storage failures cannot block other settings; re-read after confirmation
    // for safe rollback.
    let previousTheme = theme;
    try {
      previousTheme = readThemePreference();
    } catch {}
    const liveHalves = readThemeHalves();
    const needsThemeReset = previousTheme !== "system";
    const needsMixReset = liveHalves !== null;
    const needsFollowSystemReset = readAppearanceModePreference(previousTheme) !== "system";
    const notifyThemeRestoreFailure = () => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t(($) => $.panels.couldnTRestoreThemeSettings),
          description: t(($) => $.panels.tryAgain),
        }),
      );
    };
    // Restore the base preference before the mix because restoring the base clears the mix.
    const previousHalves = liveHalves;
    const rollbackThemeState = () => {
      if (needsThemeReset) setTheme(previousTheme);
      if (previousHalves?.light) setThemeHalf("light", previousHalves.light);
      if (previousHalves?.dark) setThemeHalf("dark", previousHalves.dark);
    };
    if (needsThemeReset && !setTheme("system")) {
      notifyThemeRestoreFailure();
      return;
    }
    if (needsMixReset && !clearThemeHalves()) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    if (needsFollowSystemReset && !setFollowSystem(true)) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    updateSettings({
      appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
      diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme,
      chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth,
      effortDisplay: DEFAULT_UNIFIED_SETTINGS.effortDisplay,
      mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
      timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
      notificationMode: DEFAULT_UNIFIED_SETTINGS.notificationMode,
      inAppNotificationsEnabled: DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled,
      wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap,
      persistComposerContextStrip: DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
      diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
      diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
      diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout,
      proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
      showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
      composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
      composerSpellCheckEnabled: DEFAULT_UNIFIED_SETTINGS.composerSpellCheckEnabled,
      sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut,
      followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
      contextWindowMeterEnabled: DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled,
      environmentIdentificationMode: DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode,
      glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity,
      panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
      sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
      sidebarProjectSortOrder: DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder,
      sidebarWorkingShelfEnabled: DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled,
      sidebarAutoSettleAfterDays: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
      sidebarAutoSettleKeepPullRequests: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleKeepPullRequests,
      sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
      autoResumeLimitedThreads: DEFAULT_UNIFIED_SETTINGS.autoResumeLimitedThreads,
      snoozeLimitedThreads: DEFAULT_UNIFIED_SETTINGS.snoozeLimitedThreads,
      snoozePresets: DEFAULT_UNIFIED_SETTINGS.snoozePresets,
      responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
      enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
      continueThreadsAfterServerUpdate: DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
      backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
      backgroundActivityProfile: DEFAULT_UNIFIED_SETTINGS.backgroundActivityProfile,
      automaticGitFetchInterval: DEFAULT_UNIFIED_SETTINGS.automaticGitFetchInterval,
      providerHealthRefreshInterval: DEFAULT_UNIFIED_SETTINGS.providerHealthRefreshInterval,
      defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
      newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
      addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
      ghqCloneLayout: DEFAULT_UNIFIED_SETTINGS.ghqCloneLayout,
      confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
      confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
      confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
      confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit,
      textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
      threadTitleInstructions: DEFAULT_UNIFIED_SETTINGS.threadTitleInstructions,
      fontFamilySans: DEFAULT_UNIFIED_SETTINGS.fontFamilySans,
      fontFamilyComposer: DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer,
      fontFamilyCode: DEFAULT_UNIFIED_SETTINGS.fontFamilyCode,
      fontFamilyTerminal: DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal,
      fontSizeInterface: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
      fontSizePrompt: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
      fontSizeCode: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
      fontSizeTerminal: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
      browserDefaultViewport: DEFAULT_UNIFIED_SETTINGS.browserDefaultViewport,
      browserDefaultZoomFactor: DEFAULT_UNIFIED_SETTINGS.browserDefaultZoomFactor,
      browserDefaultAppearance: DEFAULT_UNIFIED_SETTINGS.browserDefaultAppearance,
      browserRecordingFrameRate: DEFAULT_UNIFIED_SETTINGS.browserRecordingFrameRate,
      browserRecordingShowKeyPresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowKeyPresses,
      browserRecordingShowMousePresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowMousePresses,
      browserLinkTarget: DEFAULT_UNIFIED_SETTINGS.browserLinkTarget,
      browserSearchEngine: DEFAULT_UNIFIED_SETTINGS.browserSearchEngine,
      browserCustomSearchUrl: DEFAULT_UNIFIED_SETTINGS.browserCustomSearchUrl,
      browserAutoShowFloatingPreview: DEFAULT_UNIFIED_SETTINGS.browserAutoShowFloatingPreview,
      pullRequestLinksOpenInApp: DEFAULT_UNIFIED_SETTINGS.pullRequestLinksOpenInApp,
      enableAgentBrowserAccess: DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess,
    });
    onRestored?.();
  };

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

const AUTO_SETTLE_DEFAULT_DAYS = DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ?? 7;

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  const { t } = useTranslation("settings");
  const [draft, setDraft] = useState(String(value));
  const [draftSource, setDraftSource] = useState(value);
  if (draftSource !== value) {
    setDraftSource(value);
    setDraft(String(value));
  }

  return (
    <Input
      size="sm"
      type="number"
      min={MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      max={MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = Number(event.target.value);
        if (
          Number.isInteger(parsed) &&
          parsed >= MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS &&
          parsed <= MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label={t(($) => $.panels.daysOfInactivityBeforeAutoSettle)}
    />
  );
}

export function LegacyFeaturesSection() {
  const { t } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsSection id="legacy-features" title={t(($) => $.panels.legacy)}>
      <SettingsRow
        {...searchableSetting("legacy-plan-mode", t)}
        description={t(($) => $.panels.restoreBuildPlanPlanDefaultAndShiftTab)}
        control={
          <Switch
            checked={settings.planModeEnabled}
            onCheckedChange={(checked) => {
              updateSettings({ planModeEnabled: Boolean(checked) });
            }}
            aria-label={t(($) => $.panels.planModeLegacy)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("legacy-context-window-indicator", t)}
        description={t(($) => $.panels.showsContextWindowUsageAsACircularIndicator)}
        control={
          <Switch
            checked={settings.contextWindowMeterEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ contextWindowMeterEnabled: Boolean(checked) })
            }
            aria-label={t(($) => $.panels.contextWindowIndicatorLegacy)}
          />
        }
      />
    </SettingsSection>
  );
}

const languageNames: Record<InterfaceLanguage, string> = { en: "English", de: "Deutsch" };

function InterfaceLanguageRow() {
  const { t } = useTranslation("settings");
  const language = useClientSettings((settings) => settings.interfaceLanguage);
  const hydrated = useClientSettingsHydrated();
  const [saving, setSaving] = useState(false);
  const save = async (next: InterfaceLanguage) => {
    if (saving || next === language) return;
    setSaving(true);
    try {
      await persistClientSettingsUpdate((current) => ({ ...current, interfaceLanguage: next }));
    } catch (error) {
      setSaving(false);
      toastManager.add({
        type: "error",
        title: t(($) => $.panels.languageNotSaved),
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    setSaving(false);
  };
  return (
    <SettingsRow
      {...searchableSetting("interface-language", t)}
      resetAction={
        language !== DEFAULT_UNIFIED_SETTINGS.interfaceLanguage ? (
          <SettingResetButton
            label={t(($) => $.search.interfaceLanguage)}
            disabled={!hydrated || saving}
            onClick={() => void save(DEFAULT_UNIFIED_SETTINGS.interfaceLanguage)}
          />
        ) : null
      }
      control={
        <Select
          value={language}
          disabled={!hydrated || saving}
          onValueChange={(value) => {
            const next = InterfaceLanguage.literals.find((candidate) => candidate === value);
            if (next) void save(next);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-40"
            aria-label={t(($) => $.search.interfaceLanguage)}
          >
            <SelectValue>{languageNames[language]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {InterfaceLanguage.literals.map((option) => (
              <SelectItem key={option} value={option}>
                {languageNames[option]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

export function GeneralSettingsPanel() {
  const { t } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const lastEnabledProjectGroupingMode = useRef<SidebarProjectGroupingMode>(
    readLastEnabledProjectGroupingMode(),
  );

  return (
    <SettingsPageContainer>
      <SettingsSection id="interface" title={t(($) => $.search.interfaceLanguage)}>
        <InterfaceLanguageRow />
      </SettingsSection>
      <SettingsSection id="notifications" title={t(($) => $.panels.notifications)}>
        <NotificationSettings />
        <SettingsRow
          {...searchableSetting("in-app-notifications", t)}
          description={t(($) => $.panels.showAToastWhenAnotherThreadFinishesFails)}
          control={
            <Switch
              checked={settings.inAppNotificationsEnabled}
              onCheckedChange={(checked) => updateSettings({ inAppNotificationsEnabled: checked })}
              aria-label={t(($) => $.panels.inAppNotifications)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="sidebar" title={t(($) => $.panels.sidebar)}>
        <SettingsRow
          {...searchableSetting("project-grouping", t)}
          description={t(($) => $.panels.combineMatchingRepositoriesAcrossEnvironments)}
          resetAction={
            settings.sidebarProjectGroupingMode !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode ? (
              <SettingResetButton
                label={t(($) => $.panels.projectGroupingLabel)}
                onClick={() =>
                  updateSettings({
                    sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={isProjectGroupingEnabled(settings.sidebarProjectGroupingMode)}
              onCheckedChange={(checked) => {
                if (!checked && settings.sidebarProjectGroupingMode !== "separate") {
                  lastEnabledProjectGroupingMode.current = settings.sidebarProjectGroupingMode;
                  rememberEnabledProjectGroupingMode(settings.sidebarProjectGroupingMode);
                }
                updateSettings({
                  sidebarProjectGroupingMode: projectGroupingModeFromToggle(
                    checked,
                    lastEnabledProjectGroupingMode.current,
                  ),
                });
              }}
              aria-label={t(($) => $.panels.projectGroupingLabelLabel)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("project-order", t)}
          description={t(($) => $.panels.orderOfProjectsInTheSidebarProjectPicker)}
          resetAction={
            settings.sidebarProjectSortOrder !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder ? (
              <SettingResetButton
                label={t(($) => $.panels.projectOrderLabel)}
                onClick={() =>
                  updateSettings({
                    sidebarProjectSortOrder: DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sidebarProjectSortOrder}
              onValueChange={(value) => {
                if (isSidebarProjectSortOrder(value)) {
                  updateSettings({ sidebarProjectSortOrder: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-44"
                aria-label={t(($) => $.panels.projectOrder)}
              >
                <SelectValue>
                  {sidebarProjectSortOrderLabels(t)[settings.sidebarProjectSortOrder]}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {SidebarProjectSortOrder.literals.map((sortOrder) => (
                  <SelectItem hideIndicator key={sortOrder} value={sortOrder}>
                    {sidebarProjectSortOrderLabels(t)[sortOrder]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("working-shelf", t)}
          description={t(($) => $.panels.foldWorkingAndMonitoringThreadsIntoAWorking)}
          resetAction={
            settings.sidebarWorkingShelfEnabled !==
            DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled ? (
              <SettingResetButton
                label={t(($) => $.panels.workingSectionLabel)}
                onClick={() =>
                  updateSettings({
                    sidebarWorkingShelfEnabled: DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.sidebarWorkingShelfEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarWorkingShelfEnabled: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.workingSection)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="confirmations" title={t(($) => $.panels.confirmations)}>
        <SettingsRow
          {...searchableSetting("unpin-confirmation", t)}
          description={t(($) => $.panels.askBeforeUnpinningAThreadFromThePinned)}
          resetAction={
            settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin ? (
              <SettingResetButton
                label={t(($) => $.panels.unpinConfirmationLabel)}
                onClick={() =>
                  updateSettings({
                    confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadUnpin}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadUnpin: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.confirmThreadUnpinning)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("archive-confirmation", t)}
          description={t(($) => $.panels.requireASecondClickOnTheInlineArchive)}
          resetAction={
            settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive ? (
              <SettingResetButton
                label={t(($) => $.panels.archiveConfirmationLabel)}
                onClick={() =>
                  updateSettings({
                    confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadArchive}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadArchive: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.confirmThreadArchiving)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("delete-confirmation", t)}
          description={t(($) => $.panels.askBeforeDeletingAThreadAndItsChat)}
          resetAction={
            settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete ? (
              <SettingResetButton
                label={t(($) => $.panels.deleteConfirmationLabel)}
                onClick={() =>
                  updateSettings({
                    confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadDelete}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadDelete: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.confirmThreadDeletion)}
            />
          }
        />
        {isElectron ? (
          <SettingsRow
            {...searchableSetting("quit-confirmation", t)}
            description={t(($) => $.panels.holdModeAlsoQuitsOnTwoQuickPresses)}
            resetAction={
              settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit ? (
                <SettingResetButton
                  label={t(($) => $.panels.quitShortcutBehavior)}
                  onClick={() =>
                    updateSettings({ confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.confirmQuit}
                onValueChange={(value) => {
                  if (value === "direct" || value === "hold" || value === "double-click") {
                    updateSettings({ confirmQuit: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={t(($) => $.panels.quitShortcutBehaviorLabel)}
                >
                  <SelectValue>{quitConfirmationModeLabels(t)[settings.confirmQuit]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(quitConfirmationModeLabels(t)).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection id="display" title={t(($) => $.panels.display)}>
        <SettingsRow
          {...searchableSetting("time-format", t)}
          description={t(($) => $.panels.systemDefaultFollowsYourBrowserOrOSClock)}
          resetAction={
            settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
              <SettingResetButton
                label={t(($) => $.panels.timeFormatLabel)}
                onClick={() =>
                  updateSettings({
                    timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.timestampFormat}
              onValueChange={(value) => {
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t(($) => $.panels.timestampFormat)}
              >
                <SelectValue>{timestampFormatLabels(t)[settings.timestampFormat]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="locale">
                  {timestampFormatLabels(t).locale}
                </SelectItem>
                <SelectItem hideIndicator value="12-hour">
                  {timestampFormatLabels(t)["12-hour"]}
                </SelectItem>
                <SelectItem hideIndicator value="24-hour">
                  {timestampFormatLabels(t)["24-hour"]}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function ChatSettingsPanel() {
  const { t } = useTranslation("settings");
  const modifierLabel = isMacPlatform(navigator.platform) ? "⌘" : "Ctrl";
  const sendShortcutOptions = [
    { value: "enter", label: "Enter" },
    {
      value: "mod-enter-multiline",
      label: t(($) => $.panels.multilineShortcut, { modifier: modifierLabel }),
    },
    { value: "mod-enter", label: t(($) => $.panels.alwaysShortcut, { modifier: modifierLabel }) },
  ] as const;
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection id="composer" title={t(($) => $.panels.composer)}>
        <SettingsRow
          {...searchableSetting("composer-rich-text", t)}
          description={t(($) => $.panels.showFormattedMarkdownAsYouType)}
          resetAction={
            settings.composerRichTextEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled ? (
              <SettingResetButton
                label={t(($) => $.panels.richTextComposerLabel)}
                onClick={() =>
                  updateSettings({
                    composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerRichTextEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerRichTextEnabled: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.richTextComposer)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("composer-spell-check", t)}
          description={t(($) => $.panels.underlineMisspelledWordsInTheComposer)}
          resetAction={
            settings.composerSpellCheckEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerSpellCheckEnabled ? (
              <SettingResetButton
                label={t(($) => $.panels.composerSpellCheckLabel)}
                onClick={() =>
                  updateSettings({
                    composerSpellCheckEnabled: DEFAULT_UNIFIED_SETTINGS.composerSpellCheckEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerSpellCheckEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerSpellCheckEnabled: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.composerSpellCheck)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("send-shortcut", t)}
          description={t(($) => $.panels.chooseWhenEnterSendsAPromptOrInserts)}
          resetAction={
            settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut ? (
              <SettingResetButton
                label={t(($) => $.panels.sendShortcutLabel)}
                onClick={() =>
                  updateSettings({ sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sendShortcut}
              onValueChange={(value) => {
                const option = sendShortcutOptions.find((option) => option.value === value);
                if (option) updateSettings({ sendShortcut: option.value });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-auto min-w-0 max-w-full"
                aria-label={t(($) => $.panels.sendShortcut)}
              >
                <SelectValue>
                  {
                    sendShortcutOptions.find((option) => option.value === settings.sendShortcut)
                      ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {sendShortcutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center justify-between gap-4">
                      {option.label}
                      {settings.sendShortcut === option.value && <CheckIcon aria-hidden="true" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <AdvancedSettings targetIds={[searchableSetting("skills-in-slash-menu", t).id]}>
          <SettingsRow
            {...searchableSetting("skills-in-slash-menu", t)}
            description={t(($) => $.panels.alsoIncludeSkillsInTheCommandMenuSkills)}
            resetAction={
              settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu ? (
                <SettingResetButton
                  label={t(($) => $.panels.skillsInSlashMenu)}
                  onClick={() =>
                    updateSettings({
                      showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.showSkillsInSlashMenu}
                onCheckedChange={(checked) =>
                  updateSettings({ showSkillsInSlashMenu: Boolean(checked) })
                }
                aria-label={t(($) => $.panels.showSkillsInSlashMenu)}
              />
            }
          />
        </AdvancedSettings>
      </SettingsSection>

      <SettingsSection id="follow-ups" title={t(($) => $.panels.followUps)}>
        <SettingsRow
          {...searchableSetting("follow-up-behavior", t)}
          description={
            settings.sendShortcut === "mod-enter-multiline"
              ? t(($) => $.panels.queueMultiline, { modifier: modifierLabel })
              : t(($) => $.panels.queueModifier, {
                  shortcut:
                    settings.sendShortcut === "mod-enter"
                      ? `${modifierLabel} + Shift`
                      : modifierLabel,
                })
          }
          resetAction={
            settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior ? (
              <SettingResetButton
                label={t(($) => $.panels.followUpBehaviorLabel)}
                onClick={() =>
                  updateSettings({
                    followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.followUpBehavior}
              onValueChange={(value) => {
                if (value === "queue" || value === "steer") {
                  updateSettings({ followUpBehavior: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-auto min-w-0"
                aria-label={t(($) => $.panels.followUpBehavior)}
              >
                <SelectValue>
                  {settings.followUpBehavior === "queue"
                    ? t(($) => $.panels.queue)
                    : t(($) => $.panels.steer)}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="queue">{t(($) => $.panels.queue)}</SelectItem>
                <SelectItem value="steer">{t(($) => $.panels.steer)}</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function DiffColorsSettingsRow() {
  const { t } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("diff-color-scheme", t)}
      description={t(($) => $.panels.chooseColorsForAdditionsAndDeletionsIncludingChange)}
      resetAction={
        settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme ? (
          <SettingResetButton
            label={t(($) => $.panels.diffColorsLabel)}
            onClick={() =>
              updateSettings({ diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme })
            }
          />
        ) : null
      }
      control={
        <div className="w-full sm:w-40">
          <Select
            value={settings.diffColorScheme}
            onValueChange={(value) => {
              if (value === "red-green" || value === "blue-orange")
                updateSettings({ diffColorScheme: value });
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-0"
              aria-label={t(($) => $.panels.diffColors)}
            >
              <span
                aria-hidden="true"
                className={
                  settings.diffColorScheme === "blue-orange"
                    ? "flex shrink-0 flex-row-reverse gap-1"
                    : "flex shrink-0 gap-1"
                }
              >
                <span className="size-2 rounded-full bg-diff-deletion" />
                <span className="size-2 rounded-full bg-diff-addition" />
              </span>
              <SelectValue>
                {settings.diffColorScheme === "blue-orange"
                  ? t(($) => $.panels.blueOrange)
                  : t(($) => $.panels.redGreen)}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="red-green">{t(($) => $.panels.redGreenDefault)}</SelectItem>
              <SelectItem value="blue-orange">{t(($) => $.panels.blueOrange)}</SelectItem>
            </SelectPopup>
          </Select>
        </div>
      }
    />
  );
}

export function DiffsSettingsPanel() {
  const { t } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection id="diffs" title={t(($) => $.panels.diffs)}>
        <SettingsRow
          {...searchableSetting("diff-layout", t)}
          description={t(($) => $.panels.showDiffsStackedOrSideBySideThe)}
          resetAction={
            settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout ? (
              <SettingResetButton
                label={t(($) => $.panels.diffLayoutLabel)}
                onClick={() => updateSettings({ diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffLayout}
              onValueChange={(value) => {
                if (value === "stacked" || value === "split") {
                  updateSettings({ diffLayout: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t(($) => $.panels.diffLayout)}
              >
                <SelectValue>{diffLayoutLabels(t)[settings.diffLayout]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="stacked">
                  {diffLayoutLabels(t).stacked}
                </SelectItem>
                <SelectItem hideIndicator value="split">
                  {diffLayoutLabels(t).split}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("hide-whitespace-changes", t)}
          description={t(($) => $.panels.setWhetherTheDiffPanelIgnoresWhitespaceOnly)}
          resetAction={
            settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace ? (
              <SettingResetButton
                label={t(($) => $.panels.diffWhitespaceChangesLabel)}
                onClick={() =>
                  updateSettings({
                    diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.diffIgnoreWhitespace}
              onCheckedChange={(checked) =>
                updateSettings({ diffIgnoreWhitespace: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.hideWhitespaceChangesByDefault)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("default-diff-file-state", t)}
          description={t(($) => $.panels.startWithFilesExpandedOrCollapsedWhenOpening)}
          resetAction={
            settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed ? (
              <SettingResetButton
                label={t(($) => $.panels.defaultDiffFileStateLabel)}
                onClick={() =>
                  updateSettings({
                    diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffFilesCollapsed ? "collapsed" : "expanded"}
              onValueChange={(value) => {
                if (value === "expanded" || value === "collapsed") {
                  updateSettings({ diffFilesCollapsed: value === "collapsed" });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t(($) => $.panels.defaultDiffFileState)}
              >
                <SelectValue>
                  {settings.diffFilesCollapsed
                    ? t(($) => $.panels.collapsed)
                    : t(($) => $.panels.expanded)}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="expanded">
                  {t(($) => $.panels.expanded)}
                </SelectItem>
                <SelectItem hideIndicator value="collapsed">
                  {t(($) => $.panels.collapsed)}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <DiffColorsSettingsRow />
      </SettingsSection>

      <SettingsSection id="pull-requests" title={t(($) => $.panels.pullRequests)}>
        <SettingsRow
          {...searchableSetting("proactive-panels", t)}
          description={t(($) => $.panels.openLinkedPullRequestsFirstOtherwiseOpenChanges)}
          resetAction={
            settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled ? (
              <SettingResetButton
                label={t(($) => $.panels.proactivePanelsLabel)}
                onClick={() =>
                  updateSettings({
                    proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.proactivePanelsEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ proactivePanelsEnabled: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.proactivePanels)}
            />
          }
        />
        <PullRequestLinksOpenInAppSetting />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

/** The Providers panel can render without a settings scope, as its tests do; this row needs one. */
export function CompactIdleThreadsRow() {
  return useOptionalSettingsScope() === null ? null : <ScopedCompactIdleThreadsRow />;
}

function ScopedCompactIdleThreadsRow() {
  const { t } = useTranslation("settings");
  const compactionModes = IDLE_COMPACTION_MODES.map((mode) => ({
    value: mode.value,
    label:
      mode.value === "onReturn"
        ? t(($) => $.panels.onReturn)
        : mode.value === "beforeCacheExpires"
          ? t(($) => $.panels.beforeCacheExpires)
          : t(($) => $.panels.never),
  }));
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { targets } = useSettingsScope();
  const idleCompaction = scopedIdleCompaction(targets.length > 0 ? targets : [{ settings }]);

  return (
    <SettingsRow
      serverScoped
      settingKeys={["idleCompaction", "compactIdleThreads"]}
      mixed={idleCompaction.mixed}
      {...searchableSetting("compact-idle-threads", t)}
      description={t(($) => $.panels.whenToCompactAnIdleClaudeThreadOver)}
      resetAction={
        globalIdleCompaction(settings) !== globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS) ? (
          <SettingResetButton
            label={t(($) => $.panels.compactIdleThreads)}
            onClick={() =>
              updateSettings({ idleCompaction: globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS) })
            }
          />
        ) : null
      }
      control={
        <Select
          value={idleCompaction.mixed ? null : globalIdleCompaction(settings)}
          onValueChange={(value) => {
            const mode = compactionModes.find((candidate) => candidate.value === value);
            if (mode) updateSettings({ idleCompaction: mode.value });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-56"
            aria-label={t(($) => $.panels.compactIdleThreadsLabel)}
          >
            <SelectValue>
              {(value: string | null) =>
                value === null
                  ? t(($) => $.panels.mixed)
                  : compactionModes.find((mode) => mode.value === value)?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {compactionModes.map((mode) => (
              <SelectItem
                hideIndicator
                key={mode.value}
                value={mode.value}
                // A server from before modes has only the on/off switch, so it cannot store "Never".
                disabled={mode.value === "off" && !idleCompaction.neverAvailable}
              >
                {mode.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

export function ThreadsSettingsPanel() {
  const { t } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const { environment, connectedEnvironments, target, scope } = useSettingsScope();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const environmentId = environment?.environmentId ?? null;
  const hasServerTargets = connectedEnvironments.length > 0;
  const mixedResponseStreamingMode = useScopedSettingsMixed(["responseStreamingMode"]);
  const providersByEnvironment = useEnvironmentProviders();
  const serverProviders =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const supportsAutoSettlementScope = connectedEnvironments.every(
    (target) => target.serverConfig?.environment.capabilities.threadAutoSettlementScope === true,
  );

  const textGenerationProviders = serverProviders.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const textGenerationModelSelection = resolveAppModelSelectionState(
    settings,
    textGenerationProviders,
  );
  const textGenInstanceId = textGenerationModelSelection.instanceId;
  const textGenModel = textGenerationModelSelection.model;
  const textGenModelOptions = textGenerationModelSelection.options;
  const textGenerationModelInstanceEntries = providerInstanceEntriesFor(
    textGenerationProviders,
    settings,
    target?.projectId ?? null,
  );
  const hasTextGenerationProvider = textGenerationModelInstanceEntries.some(
    (entry) => entry.enabled && entry.isAvailable,
  );
  const textGenInstanceEntry = textGenerationModelInstanceEntries.find(
    (entry) => entry.instanceId === textGenInstanceId,
  );
  const textGenProvider: ProviderDriverKind =
    textGenInstanceEntry?.driverKind ?? DEFAULT_DRIVER_KIND;
  const textGenerationModelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    textGenInstanceId,
    textGenModel,
  );
  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const textGenerationModelDisabledReason = useScopedModelDisabledReason(
    settings,
    textGenerationModelInstanceEntries,
  );
  const mixedAddProjectBaseDirectory = useScopedSettingsMixed(["addProjectBaseDirectory"]);
  const mixedTextGenerationModel = useScopedSettingsMixed(["textGenerationModelSelection"]);

  return (
    <SettingsPageContainer>
      <SettingsSection id="new-projects" title={t(($) => $.panels.newProjects)}>
        <SettingsRow
          serverScoped
          settingKeys={["addProjectBaseDirectory"]}
          {...searchableSetting("add-project-starts-in", t)}
          description={t(($) => $.panels.projectBaseEmpty)}
          resetAction={
            settings.addProjectBaseDirectory !==
            DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory ? (
              <SettingResetButton
                label={t(($) => $.panels.addProjectBaseDirectoryLabel)}
                onClick={() =>
                  updateSettings({
                    addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
                  })
                }
              />
            ) : null
          }
          control={
            <DraftInput
              size="sm"
              className="w-full sm:w-72"
              value={mixedAddProjectBaseDirectory ? "" : settings.addProjectBaseDirectory}
              onCommit={(next) => updateSettings({ addProjectBaseDirectory: next })}
              normalizeDraft={resolvePastedPath}
              placeholder={mixedAddProjectBaseDirectory ? t(($) => $.panels.mixed) : "~/"}
              spellCheck={false}
              aria-label={t(($) => $.panels.addProjectBaseDirectory)}
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["ghqCloneLayout"]}
          {...searchableSetting("ghq-clone-layout", t)}
          description={t(($) => $.panels.clonesGoToHostFolders)}
          resetAction={
            settings.ghqCloneLayout !== DEFAULT_UNIFIED_SETTINGS.ghqCloneLayout ? (
              <SettingResetButton
                label={t(($) => $.panels.cloneIntoHostFoldersLabel)}
                onClick={() =>
                  updateSettings({ ghqCloneLayout: DEFAULT_UNIFIED_SETTINGS.ghqCloneLayout })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["ghqCloneLayout"]}
              checked={settings.ghqCloneLayout}
              onCheckedChange={(checked) => updateSettings({ ghqCloneLayout: Boolean(checked) })}
              aria-label={t(($) => $.panels.cloneIntoHostFolders)}
            />
          }
        />
      </SettingsSection>

      <ProjectDefaultsSettings category="general" />

      {!isProjectScope ? (
        <SettingsSection id="snooze" title={t(($) => $.panels.snooze)}>
          <SnoozePresetsRow />
        </SettingsSection>
      ) : null}

      <SettingsSection id="usage-limits" title={t(($) => $.panels.usageLimits)}>
        <SettingsRow
          serverScoped
          {...searchableSetting("auto-resume-limited-threads", t)}
          description={t(($) => $.panels.automaticallyResumeThreadsWhenTheirUsageLimitsReset)}
          settingKeys={["autoResumeLimitedThreads"]}
          control={
            <ScopedSwitch
              settingKeys={["autoResumeLimitedThreads"]}
              checked={settings.autoResumeLimitedThreads}
              onCheckedChange={(checked) =>
                updateSettings({ autoResumeLimitedThreads: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.resumeAfterUsageLimits)}
            />
          }
        />
        <SettingsRow
          serverScoped
          {...searchableSetting("snooze-limited-threads", t)}
          description={t(($) => $.panels.snoozeThreadsUntilTheirUsageLimitsReset)}
          settingKeys={["snoozeLimitedThreads"]}
          control={
            <ScopedSwitch
              settingKeys={["snoozeLimitedThreads"]}
              checked={settings.snoozeLimitedThreads}
              onCheckedChange={(checked) =>
                updateSettings({ snoozeLimitedThreads: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.snoozeUntilLimitsReset)}
            />
          }
        />
      </SettingsSection>

      {hasServerTargets ? (
        <SettingsSection id="auto-settle" title={t(($) => $.panels.autoSettle)}>
          <SettingsRow
            serverScoped
            settingKeys={["sidebarAutoSettleOnMerge"]}
            {...searchableSetting("auto-settle-merged-threads", t)}
            description={t(($) => $.panels.settleAThreadWhenItsPullRequestMerges)}
            resetAction={
              settings.sidebarAutoSettleOnMerge !==
              DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge ? (
                <SettingResetButton
                  label={t(($) => $.panels.autoSettleOnMerge)}
                  onClick={() =>
                    updateSettings({
                      sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
                    })
                  }
                />
              ) : null
            }
            control={
              <ScopedSwitch
                settingKeys={["sidebarAutoSettleOnMerge"]}
                checked={settings.sidebarAutoSettleOnMerge}
                onCheckedChange={(checked) =>
                  updateSettings({ sidebarAutoSettleOnMerge: Boolean(checked) })
                }
                aria-label={t(($) => $.panels.autoSettleMergedThreads)}
              />
            }
          />

          <SettingsRow
            serverScoped
            settingKeys={["sidebarAutoSettleAfterDays"]}
            {...searchableSetting("auto-settle-inactive-threads", t)}
            description={t(($) => $.panels.sidebarThreadsWithNoActivityForThisLong)}
            resetAction={
              settings.sidebarAutoSettleAfterDays !==
              DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ? (
                <SettingResetButton
                  label={t(($) => $.panels.autoSettle)}
                  onClick={() =>
                    updateSettings({
                      sidebarAutoSettleAfterDays:
                        DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
                    })
                  }
                />
              ) : null
            }
            control={
              <ScopedSwitch
                settingKeys={["sidebarAutoSettleAfterDays"]}
                checked={settings.sidebarAutoSettleAfterDays !== null}
                onCheckedChange={(checked) =>
                  updateSettings({
                    sidebarAutoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                  })
                }
                aria-label={t(($) => $.panels.autoSettleInactiveThreads)}
              />
            }
          />
          {settings.sidebarAutoSettleAfterDays !== null ? (
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleAfterDays"]}
              title={searchableSetting("days-before-auto-settle", t).title}
              description={t(($) => $.panels.anyNewActivityUnSettlesAThreadAutomatically)}
              control={
                <AutoSettleDaysInput
                  value={settings.sidebarAutoSettleAfterDays}
                  onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                />
              }
            />
          ) : null}
          {settings.sidebarAutoSettleAfterDays !== null && supportsAutoSettlementScope ? (
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleKeepPullRequests"]}
              title={t(($) => $.panels.keepThreadsWithAPR)}
              description={t(($) => $.panels.inactivityDoesNotSettleThreadsWithAPull)}
              control={
                <ScopedSwitch
                  settingKeys={["sidebarAutoSettleKeepPullRequests"]}
                  checked={settings.sidebarAutoSettleKeepPullRequests}
                  onCheckedChange={(checked) =>
                    updateSettings({ sidebarAutoSettleKeepPullRequests: checked })
                  }
                  aria-label={t(($) => $.panels.keepThreadsWithAPR)}
                />
              }
            />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection id="text-generation" title={t(($) => $.panels.textGeneration)}>
        <SettingsRow
          serverScoped
          settingKeys={["textGenerationModelSelection"]}
          {...searchableSetting("text-generation-model", t)}
          description={t(($) => $.panels.usedForThreadTitlesAndOtherGeneratedText)}
          resetAction={
            hasServerTargets && isTextGenerationModelDirty ? (
              <SettingResetButton
                label={t(($) => $.panels.textGenerationModelLabel)}
                onClick={() =>
                  updateSettings({
                    textGenerationModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            !hasServerTargets ? (
              <span className="text-sm text-muted-foreground">
                {t(($) => $.panels.connectAnEnvironmentToChooseItsTextGeneration)}
              </span>
            ) : !hasTextGenerationProvider ? (
              <span className="text-sm text-muted-foreground">
                {t(($) => $.panels.noTextGenerationProvidersAvailable)}
              </span>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ProviderModelPicker
                  environmentId={environmentId}
                  activeInstanceId={textGenInstanceId}
                  model={textGenModel}
                  lockedProvider={null}
                  instanceEntries={textGenerationModelInstanceEntries}
                  modelOptionsByInstance={textGenerationModelOptionsByInstance}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  {...(mixedTextGenerationModel ? { triggerLabel: t(($) => $.panels.mixed) } : {})}
                  getModelDisabledReason={textGenerationModelDisabledReason}
                  {...(environmentId
                    ? {
                        onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                          void navigate({
                            to: "/settings/providers",
                            search: { environmentId, instanceId },
                          });
                        },
                      }
                    : {})}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = textGenerationModelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: t(($) => $.panels.textGenerationModelNotSaved),
                        description: reason,
                      });
                      return;
                    }
                    updateSettings({
                      textGenerationModelSelection: resolveAppModelSelectionState(
                        {
                          ...settings,
                          textGenerationModelSelection: createModelSelection(instanceId, model),
                        },
                        textGenerationProviders,
                      ),
                    });
                  }}
                />
                {textGenInstanceEntry ? (
                  <TraitsPicker
                    provider={textGenProvider}
                    models={textGenInstanceEntry?.models ?? []}
                    model={textGenModel}
                    modelOptions={textGenModelOptions}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={
                      settings.planModeEnabled || selectsPlanAgent(textGenModelOptions)
                    }
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(nextOptions) => {
                      updateSettings({
                        textGenerationModelSelection: resolveAppModelSelectionState(
                          {
                            ...settings,
                            textGenerationModelSelection: createModelSelection(
                              textGenInstanceId,
                              textGenModel,
                              nextOptions,
                            ),
                          },
                          textGenerationProviders,
                        ),
                      });
                    }}
                  />
                ) : null}
              </div>
            )
          }
        />
        <AdvancedSettings
          targetIds={[
            searchableSetting("thread-title-instructions", t).id,
            searchableSetting("response-streaming", t).id,
          ]}
        >
          <ThreadTitleInstructionsSettings />
          <SettingsRow
            serverScoped
            settingKeys={["responseStreamingMode"]}
            {...searchableSetting("response-streaming", t)}
            description={
              mixedResponseStreamingMode
                ? t(($) => $.panels.theSelectedTargetsUseDifferentStreamingModes)
                : responseStreamingModeDescriptions(t)[settings.responseStreamingMode]
            }
            resetAction={
              settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode ? (
                <SettingResetButton
                  label={t(($) => $.panels.responseStreamingLabel)}
                  onClick={() =>
                    updateSettings({
                      responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={mixedResponseStreamingMode ? null : settings.responseStreamingMode}
                onValueChange={(value) => {
                  if (value === "turn" || value === "paragraph") {
                    updateSettings({ responseStreamingMode: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-56"
                  aria-label={t(($) => $.panels.responseStreaming)}
                >
                  <SelectValue>
                    {(value: ResponseStreamingMode | null) =>
                      value === null
                        ? t(($) => $.panels.mixed)
                        : responseStreamingModeLabels(t)[value]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="turn">
                    {responseStreamingModeLabels(t).turn}
                  </SelectItem>
                  <SelectItem hideIndicator value="paragraph">
                    {responseStreamingModeLabels(t).paragraph}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </AdvancedSettings>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function MaintenanceSettingsPanel() {
  const { t } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { scope, environment, connectedEnvironments } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const isEnvironmentScope = scope.environmentIds.length === 1 && environmentId !== null;
  const hasServerTargets = connectedEnvironments.length > 0;

  return (
    <SettingsPageContainer>
      <SettingsSection id="updates" title={t(($) => $.panels.updates)}>
        <SettingsRow
          serverScoped
          settingKeys={["enableProviderUpdateChecks"]}
          {...searchableSetting("provider-update-checks", t)}
          description={t(($) => $.panels.checkInstalledProviderCLIsForNewerAvailableVersions)}
          resetAction={
            settings.enableProviderUpdateChecks !==
            DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks ? (
              <SettingResetButton
                label={t(($) => $.panels.providerUpdateChecksLabel)}
                onClick={() =>
                  updateSettings({
                    enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["enableProviderUpdateChecks"]}
              checked={settings.enableProviderUpdateChecks}
              onCheckedChange={(checked) =>
                updateSettings({ enableProviderUpdateChecks: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.checkProviderVersions)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("continue-threads-after-server-update", t)}
          serverScoped
          settingKeys={["continueThreadsAfterServerUpdate"]}
          description={t(($) => $.panels.automaticallyResumeInterruptedThreadsAfterAnUpdateCrash)}
          status={
            !hasServerTargets
              ? t(($) => $.panels.allSelectedConnectedEnvironmentsMustSupportRestartContinuation)
              : undefined
          }
          resetAction={
            hasServerTargets &&
            settings.continueThreadsAfterServerUpdate !==
              DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate ? (
              <SettingResetButton
                label={t(($) => $.panels.continueThreadsAfterRestartsLabel)}
                onClick={() =>
                  updateSettings({
                    continueThreadsAfterServerUpdate:
                      DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["continueThreadsAfterServerUpdate"]}
              checked={settings.continueThreadsAfterServerUpdate}
              disabled={!hasServerTargets}
              onCheckedChange={(checked) =>
                updateSettings({ continueThreadsAfterServerUpdate: Boolean(checked) })
              }
              aria-label={t(($) => $.panels.continueThreadsAfterRestarts)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="background" title={t(($) => $.panels.backgroundActivity)}>
        <BackgroundActivitySettingsRow />
      </SettingsSection>

      <StorageCleanupSections />

      <SettingsSection id="diagnostics-section" title={t(($) => $.panels.diagnostics)}>
        <SettingsRow
          {...searchableSetting("diagnostics", t)}
          description={
            isEnvironmentScope
              ? t(($) => $.panels.inspectProcessesResourceUseAndLogsOnThis)
              : t(($) => $.panels.inspectProcessesResourceUseAndLogsOnOne)
          }
          control={
            <Button
              render={
                <Link to="/settings/diagnostics" search={{ machine: environmentId ?? undefined }} />
              }
              size="sm"
              variant="outline"
            >
              {t(($) => $.panels.viewDiagnostics)}
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function AboutSettingsPanel() {
  const { t } = useTranslation("settings");
  const primaryPolicy = usePrimaryManagedPolicy();
  const telemetryOff = managedTelemetryOffMessage(primaryPolicy);
  return (
    <SettingsPageContainer>
      <SettingsSection id="about" title={t(($) => $.panels.app)}>
        {primaryPolicy ? (
          <SettingsRow
            title={t(($) => $.panels.organization)}
            description={t(($) => $.panels.managedByOrganization, {
              organization: primaryPolicy.organization,
            })}
            control={
              primaryPolicy.supportUrl ? (
                <Button
                  render={
                    <a href={primaryPolicy.supportUrl} target="_blank" rel="noreferrer noopener" />
                  }
                  size="sm"
                  variant="outline"
                >
                  {t(($) => $.panels.getHelp)}
                </Button>
              ) : null
            }
          />
        ) : null}
        {isElectron || HOSTED_APP_CHANNEL ? (
          <AboutVersionSection />
        ) : (
          <>
            <SettingsRow
              id={searchableSetting("app-version", t).id}
              title={<AboutVersionTitle />}
              description={t(($) => $.panels.currentVersionOfTheApplication)}
            />
          </>
        )}
        <MobileAppSettingsRow />
      </SettingsSection>

      <SettingsSection id="legal" title={t(($) => $.panels.legal)}>
        <SettingsRow
          {...searchableSetting("privacy-policy", t)}
          description={
            telemetryOff === undefined
              ? t(($) => $.panels.howWeHandleYourDataIncludingTheAnonymous)
              : t(($) => $.panels.howWeHandleYourDataTelemetryOff, { message: telemetryOff })
          }
          control={
            <Button
              render={<a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer noopener" />}
              size="sm"
              variant="outline"
            >
              {t(($) => $.panels.viewPolicy)}
            </Button>
          }
        />
        <SettingsRow
          {...searchableSetting("open-source-licenses", t)}
          description={t(($) => $.panels.noticesForDependenciesAssetsAndOptionalToolsUsed)}
          control={
            <Button
              render={<Link to="/settings/open-source-licenses" />}
              size="sm"
              variant="outline"
            >
              {t(($) => $.panels.viewLicenses)}
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
