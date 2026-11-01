import { sessionHasLegacyPermissions, type EnvironmentId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { appI18n } from "~/i18n";

import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSummaries } from "../state/presentation";
import { environmentSession } from "../state/session";
import { toastManager } from "./ui/toast";

interface LegacyPermissionEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

/** Environments whose settled session still carries pre-scope permissions. */
const legacyPermissionEnvironmentsAtom = Atom.make((get) =>
  get(environmentSummaries.identitiesAtom).filter(({ environmentId }) => {
    const session = get(environmentSession.sessionStateAtom(environmentId));
    return (
      session._tag === "Success" && !session.waiting && sessionHasLegacyPermissions(session.value)
    );
  }),
).pipe(Atom.withLabel("web-legacy-permission-environments"));

const dismissalKey = (environmentId: EnvironmentId) =>
  `t3code:permission-update:v1:${environmentId}`;

function showPermissionNotice(
  router: AnyRouter,
  { environmentId, label }: LegacyPermissionEnvironment,
  t: TFunction<"common">,
) {
  const key = dismissalKey(environmentId);
  const persistDismissal = () => {
    try {
      setLocalStorageItem(key, true, Schema.Boolean);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: t(($) => $.misc.permissions.dismissFailed),
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const dismiss = () => {
    persistDismissal();
    toastManager.close(id);
  };
  const content = () => ({
    title: t(($) => $.misc.permissions.changed, { label }),
    description: t(($) => $.misc.permissions.description),
    actionProps: {
      children: t(($) => $.misc.permissions.openAccess),
      onClick: () => {
        dismiss();
        void router.navigate({ to: "/settings/access" });
      },
    },
    data: {
      actionLayout: "stacked-end" as const,
      secondaryActionProps: { children: t(($) => $.misc.permissions.dismiss), onClick: dismiss },
      secondaryActionVariant: "ghost" as const,
    },
  });
  const stop = () => {
    appI18n.off("languageChanged", refresh);
  };
  const id = toastManager.add({
    ...content(),
    timeout: 0,
    onClose: () => {
      stop();
      persistDismissal();
    },
  });
  function refresh() {
    toastManager.update(id, content());
  }
  appI18n.on("languageChanged", refresh);
  return stop;
}

/** Asks once per environment, until dismissed, to re-pair a connection that predates scoped permissions. */
export function startPermissionUpdateNotices(router: AnyRouter): () => void {
  const shown = new Set<EnvironmentId>();
  const notices = new Set<() => void>();
  const t = appI18n.getFixedT(null, "common");
  const unsubscribe = appAtomRegistry.subscribe(
    legacyPermissionEnvironmentsAtom,
    (environments) => {
      for (const environment of environments) {
        if (shown.has(environment.environmentId)) continue;
        try {
          if (getLocalStorageItem(dismissalKey(environment.environmentId), Schema.Boolean))
            continue;
        } catch (error) {
          toastManager.add({
            type: "error",
            title: t(($) => $.misc.permissions.readFailed),
            description: error instanceof Error ? error.message : String(error),
          });
        }
        shown.add(environment.environmentId);
        notices.add(showPermissionNotice(router, environment, t));
      }
    },
    { immediate: true },
  );
  return () => {
    unsubscribe();
    for (const stop of notices) stop();
  };
}
