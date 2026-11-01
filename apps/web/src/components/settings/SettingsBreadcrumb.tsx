import { useTranslation } from "react-i18next";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "~/components/WorkspaceBreadcrumb";
import {
  settingsSectionLabels,
  type SettingsTranslation,
} from "~/components/settings/settingsSearch";

function settingsBreadcrumbLabels(t: SettingsTranslation): Readonly<Record<string, string>> {
  return {
    ...settingsSectionLabels(t),
    "/settings/diagnostics": t(($) => $.navUi.diagnostics),
    "/settings/open-source-licenses": t(($) => $.navUi.openSourceLicenses),
  };
}

function settingsBreadcrumbLabel(pathname: string, t: SettingsTranslation): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return settingsBreadcrumbLabels(t)[normalizedPathname] ?? null;
}

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const { t } = useTranslation("settings");
  const sectionLabel = settingsBreadcrumbLabel(pathname, t);

  return (
    <WorkspaceBreadcrumb ariaLabel={t(($) => $.navUi.settingsBreadcrumb)}>
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>{t(($) => $.navUi.settings)}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? t(($) => $.navUi.settings)}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
