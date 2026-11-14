import { useAuth } from "@clerk/react";
import { useAtomValue } from "@effect/atom-react";
import { offersLinkedEnvironments } from "@t3tools/client-runtime/link-request";
import {
  AuthAccessWriteScope,
  AuthMcpClientAccess,
  AuthRelayReadScope,
  type EnvironmentConnectReachability,
  type EnvironmentId,
  managedCapabilityDenial,
  managedRuntimeModeDenial,
  mcpClientScopes,
  sessionGrantsScope,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import * as Result from "effect/Result";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import { checkReachability, readLinkState } from "~/cloud/linkEnvironmentAtoms";
import { isManagedTunnelActive } from "~/cloud/t3ConnectState";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { readCachedCloudLinkState } from "~/cloud/cloudLinkState";
import { useCloudLinkController } from "~/cloud/useCloudLinkController";
import { isDesktopLocalConnectionTarget } from "~/connection/desktopLocal";
import { isElectron } from "~/env";
import { useT3ConnectTurnOn } from "~/cloud/useT3ConnectTurnOn";
import { useCopyToClipboard, writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { useNowSecond } from "~/hooks/useNowSecond";
import { readLocalApi } from "~/localApi";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  type EnvironmentPresentation,
  useEnvironmentIdentities,
  usePrimaryEnvironmentId,
} from "~/state/environments";
import { useManagedPolicy } from "~/state/managedPolicy";
import { mintMcpApprovalCodeOn } from "~/state/peerPairingCode";
import { peerLinkEnvironment } from "~/state/peerLinks";
import { useEnvironmentQuery } from "~/state/query";
import { relayEnvironmentDiscovery } from "~/state/relay";
import { useEnvironmentScope, useEnvironmentSessionState } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { CommandBlock } from "../CommandBlock";
import { AccessOption, getAccessConfig } from "../auth/ConnectAgentSurface";
import { useAccessEnvironment } from "../settings/useAccessEnvironment";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { RadioGroup } from "../ui/radio-group";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { WizardFooter, WizardHeader, WizardPanel, WizardPopup, WizardSteps } from "../ui/wizard";
import { afterFailedCheck, resolveMcpGate } from "./mcpGate";
import { MCP_APPS, type McpApp, mcpHandoffAction, OTHER_MCP_APP_STEPS } from "./mcpApps";

const requestAtom = Atom.make<{ readonly environmentId: EnvironmentId | null } | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("mcp:use-in-another-app"),
);

export function openUseInAnotherApp(environmentId: EnvironmentId | null): void {
  appAtomRegistry.set(requestAtom, { environmentId });
}

const close = () => appAtomRegistry.set(requestAtom, null);

export function UseInAnotherAppDialogHost() {
  const request = useAtomValue(requestAtom);
  return request === null ? null : <UseInAnotherAppDialog requested={request.environmentId} />;
}

function UseInAnotherAppDialog({ requested }: { readonly requested: EnvironmentId | null }) {
  const { t } = useTranslation("connect");
  const { environment, label } = useAccessEnvironment(requested);
  const title = t(($) => $.mcp.title, { environment: label ?? "T3 Code" });
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <WizardPopup>
        {environment !== null && hasCloudPublicConfig() ? (
          <Wizard key={environment.environmentId} environment={environment} title={title} />
        ) : (
          <>
            <WizardHeader title={title} />
            <WizardPanel>
              <GateMessage
                title={
                  environment === null ? t(($) => $.mcp.connectFirst) : t(($) => $.mcp.unavailable)
                }
              />
            </WizardPanel>
          </>
        )}
      </WizardPopup>
    </Dialog>
  );
}

type Step = 0 | 1 | 2;
type Choice = McpApp | "other";

function Wizard({
  environment,
  title,
}: {
  readonly environment: EnvironmentPresentation;
  readonly title: string;
}) {
  const { t } = useTranslation("connect");
  const gate = useGate(environment);
  const levels = useGrantableLevels(environment);
  const [step, setStep] = useState<Step>(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [picked, setPicked] = useState<AuthMcpClientAccess | null>(null);
  const access = picked ?? DEFAULT_LEVELS.find((level) => levels.get(level) === undefined) ?? null;
  const open = gate.gate.kind === "open";
  const hostedApproval =
    environment.serverConfig?.environment.capabilities.mcpHostedApproval === true;
  const appStep = { id: "app", label: t(($) => $.agent.appLabel) };
  const connectStep = { id: "connect", label: t(($) => $.mcp.stepConnect) };
  const steps = hostedApproval
    ? [appStep, connectStep]
    : [appStep, { id: "access", label: t(($) => $.agent.access) }, connectStep];
  const shownStep = hostedApproval && step === 2 ? 1 : step;
  const next = () => setStep(step === 0 ? (hostedApproval ? 2 : 1) : 2);
  const appName = choice === null || choice === "other" ? t(($) => $.mcp.theApp) : choice.name;
  return (
    <>
      <WizardHeader title={title}>
        {open ? (
          <WizardSteps
            steps={steps}
            currentStep={shownStep}
            isStepDisabled={(index) => index > shownStep}
            onStepChange={(index) => setStep(hostedApproval && index === 1 ? 2 : (index as Step))}
          />
        ) : null}
      </WizardHeader>
      <WizardPanel>
        {gate.gate.kind !== "open" ? (
          <GateScreen environment={environment} gate={gate} />
        ) : step === 0 ? (
          <AppStep choice={choice} onChoose={setChoice} />
        ) : step === 1 ? (
          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t(($) => $.mcp.whatCanDo, { app: appName })}</h3>
            <RadioGroup
              aria-label={t(($) => $.mcp.whatCanDo, { app: appName })}
              value={access}
              onValueChange={(value) => setPicked(value as AuthMcpClientAccess)}
            >
              {AuthMcpClientAccess.literals.map((level) => (
                <AccessOption
                  key={level}
                  access={level}
                  selected={level === access}
                  disabledReason={levels.get(level)}
                  description={
                    level === "full-access" ? t(($) => $.mcp.fullAccessDescription) : null
                  }
                />
              ))}
            </RadioGroup>
          </section>
        ) : choice !== null && (hostedApproval || access !== null) ? (
          <ConnectStep
            environment={environment}
            mcpUrl={gate.gate.mcpUrl}
            choice={choice}
            access={hostedApproval ? null : access}
          />
        ) : null}
      </WizardPanel>
      {open ? (
        <WizardFooter
          leading={step === 2 ? <ManageAccessButton environment={environment} /> : undefined}
        >
          {step === 1 ? (
            <Button variant="outline" onClick={() => setStep(0)}>
              {t(($) => $.mcp.back)}
            </Button>
          ) : null}
          {step === 2 ? (
            <Button onClick={close}>{t(($) => $.mcp.done)}</Button>
          ) : (
            <Button disabled={step === 0 ? choice === null : access === null} onClick={next}>
              {t(($) => $.mcp.next)}
            </Button>
          )}
        </WizardFooter>
      ) : null}
    </>
  );
}

const DEFAULT_LEVELS: readonly AuthMcpClientAccess[] = [
  "auto",
  "auto-accept-edits",
  "approval-required",
  "read-only",
];

function useGrantableLevels(environment: EnvironmentPresentation) {
  const { t } = useTranslation("connect");
  const environmentId = environment.environmentId;
  const session = useEnvironmentSessionState(environmentId).data;
  const canMint = useEnvironmentScope(environmentId, AuthAccessWriteScope);
  const policy = useManagedPolicy(environmentId);
  const remoteDenial = managedCapabilityDenial(policy, "remoteClients");
  return new Map(
    AuthMcpClientAccess.literals.flatMap((level) => {
      const reason =
        remoteDenial ??
        (!canMint
          ? t(($) => $.mcp.needsManageAccess, { environment: environment.label })
          : session === null ||
              !mcpClientScopes(level).every((scope) => sessionGrantsScope(session, scope))
            ? t(($) => $.mcp.cannotGrant, { environment: environment.label })
            : level === "read-only"
              ? undefined
              : managedRuntimeModeDenial(policy, level));
      return reason === undefined ? [] : [[level, reason] as const];
    }),
  );
}

function useGate(environment: EnvironmentPresentation) {
  const environmentId = environment.environmentId;
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const controller = useCloudLinkController(environmentId);
  const canReadRelay = useEnvironmentScope(environmentId, AuthRelayReadScope);
  const thisMachine =
    environmentId === usePrimaryEnvironmentId() ||
    isDesktopLocalConnectionTarget(environment.entry.target);
  const discovery = useAtomValue(relayEnvironmentDiscovery.stateValueAtom);
  const refreshDiscovery = useAtomCommand(relayEnvironmentDiscovery.refresh, {
    reportFailure: false,
  });
  const runCheck = useAtomCommand(checkReachability, { reportFailure: false });
  const readState = useAtomCommand(readLinkState, { reportFailure: false });
  const [check, setCheck] = useState<
    | "idle"
    | "running"
    | { readonly result: EnvironmentConnectReachability | null; readonly since: string | null }
  >("idle");
  const [connecting, setConnecting] = useState(false);
  const linkState = controller.linkState.data;
  const reported = linkState?.reachability;
  const serverConfig = environment.serverConfig;
  const connected = environment.connection.phase === "connected";
  const relayEntry = discovery.environments.get(environmentId);
  const gate = resolveMcpGate({
    signedIn: isSignedIn,
    connected,
    approvalCodes:
      serverConfig === null
        ? undefined
        : serverConfig.environment.capabilities.mcpApprovalCodes === true,
    canReadRelay,
    linkState,
    linkStateError: controller.linkState.error,
    thisMachine,
    relay:
      !discovery.refreshing && (discovery.offline || Option.isSome(discovery.error))
        ? { status: "failed" }
        : discovery.listed
          ? {
              status: "listed",
              endpoint: relayEntry?.environment.endpoint,
              availability: relayEntry?.availability,
            }
          : { status: "loading" },
    reachability:
      typeof check === "string"
        ? "checking"
        : reported !== undefined && check.since !== null && reported.checkedAt > check.since
          ? reported
          : check.result,
  });
  const runReachabilityCheck = async () => {
    setCheck("running");
    if (!thisMachine) void refreshDiscovery();
    const prior = readCachedCloudLinkState({ environmentId });
    const result = await runCheck({ target: { environmentId } });
    controller.linkState.refresh();
    if (result._tag === "Success") {
      setCheck({ result: result.value, since: result.value.checkedAt });
      return;
    }
    const latest = await readState({ target: { environmentId } });
    setCheck(afterFailedCheck(prior, latest._tag === "Success" ? latest.value : null));
  };
  const turnOn = async () => {
    setConnecting(true);
    const ok = await controller.reconcileCloudState({
      managedTunnel: true,
      publish: controller.publishAgentActivity,
    });
    if (!ok) setConnecting(false);
  };
  const canCheck = connected && linkState !== null && isManagedTunnelActive(linkState, undefined);
  const checkOnce = useEffectEvent(() => {
    if (check === "idle") void runReachabilityCheck();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the server to check its tunnel once one exists
  useEffect(() => {
    if (canCheck) queueMicrotask(checkOnce);
  }, [canCheck]);
  const discoverIfUnasked = useEffectEvent(() => {
    if (!thisMachine && !discovery.listed && !discovery.refreshing) void refreshDiscovery();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks T3 Connect for its machine list once the wizard opens signed in
  useEffect(() => {
    if (isSignedIn) discoverIfUnasked();
  }, [isSignedIn]);
  const waiting = gate.kind === "offline" || (connecting && gate.kind === "turn-on");
  const refreshLinkState = useEffectEvent(() => controller.linkState.refresh());
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the server's link state while the tunnel starts; the server has no push for it
  useEffect(() => {
    if (!waiting) return;
    const interval = window.setInterval(() => refreshLinkState(), 5_000);
    return () => window.clearInterval(interval);
  }, [waiting]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- stops showing Connecting once a started tunnel has had time to come up
  useEffect(() => {
    if (!connecting) return;
    const timeout = window.setTimeout(() => setConnecting(false), 90_000);
    return () => window.clearTimeout(timeout);
  }, [connecting]);
  return {
    gate,
    connecting: connecting && gate.kind !== "open",
    check: runReachabilityCheck,
    refreshList: () => void refreshDiscovery(),
    turnOn,
    operationError: controller.operationError,
    tunnelLimit: controller.tunnelLimit,
  };
}

type Gate = ReturnType<typeof useGate>;

function GateScreen({
  environment,
  gate: { gate, connecting, check, refreshList, turnOn, operationError, tunnelLimit },
}: {
  readonly environment: EnvironmentPresentation;
  readonly gate: Gate;
}) {
  const { t } = useTranslation("connect");
  const name = environment.label;
  const turnOnHere = useT3ConnectTurnOn(environment.environmentId);
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  const retry = (onClick: () => void) => (
    <Button variant="outline" onClick={onClick}>
      {t(($) => $.mcp.checkAgain)}
    </Button>
  );
  const checkAgain = retry(() => void check());
  switch (gate.kind) {
    case "checking":
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" tone="muted" />
          {t(($) => $.mcp.checking)}
        </p>
      );
    case "sign-in":
      return (
        <GateMessage
          title={t(($) => $.profile.signIn)}
          lines={[
            t(($) => $.mcp.cloudApps, { environment: name }),
            t(($) => $.mcp.addressGiven, { environment: name }),
          ]}
        >
          <Button
            onClick={() => {
              close();
              openAuthPrompt();
            }}
          >
            {t(($) => $.profile.signIn)}
          </Button>
        </GateMessage>
      );
    case "disconnected":
      return gate.relay === null ? (
        <GateMessage title={t(($) => $.mcp.connectTo, { environment: name })} />
      ) : (
        <GateMessage
          title={
            gate.relay === "offline"
              ? t(($) => $.mcp.offline, { environment: name })
              : t(($) => $.mcp.cannotCheck, { environment: name })
          }
        >
          {retry(refreshList)}
        </GateMessage>
      );
    case "update":
      return <GateMessage title={t(($) => $.mcp.update, { environment: name })} />;
    case "no-relay-read":
      return (
        <GateMessage
          title={t(($) => $.mcp.cannotCheck, { environment: name })}
          lines={[t(($) => $.mcp.needsRelayRead, { environment: name })]}
        />
      );
    case "error":
      return (
        <GateMessage
          title={t(($) => $.mcp.cannotCheck, { environment: name })}
          lines={[gate.message]}
        >
          {checkAgain}
        </GateMessage>
      );
    case "turn-on":
    case "offline": {
      if (gate.kind === "offline" && !connecting) {
        const reachability = gate.reachability;
        return (
          <GateMessage
            title={
              reachability
                ? t(($) => $.mcp.offline, { environment: name })
                : t(($) => $.mcp.cannotCheck, { environment: name })
            }
            lines={
              reachability
                ? [reachability.reason, t(($) => $.mcp.fix, { fix: reachability.fix })]
                : []
            }
          >
            {checkAgain}
          </GateMessage>
        );
      }
      return (
        <GateMessage
          title={t(($) => $.mcp.turnOnTitle, { environment: name })}
          lines={[
            t(($) => $.mcp.publicAddress, { environment: name }),
            t(($) => $.mcp.approvedOnly),
          ]}
        >
          {turnOnHere.kind === "here" ? (
            <div className="space-y-2">
              <Button disabled={connecting} onClick={() => void turnOn()}>
                {connecting ? t(($) => $.mcp.connecting) : t(($) => $.mcp.turnOn)}
              </Button>
              {operationError ? (
                <p className="text-xs text-destructive-foreground">{operationError}</p>
              ) : null}
              {tunnelLimit !== null ? (
                <>
                  <p className="text-sm text-destructive-foreground">
                    {t(($) => $.mcp.outOfTunnels)}
                  </p>
                  <ManageAccessButton
                    environment={environment}
                    label={t(($) => $.tunnels.manage)}
                  />
                </>
              ) : null}
            </div>
          ) : turnOnHere.kind === "policy" ? (
            <p className="text-sm text-muted-foreground">{turnOnHere.reason}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <CommandBlock command="t3 connect link" />
              <p>{t(($) => $.mcp.restart, { environment: name })}</p>
              {checkAgain}
            </div>
          )}
        </GateMessage>
      );
    }
    case "open":
      return null;
  }
}

function GateMessage({
  title,
  lines = [],
  children,
}: {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-medium">{title}</h3>
      {lines.length > 0 ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function AppStep({
  choice,
  onChoose,
}: {
  readonly choice: Choice | null;
  readonly onChoose: (choice: Choice) => void;
}) {
  const { t } = useTranslation("connect");
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t(($) => $.mcp.whichApp)}</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MCP_APPS.filter((app) => !app.hidden).map((app) => (
          <button
            key={app.id}
            type="button"
            aria-pressed={choice === app}
            onClick={() => onChoose(app)}
            className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-transparent px-1 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/8"
          >
            <img
              src={app.logo}
              alt=""
              className="size-10 rounded-lg ring-1 ring-black/10 dark:ring-white/12"
            />
            <span className="max-w-full truncate whitespace-nowrap text-xs font-medium">
              {app.name}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={choice === "other"}
        onClick={() => onChoose("other")}
        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/8"
      >
        {t(($) => $.mcp.somethingElse)}
      </button>
    </section>
  );
}

function ConnectStep({
  environment,
  mcpUrl,
  choice,
  access,
}: {
  readonly environment: EnvironmentPresentation;
  readonly mcpUrl: string;
  readonly choice: Choice;
  readonly access: AuthMcpClientAccess | null;
}) {
  const { t } = useTranslation("connect");
  const { t: tCommon } = useTranslation("common");
  const [anotherWay, setAnotherWay] = useState(choice === "other");
  const app = choice === "other" ? null : choice;
  const code =
    access === null ? (
      <p className="text-sm text-muted-foreground">
        {t(($) => $.mcp.approveOnSignIn, { app: app?.name ?? t(($) => $.mcp.theApp) })}
      </p>
    ) : (
      <ApprovalCode
        key={access}
        environmentId={environment.environmentId}
        name={environment.label}
        access={access}
      />
    );
  if (anotherWay || app === null) {
    const message = app?.handoff.kind === "copy-message" ? app.handoff.message(mcpUrl) : null;
    return (
      <section className="space-y-4">
        <CopyRow label={t(($) => $.mcp.url)} value={mcpUrl} />
        {message ? <CopyRow label={t(($) => $.mcp.message)} value={message} /> : null}
        <ol className="list-decimal space-y-1 ps-5 text-sm">
          {(app?.steps ?? OTHER_MCP_APP_STEPS).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {app === null ? (
          <p className="text-xs text-muted-foreground">{t(($) => $.mcp.clientIdUnsupported)}</p>
        ) : app.docs ? (
          <TextButton onClick={() => openLink(app.docs ?? "", tCommon)}>
            {t(($) => $.mcp.appHelp, { app: app.name })}
          </TextButton>
        ) : null}
        {code}
        {app === null ? null : (
          <TextButton onClick={() => setAnotherWay(false)}>
            {app.handoff.kind === "commands"
              ? t(($) => $.mcp.backToCommands)
              : t(($) => $.mcp.backToOneClick)}
          </TextButton>
        )}
        <LinkedLine environment={environment} access={access} />
      </section>
    );
  }
  return (
    <section className="space-y-4">
      <PrimaryAction app={app} mcpUrl={mcpUrl} />
      <CopyRow label={t(($) => $.mcp.url)} value={mcpUrl} />
      {code}
      <TextButton onClick={() => setAnotherWay(true)}>{t(($) => $.mcp.anotherWay)}</TextButton>
      <LinkedLine environment={environment} access={access} />
    </section>
  );
}

function TextButton({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
    >
      {children}
    </button>
  );
}

function openLink(url: string, t: TFunction<"common">) {
  void readLocalApi()
    ?.shell.openExternal(url)
    .catch((error: unknown) =>
      toastManager.add({
        type: "error",
        title: t(($) => $.errors.linkFailed),
        description: error instanceof Error ? error.message : url,
      }),
    );
}

function PrimaryAction({ app, mcpUrl }: { readonly app: McpApp; readonly mcpUrl: string }) {
  const { t } = useTranslation("connect");
  const { t: tCommon } = useTranslation("common");
  const action = mcpHandoffAction(app, mcpUrl);
  const note = app.note ? <p className="text-xs text-muted-foreground">{app.note}</p> : null;
  if (action === null) {
    return (
      <div className="space-y-2">
        {app.handoff.kind === "commands"
          ? app.handoff
              .commands(mcpUrl)
              .map((command) => <CommandBlock key={command} command={command} />)
          : null}
        <p className="text-xs text-muted-foreground">
          {t(($) => $.mcp.runWhere, { app: app.name })}
        </p>
        {note}
      </div>
    );
  }
  const { copy, link, appLink } = action;
  const openApp = () => {
    if (appLink === null) return openLink(link, tCommon);
    if (!isElectron) return window.location.assign(appLink);
    void readLocalApi()
      ?.shell.openExternal(appLink)
      .catch(() => openLink(link, tCommon));
  };
  const handOff = async () => {
    if (copy !== null) {
      const copied = await writeTextToClipboard(copy.text, copy.title).catch(() => false);
      if (!copied) {
        toastManager.add({
          type: "error",
          title: t(($) => $.mcp.copyFailed),
          description: t(($) => $.mcp.useAnotherWay),
        });
        return;
      }
      toastManager.add({
        type: "success",
        title: copy.title,
        ...(isElectron && appLink === null
          ? {}
          : {
              actionProps: {
                children:
                  appLink === null
                    ? t(($) => $.mcp.openApp, { app: app.name })
                    : t(($) => $.mcp.getApp, { app: app.name }),
                onClick: () => openLink(link, tCommon),
              },
            }),
      });
    }
    openApp();
  };
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={() => void handOff()}>
        {action.label}
      </Button>
      {note}
    </div>
  );
}

function ApprovalCode({
  environmentId,
  name,
  access,
}: {
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly access: AuthMcpClientAccess;
}) {
  const { t } = useTranslation("connect");
  const { t: tChat } = useTranslation("chat");
  const [code, setCode] = useState<{
    readonly credential: string;
    readonly expiresAt: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNowSecond();
  const live = code !== null && now < code.expiresAt;
  const mint = async () => {
    setPending(true);
    setError(null);
    const result = await mintMcpApprovalCodeOn(environmentId, access);
    setPending(false);
    if (Result.isSuccess(result)) {
      setCode({
        credential: result.success.credential,
        expiresAt: result.success.expiresAt.epochMilliseconds,
      });
    } else {
      setError(t(($) => $.mcp.codeFailed, { environment: name }));
    }
  };
  const left = code === null ? 0 : Math.max(0, Math.floor((code.expiresAt - now) / 1000));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <Trans
            t={t}
            i18nKey={($) => $.mcp.codeToApprove}
            components={{
              level: <span className="font-medium">{getAccessConfig(t, tChat)[access].label}</span>,
            }}
          />
        </span>
        {live ? null : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void mint()}>
            {pending
              ? t(($) => $.mcp.gettingCode)
              : code === null
                ? t(($) => $.mcp.getCode)
                : t(($) => $.mcp.newCode)}
          </Button>
        )}
      </div>
      {code !== null ? (
        live ? (
          <>
            <CopyRow label={t(($) => $.mcp.code)} value={code.credential} />
            <p className="text-xs text-muted-foreground">
              {t(($) => $.mcp.expires, {
                time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
              })}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t(($) => $.mcp.expired)}</p>
        )
      ) : null}
      {error ? <p className="text-xs text-destructive-foreground">{error}</p> : null}
    </div>
  );
}

function CopyRow({ label, value }: { readonly label: string; readonly value: string }) {
  const { t } = useTranslation("connect");
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 1500, target: label });
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{value}</span>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={t(($) => $.mcp.copyLabel, { label })}
        onClick={() => copyToClipboard(value, undefined)}
      >
        {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </Button>
    </div>
  );
}

const levelRank = (level: AuthMcpClientAccess) => AuthMcpClientAccess.literals.indexOf(level);

function LinkedLine({
  environment,
  access,
}: {
  readonly environment: EnvironmentPresentation;
  readonly access: AuthMcpClientAccess | null;
}) {
  const { t } = useTranslation("connect");
  const { t: tChat } = useTranslation("chat");
  const offered = offersLinkedEnvironments(environment.serverConfig);
  const links = useEnvironmentQuery(
    offered
      ? peerLinkEnvironment.list({ environmentId: environment.environmentId, input: {} })
      : null,
  ).data?.links;
  const identities = useEnvironmentIdentities();
  if (!offered || links === undefined || links.length === 0) return null;
  const accessConfig = getAccessConfig(t, tChat);
  const named = links.map((link) => {
    const name =
      identities.find((identity) => identity.environmentId === link.environmentId)?.label ??
      link.label;
    const level =
      access === null || levelRank(link.access) < levelRank(access) ? link.access : access;
    return `${name} · ${link.status === "expired" ? t(($) => $.mcp.linkExpired) : accessConfig[level].label}`;
  });
  return (
    <p className="text-xs text-muted-foreground">
      {t(($) => $.mcp.linked, { links: named.join(", ") })}
    </p>
  );
}

function ManageAccessButton({
  environment,
  label,
}: {
  readonly environment: EnvironmentPresentation;
  readonly label?: string;
}) {
  const { t } = useTranslation("connect");
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        close();
        void navigate({ to: "/settings/access", search: { machine: environment.environmentId } });
      }}
    >
      {label ?? t(($) => $.mcp.manageAccess)}
    </Button>
  );
}
