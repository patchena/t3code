import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  databaseReclaimMinutes,
  type DatabaseStorageStatus,
  type EnvironmentId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { environmentAtomList, environmentIdsKey } from "../../state/environmentAtomList";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const DismissedEnvironmentIds = Schema.Array(Schema.String);
const reclaimPermissionsAtom = environmentAtomList(
  "web-database-reclaim-permissions",
  serverEnvironment.reclaimDatabaseSpace.permissionAtom,
);

const formatGiB = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

/** Offers to reclaim the space on every machine whose database still holds at least 1 GiB of freed pages. */
export function DatabaseStorageNotice({
  environments,
}: {
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly label: string }>;
}) {
  const { t } = useTranslation("settings");
  const environmentIds = environments.map((environment) => environment.environmentId);
  const recommendations = useAtomValue(
    serverEnvironment.databaseCompactionRecommendations(JSON.stringify(environmentIds)),
  );
  const permissions = useAtomValue(reclaimPermissionsAtom(environmentIdsKey(environmentIds)));
  const [dismissed, setDismissed] = useLocalStorage(
    "database-storage-notice-dismissed",
    [],
    DismissedEnvironmentIds,
  );
  const { copyToClipboard } = useCopyToClipboard({ target: "command" });
  const visible = recommendations
    .filter((recommendation) => !dismissed.includes(recommendation.environmentId))
    .map((recommendation) => ({
      ...recommendation,
      label:
        environments.find(
          (environment) => environment.environmentId === recommendation.environmentId,
        )?.label ?? recommendation.environmentId,
      reclaimable:
        recommendation.status.canReclaim === true &&
        permissions[environmentIds.indexOf(recommendation.environmentId)] === true,
    }));
  if (visible.length === 0) return null;
  return (
    <SettingsSection id="storage-database" title={t(($) => $.extra.database.title)}>
      <SettingsRow
        title={t(($) => $.extra.database.reclaim)}
        description={
          visible.every((recommendation) => recommendation.reclaimable)
            ? t(($) => $.extra.database.reclaimableDescription)
            : t(($) => $.extra.database.description)
        }
      />
      {visible.map(({ environmentId, status, label, reclaimable }) => {
        const dismiss = (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDismissed((current) => [...current, environmentId])}
          >
            {t(($) => $.extra.database.dismiss)}
          </Button>
        );
        return reclaimable ? (
          <ReclaimRow
            key={environmentId}
            environmentId={environmentId}
            label={label}
            status={status}
            dismiss={dismiss}
          />
        ) : (
          <SettingsRow
            key={environmentId}
            title={t(($) => $.extra.database.space, {
              size: formatGiB(status.reclaimableBytes),
              environment: label,
            })}
            description={<code className="select-text break-all">{status.compactCommand}</code>}
            control={
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => copyToClipboard(status.compactCommand, undefined)}
                >
                  {t(($) => $.extra.database.copyCommand)}
                </Button>
                {dismiss}
              </div>
            }
          />
        );
      })}
    </SettingsSection>
  );
}

function ReclaimRow({
  environmentId,
  label,
  status,
  dismiss,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly status: DatabaseStorageStatus;
  readonly dismiss: ReactNode;
}) {
  const { t } = useTranslation("settings");
  const reclaim = useAtomCommand(serverEnvironment.reclaimDatabaseSpace);
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  // A failed repair reports back after the restart, which ends the wait.
  const restarting = requested && status.reclaimFailure === undefined;
  const minutes = databaseReclaimMinutes(status);
  const size = formatGiB(status.reclaimableBytes);
  const start = async () => {
    setConfirming(false);
    setRequested(true);
    const result = await reclaim({ environmentId, input: {} });
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: t(($) => $.extra.database.reclaimingTitle, { size, environment: label }),
        description: t(($) => $.extra.database.reclaimingDescription, { minutes }),
      });
      return;
    }
    setRequested(false);
    if (isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: t(($) => $.extra.database.reclaimFailed, { environment: label }),
      description: error instanceof Error ? error.message : t(($) => $.extra.database.error),
    });
  };
  return (
    <SettingsRow
      title={t(($) => $.extra.database.space, { size, environment: label })}
      description={
        status.reclaimFailure === undefined
          ? t(($) => $.extra.database.restartDescription, { minutes })
          : t(($) => $.extra.database.lastAttemptFailed, { error: status.reclaimFailure })
      }
      control={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={restarting}
            onClick={() => setConfirming(true)}
          >
            {restarting
              ? t(($) => $.extra.database.restarting)
              : t(($) => $.extra.database.reclaimAction)}
          </Button>
          {dismiss}
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(($) => $.extra.database.confirmTitle, { size, environment: label })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(($) => $.extra.database.confirmDescription, { environment: label, minutes })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="outline" />}>
                  {t(($) => $.extra.database.cancel)}
                </AlertDialogClose>
                <Button onClick={() => void start()}>{t(($) => $.extra.database.confirm)}</Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        </div>
      }
    />
  );
}
