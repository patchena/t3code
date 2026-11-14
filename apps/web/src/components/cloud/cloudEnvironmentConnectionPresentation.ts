import { type EnvironmentConnectionPresentation } from "@t3tools/client-runtime/connection";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { connectionStatusText } from "~/connection/presentation";

export interface SavedCloudEnvironmentConnectionPresentation {
  readonly buttonLabel: string;
  readonly statusText: string;
  readonly tone: "connected" | "connecting" | "error" | "idle";
}

export function presentSavedCloudEnvironmentConnection(
  connection: EnvironmentConnectionPresentation,
  t: TFunction<"connect">,
): SavedCloudEnvironmentConnectionPresentation {
  switch (connection.phase) {
    case "connected":
      return {
        buttonLabel: t(($) => $.connection.connected),
        statusText: connectionStatusText(connection, t),
        tone: "connected",
      };
    case "connecting":
      return {
        buttonLabel: t(($) => $.connection.connecting),
        statusText: connectionStatusText(connection, t),
        tone: "connecting",
      };
    case "reconnecting":
      return {
        buttonLabel: connection.awaitingApproval
          ? t(($) => $.connection.awaitingApproval)
          : t(($) => $.connection.reconnecting),
        statusText: connectionStatusText(connection, t),
        tone: "connecting",
      };
    case "unsupported":
      return {
        buttonLabel: t(($) => $.connection.unsupported),
        statusText: connectionStatusText(connection, t),
        tone: "idle",
      };
    case "error":
      return {
        buttonLabel: t(($) => $.connection.failed),
        statusText: connectionStatusText(connection, t),
        tone: "error",
      };
    case "offline":
      return {
        buttonLabel: t(($) => $.connection.offline),
        statusText: connectionStatusText(connection, t),
        tone: "idle",
      };
    case "available":
      return {
        buttonLabel: t(($) => $.connection.notConnected),
        statusText: connectionStatusText(connection, t),
        tone: "idle",
      };
  }
}
