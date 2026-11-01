import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  type DeviceHostSummary,
  type DevicePlatformAvailability,
  type EnvironmentId,
  SshDeviceHostConfig,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export interface DeviceHostCheckTarget {
  environmentId: EnvironmentId;
  label: string;
  connected: boolean;
}
export type DeviceHostCheck =
  | { status: "pending" }
  | { status: "local" }
  | {
      status: "connected";
      platforms: ReadonlyArray<DevicePlatformAvailability>;
      tools?: DeviceHostSummary["tools"];
    }
  | {
      status: "failed";
      error: { kind: "disconnected" | "permission" } | { kind: "diagnostic"; message: string };
    };

export class DeviceHostAccessError extends Schema.TaggedError<DeviceHostAccessError>()(
  "DeviceHostAccessError",
  {},
) {}

const isDeviceHostAccessError = Schema.is(DeviceHostAccessError);

export function deviceHostCheckError(
  error: Extract<DeviceHostCheck, { status: "failed" }>["error"],
  t: TFunction<"settings">,
): string {
  if (error.kind === "diagnostic") return error.message;
  return error.kind === "disconnected"
    ? t(($) => $.providers.environmentDisconnected)
    : t(($) => $.providers.cannotTestHosts);
}

const decodeDeviceHostDraft = Schema.decodeUnknownOption(SshDeviceHostConfig);

export function parseDeviceHostDraft(host: SshDeviceHostConfig) {
  const { identityFile, ...rest } = host;
  return decodeDeviceHostDraft({
    ...rest,
    ...(identityFile?.trim() ? { identityFile: identityFile.trim() } : {}),
  });
}

export function deviceHostConnectionKey(host: SshDeviceHostConfig) {
  return JSON.stringify([host.target.trim(), host.port, host.identityFile?.trim() || undefined]);
}

export async function checkDeviceHostConnections(
  targets: ReadonlyArray<DeviceHostCheckTarget>,
  host: SshDeviceHostConfig,
  probe: (environmentId: EnvironmentId, host: SshDeviceHostConfig) => Promise<DeviceHostSummary>,
  report: (environmentId: EnvironmentId, result: DeviceHostCheck) => void,
) {
  await Promise.all(
    targets.map(async (target) => {
      report(target.environmentId, { status: "pending" });
      try {
        if (!target.connected) {
          report(target.environmentId, { status: "failed", error: { kind: "disconnected" } });
          return;
        }
        const result = await probe(target.environmentId, host);
        report(
          target.environmentId,
          result.kind === "local"
            ? { status: "local" }
            : {
                status: "connected",
                platforms: result.platforms,
                ...(result.tools ? { tools: result.tools } : {}),
              },
        );
      } catch (error) {
        report(target.environmentId, {
          status: "failed",
          error: isDeviceHostAccessError(error)
            ? { kind: "permission" }
            : {
                kind: "diagnostic",
                message: error instanceof Error ? error.message : String(error),
              },
        });
      }
    }),
  );
}
