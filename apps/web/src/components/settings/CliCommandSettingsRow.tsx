import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  desktopCliCommandStateAtom,
  getDesktopCliCommandBridge,
  refreshDesktopCliCommandState,
} from "~/state/desktopCliCommand";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function CliCommandSettingsRow() {
  const { t } = useTranslation("settings");
  const bridge = getDesktopCliCommandBridge();
  const query = useEnvironmentQuery(bridge ? desktopCliCommandStateAtom : null);
  const state = query.data;
  const [pending, setPending] = useState(false);

  const change = (action: "install" | "uninstall") => {
    if (!bridge || pending) return;
    setPending(true);
    void bridge[action]()
      .then(refreshDesktopCliCommandState)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title:
              action === "install"
                ? t(($) => $.extra.cli.installFailed)
                : t(($) => $.extra.cli.removeFailed),
            description: error instanceof Error ? error.message : t(($) => $.extra.cli.error),
          }),
        );
      })
      .finally(() => setPending(false));
  };

  if (!bridge || !state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? t(($) => $.extra.cli.shadowed, { path: state.shadowedBy })
    : !installed
      ? t(($) => $.extra.cli.description)
      : state.onPath
        ? t(($) => $.extra.cli.installed, { path: state.installedPath })
        : t(($) => $.extra.cli.missingPath, { path: state.installedPath });

  return (
    <SettingsRow
      {...searchableSetting("cli-command", t)}
      description={description}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={pending || query.isPending || (!installed && Boolean(state.shadowedBy))}
          onClick={() => change(installed ? "uninstall" : "install")}
        >
          {installed ? t(($) => $.extra.cli.remove) : t(($) => $.extra.cli.install)}
        </Button>
      }
    />
  );
}
