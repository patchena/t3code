import { systemLocale } from "~/timestampFormat";
import { appI18n } from "~/i18n";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryServerLegacyThreadMigrationAtom } from "~/state/server";
import { toastManager } from "~/components/ui/toast";

type MigrationToastId = ReturnType<typeof toastManager.add>;

/** A loading toast for as long as the primary server reports a legacy thread migration running. */
export function startLegacyThreadMigrationToast(): () => void {
  const t = appI18n.getFixedT(null, "workspace");
  let toastId: MigrationToastId | null = null;

  const unsubscribe = appAtomRegistry.subscribe(
    primaryServerLegacyThreadMigrationAtom,
    (migration) => {
      if (migration?.status === "running") {
        if (toastId !== null) return;
        toastId = toastManager.add({
          type: "loading",
          title: t(($) => $.updates.restoringYourThreads),
          description: t(($) => $.updates.migratingThreads, {
            count: migration.totalThreadCount,
            total: migration.totalThreadCount.toLocaleString(systemLocale),
          }),
          timeout: 0,
        });
        return;
      }

      if (toastId !== null) {
        toastManager.close(toastId);
        toastId = null;
      }
    },
    { immediate: true },
  );

  const refreshLanguage = () => {
    const migration = appAtomRegistry.get(primaryServerLegacyThreadMigrationAtom);
    if (toastId !== null && migration?.status === "running")
      toastManager.update(toastId, {
        title: t(($) => $.updates.restoringYourThreads),
        description: t(($) => $.updates.migratingThreads, {
          count: migration.totalThreadCount,
          total: migration.totalThreadCount.toLocaleString(systemLocale),
        }),
      });
  };
  appI18n.on("languageChanged", refreshLanguage);
  return () => {
    appI18n.off("languageChanged", refreshLanguage);
    unsubscribe();
    if (toastId !== null) toastManager.close(toastId);
  };
}
