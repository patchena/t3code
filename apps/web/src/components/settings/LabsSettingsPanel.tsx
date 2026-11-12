import { useAuth } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { managedCapabilityDenial } from "@t3tools/contracts";
import { Trans, useTranslation } from "react-i18next";

import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { ScopedSwitch } from "./ScopedSwitch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { useOptionalSettingsScope, useSettingsScope } from "./SettingsScopeContext";
import { firstManagedDenial, usePrimaryManagedPolicy } from "~/state/managedPolicy";

/** Features still settling in. */
export function LabsSettingsPanel() {
  const { t } = useTranslation("common");
  return (
    <SettingsPageContainer>
      <SettingsSection id="beta" title={t(($) => $.misc.labs.beta)}>
        <BoringSidebarRow />
        {/* Clerk is only mounted when this build has T3 Connect. */}
        {hasCloudPublicConfig() ? <GuestLinksRowWithSignIn /> : <GuestLinksRow />}
        <LinkedEnvironmentsRow />
        <PromptSuggestionsRow />
        <SimlockHostsRow />
        <FastWorktreeCheckoutRow />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function BoringSidebarRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar", tSettings)}
      description={t(($) => $.misc.labs.boringSidebar)}
      control={
        <Switch
          checked={settings.boringSidebarEnabled}
          onCheckedChange={(checked) => updateSettings({ boringSidebarEnabled: Boolean(checked) })}
          aria-label={t(($) => $.misc.labs.boringSidebarLabel)}
        />
      }
    >
      {settings.boringSidebarEnabled ? (
        <div className="mt-2 mb-2 border-l-2 border-border/60 ps-3">
          <BoringSidebarMultilineRow />
        </div>
      ) : null}
    </SettingsRow>
  );
}

function BoringSidebarMultilineRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar-multiline", tSettings)}
      className="px-0 py-2 sm:px-0"
      description={t(($) => $.misc.labs.multilineNested)}
      control={
        <Switch
          checked={settings.boringSidebarMultilineRows}
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarMultilineRows: Boolean(checked) })
          }
          aria-label={t(($) => $.misc.labs.multilineLabel)}
        />
      }
    />
  );
}

/** Signed out of T3 Connect, the row offers to sign in instead of its switch. */
function GuestLinksRowWithSignIn() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const { isSignedIn } = useAuth();
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  // `isSignedIn` is undefined until Clerk loads.
  if (isSignedIn !== false) return <GuestLinksRow />;
  return (
    <SettingsRow
      {...searchableSetting("guest-links", tSettings)}
      description={t(($) => $.misc.labs.guestSignIn)}
      control={
        <Button size="sm" variant="outline" onClick={openAuthPrompt}>
          {t(($) => $.misc.labs.signIn)}
        </Button>
      }
    />
  );
}

function GuestLinksRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const scope = useOptionalSettingsScope();
  const primaryPolicy = usePrimaryManagedPolicy();
  // Guests arrive through T3 Connect, so a policy that turns Connect off turns this off too.
  const connectDenial = firstManagedDenial(
    scope
      ? scope.connectedEnvironments.map((environment) => environment.serverConfig?.managedPolicy)
      : [primaryPolicy],
    (policy) => managedCapabilityDenial(policy, "connect"),
  );
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("guest-links", tSettings)}
      settingKeys={["guestSharingEnabled"]}
      // Turning guest links off still works without T3 Connect.
      managed={settings.guestSharingEnabled ? undefined : connectDenial}
      description={
        <Trans
          t={t}
          i18nKey={($) => $.misc.labs.guestDescription}
          components={{
            access: <Link to="/settings/access" className="underline underline-offset-2" />,
          }}
        />
      }
      control={
        <ScopedSwitch
          settingKeys={["guestSharingEnabled"]}
          checked={settings.guestSharingEnabled}
          onCheckedChange={(checked) => updateSettings({ guestSharingEnabled: Boolean(checked) })}
          aria-label={t(($) => $.misc.labs.guests)}
        />
      }
    />
  );
}

function LinkedEnvironmentsRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("linked-environments-beta", tSettings)}
      settingKeys={["linkedEnvironmentsEnabled"]}
      description={
        <Trans
          t={t}
          i18nKey={($) => $.misc.labs.linkedDescription}
          components={{
            connections: (
              <Link to="/settings/connections" className="underline underline-offset-2" />
            ),
          }}
        />
      }
      control={
        <ScopedSwitch
          settingKeys={["linkedEnvironmentsEnabled"]}
          checked={settings.linkedEnvironmentsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ linkedEnvironmentsEnabled: Boolean(checked) })
          }
          aria-label={t(($) => $.misc.labs.linked)}
        />
      }
    />
  );
}

function PromptSuggestionsRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("prompt-suggestions-beta", tSettings)}
      settingKeys={["promptSuggestionsEnabled"]}
      description={t(($) => $.misc.labs.promptSuggestionsDescription)}
      control={
        <ScopedSwitch
          settingKeys={["promptSuggestionsEnabled"]}
          checked={settings.promptSuggestionsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ promptSuggestionsEnabled: Boolean(checked) })
          }
          aria-label={t(($) => $.misc.labs.promptSuggestionsLabel)}
        />
      }
    />
  );
}

function SimlockHostsRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("simlock-hosts", tSettings)}
      settingKeys={["simlockDeviceHostsEnabled"]}
      description={
        <Trans
          t={t}
          i18nKey={($) => $.misc.labs.simlockDescription}
          components={{
            simlock: (
              <a
                href="https://incubator.callstack.com/simlock/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              />
            ),
            devices: <Link to="/settings/devices" className="underline underline-offset-2" />,
          }}
        />
      }
      control={
        <ScopedSwitch
          settingKeys={["simlockDeviceHostsEnabled"]}
          checked={settings.simlockDeviceHostsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ simlockDeviceHostsEnabled: Boolean(checked) })
          }
          aria-label={t(($) => $.misc.labs.simlock)}
        />
      }
    />
  );
}

/** Shows only when every machine in scope is a Mac, since only macOS servers honor it. */
function FastWorktreeCheckoutRow() {
  const { t } = useTranslation("common");
  const { t: tSettings } = useTranslation("settings");
  const { scope, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  if (
    scope.kind === "project" ||
    scope.kind === "checkout" ||
    connectedEnvironments.length === 0 ||
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.fastWorktreeCheckout !== true,
    )
  )
    return null;
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("worktree-fast-checkout", tSettings)}
      settingKeys={["fastWorktreeCheckout"]}
      description={t(($) => $.misc.labs.fastWorktreeCheckoutDescription)}
      control={
        <ScopedSwitch
          settingKeys={["fastWorktreeCheckout"]}
          checked={settings.fastWorktreeCheckout}
          onCheckedChange={(checked) => updateSettings({ fastWorktreeCheckout: Boolean(checked) })}
          aria-label={t(($) => $.misc.labs.fastWorktreeCheckoutLabel)}
        />
      }
    />
  );
}
