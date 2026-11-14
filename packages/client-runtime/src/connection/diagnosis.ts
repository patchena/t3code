import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  t3ConnectTroubleshootingUrl,
  type T3ConnectTroubleshootingSection,
} from "@t3tools/contracts";
import type { RelayEnvironmentStatusResponse } from "@t3tools/contracts/relay";
import * as DateTime from "effect/DateTime";

import type {
  ConnectionAttemptError,
  ConnectionFailureCause,
  ConnectionHop,
  SupervisorConnectionState,
} from "./model.ts";

export type ConnectionHopResult = "ok" | "failed" | "unchecked";

export interface ConnectionDiagnosisHop {
  readonly hop: ConnectionHop;
  readonly label: string;
  readonly result: ConnectionHopResult;
}

export interface ConnectionDiagnosis {
  /** Names the part that failed, e.g. "Mac mini's tunnel is offline". */
  readonly headline: string;
  readonly hops: ReadonlyArray<ConnectionDiagnosisHop>;
  readonly steps: ReadonlyArray<string>;
  readonly facts: ReadonlyArray<readonly [label: string, value: string]>;
  /** The troubleshooting guide section for this failure. Null for direct routes, except a pending T3 Connect sign-in. */
  readonly moreInfoUrl: string | null;
}

export interface ConnectionDiagnosisInput {
  readonly hostLabel: string;
  readonly state: SupervisorConnectionState;
  /** The environment's usual route, used when the failure does not name one. */
  readonly via: "relay" | "direct";
  /** The relay's last health check, which can name a cause before any connect attempt. */
  readonly relayStatus?: Pick<
    RelayEnvironmentStatusResponse,
    "status" | "endpointFailure" | "endpointStatus" | "offlineReason"
  > | null;
  readonly clientVersion?: string | undefined;
  readonly serverVersion?: string | null | undefined;
}

interface Located {
  readonly hop: ConnectionHop;
  readonly cause:
    | ConnectionFailureCause
    | "offline"
    | "outdated"
    | "released"
    | "session_pending"
    | null;
  /** The failure named no hop, so the hops before this one were never probed. */
  readonly guessed?: true;
}

const NOT_ANSWERING: ReadonlySet<ConnectionFailureCause> = new Set([
  "origin_unreachable",
  "invalid_response",
]);

function locate(input: ConnectionDiagnosisInput): Located | null {
  const failure = input.state.lastFailure;
  if (input.state.network === "offline" || input.state.phase === "offline") {
    return { hop: "device", cause: "offline" };
  }
  if (failure?._tag === "ConnectionBlockedError" && failure.serverUpdateRequired) {
    return { hop: "server", cause: "outdated" };
  }
  if (failure?.reason === "session-pending") {
    return { hop: "device", cause: "session_pending" };
  }
  if (failure?.hop !== undefined) {
    return { hop: failure.hop, cause: failure.failureCause ?? null };
  }
  if (failure !== null) {
    const unreachable =
      failure.reason === "network" ||
      failure.reason === "timeout" ||
      failure.reason === "transport";
    const via = failure.via ?? input.via;
    return {
      hop: unreachable && via === "relay" ? "tunnel" : "server",
      cause: null,
      guessed: true,
    };
  }
  const status = input.relayStatus;
  if (status?.status !== "offline") return null;
  if (status.offlineReason === "tunnel_released") return { hop: "tunnel", cause: "released" };
  const cause = status.endpointFailure ?? null;
  return { hop: cause !== null && NOT_ANSWERING.has(cause) ? "server" : "tunnel", cause };
}

function headline(
  host: string,
  located: Located,
  failure: ConnectionAttemptError | null,
  t: TFunction<"connect">,
): string {
  switch (located.cause) {
    case "offline":
      return t(($) => $.diagnosis.offline);
    case "session_pending":
      return t(($) => $.diagnosis.sessionPending);
    case "approval_pending":
      return t(($) => $.diagnosis.approvalPending, { host });
    case "outdated":
      return t(($) => $.diagnosis.outdated, { host });
    case "clock_skew":
      return t(($) => $.diagnosis.clock);
    case "not_linked":
      return t(($) => $.diagnosis.notLinked, { host });
    case "relay_error":
      return t(($) => $.diagnosis.relayError);
    case "tunnel_pending":
      return t(($) => $.diagnosis.pending, { host });
    case "tunnel_not_enabled":
      return t(($) => $.diagnosis.notEnabled, { host });
    case "released":
    case "tunnel_down":
      return t(($) => $.diagnosis.tunnelOffline, { host });
    case "origin_unreachable":
      return t(($) => $.diagnosis.origin, { host });
    case "invalid_response":
      return t(($) => $.diagnosis.response, { host });
    case "dns":
      return t(($) => $.diagnosis.dns, { host });
    case "tls":
      return t(($) => $.diagnosis.tls, { host });
    case "refused":
      return t(($) => $.diagnosis.refused, { host });
    case "timeout":
      return t(($) => $.diagnosis.timeout, { host });
    case "unknown":
    case null:
      break;
  }
  switch (located.hop) {
    case "device":
      return t(($) => $.diagnosis.prepare);
    case "relay":
      return failure?.reason === "authentication"
        ? t(($) => $.diagnosis.signIn)
        : t(($) => $.diagnosis.relayUnreachable);
    case "tunnel":
      // The relay already reached the host when this device fails on its own.
      return failure?.reason === "network" ||
        failure?.reason === "transport" ||
        failure?.reason === "timeout"
        ? t(($) => $.diagnosis.deviceTunnel, { host })
        : t(($) => $.diagnosis.relayTunnel, { host });
    case "server":
      return failure?.reason === "authentication" || failure?.reason === "permission"
        ? t(($) => $.diagnosis.rejected, { host })
        : t(($) => $.diagnosis.noAnswer, { host });
  }
}

function steps(
  host: string,
  located: Located,
  failure: ConnectionAttemptError | null,
  t: TFunction<"connect">,
): string[] {
  const checkHost = t(($) => $.diagnosis.checkHost, { host });
  switch (located.cause) {
    case "offline":
      return [t(($) => $.diagnosis.connectDevice)];
    case "session_pending":
      return [t(($) => $.diagnosis.waitMoment), t(($) => $.diagnosis.reloadDevice)];
    case "approval_pending": {
      const code =
        failure?._tag === "ConnectionTransientError" ? failure.verificationCode : undefined;
      return [
        code
          ? t(($) => $.diagnosis.approveDeviceCode, { host, code })
          : t(($) => $.diagnosis.approveDevice, { host }),
        t(($) => $.diagnosis.approveCommand, { host, code: code ?? "<code>" }),
      ];
    }
    case "outdated":
      return [t(($) => $.diagnosis.updateHost, { host })];
    case "clock_skew":
      return [t(($) => $.diagnosis.automaticTime, { host })];
    case "not_linked":
      return [t(($) => $.diagnosis.sameAccount), t(($) => $.diagnosis.enableHost, { host })];
    case "tunnel_pending":
      return [t(($) => $.diagnosis.waitMinute), checkHost];
    case "relay_error":
      return [t(($) => $.diagnosis.waitMinutes), t(($) => $.diagnosis.report)];
    case "tunnel_not_enabled":
      return [t(($) => $.diagnosis.enableHost, { host })];
    case "released":
    case "tunnel_down":
      return [
        t(($) => $.diagnosis.hostRunning, { host }),
        checkHost,
        t(($) => $.diagnosis.hostVpn, { host }),
      ];
    case "origin_unreachable":
    case "invalid_response":
      return [t(($) => $.diagnosis.restartHost, { host }), checkHost];
    // The relay saw these on its way to the host, so the fix is on the host.
    case "dns":
    case "tls":
    case "refused":
    case "timeout":
    case "unknown":
      return [t(($) => $.diagnosis.hostOnline, { host }), checkHost];
    case null:
      break;
  }
  switch (located.hop) {
    case "device":
      return [t(($) => $.diagnosis.restartDevice), t(($) => $.diagnosis.addAgain, { host })];
    case "relay":
      return failure?.reason === "authentication"
        ? [t(($) => $.diagnosis.signInAgain)]
        : [t(($) => $.diagnosis.checkDevice), t(($) => $.diagnosis.deviceVpn)];
    case "tunnel":
      return failure?.reason === "network" ||
        failure?.reason === "transport" ||
        failure?.reason === "timeout"
        ? [t(($) => $.diagnosis.deviceFilter), t(($) => $.diagnosis.directRoute)]
        : [t(($) => $.diagnosis.hostOnline, { host }), checkHost];
    case "server":
      return [t(($) => $.diagnosis.codeRunning, { host }), t(($) => $.diagnosis.retryDiagnostics)];
  }
}

function helpSection(
  located: Located,
  failure: ConnectionAttemptError | null,
): T3ConnectTroubleshootingSection {
  switch (located.cause) {
    case "offline":
      return "this-device-cant-reach-t3-connect";
    case "outdated":
      return "the-host-runs-an-older-t3-code";
    case "clock_skew":
      return "the-clock-is-off";
    case "session_pending":
    case "approval_pending":
    case "not_linked":
    case "tunnel_not_enabled":
      return "sign-in-account-or-link-problems";
    case "relay_error":
      return "t3-connect-returned-an-error";
    case "released":
    case "tunnel_down":
    case "tunnel_pending":
      return "the-hosts-tunnel-is-offline";
    case "origin_unreachable":
    case "invalid_response":
      return "the-tunnel-works-but-t3-code-does-not-answer";
    case "dns":
    case "tls":
    case "refused":
    case "timeout":
    case "unknown":
      return "the-t3-connect-address-does-not-resolve-or-answer";
    case null:
      break;
  }
  const onThisDevice =
    failure?.reason === "network" ||
    failure?.reason === "transport" ||
    failure?.reason === "timeout";
  switch (located.hop) {
    case "device":
      return "this-device-cant-reach-t3-connect";
    case "relay":
      return failure?.reason === "authentication"
        ? "sign-in-account-or-link-problems"
        : "this-device-cant-reach-t3-connect";
    case "tunnel":
      return onThisDevice ? "this-device-cant-reach-t3-connect" : "the-hosts-tunnel-is-offline";
    case "server":
      return failure?.reason === "authentication" || failure?.reason === "permission"
        ? "sign-in-account-or-link-problems"
        : "the-tunnel-works-but-t3-code-does-not-answer";
  }
}

const HOP_ORDER = {
  relay: ["device", "relay", "tunnel", "server"],
  direct: ["device", "server"],
} as const;

function hopLabel(hop: ConnectionHop, host: string, t: TFunction<"connect">): string {
  switch (hop) {
    case "device":
      return t(($) => $.connection.thisDevice);
    case "relay":
      return "T3 Connect";
    case "tunnel":
      return t(($) => $.diagnosis.tunnelHop, { host });
    case "server":
      return t(($) => $.diagnosis.serverHop, { host });
  }
}

/**
 * Turns a connection state into what failed, in order, and what to try. Returns
 * null when nothing has failed. Web and mobile render this same model.
 */
export function presentConnectionDiagnosis(
  input: ConnectionDiagnosisInput,
  t: TFunction<"connect">,
): ConnectionDiagnosis | null {
  const located = locate(input);
  if (located === null) return null;
  const host = input.hostLabel;
  const failure = input.state.lastFailure;
  const relayPath =
    located.hop === "relay" ||
    located.hop === "tunnel" ||
    (failure === null && input.relayStatus?.status === "offline") ||
    (failure?.via ?? input.via) === "relay";
  const order: ReadonlyArray<ConnectionHop> = HOP_ORDER[relayPath ? "relay" : "direct"];
  const failedIndex = order.indexOf(located.hop);
  const hops = order.map((hop, index): ConnectionDiagnosisHop => ({
    hop,
    label: hopLabel(hop, host, t),
    result:
      index === failedIndex
        ? "failed"
        : index < failedIndex && located.guessed !== true
          ? "ok"
          : "unchecked",
  }));

  // The relay health check only explains the state when no attempt has failed yet.
  const httpStatus = failure !== null ? failure.httpStatus : input.relayStatus?.endpointStatus;
  const facts: Array<readonly [string, string]> = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") facts.push([label, String(value)]);
  };
  add(
    t(($) => $.diagnosis.cause),
    located.cause ?? failure?.reason,
  );
  add(
    t(($) => $.diagnosis.http),
    httpStatus,
  );
  add(
    t(($) => $.diagnosis.attempts),
    input.state.attempt > 0 ? input.state.attempt : null,
  );
  add(
    t(($) => $.diagnosis.nextRetry),
    input.state.retryAt === null
      ? null
      : DateTime.formatIso(DateTime.makeUnsafe(input.state.retryAt)),
  );
  add(
    t(($) => $.diagnosis.route),
    relayPath ? "T3 Connect" : t(($) => $.diagnosis.direct),
  );
  add(
    t(($) => $.diagnosis.appVersion),
    input.clientVersion,
  );
  add(
    t(($) => $.diagnosis.hostVersion),
    input.serverVersion,
  );
  add(
    t(($) => $.diagnosis.error),
    failure?.detail,
  );
  add(
    t(($) => $.diagnosis.trace),
    failure?.traceId,
  );

  return {
    headline: headline(host, located, failure, t),
    hops,
    steps: steps(host, located, failure, t),
    facts,
    moreInfoUrl:
      relayPath || located.cause === "session_pending"
        ? t3ConnectTroubleshootingUrl(helpSection(located, failure))
        : null,
  };
}

/** One plain-text block for bug reports. */
export function connectionDiagnosisText(
  hostLabel: string,
  diagnosis: ConnectionDiagnosis,
  t: TFunction<"connect">,
): string {
  const hopMark = {
    ok: t(($) => $.diagnosis.ok),
    failed: t(($) => $.diagnosis.failedReport),
    unchecked: t(($) => $.diagnosis.uncheckedReport),
  };
  return [
    t(($) => $.diagnosis.reportTitle, { host: hostLabel, headline: diagnosis.headline }),
    "",
    ...diagnosis.hops.map((hop) => `${hop.label}: ${hopMark[hop.result]}`),
    "",
    ...diagnosis.facts.map(([label, value]) => `${label}: ${value}`),
    ...(diagnosis.moreInfoUrl
      ? ["", t(($) => $.diagnosis.moreInfoReport, { url: diagnosis.moreInfoUrl })]
      : []),
  ].join("\n");
}
