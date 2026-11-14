import type { AuthConnectDevice, EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import type { ServerPairingLinkRecord } from "~/environments/primary";
import { authEnvironment } from "~/state/auth";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  connectDeviceName,
  describeConnectDeviceClient,
  formatAccessTimestamp,
} from "./ConnectionsSettings.logic";
import { ITEM_ROW_CLASSNAME, ITEM_ROW_INNER_CLASSNAME } from "./itemRows";
import { SettingsSection } from "./settingsLayout";

function reportFailure(
  title: string,
  result: Parameters<typeof isAtomCommandInterrupted>[0],
  t: TFunction<"common">,
) {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
  const error = squashAtomCommandFailure(result);
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : t(($) => $.operations.error),
    }),
  );
}

export function ConnectDeviceApprovalSettings({
  environmentId,
  requests,
  devices,
  canWrite,
  requestRevoke,
}: {
  readonly environmentId: EnvironmentId;
  readonly requests: ReadonlyArray<ServerPairingLinkRecord>;
  readonly devices: ReadonlyArray<AuthConnectDevice>;
  readonly canWrite: boolean;
  /** Revokes now, or first asks to turn approval on when it is off. */
  readonly requestRevoke: (title: string, revoke: () => Promise<void>) => void;
}) {
  const { t, i18n } = useTranslation("connect");
  const { t: tCommon } = useTranslation("common");
  const approve = useAtomCommand(authEnvironment.approveConnectDevice, { reportFailure: false });
  const deny = useAtomCommand(authEnvironment.revokePairingLink, { reportFailure: false });
  const revoke = useAtomCommand(authEnvironment.revokeConnectDevice, { reportFailure: false });
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    await action();
    setBusyId(null);
  };

  return (
    <SettingsSection id="connect-devices" title={t(($) => $.connectDevices.title)}>
      {requests.map((request) => {
        const connectRequest = request.connectDeviceRequest;
        if (!connectRequest) return null;
        const busy = busyId === request.id;
        return (
          <div key={request.id} className={ITEM_ROW_CLASSNAME}>
            <div className={ITEM_ROW_INNER_CLASSNAME}>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t(($) => $.saved.waitingApproval)} ·{" "}
                  <span className="font-mono tabular-nums">{connectRequest.verificationCode}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.connectDevices.approveHint, {
                    device: describeConnectDeviceClient(connectRequest, t),
                  })}
                </p>
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
                <Button
                  size="xs"
                  variant="destructive-outline"
                  disabled={!canWrite || busy}
                  onClick={() =>
                    void run(request.id, async () =>
                      reportFailure(
                        t(($) => $.connectDevices.denyFailed),
                        await deny({ environmentId, input: { id: request.id } }),
                        tCommon,
                      ),
                    )
                  }
                >
                  {t(($) => $.actions.deny)}
                </Button>
                <Button
                  size="xs"
                  disabled={!canWrite || busy}
                  onClick={() =>
                    void run(request.id, async () =>
                      reportFailure(
                        t(($) => $.connectDevices.approveFailed),
                        await approve({ environmentId, input: { pairingLinkId: request.id } }),
                        tCommon,
                      ),
                    )
                  }
                >
                  {busy ? t(($) => $.connectDevices.saving) : t(($) => $.actions.approve)}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      {devices.map((device) => {
        const busy = busyId === device.proofKeyThumbprint;
        return (
          <div key={device.proofKeyThumbprint} className={ITEM_ROW_CLASSNAME}>
            <div className={ITEM_ROW_INNER_CLASSNAME}>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {describeConnectDeviceClient(device, t)}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{device.verificationCode}</span>
                  <span aria-hidden> · </span>
                  {t(($) => $.connectDevices.trustedSince, {
                    date: formatAccessTimestamp(
                      DateTime.formatIso(device.approvedAt),
                      i18n.language,
                    ),
                  })}
                </p>
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
                <Button
                  size="xs"
                  variant="destructive-outline"
                  disabled={!canWrite || busy}
                  onClick={() =>
                    requestRevoke(
                      t(($) => $.connectDevices.revokeTitle, {
                        device: connectDeviceName(device, t),
                      }),
                      () =>
                        run(device.proofKeyThumbprint, async () =>
                          reportFailure(
                            t(($) => $.connectDevices.revokeFailed),
                            await revoke({
                              environmentId,
                              input: { proofKeyThumbprint: device.proofKeyThumbprint },
                            }),
                            tCommon,
                          ),
                        ),
                    )
                  }
                >
                  {busy ? t(($) => $.access.revoking) : t(($) => $.access.revoke)}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      {devices.length === 0 && requests.length === 0 ? (
        <div className={ITEM_ROW_CLASSNAME}>
          <p className="text-xs text-muted-foreground/60">{t(($) => $.connectDevices.empty)}</p>
        </div>
      ) : null}
    </SettingsSection>
  );
}
