import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";
import { DeviceHostUpdates } from "./DeviceHostUpdates";
import type { DevicePlatform, DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import { Check, CircleAlert } from "lucide-react";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { useAtomMount } from "@effect/atom-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { WizardHeader, WizardPanel, WizardSteps, WizardFooter } from "~/components/ui/wizard";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { deviceEnvironment, deviceHostProbeAtom, NO_DEVICE_PROBE_ATOM } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { cn } from "~/lib/utils";

const platformName = (platform: DevicePlatform) => (platform === "ios" ? "iOS" : "Android");

/** Platforms whose latest listing on a ready host may be missing devices. */
export const incompleteListings = (
  status: DeviceServiceState["hostStatuses"][string] | undefined,
) =>
  (["ios", "android"] as const).filter(
    (platform) =>
      status?.status === "ready" &&
      (status.incompletePlatforms?.includes(platform) ||
        (platform === "android" && status.androidDiscoveryIncomplete === true)),
  );

export const isAndroidDiscoveryUncertain = (state: DeviceServiceState) =>
  Object.values(state.hostStatuses).some((status) =>
    incompleteListings(status).includes("android"),
  );

/**
 * `hostStatus` only tracks this machine. A machine without simulator tooling never
 * starts its own hub, so setup and the panel must also count remote device hosts.
 */
export function deviceHubReadiness(state: DeviceServiceState) {
  const statuses = Object.values(state.hostStatuses).map((host) => host.status);
  const ready = state.hostStatus === "ready" || statuses.includes("ready");
  const busy =
    !ready &&
    [state.hostStatus, ...statuses].some(
      (status) => status === "installing" || status === "starting",
    );
  return { ready, busy };
}

/** A ready host keeps its devices usable but may still carry a discovery warning. */
function deviceHostDiagnostics(
  hosts: ReadonlyArray<Pick<DeviceServiceState["hosts"][number], "id" | "label">>,
  hostStatuses: DeviceServiceState["hostStatuses"],
) {
  return hosts.flatMap((host) => {
    const status = hostStatuses[host.id];
    return status?.status === "ready" && status.detail
      ? [{ hostId: host.id, label: host.label, detail: status.detail }]
      : [];
  });
}

function DeviceHostDiagnostics(props: {
  readonly hosts: ReadonlyArray<Pick<DeviceServiceState["hosts"][number], "id" | "label">>;
  readonly hostStatuses: DeviceServiceState["hostStatuses"];
  readonly className?: string;
}) {
  const diagnostics = deviceHostDiagnostics(props.hosts, props.hostStatuses);
  if (diagnostics.length === 0) return null;
  return (
    <div role="status" className={cn("space-y-1 text-xs text-muted-foreground", props.className)}>
      {diagnostics.map(({ hostId, label, detail }) => (
        <p key={hostId} className="whitespace-pre-line break-words">
          {label}: {detail}
        </p>
      ))}
    </div>
  );
}

export function platformSetupStatus(
  state: DeviceServiceState,
  platform: DevicePlatform,
  t: TFunction<"tools">,
) {
  const hasDevices = state.devices.some((device) => device.platform === platform);
  if (platform === "android" && !hasDevices && isAndroidDiscoveryUncertain(state)) {
    return {
      ready: false,
      message: t(($) => $.deviceAndroidIncomplete),
    };
  }
  const availabilities = state.hosts.flatMap((host) =>
    host.platforms
      .filter((candidate) => candidate.platform === platform)
      .map((candidate) => ({ ...candidate, host })),
  );
  const supportingHosts = availabilities
    .filter((candidate) => candidate.available)
    .map((candidate) => candidate.host);
  if (supportingHosts.length === 0) {
    return {
      ready: false,
      message:
        availabilities[0]?.reason ??
        t(($) => $.deviceSupportMissing, { platform: platformName(platform) }),
    };
  }
  const readyHosts = supportingHosts.filter(
    (host) =>
      state.hostStatuses[host.id]?.status === "ready" ||
      (host.kind === "local" && state.hostStatus === "ready"),
  );
  if (readyHosts.length > 0 && !hasDevices) {
    if (
      readyHosts.some((host) =>
        state.hostStatuses[host.id]?.incompletePlatforms?.includes(platform),
      )
    ) {
      return {
        ready: false,
        message: t(($) => $.deviceDiscoveryProblem, { platform: platformName(platform) }),
      };
    }
    return {
      ready: false,
      message:
        platform === "ios"
          ? t(($) => $.deviceIosRuntimeMissing)
          : t(($) => $.deviceAndroidVirtualMissing),
    };
  }
  const remoteHost = supportingHosts.every((host) => host.kind !== "local")
    ? supportingHosts[0]
    : undefined;
  return {
    ready: true,
    message:
      remoteHost?.kind === "eas"
        ? platform === "ios"
          ? t(($) => $.deviceIosCloud, { host: remoteHost.label })
          : t(($) => $.deviceAndroidCloud, { host: remoteHost.label })
        : platform === "ios"
          ? remoteHost
            ? t(($) => $.deviceIosAvailableHost, { host: remoteHost.label })
            : t(($) => $.deviceIosAvailable)
          : remoteHost
            ? t(($) => $.deviceAndroidAvailableHost, { host: remoteHost.label })
            : t(($) => $.deviceAndroidAvailable),
  };
}

export function DeviceSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly state: DeviceServiceState;
  readonly onComplete?: () => void;
}) {
  const { t } = useTranslation("tools");
  const canConfigure = useEnvironmentScope(props.environmentId, AuthSettingsWriteScope);
  const configure = useAtomCommand(deviceEnvironment.configure);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<"hub" | "check" | "agent" | "complete" | null>(null);
  const [step, setStep] = useState(0);
  const enabled = props.state.hostStatus !== "disabled";
  const { ready, busy } = deviceHubReadiness(props.state);
  const localPlatformsUnavailable = props.state.hosts.some(
    (host) => host.kind === "local" && !host.platforms.some((platform) => platform.available),
  );

  useAtomMount(enabled ? deviceHostProbeAtom(props.environmentId) : NO_DEVICE_PROBE_ATOM);

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean; onboardingCompleted?: boolean },
  ) => {
    if (!readEnvironmentScope(props.environmentId, AuthSettingsWriteScope)) return;
    setPending(kind);
    const result = await configure({ environmentId: props.environmentId, input });
    setPending(null);
    if (kind === "complete" && result._tag === "Success") props.onComplete?.();
  };

  return (
    <>
      <WizardHeader
        title={t(($) => $.deviceSetupTitle)}
        description={t(($) => $.deviceSetupDescription)}
      >
        <WizardSteps
          steps={[
            { id: "hub", label: t(($) => $.deviceHub) },
            { id: "simulators", label: t(($) => $.deviceSimulators) },
            { id: "agent-access", label: t(($) => $.deviceAgentAccess) },
          ]}
          currentStep={step}
          onStepChange={setStep}
          isStepDisabled={(requested) => busy || pending !== null || requested > step}
        />
      </WizardHeader>

      <WizardPanel>
        <DeviceHostUpdates state={props.state} environmentId={props.environmentId} />
        {step === 0 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">{t(($) => $.deviceEnableHubHeading)}</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{t(($) => $.deviceHubDescription)}</p>
              <Switch
                checked={enabled}
                disabled={!canConfigure || busy || pending !== null}
                aria-label={t(($) => $.deviceEnableHub)}
                onCheckedChange={(checked) =>
                  void update("hub", {
                    enabled: Boolean(checked),
                    ...(checked ? {} : { agentAccessEnabled: false }),
                  })
                }
              />
            </div>
            <DeviceHubSetupStatus
              state={props.state}
              pending={pending === "hub" || (busy && pending !== "agent")}
            />
          </section>
        ) : null}

        {step === 1 || (step === 0 && enabled && localPlatformsUnavailable) ? (
          <section className={cn("space-y-3 text-sm", step === 0 && "mt-4")}>
            <h3 className="font-medium">{t(($) => $.deviceCheckSupport)}</h3>
            <DevicePlatformSetup
              state={props.state}
              checking={pending === "check"}
              disabled={!enabled || busy || pending !== null}
              onCheck={() => {
                setPending("check");
                void list({ environmentId: props.environmentId, input: {} }).finally(() =>
                  setPending(null),
                );
              }}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">{t(($) => $.deviceAllowControl)}</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{t(($) => $.deviceAgentDescription)}</p>
              <Switch
                checked={props.state.agentAccessEnabled}
                disabled={!canConfigure || !enabled || busy || pending !== null}
                aria-label={t(($) => $.deviceAllowControlLabel)}
                onCheckedChange={(checked) =>
                  void update("agent", { agentAccessEnabled: Boolean(checked) })
                }
              />
            </div>
            <AgentDeviceSetupStatus state={props.state} pending={pending === "agent"} />
            <p className="text-xs text-muted-foreground">{t(($) => $.deviceManualControls)}</p>
          </section>
        ) : null}
        {props.state.hostStatus === "failed" && props.state.hostStatusDetail ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {props.state.hostStatusDetail}
          </p>
        ) : null}
      </WizardPanel>

      <WizardFooter>
        {step === 0 ? (
          <DialogClose render={<Button variant="outline" />}>{t(($) => $.cancel)}</DialogClose>
        ) : (
          <Button
            variant="outline"
            disabled={busy || pending !== null}
            onClick={() => setStep(step - 1)}
          >
            {t(($) => $.back)}
          </Button>
        )}
        {step < 2 ? (
          <Button disabled={!ready || pending !== null} onClick={() => setStep(step + 1)}>
            {t(($) => $.continue)}
          </Button>
        ) : (
          <Button
            disabled={!canConfigure || !ready || pending !== null}
            onClick={() => void update("complete", { onboardingCompleted: true })}
          >
            {pending === "complete" ? t(($) => $.saving) : t(($) => $.done)}
          </Button>
        )}
      </WizardFooter>
    </>
  );
}

export function DeviceHubSetupStatus({
  state,
  pending,
  compact = false,
}: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  const { t } = useTranslation("tools");
  if (!pending && !deviceHubReadiness(state).ready) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      {pending ? <Spinner size="xs" /> : <Check className="size-3 text-success" />}
      {pending
        ? state.hostStatus === "installing"
          ? compact
            ? t(($) => $.deviceInstalling)
            : t(($) => $.deviceInstallingHub)
          : state.hostStatus === "starting"
            ? compact
              ? t(($) => $.deviceStarting)
              : t(($) => $.deviceStartingHub)
            : compact
              ? t(($) => $.deviceUpdating)
              : t(($) => $.deviceUpdatingHub)
        : t(($) => $.deviceHubReady)}
    </p>
  );
}

function DevicePlatformSetup(props: {
  readonly state: DeviceServiceState;
  readonly checking: boolean;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}) {
  const { t } = useTranslation("tools");
  return (
    <div className="space-y-3">
      <PlatformStatus platform="iOS" status={platformSetupStatus(props.state, "ios", t)} />
      <PlatformStatus platform="Android" status={platformSetupStatus(props.state, "android", t)} />
      <DeviceHostDiagnostics hosts={props.state.hosts} hostStatuses={props.state.hostStatuses} />
      <p className="text-xs text-muted-foreground">{t(($) => $.deviceEitherPlatform)}</p>
      <Button size="compact" variant="outline" disabled={props.disabled} onClick={props.onCheck}>
        {props.checking ? <Spinner size="xs" /> : null}
        {props.checking ? t(($) => $.deviceChecking) : t(($) => $.deviceCheckAgain)}
      </Button>
    </div>
  );
}

export function AgentDeviceSetupStatus(props: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  const { t } = useTranslation("tools");
  if (props.pending) {
    const label =
      props.state.hostStatus === "installing"
        ? props.compact
          ? t(($) => $.deviceInstalling)
          : t(($) => $.deviceInstallingAgent)
        : props.state.hostStatus === "starting"
          ? props.compact
            ? t(($) => $.deviceStarting)
            : t(($) => $.deviceStartingAgent)
          : props.compact
            ? t(($) => $.deviceUpdating)
            : t(($) => $.deviceUpdatingAccess);
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size="xs" />
        {label}
      </p>
    );
  }
  if (
    props.state.agentAccessEnabled &&
    deviceHubReadiness(props.state).ready &&
    props.state.hosts.some((host) => host.agentDeviceInstalled)
  ) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3 text-success" />
        {t(($) => $.deviceAgentReady)}
      </p>
    );
  }
  return null;
}

function PlatformStatus(props: {
  readonly platform: string;
  readonly status: { readonly ready: boolean; readonly message: string };
  readonly compact?: boolean;
}) {
  const { t } = useTranslation("tools");
  return (
    <div
      className={cn("flex gap-2", !props.compact && "rounded-md border border-border/60 px-3 py-2")}
    >
      {props.status.ready ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className={cn(props.compact && props.status.ready && "flex items-center gap-2")}>
        <p className="font-medium">{props.platform}</p>
        <p className="text-xs text-muted-foreground">
          {props.compact && props.status.ready ? t(($) => $.ready) : props.status.message}
        </p>
      </div>
    </div>
  );
}
