import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/inter";
import "./index.css";

import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { isElectron } from "./env";
import { startAppServices } from "./appInit";
import { AppRoot } from "./AppRoot";
import { reloadOnceForChunkLoadError } from "./lib/chunkReloadGuard";
import { ensureClientSettingsHydrated, getClientSettings } from "~/hooks/useSettings";
import { appI18n } from "~/i18n";
import { InterfaceErrorBoundary } from "~/components/InterfaceErrorBoundary";
import { startProviderAuthDelivery } from "~/providerAuthDelivery";

startProviderAuthDelivery();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

let reloadScheduled = false;
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForChunkLoadError()) {
    reloadScheduled = true;
    event.preventDefault();
  }
});

// Split by runtime to keep Clerk out of local startup and clerk-js out of browser builds.
const managedAuthShellModule =
  clerkPublishableKey && hasCloudPublicConfig()
    ? isElectron
      ? import("./components/clerk/ElectronManagedAuthShell").then(
          (module) => module.ElectronManagedAuthShell,
        )
      : import("./components/clerk/BrowserManagedAuthShell").then(
          (module) => module.BrowserManagedAuthShell,
        )
    : null;

export const startup = Promise.all([managedAuthShellModule, ensureClientSettingsHydrated()])
  .then(async ([ManagedAuthShell]) => {
    await appI18n.changeLanguage(getClientSettings().interfaceLanguage);
    document.documentElement.lang = getClientSettings().interfaceLanguage;
    const router = startAppServices();
    const app = <AppRoot router={router} />;
    await router.load();
    // Route chunk failures resolve router.load() and surface later through the error boundary.
    if (reloadScheduled) return;
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <InterfaceErrorBoundary>
          {ManagedAuthShell && clerkPublishableKey ? (
            <ManagedAuthShell publishableKey={clerkPublishableKey}>{app}</ManagedAuthShell>
          ) : (
            app
          )}
        </InterfaceErrorBoundary>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    if (reloadScheduled) return;
    throw error;
  });
