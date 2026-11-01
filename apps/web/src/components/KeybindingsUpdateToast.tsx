import { appI18n } from "~/i18n";
import { appAtomRegistry, subscribeAtomChanges } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { primaryServerConfigAtom, primaryServerConfigEventAtom } from "~/state/server";
import { KeybindingsConfigWarning } from "~/components/KeybindingsConfigWarning";
import { createKeybindingsUpdateToastController } from "~/components/KeybindingsUpdateToast.logic";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";

/** Toasts each keybindings reload the primary server reports. */
export function startKeybindingsUpdateToasts(): () => void {
  const t = appI18n.getFixedT(null, "workspace");
  const controller = createKeybindingsUpdateToastController({});
  return subscribeAtomChanges(primaryServerConfigEventAtom, (event) => {
    const decision = controller.handle(event);
    if (!decision) return;

    if (decision._tag === "Success") {
      toastManager.add({
        type: "success",
        title: t(($) => $.updates.keybindingsUpdated),
        description: t(($) => $.updates.keybindingsConfigurationReloadedSuccessfully),
      });
      return;
    }

    const serverConfig = appAtomRegistry.get(primaryServerConfigAtom);
    toastManager.add(
      stackedThreadToast({
        type: "warning",
        title: t(($) => $.updates.invalidKeybindingsConfiguration),
        description: (
          <KeybindingsConfigWarning
            message={decision.message}
            environmentId={appAtomRegistry.get(primaryEnvironmentIdAtom)}
            configPath={serverConfig?.keybindingsConfigPath ?? null}
            availableEditors={serverConfig?.availableEditors ?? []}
          />
        ),
      }),
    );
  });
}
