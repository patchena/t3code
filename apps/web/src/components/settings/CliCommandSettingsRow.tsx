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

type CliCommandAction = "install" | "uninstall" | "addToPath";

/** The desktop `t3` command's state, and its actions with a toast on failure. */
export function useDesktopCliCommand() {
  const { t } = useTranslation("settings");
  const bridge = getDesktopCliCommandBridge();
  const query = useEnvironmentQuery(bridge ? desktopCliCommandStateAtom : null);
  const [pending, setPending] = useState(false);

  const run = (action: CliCommandAction) => {
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
                : action === "uninstall"
                  ? t(($) => $.extra.cli.removeFailed)
                  : t(($) => $.extra.cli.addToPathFailed),
            description: error instanceof Error ? error.message : t(($) => $.extra.cli.error),
          }),
        );
      })
      .finally(() => setPending(false));
  };

  return {
    state: bridge ? query.data : undefined,
    busy: pending || query.isPending,
    run,
  };
}

export function CliCommandSettingsRow() {
  const { t } = useTranslation("settings");
  const { state, busy, run } = useDesktopCliCommand();

  if (!state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? t(($) => $.extra.cli.shadowed, { path: state.shadowedBy })
    : !installed
      ? t(($) => $.extra.cli.description)
      : state.onPath
        ? t(($) => $.extra.cli.installed, { path: state.installedPath })
        : state.pathSetup?.added
          ? t(($) => $.extra.cli.addedToPath, {
              path: state.installedPath,
              file: state.pathSetup.file,
            })
          : state.pathSetup
            ? t(($) => $.extra.cli.notOnPath, { path: state.installedPath })
            : t(($) => $.extra.cli.missingPath, { path: state.installedPath });

  return (
    <SettingsRow
      {...searchableSetting("cli-command", t)}
      description={description}
      control={
        <div className="flex gap-2">
          {state.pathSetup && !state.pathSetup.added ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("addToPath")}>
              {t(($) => $.extra.cli.addToPath)}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || (!installed && Boolean(state.shadowedBy))}
            onClick={() => run(installed ? "uninstall" : "install")}
          >
            {installed ? t(($) => $.extra.cli.remove) : t(($) => $.extra.cli.install)}
          </Button>
        </div>
      }
    />
  );
}
