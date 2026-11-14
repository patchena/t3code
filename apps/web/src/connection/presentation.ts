import {
  type ConnectionRoute,
  type EnvironmentConnectionPresentation,
  connectionRouteKind,
  connectionRouteAddress,
  connectionRouteLabel as routeLabel,
} from "@t3tools/client-runtime/connection";
import type { TFunction } from "@t3tools/client-runtime/i18n";

export function connectionStatusText(
  connection: EnvironmentConnectionPresentation,
  t: TFunction<"connect">,
): string {
  switch (connection.phase) {
    case "available":
      return t(($) => $.connection.available);
    case "offline":
      return t(($) => $.connection.offline);
    case "connecting":
      return t(($) => $.connection.connectingDots);
    case "reconnecting":
      if (connection.awaitingApproval) {
        return connection.error ?? t(($) => $.connection.awaitingHostApproval);
      }
      return connection.error
        ? t(($) => $.connection.reconnectingReason, { error: connection.error })
        : t(($) => $.connection.reconnectingDots);
    case "connected":
      return t(($) => $.connection.connected);
    case "unsupported":
      return t(($) => $.connection.unsupported);
    case "error":
      return connection.error
        ? t(($) => $.connection.failedReason, { error: connection.error })
        : t(($) => $.connection.failed);
  }
}

export function connectionStatusTitle(
  connection: EnvironmentConnectionPresentation,
  t: TFunction<"connect">,
): string {
  if (connection.awaitingApproval) {
    return t(($) => $.saved.waitingApproval);
  }
  if (connection.phase === "reconnecting" && connection.error) {
    return t(($) => $.connection.reconnectingFailed);
  }
  return connectionStatusText({ ...connection, error: null }, t);
}

export function connectionRouteLabel(route: ConnectionRoute, t: TFunction<"connect">): string {
  if (connectionRouteKind(route) === "loopback") return t(($) => $.connection.thisDevice);
  if (connectionRouteKind(route) === "public") {
    const address = connectionRouteAddress(route);
    return address === null ? t(($) => $.connection.remoteLink) : new URL(address).hostname;
  }
  return routeLabel(route);
}
