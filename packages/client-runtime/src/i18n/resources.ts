import { activityDe } from "#client/i18n/de/activity";
import { activitySharedDe } from "#client/i18n/de/activityShared";
import { chatDe } from "#client/i18n/de/chat";
import { commonDe } from "#client/i18n/de/common";
import { composerDe } from "#client/i18n/de/composer";
import { connectDe } from "#client/i18n/de/connect";
import { desktopDe } from "#client/i18n/de/desktop";
import { diagnosticsDe } from "#client/i18n/de/diagnostics";
import { filesDe } from "#client/i18n/de/files";
import { gitDe } from "#client/i18n/de/git";
import { guestLinksDe } from "#client/i18n/de/guestLinks";
import { miscDe } from "#client/i18n/de/misc";
import { settingsDe } from "#client/i18n/de/settings";
import { settingsExtraDe } from "#client/i18n/de/settingsExtra";
import { settingsProviderDe } from "#client/i18n/de/settingsProvider";
import { toolsDe } from "#client/i18n/de/tools";
import { voiceDe } from "#client/i18n/de/voice";
import { timeDe } from "#client/i18n/de/time";
import { workspaceDe } from "#client/i18n/de/workspace";
import { workspaceUpdatesDe } from "#client/i18n/de/workspaceUpdates";
import { welcomeDe } from "#client/i18n/de/welcome";
import { activityEn } from "#client/i18n/en/activity";
import { activitySharedEn } from "#client/i18n/en/activityShared";
import { chatEn } from "#client/i18n/en/chat";
import { commonEn } from "#client/i18n/en/common";
import { composerEn } from "#client/i18n/en/composer";
import { connectEn } from "#client/i18n/en/connect";
import { desktopEn } from "#client/i18n/en/desktop";
import { diagnosticsEn } from "#client/i18n/en/diagnostics";
import { filesEn } from "#client/i18n/en/files";
import { gitEn } from "#client/i18n/en/git";
import { guestLinksEn } from "#client/i18n/en/guestLinks";
import { miscEn } from "#client/i18n/en/misc";
import { settingsEn } from "#client/i18n/en/settings";
import { settingsExtraEn } from "#client/i18n/en/settingsExtra";
import { settingsProviderEn } from "#client/i18n/en/settingsProvider";
import { toolsEn } from "#client/i18n/en/tools";
import { voiceEn } from "#client/i18n/en/voice";
import { timeEn } from "#client/i18n/en/time";
import { workspaceEn } from "#client/i18n/en/workspace";
import { workspaceUpdatesEn } from "#client/i18n/en/workspaceUpdates";
import { welcomeEn } from "#client/i18n/en/welcome";

export const resources = {
  en: {
    common: { ...commonEn, time: timeEn, misc: miscEn },
    settings: {
      ...settingsEn,
      extra: settingsExtraEn,
      providers: settingsProviderEn,
      diagnostics: diagnosticsEn,
    },
    chat: { ...chatEn, composer: composerEn, links: guestLinksEn },
    workspace: { ...workspaceEn, git: gitEn, updates: workspaceUpdatesEn },
    connect: { ...connectEn, welcome: welcomeEn },
    desktop: desktopEn,
    tools: toolsEn,
    activity: { ...activityEn, shared: activitySharedEn },
    files: filesEn,
    voice: voiceEn,
  },
  de: {
    common: { ...commonDe, time: timeDe, misc: miscDe },
    settings: {
      ...settingsDe,
      extra: settingsExtraDe,
      providers: settingsProviderDe,
      diagnostics: diagnosticsDe,
    },
    chat: { ...chatDe, composer: composerDe, links: guestLinksDe },
    workspace: { ...workspaceDe, git: gitDe, updates: workspaceUpdatesDe },
    connect: { ...connectDe, welcome: welcomeDe },
    desktop: desktopDe,
    tools: toolsDe,
    activity: { ...activityDe, shared: activitySharedDe },
    files: filesDe,
    voice: voiceDe,
  },
} as const;
