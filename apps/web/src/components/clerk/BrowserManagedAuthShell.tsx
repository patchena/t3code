import { ClerkProvider } from "@clerk/react";
import type { ReactNode } from "react";
import { enUS } from "@clerk/localizations/en-US";
import { deDE } from "@clerk/localizations/de-DE";

import { useClientSettings } from "~/hooks/useSettings";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { clerkAppearance } from "./clerkAppearance";

/** Lazy-load Clerk so cloudless local mode never downloads it. */
export function BrowserManagedAuthShell({
  publishableKey,
  children,
}: {
  readonly publishableKey: string;
  readonly children: ReactNode;
}) {
  const language = useClientSettings((settings) => settings.interfaceLanguage);
  const localizations = { en: enUS, de: deDE };
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      publishableKey={publishableKey}
      localization={localizations[language]}
    >
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
