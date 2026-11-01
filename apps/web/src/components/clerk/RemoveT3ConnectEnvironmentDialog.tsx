import { Discovery } from "@t3tools/client-runtime/relay";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { useRelayEnvironmentDiscovery } from "../../state/environments";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button, InlineButton } from "../ui/button";
import { useT3ConnectAccountPage } from "./T3ConnectAccountPages";

export function RemoveT3ConnectEnvironmentDialog({
  environmentLabel,
  environmentId,
  onCancel,
  onConfirm,
}: {
  readonly environmentLabel: string | null;
  readonly environmentId: EnvironmentId | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation("connect");
  const accountPage = useT3ConnectAccountPage();
  const discovery = useRelayEnvironmentDiscovery();
  const registration = environmentId
    ? Discovery.relayEnvironmentRegistration(discovery, environmentId)
    : "unknown";
  const [shown, setShown] = useState({ label: environmentLabel, registration });
  if (
    environmentLabel !== null &&
    (environmentLabel !== shown.label || registration !== shown.registration)
  ) {
    setShown({ label: environmentLabel, registration });
  }
  const openAccountPage = accountPage.open;
  const accountPageLink = openAccountPage ? (
    <InlineButton
      onClick={() => {
        onCancel();
        openAccountPage();
      }}
    >
      {t(($) => $.profile.settings)}
    </InlineButton>
  ) : (
    <span>{t(($) => $.profile.settings)}</span>
  );

  return (
    <>
      <AlertDialog
        open={environmentLabel !== null}
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(($) => $.profile.removeTitle, { environment: shown.label ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t(($) => $.profile.removeDescription)}</AlertDialogDescription>
            <AlertDialogDescription>
              {shown.registration === "registered" ? (
                <Trans
                  t={t}
                  i18nKey={($) => $.profile.removeRegistered}
                  components={{ settings: accountPageLink }}
                />
              ) : shown.registration === "unregistered" ? (
                t(($) => $.profile.removeUnregistered)
              ) : (
                <Trans
                  t={t}
                  i18nKey={($) => $.profile.removeUnknown}
                  components={{ settings: accountPageLink }}
                />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t(($) => $.actions.cancel)}
            </AlertDialogClose>
            <Button variant="destructive" onClick={onConfirm}>
              {t(($) => $.profile.removeDevice)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      {accountPage.portals}
    </>
  );
}
