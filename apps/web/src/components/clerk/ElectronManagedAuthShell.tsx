import { passkeys } from "@clerk/electron/passkeys";
import { ClerkProvider } from "@clerk/electron/react";
import type { ReactNode } from "react";
import { enUS } from "@clerk/localizations/en-US";
import { deDE } from "@clerk/localizations/de-DE";

import { useClientSettings } from "~/hooks/useSettings";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { clerkAppearance } from "./clerkAppearance";

/** Load only lazily inside desktop; clerk-js is statically bundled and would otherwise enter every
 * client's startup graph. */
export function ElectronManagedAuthShell({
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
      passkeys={passkeys}
      localization={localizations[language]}
    >
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
