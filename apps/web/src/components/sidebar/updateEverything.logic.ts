import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { ServerUpdateState } from "@t3tools/client-runtime/state/server";
import {
  type DesktopUpdateChannel,
  type EnvironmentId,
  managedNightlyDeniedMessage,
  managedUpdatesDenial,
  type ServerConfig,
  type ServerSelfUpdateCapability,
} from "@t3tools/contracts";
import { cliReleaseChannelOf, desktopUpdateChannelOf } from "@t3tools/shared/cliRelease";
import { compareSemverVersions } from "@t3tools/shared/semver";

import {
  resolveServerSelfUpdateCapability,
  resolveVersionMismatch,
  supportsDesktopAppUpdate,
} from "~/versionSkew";
import type { ServerUpdateOutcome, ServerUpdateTarget } from "~/components/ServerUpdateAction";

export interface UpdateEverythingMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly serverConfig: {
    readonly environment: ServerConfig["environment"];
    readonly settings: Pick<ServerConfig["settings"], "continueThreadsAfterServerUpdate">;
    readonly managedPolicy?: ServerConfig["managedPolicy"];
  } | null;
  readonly connected: boolean;
  readonly hostedByThisApp: boolean;
  readonly canMaintain: boolean;
  readonly updateState: ServerUpdateState;
}

export interface RestartingMachine {
  readonly environmentId: EnvironmentId;
  readonly continuesThreads: boolean;
}

export function collectRestartingMachines(
  machines: ReadonlyArray<UpdateEverythingMachine>,
  servers: ReadonlyArray<Pick<ServerUpdateTarget, "environmentId">>,
  installsLocal: boolean,
): RestartingMachine[] {
  const updated = new Set(servers.map((server) => server.environmentId));
  return machines.flatMap((machine) => {
    const config = machine.serverConfig;
    if (
      config === null ||
      !machine.connected ||
      !(updated.has(machine.environmentId) || (installsLocal && machine.hostedByThisApp))
    ) {
      return [];
    }
    return [
      {
        environmentId: machine.environmentId,
        continuesThreads: config.settings.continueThreadsAfterServerUpdate === true,
      },
    ];
  });
}

export interface SkippedMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly reason: string;
}

/** Skip current and app-hosted servers; the latter update with the app and would relaunch mid-run.
 * Desktop-managed servers use their own feed. Each server's updater checks that it can install the
 * release before it restarts, so no registry precheck runs here. */
export function collectServerUpdateTargets(
  machines: ReadonlyArray<UpdateEverythingMachine>,
  targetVersion: string,
  t: TFunction<"workspace">,
): {
  readonly targets: ServerUpdateTarget[];
  readonly skipped: SkippedMachine[];
} {
  const targets: ServerUpdateTarget[] = [];
  const skipped: SkippedMachine[] = [];
  for (const machine of machines) {
    const config = machine.serverConfig;
    if (machine.hostedByThisApp) continue;
    if (
      config !== null &&
      resolveVersionMismatch(config.environment.serverVersion, targetVersion) === null
    ) {
      continue;
    }
    const skip = (reason: string) =>
      skipped.push({ environmentId: machine.environmentId, label: machine.label, reason });
    const unavailable = unavailableReason(machine);
    if (config === null || unavailable !== null) {
      skip(
        unavailable === "no-permission"
          ? t(($) => $.updates.noPermission)
          : unavailable === "already-updating"
            ? t(($) => $.updates.alreadyUpdating)
            : t(($) => $.updates.notConnected),
      );
      continue;
    }
    const selfUpdate = resolveServerSelfUpdateCapability(config);
    const managedDenial = managedMachineUpdateDenial(
      config,
      selfUpdate === "desktop-managed" ? undefined : targetVersion,
    );
    if (managedDenial !== undefined) {
      skip(managedDenial);
      continue;
    }
    const desktopAppUpdate = supportsDesktopAppUpdate(config);
    if (selfUpdate === null) {
      skip(t(($) => $.updates.needsAManualUpdate));
      continue;
    }
    if (selfUpdate === "desktop-managed" && !desktopAppUpdate) {
      skip(t(($) => $.updates.needsANewerDesktopApp));
      continue;
    }
    const serverVersion = config.environment.serverVersion;
    if (
      selfUpdate !== "desktop-managed" &&
      cliReleaseChannelOf(serverVersion) !== cliReleaseChannelOf(targetVersion)
    ) {
      skip(t(($) => $.updates.channelMismatch, { channel: cliReleaseChannelOf(serverVersion) }));
      continue;
    }
    const target: ServerUpdateTarget = {
      environmentId: machine.environmentId,
      serverLabel: machine.label,
      selfUpdate,
      installation: config.environment.capabilities.serverInstallation,
      desktopAppUpdate,
      targetVersion,
    };
    targets.push(target);
  }
  return { targets, skipped };
}

function unavailableReason(machine: UpdateEverythingMachine) {
  if (machine.serverConfig === null || !machine.connected) return "not-connected" as const;
  if (!machine.canMaintain) return "no-permission" as const;
  if (machine.updateState.status === "running") return "already-updating" as const;
  return null;
}

/** The latest release on the track a fleet switches to, as npm reports it. */
export interface ChannelSwitchRelease {
  readonly channel: DesktopUpdateChannel;
  readonly version: string;
  readonly databaseMigration: number | undefined;
}

export const channelSwitchLabel = (channel: DesktopUpdateChannel, t: TFunction<"workspace">) =>
  channel === "nightly" ? t(($) => $.updates.nightly) : t(($) => $.updates.stable);

/** Stable and Nightly each build their own commits, so either can hold migrations the other lacks.
 * Crossing tracks needs proof that the target release knows every migration the database holds. */
const crossesTrack = (fromVersion: string, release: ChannelSwitchRelease) =>
  desktopUpdateChannelOf(fromVersion) !== release.channel;

function channelSwitchBlockReason(
  fromVersion: string,
  release: ChannelSwitchRelease,
  currentMigration: number | undefined,
  t: TFunction<"workspace">,
): string | null {
  if (!crossesTrack(fromVersion, release)) return null;
  const from = channelSwitchLabel(desktopUpdateChannelOf(fromVersion), t);
  // Servers and releases from before this check report no migration number.
  if (currentMigration === undefined) {
    return t(($) => $.updates.serverPredatesChecks, { channel: from });
  }
  if (release.databaseMigration === undefined) {
    return t(($) => $.updates.releasePredatesChecks, {
      version: release.version,
      channel: channelSwitchLabel(release.channel, t),
    });
  }
  return currentMigration > release.databaseMigration
    ? t(($) => $.updates.databaseUnsupported, {
        version: release.version,
        from,
        to: channelSwitchLabel(release.channel, t),
      })
    : null;
}

/** This app's reinstall restarts every server it hosts, so each of their databases must allow the
 * switch. `backendCount` is the desktop's own inventory: a backend still starting has no client
 * entry yet. A cached config can outlive its connection, so only a connected server's head counts. */
export function localSwitchBlockReason(
  appVersion: string,
  release: ChannelSwitchRelease,
  hosted: ReadonlyArray<{
    readonly connected: boolean;
    readonly databaseMigration: number | undefined;
  }>,
  backendCount: number,
  t: TFunction<"workspace">,
): string | null {
  if (!crossesTrack(appVersion, release)) return null;
  if (
    hosted.length === 0 ||
    hosted.length < backendCount ||
    hosted.some((server) => !server.connected)
  ) {
    return t(($) => $.updates.itsServerIsNotConnectedSoItsDatabaseCannot);
  }
  return (
    hosted
      .map((server) => channelSwitchBlockReason(appVersion, release, server.databaseMigration, t))
      .find((reason) => reason !== null) ?? null
  );
}

/**
 * The server refuses these with the same message; say so before the run instead of after.
 * `targetVersion` is undefined when the server picks its own version, as desktop apps do.
 */
function managedMachineUpdateDenial(
  config: NonNullable<UpdateEverythingMachine["serverConfig"]>,
  targetVersion: string | undefined,
): string | undefined {
  const policy = config.managedPolicy;
  return (
    managedUpdatesDenial(policy) ??
    (policy !== undefined &&
    policy.limits?.updates?.allowNightly === false &&
    targetVersion !== undefined &&
    cliReleaseChannelOf(targetVersion) !== "stable"
      ? managedNightlyDeniedMessage(policy.organization)
      : undefined)
  );
}

/** Servers move to the release; desktop-managed hosts reinstall their app on its track. A desktop
 * host already current gets a track-only request, since its saved track may still differ. */
export function collectChannelSwitchTargets(
  machines: ReadonlyArray<UpdateEverythingMachine>,
  release: ChannelSwitchRelease,
  t: TFunction<"workspace">,
): { readonly targets: ServerUpdateTarget[]; readonly skipped: SkippedMachine[] } {
  const targets: ServerUpdateTarget[] = [];
  const skipped: SkippedMachine[] = [];
  for (const machine of machines) {
    const config = machine.serverConfig;
    if (machine.hostedByThisApp) continue;
    const skip = (reason: string) =>
      skipped.push({ environmentId: machine.environmentId, label: machine.label, reason });
    const target = (
      selfUpdate: ServerSelfUpdateCapability,
      targetVersion: string,
    ): ServerUpdateTarget => ({
      environmentId: machine.environmentId,
      serverLabel: machine.label,
      selfUpdate,
      installation: config?.environment.capabilities.serverInstallation,
      desktopAppUpdate: config !== null && supportsDesktopAppUpdate(config),
      targetVersion,
      ...(selfUpdate === "desktop-managed" ? { channel: release.channel } : {}),
      ...(release.databaseMigration === undefined
        ? {}
        : { targetDatabaseMigration: release.databaseMigration }),
    });
    const serverVersion = config?.environment.serverVersion;
    const sameTrack = serverVersion !== undefined && isOnTrack(serverVersion, release.channel);
    if (
      config !== null &&
      sameTrack &&
      resolveVersionMismatch(serverVersion, release.version) === null
    ) {
      const move = trackSwitchMove(config, true);
      if (
        !("skip" in move) &&
        move.selfUpdate === "desktop-managed" &&
        unavailableReason(machine) === null &&
        managedMachineUpdateDenial(config, release.version) === undefined
      ) {
        targets.push({ ...target(move.selfUpdate, serverVersion), trackOnly: true });
      }
      continue;
    }
    const unavailable = unavailableReason(machine);
    if (config === null || serverVersion === undefined || unavailable !== null) {
      skip(
        unavailable === "no-permission"
          ? t(($) => $.updates.noPermission)
          : unavailable === "already-updating"
            ? t(($) => $.updates.alreadyUpdating)
            : t(($) => $.updates.notConnected),
      );
      continue;
    }
    const managedDenial = managedMachineUpdateDenial(config, release.version);
    if (managedDenial !== undefined) {
      skip(managedDenial);
      continue;
    }
    const move = trackSwitchMove(config, sameTrack);
    if ("skip" in move) {
      skip(
        move.skip === "preview"
          ? t(($) => $.updates.runsAPreviewBuild)
          : move.skip === "manual"
            ? t(($) => $.updates.needsAManualUpdate)
            : move.skip === "desktop"
              ? t(($) => $.updates.needsANewerDesktopApp)
              : t(($) => $.updates.switchTheMacAppOnThatMac),
      );
      continue;
    }
    const blocked = channelSwitchBlockReason(
      serverVersion,
      release,
      config.environment.databaseMigration,
      t,
    );
    if (blocked !== null) {
      skip(blocked);
      continue;
    }
    // Service launchers only accept newer versions, so leaving for an older release is manual.
    if (
      move.selfUpdate === "boot-service" &&
      compareSemverVersions(release.version, serverVersion) <= 0
    ) {
      skip(
        t(($) => $.updates.manualChannelCommand, {
          command: `t3 update --channel ${release.channel === "nightly" ? "nightly" : "stable"} --allow-downgrade`,
        }),
      );
      continue;
    }
    targets.push(target(move.selfUpdate, release.version));
  }
  return { targets, skipped };
}

/** A remote host on the other track that a switch can still move, for retrying a partial switch. */
export function awaitsTrackSwitch(
  machine: Pick<UpdateEverythingMachine, "serverConfig" | "hostedByThisApp">,
  channel: DesktopUpdateChannel,
): boolean {
  const config = machine.serverConfig;
  return (
    !machine.hostedByThisApp &&
    config !== null &&
    !isOnTrack(config.environment.serverVersion, channel) &&
    !("skip" in trackSwitchMove(config, false))
  );
}

function isOnTrack(version: string, channel: DesktopUpdateChannel): boolean {
  return cliReleaseChannelOf(version) !== "preview" && desktopUpdateChannelOf(version) === channel;
}

/** How a switch moves a host, or why it never can from here, whatever the release. */
function trackSwitchMove(
  config: NonNullable<UpdateEverythingMachine["serverConfig"]>,
  sameTrack: boolean,
):
  | { readonly selfUpdate: ServerSelfUpdateCapability }
  | { readonly skip: "preview" | "manual" | "desktop" | "mac" } {
  if (cliReleaseChannelOf(config.environment.serverVersion) === "preview") {
    return { skip: "preview" as const };
  }
  const selfUpdate = resolveServerSelfUpdateCapability(config);
  if (selfUpdate === null) return { skip: "manual" as const };
  if (selfUpdate !== "desktop-managed") return { selfUpdate };
  if (config.environment.capabilities.desktopAppChannelSwitch !== true) {
    return { skip: "desktop" as const };
  }
  // Squirrel.Mac renames the bundle for the new track and then cannot relaunch it.
  if (!sameTrack && config.environment.platform.os === "darwin") {
    return { skip: "mac" as const };
  }
  return { selfUpdate };
}

export interface UpdateEverythingSteps<Providers, Servers> {
  readonly downloadLocal?: () => Promise<boolean>;
  readonly updateProviders: () => Promise<Providers>;
  readonly updateServers: () => Promise<Servers>;
}

/** Finish provider installs before server restarts. Install this app last when localReady; failed
 * downloads skip only that install. */
export async function runUpdateEverything<Providers, Servers>(
  steps: UpdateEverythingSteps<Providers, Servers>,
): Promise<{
  readonly localReady: boolean;
  readonly providers: Providers;
  readonly servers: Servers;
}> {
  const [localReady, remote] = await Promise.all([
    steps.downloadLocal?.() ?? Promise.resolve(true),
    steps
      .updateProviders()
      .then(async (providers) => ({ providers, servers: await steps.updateServers() })),
  ]);
  return { localReady, ...remote };
}

export type UpdateRunMachineStatus =
  | "providers"
  | "waiting"
  | "downloading"
  | "restarting"
  | "done"
  | "failed";

export interface UpdateRunMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly updatesProviders: boolean;
  readonly server: ServerUpdateTarget | null;
  readonly handedOffVersion: string | null;
  readonly startedAt: number;
  readonly result: "done" | "failed" | null;
  readonly failure: string | null;
  readonly providerFailure: string | null;
}

export interface UpdateEverythingRun {
  /** Track switches retry through their planner, which re-checks each database. */
  readonly trackSwitch?: boolean;
  readonly localVersion: string | null;
  readonly phase: "providers" | "servers" | "countdown" | "installing";
  readonly restartAt: number | null;
  readonly machines: ReadonlyArray<UpdateRunMachine>;
}

export function resolveUpdateRunMachineStatus(
  machine: UpdateRunMachine,
  phase: UpdateEverythingRun["phase"],
  serverState: ServerUpdateState,
): UpdateRunMachineStatus {
  if (machine.result !== null) return machine.result;
  if (machine.handedOffVersion !== null) return "restarting";
  if (phase === "providers" && machine.updatesProviders) return "providers";
  if (machine.server !== null && serverState.status === "running") {
    return serverState.stage === "resuming" ? "restarting" : "downloading";
  }
  return "waiting";
}

export function isServerUpdateHandedOff(state: ServerUpdateState): boolean {
  return state.status === "running" && state.stage === "resuming";
}

export function closeFinishedUpdateRun(run: UpdateEverythingRun): UpdateEverythingRun | null {
  return run.phase === "servers" &&
    run.localVersion === null &&
    run.machines.every((machine) => machine.result === "done")
    ? null
    : run;
}

const UPDATE_SLOW_AFTER_MS = 3 * 60 * 1000;

export function formatUpdateElapsed(ms: number, t: TFunction<"workspace">): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t(($) => $.updates.elapsedLessMinute);
  if (minutes < 60) return t(($) => $.updates.elapsedMinutes, { minutes });
  return t(($) => $.updates.elapsedHoursMinutes, {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

export interface UpdateRunMachineView {
  readonly machine: UpdateRunMachine;
  readonly status: UpdateRunMachineStatus;
}

export type UpdateRunLocalState =
  | { readonly status: "downloading"; readonly percent: number | null }
  | { readonly status: "waiting" }
  | null;

export interface UpdateCapsuleView {
  readonly tone: "default" | "slow" | "failed";
  readonly label: string;
  readonly slow?: { readonly status: string; readonly elapsed: string };
  readonly action: "later" | "retry" | "dismiss" | null;
}

const isActive = (status: UpdateRunMachineStatus) => status !== "done" && status !== "failed";

export function describeUpdateCapsule(
  run: UpdateEverythingRun,
  machines: ReadonlyArray<UpdateRunMachineView>,
  local: UpdateRunLocalState,
  now: number,
  t: TFunction<"workspace">,
): UpdateCapsuleView {
  if (run.phase === "countdown" && run.restartAt !== null) {
    const seconds = Math.max(0, Math.ceil((run.restartAt - now) / 1000));
    return { tone: "default", label: t(($) => $.updates.restartIn, { seconds }), action: "later" };
  }
  if (run.phase === "installing") {
    return { tone: "default", label: t(($) => $.updates.restarting), action: null };
  }
  const active = machines.filter(({ status }) => isActive(status) && status !== "waiting");
  const slowest = active.toSorted((a, b) => a.machine.startedAt - b.machine.startedAt)[0];
  if (slowest && now - slowest.machine.startedAt >= UPDATE_SLOW_AFTER_MS) {
    return {
      tone: "slow",
      label: slowest.machine.label,
      slow: {
        status: runStatusLabels(t)[slowest.status],
        elapsed: formatUpdateElapsed(now - slowest.machine.startedAt, t),
      },
      action: null,
    };
  }
  const done = machines.filter(({ status }) => status === "done").length;
  if (machines.some(({ status }) => isActive(status))) {
    return {
      tone: "default",
      label: t(($) => $.updates.doneMachines, { done, total: machines.length }),
      action: null,
    };
  }
  if (local?.status === "downloading") {
    return {
      tone: "default",
      label:
        local.percent === null
          ? t(($) => $.updates.downloadingNoPercent)
          : t(($) => $.updates.downloadingPercent, { percent: Math.floor(local.percent) }),
      action: null,
    };
  }
  const failed = machines.filter(({ status }) => status === "failed");
  if (failed.length > 0) {
    return {
      tone: "failed",
      label:
        failed.length === 1
          ? t(($) => $.updates.failedMachine, { machine: failed[0]!.machine.label })
          : t(($) => $.updates.failedMachines, { count: failed.length }),
      action:
        !run.trackSwitch && failed.some(({ machine }) => machine.server !== null)
          ? "retry"
          : "dismiss",
    };
  }
  return {
    tone: "default",
    label: t(($) => $.updates.doneMachines, { done, total: machines.length }),
    action: null,
  };
}

export function runStatusLabels(t: TFunction<"workspace">): Record<UpdateRunMachineStatus, string> {
  return {
    providers: t(($) => $.updates.statusProviders),
    waiting: t(($) => $.updates.statusWaiting),
    downloading: t(($) => $.updates.statusDownloading),
    restarting: t(($) => $.updates.statusRestarting),
    done: t(($) => $.updates.statusDone),
    failed: t(($) => $.updates.statusFailed),
  };
}

export interface UpdateEverythingResult {
  readonly localVersion: string | null;
  readonly updatedServers: number;
  readonly updatedProviders: number;
  readonly failures: ReadonlyArray<string>;
  readonly restarting: ReadonlyArray<string>;
}

export function collectUpdateEverythingResult(
  input: {
    readonly localVersion: string | null;
    readonly localFailures: ReadonlyArray<string>;
    readonly servers: ReadonlyArray<{
      readonly label: string;
      readonly outcome: ServerUpdateOutcome;
    }>;
    readonly providers: ReadonlyArray<
      | { readonly status: "interrupted" | "updated" }
      | { readonly status: "failed"; readonly line: string }
    >;
  },
  t: TFunction<"workspace">,
): UpdateEverythingResult {
  return {
    localVersion: input.localVersion,
    updatedServers: input.servers.filter(({ outcome }) => outcome.status === "updated").length,
    updatedProviders: input.providers.filter((outcome) => outcome.status === "updated").length,
    restarting: [],
    failures: [
      ...input.localFailures.map((failure) => t(($) => $.updates.localFailure, { error: failure })),
      ...input.servers.flatMap(({ label, outcome }) =>
        outcome.status === "failed" ? [`${label}: ${outcome.message}`] : [],
      ),
      ...input.providers.flatMap((outcome) => (outcome.status === "failed" ? [outcome.line] : [])),
    ],
  };
}

export function getUpdateEverythingToastView(
  result: UpdateEverythingResult,
  appVersion: string,
  t: TFunction<"workspace">,
): {
  readonly type: "success" | "error";
  readonly title: string;
  readonly description?: string;
} | null {
  const parts = [
    result.localVersion !== null && result.localVersion === appVersion
      ? t(($) => $.updates.thisAppLabel)
      : null,
    countLabel(result.updatedServers, "server", t),
    countLabel(result.updatedProviders, "provider", t),
  ].filter((part) => part !== null);
  const restarting =
    result.restarting.length === 0
      ? []
      : [
          t(($) => $.updates.stillRestarting, {
            machines: joinList(result.restarting, t),
            count: result.restarting.length,
          }),
        ];
  if (result.failures.length === 0) {
    if (parts.length === 0) return null;
    return {
      type: "success",
      title: t(($) => $.updates.updatedParts, { parts: joinList(parts, t) }),
      ...(restarting.length === 0 ? {} : { description: restarting.join("\n") }),
    };
  }
  return {
    type: "error",
    title:
      parts.length === 0
        ? t(($) => $.updates.updateFailed)
        : t(($) => $.updates.updatedParts, { parts: joinList(parts, t) }),
    description: [...result.failures, ...restarting].join("\n"),
  };
}

export interface UpdateEverythingPlan {
  readonly localVersion: string | null;
  /** Machines whose servers this app hosts; this app's update restarts them. */
  readonly localMachines: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly servers: ReadonlyArray<
    Pick<ServerUpdateTarget, "environmentId" | "serverLabel" | "selfUpdate" | "targetVersion">
  >;
  readonly providerMachines: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
    readonly providers: ReadonlyArray<string>;
  }>;
  readonly skipped: ReadonlyArray<SkippedMachine>;
}

export interface UpdateEverythingRow {
  readonly environmentId: EnvironmentId | null;
  readonly label: string;
  readonly app: "this-app" | "server" | "desktop-app" | null;
  readonly skipped: string | null;
  readonly providers: ReadonlyArray<string>;
}

function countLabel(
  count: number,
  noun: "server" | "provider",
  t: TFunction<"workspace">,
): string | null {
  return count === 0
    ? null
    : noun === "server"
      ? t(($) => $.updates.servers, { count })
      : t(($) => $.updates.providers, { count });
}

function joinList(parts: ReadonlyArray<string>, t: TFunction<"workspace">): string {
  const first = parts[0];
  if (first === undefined) return "";
  if (parts.length === 1) return first;
  const last = parts.at(-1);
  if (last === undefined) throw new Error("An update list requires a last item.");
  return parts.length === 2
    ? t(($) => $.updates.listTwo, { first, last })
    : t(($) => $.updates.listMany, { head: parts.slice(0, -1).join(", "), last });
}

/** One row per machine: this app's machines first, then servers, provider-only, and skipped. */
export function describeUpdateEverything(
  plan: UpdateEverythingPlan,
  t: TFunction<"workspace">,
): {
  readonly summary: string;
  readonly version: string | null;
  readonly providerCount: number;
  readonly rows: ReadonlyArray<UpdateEverythingRow>;
} {
  const providerCount = plan.providerMachines.reduce(
    (count, machine) => count + machine.providers.length,
    0,
  );
  const summary = t(($) => $.updates.updateParts, {
    parts: joinList(
      [
        plan.localVersion ? t(($) => $.updates.thisAppLabel) : null,
        countLabel(plan.servers.length, "server", t),
        countLabel(providerCount, "provider", t),
      ].filter((part) => part !== null),
      t,
    ),
  });

  const rows = new Map<EnvironmentId | null, UpdateEverythingRow>();
  const update = (
    environmentId: EnvironmentId | null,
    label: string,
    change: Partial<UpdateEverythingRow>,
  ) => {
    const row = rows.get(environmentId) ?? {
      environmentId,
      label,
      app: null,
      skipped: null,
      providers: [],
    };
    rows.set(environmentId, { ...row, ...change });
  };
  if (plan.localVersion) {
    if (plan.localMachines.length === 0)
      update(
        null,
        t(($) => $.updates.thisApp),
        { app: "this-app" },
      );
    for (const machine of plan.localMachines) {
      update(machine.environmentId, machine.label, { app: "this-app" });
    }
  }
  for (const server of plan.servers) {
    update(server.environmentId, server.serverLabel, {
      app: server.selfUpdate === "desktop-managed" ? "desktop-app" : "server",
    });
  }
  for (const machine of plan.providerMachines) {
    update(machine.environmentId, machine.label, { providers: machine.providers });
  }
  for (const machine of plan.skipped) {
    update(machine.environmentId, machine.label, { skipped: machine.reason });
  }

  return {
    summary,
    version:
      plan.localVersion ??
      plan.servers.find((server) => server.selfUpdate !== "desktop-managed")?.targetVersion ??
      null,
    providerCount,
    rows: Array.from(rows.values()),
  };
}
