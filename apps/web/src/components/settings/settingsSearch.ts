import { resources } from "@t3tools/client-runtime/i18n";
import type { UseTranslationResponse } from "react-i18next";

export type SettingsTranslation = UseTranslationResponse<"settings", undefined>["t"];

import { HOSTED_APP_CHANNEL } from "~/branding";
import { isElectron, isSecretsFeatureEnabled } from "~/env";
import { isMacPlatform, isWindowsPlatform, normalizeSearchText } from "~/lib/utils";
import { STATIC_KEYBINDING_COMMANDS, type KeybindingCommand } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import {
  sourceControlClients,
  type SourceControlDefinition,
} from "@t3tools/client-runtime/source-control-clients";
import { DEFAULT_KEYBINDINGS } from "@t3tools/shared/keybindings";
import * as Schema from "effect/Schema";
import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "~/appearanceFonts";
import { writeLocalStorageValue } from "~/hooks/useLocalStorage";
import { commandLabel } from "~/components/settings/KeybindingsSettings.logic";
import type { ResolvedSettingsScope } from "~/components/settings/settingsScope";

export type SettingsPath =
  | "/settings/projects"
  | "/settings/general"
  | "/settings/diagnostics"
  | "/settings/voice"
  | "/settings/appearance"
  | "/settings/chat"
  | "/settings/diffs"
  | "/settings/keybindings"
  | "/settings/snap-shot"
  | "/settings/providers"
  | "/settings/threads"
  | "/settings/browser"
  | "/settings/devices"
  | "/settings/scheduled-tasks"
  | "/settings/source-control"
  | "/settings/worktrees"
  | "/settings/connections"
  | "/settings/access"
  | "/settings/secrets"
  | "/settings/maintenance"
  | "/settings/labs"
  | "/settings/about"
  | "/settings/archived";

export type SettingsSearchScope =
  | "environment"
  | "environment-defaults"
  | "project-defaults"
  | "project"
  | "checkout"
  | "connections";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  readonly searchTerms?: ReadonlyArray<string>;
  readonly scope?: SettingsSearchScope;
  readonly desktopOnly?: boolean;
  readonly macOnly?: boolean;
  readonly windowsOnly?: boolean;
  readonly releaseChannelOnly?: boolean;
  readonly secretsFeatureOnly?: boolean;
  readonly cloudOnly?: boolean;
  readonly environmentOnly?: boolean;
  readonly providerSettingsOnly?: boolean;
  readonly localBackendManagementOnly?: boolean;
  readonly localEnvironmentOnly?: boolean;
  readonly primaryEnvironmentOnly?: boolean;
  readonly wslAvailableOnly?: boolean;
  readonly managedTunnelOnly?: boolean;
  readonly peerLinksOnly?: boolean;
  readonly fastWorktreeCheckoutOnly?: boolean;
  readonly textGeneratorsOnly?: boolean;
  readonly secondary?: boolean;
  readonly requiresThreadAutoSettlement?: boolean;
}

export interface SettingsSearchAvailability {
  readonly localEnvironmentDisabled?: boolean;
  readonly hasCloudPublicConfig: boolean;
  readonly hasEnvironment: boolean;
  readonly hasProviderSettingsEnvironment: boolean;
  readonly canManageLocalBackend: boolean;
  readonly isWslSettingsRowVisible: boolean;
  readonly hasThreadAutoSettlement: boolean;
  readonly managedTunnelActive?: boolean;
  readonly hasPeerLinkHost?: boolean;
  readonly hasFastWorktreeCheckoutEnvironment?: boolean;
  /** An environment without a provider allow-list, which hides text generators. */
  readonly hasTextGeneratorsEnvironment?: boolean;
  readonly hasPrimaryEnvironment?: boolean;
}

const englishSectionLabels: Readonly<Record<SettingsPath, string>> = {
  "/settings/diagnostics": resources.en.settings.navigation.diagnostics,
  "/settings/projects": resources.en.settings.navigation.projects,
  "/settings/general": resources.en.settings.navigation.general,
  "/settings/appearance": resources.en.settings.navigation.appearance,
  "/settings/chat": resources.en.settings.navigation.chat,
  "/settings/diffs": resources.en.settings.navigation.diffs,
  "/settings/keybindings": resources.en.settings.navigation.keybindings,
  "/settings/snap-shot": resources.en.settings.navigation.snapShot,
  "/settings/providers": resources.en.settings.navigation.providers,
  "/settings/threads": resources.en.settings.navigation.threads,
  "/settings/browser": resources.en.settings.navigation.browser,
  "/settings/devices": resources.en.settings.navigation.devices,
  "/settings/scheduled-tasks": resources.en.settings.navigation.scheduledTasks,
  "/settings/source-control": resources.en.settings.navigation.sourceControl,
  "/settings/worktrees": resources.en.settings.navigation.worktrees,
  "/settings/connections": resources.en.settings.navigation.connections,
  "/settings/access": resources.en.settings.navigation.access,
  "/settings/secrets": resources.en.settings.navigation.secrets,
  "/settings/maintenance": resources.en.settings.navigation.maintenance,
  "/settings/labs": resources.en.settings.navigation.labs,
  "/settings/about": resources.en.settings.navigation.about,
  "/settings/voice": resources.en.settings.navigation.voice,
  "/settings/archived": resources.en.settings.navigation.archived,
};

export function settingsSectionLabels(
  t: SettingsTranslation,
): Readonly<Record<SettingsPath, string>> {
  return {
    "/settings/diagnostics": t(($) => $.navigation.diagnostics),
    "/settings/projects": t(($) => $.navigation.projects),
    "/settings/general": t(($) => $.navigation.general),
    "/settings/appearance": t(($) => $.navigation.appearance),
    "/settings/chat": t(($) => $.navigation.chat),
    "/settings/diffs": t(($) => $.navigation.diffs),
    "/settings/keybindings": t(($) => $.navigation.keybindings),
    "/settings/snap-shot": t(($) => $.navigation.snapShot),
    "/settings/providers": t(($) => $.navigation.providers),
    "/settings/threads": t(($) => $.navigation.threads),
    "/settings/browser": t(($) => $.navigation.browser),
    "/settings/devices": t(($) => $.navigation.devices),
    "/settings/scheduled-tasks": t(($) => $.navigation.scheduledTasks),
    "/settings/source-control": t(($) => $.navigation.sourceControl),
    "/settings/worktrees": t(($) => $.navigation.worktrees),
    "/settings/connections": t(($) => $.navigation.connections),
    "/settings/access": t(($) => $.navigation.access),
    "/settings/secrets": t(($) => $.navigation.secrets),
    "/settings/maintenance": t(($) => $.navigation.maintenance),
    "/settings/labs": t(($) => $.navigation.labs),
    "/settings/about": t(($) => $.navigation.about),
    "/settings/voice": t(($) => $.navigation.voice),
    "/settings/archived": t(($) => $.navigation.archived),
  };
}

/** Sidebar order. A group without a heading is set apart by space alone. */
export function settingsNavGroups(t: SettingsTranslation): ReadonlyArray<{
  readonly heading: string | null;
  readonly paths: ReadonlyArray<SettingsPath>;
}> {
  return [
    {
      heading: null,
      paths: [
        "/settings/general",
        "/settings/appearance",
        "/settings/chat",
        "/settings/diffs",
        "/settings/keybindings",
        "/settings/voice",
        "/settings/snap-shot",
      ],
    },
    {
      heading: t(($) => $.navigation.agents),
      paths: [
        "/settings/providers",
        "/settings/threads",
        "/settings/browser",
        "/settings/devices",
        "/settings/scheduled-tasks",
      ],
    },
    {
      heading: t(($) => $.navigation.code),
      paths: ["/settings/projects", "/settings/source-control", "/settings/worktrees"],
    },
    {
      heading: t(($) => $.navigation.groupConnections),
      paths: [
        "/settings/connections",
        "/settings/access",
        ...(isSecretsFeatureEnabled ? (["/settings/secrets"] as const) : []),
      ],
    },
    {
      heading: null,
      paths: ["/settings/maintenance", "/settings/labs", "/settings/about", "/settings/archived"],
    },
  ];
}

export function keybindingSearchAnchorId<Command extends KeybindingCommand>(command: Command) {
  return `keybinding-${command}` as const;
}

const englishCommandLabels = {
  "thread.jump.1": resources.en.settings.commands.threadJump1,
  "thread.jump.2": resources.en.settings.commands.threadJump2,
  "thread.jump.3": resources.en.settings.commands.threadJump3,
  "thread.jump.4": resources.en.settings.commands.threadJump4,
  "thread.jump.5": resources.en.settings.commands.threadJump5,
  "thread.jump.6": resources.en.settings.commands.threadJump6,
  "thread.jump.7": resources.en.settings.commands.threadJump7,
  "thread.jump.8": resources.en.settings.commands.threadJump8,
  "thread.jump.9": resources.en.settings.commands.threadJump9,
  "modelPicker.jump.1": resources.en.settings.commands.modelPickerJump1,
  "modelPicker.jump.2": resources.en.settings.commands.modelPickerJump2,
  "modelPicker.jump.3": resources.en.settings.commands.modelPickerJump3,
  "modelPicker.jump.4": resources.en.settings.commands.modelPickerJump4,
  "modelPicker.jump.5": resources.en.settings.commands.modelPickerJump5,
  "modelPicker.jump.6": resources.en.settings.commands.modelPickerJump6,
  "modelPicker.jump.7": resources.en.settings.commands.modelPickerJump7,
  "modelPicker.jump.8": resources.en.settings.commands.modelPickerJump8,
  "modelPicker.jump.9": resources.en.settings.commands.modelPickerJump9,
  "thread.stop": resources.en.settings.commands.threadStop,
  "thread.steerQueuedMessage": resources.en.settings.commands.threadSteerQueuedMessage,
  "thread.editQueuedMessage": resources.en.settings.commands.threadEditQueuedMessage,
  "thread.previous": resources.en.settings.commands.threadPrevious,
  "thread.next": resources.en.settings.commands.threadNext,
  "thread.copyReference": resources.en.settings.commands.threadCopyReference,
  "thread.settle": resources.en.settings.commands.threadSettle,
  "thread.pin": resources.en.settings.commands.threadPin,
  "thread.undo": resources.en.settings.commands.threadUndo,
  "thread.regenerateTitle": resources.en.settings.commands.threadRegenerateTitle,
  "modelPicker.toggle": resources.en.settings.commands.modelPickerToggle,
  "modelPicker.previousProvider": resources.en.settings.commands.modelPickerPreviousProvider,
  "modelPicker.nextProvider": resources.en.settings.commands.modelPickerNextProvider,
  "workspace.focusNext": resources.en.settings.commands.workspaceFocusNext,
  "workspace.focusPrevious": resources.en.settings.commands.workspaceFocusPrevious,
  "sidebar.toggle": resources.en.settings.commands.sidebarToggle,
  "navigation.back": resources.en.settings.commands.navigationBack,
  "navigation.forward": resources.en.settings.commands.navigationForward,
  "terminal.toggle": resources.en.settings.commands.terminalToggle,
  "terminal.split": resources.en.settings.commands.terminalSplit,
  "terminal.splitVertical": resources.en.settings.commands.terminalSplitVertical,
  "terminal.new": resources.en.settings.commands.terminalNew,
  "terminal.close": resources.en.settings.commands.terminalClose,
  "rightPanel.toggle": resources.en.settings.commands.rightPanelToggle,
  "rightPanel.new": resources.en.settings.commands.rightPanelNew,
  "threadPanel.toggle": resources.en.settings.commands.threadPanelToggle,
  "rightPanel.toggleMaximized": resources.en.settings.commands.rightPanelToggleMaximized,
  "rightPanel.close": resources.en.settings.commands.rightPanelClose,
  "view.reopenClosed": resources.en.settings.commands.viewReopenClosed,
  "pullRequest.copyNumber": resources.en.settings.commands.pullRequestCopyNumber,
  "diff.toggle": resources.en.settings.commands.diffToggle,
  "preview.toggle": resources.en.settings.commands.previewToggle,
  "preview.refresh": resources.en.settings.commands.previewRefresh,
  "preview.focusUrl": resources.en.settings.commands.previewFocusUrl,
  "preview.find": resources.en.settings.commands.previewFind,
  "preview.zoomIn": resources.en.settings.commands.previewZoomIn,
  "preview.zoomOut": resources.en.settings.commands.previewZoomOut,
  "preview.resetZoom": resources.en.settings.commands.previewResetZoom,
  "commandPalette.toggle": resources.en.settings.commands.commandPaletteToggle,
  "filePicker.toggle": resources.en.settings.commands.filePickerToggle,
  "projectSearch.toggle": resources.en.settings.commands.projectSearchToggle,
  "usage.open": resources.en.settings.commands.usageOpen,
  "theme.select": resources.en.settings.commands.themeSelect,
  "appearance.cycle": resources.en.settings.commands.appearanceCycle,
  "themeEditor.toggle": resources.en.settings.commands.themeEditorToggle,
  "composer.stash": resources.en.settings.commands.composerStash,
  "composer.sendAlternate": resources.en.settings.commands.composerSendAlternate,
  "composer.sendBackground": resources.en.settings.commands.composerSendBackground,
  "composer.sendAndNewThread": resources.en.settings.commands.composerSendAndNewThread,
  "composer.dictation": resources.en.settings.commands.composerDictation,
  "composer.host": resources.en.settings.commands.composerHost,
  "composer.cycleHost": resources.en.settings.commands.composerCycleHost,
  "composer.effort": resources.en.settings.commands.composerEffort,
  "composer.increaseEffort": resources.en.settings.commands.composerIncreaseEffort,
  "composer.decreaseEffort": resources.en.settings.commands.composerDecreaseEffort,
  "composer.mode": resources.en.settings.commands.composerMode,
  "composer.workspace": resources.en.settings.commands.composerWorkspace,
  "composer.previousWorktree": resources.en.settings.commands.composerPreviousWorktree,
  "composer.branch": resources.en.settings.commands.composerBranch,
  "chat.new": resources.en.settings.commands.chatNew,
  "chat.newLocal": resources.en.settings.commands.chatNewLocal,
  "chat.newWithoutProject": resources.en.settings.commands.chatNewWithoutProject,
  "chat.find": resources.en.settings.commands.chatFind,
  "editor.openFavorite": resources.en.settings.commands.editorOpenFavorite,
  "usage.cost": resources.en.settings.commands.usageCost,
  "usage.tokens": resources.en.settings.commands.usageTokens,
  "usage.limits": resources.en.settings.commands.usageLimits,
  "usage.period.day": resources.en.settings.commands.usagePeriodDay,
  "usage.period.week": resources.en.settings.commands.usagePeriodWeek,
  "usage.period.month": resources.en.settings.commands.usagePeriodMonth,
  "usage.period.quarter": resources.en.settings.commands.usagePeriodQuarter,
} satisfies Record<(typeof STATIC_KEYBINDING_COMMANDS)[number], string>;

const KEYBINDING_SEARCH_SOURCES = STATIC_KEYBINDING_COMMANDS.map((command) => {
  const defaultKeys = DEFAULT_KEYBINDINGS.filter((binding) => binding.command === command).map(
    (binding) => binding.key,
  );
  return {
    id: keybindingSearchAnchorId(command),
    title: (t: SettingsTranslation) => commandLabel(command, t),
    to: "/settings/keybindings" as const,
    searchTerms: [
      command,
      ...defaultKeys,
      englishCommandLabels[command],
      command.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll(".", " "),
    ],
    secondary: true,
    ...(defaultKeys.length === 0 ? { targetId: "keybindings" } : {}),
  };
});

export function sourceControlHostSettingsSearchId(kind: string) {
  return `source-control-host-${kind}` as const;
}

/** Each host's own settings: its accounts and token, or the fields of its settings form. */
function sourceControlHostSearchSources(
  definitions: ReadonlyArray<SourceControlDefinition>,
): ReadonlyArray<
  SettingsSearchSource & { readonly id: ReturnType<typeof sourceControlHostSettingsSearchId> }
> {
  return definitions.flatMap((definition) => {
    if (!definition.settings) return [];
    const names = [definition.label, ...(definition.searchKeywords ?? [])].join(" ");
    const { credentials } = definition;
    return [
      {
        id: sourceControlHostSettingsSearchId(definition.kind),
        title: (t: SettingsTranslation) =>
          credentials
            ? t(($) => $.search.hostAccounts, { host: definition.label })
            : t(($) => $.search.hostCredentials, { host: definition.label }),
        to: "/settings/source-control" as const,
        searchTerms: [
          credentials
            ? `${names} ${credentials.cliName} account login user host switch multiple accounts disable sign in token personal access token pat api key credential`
            : `${names} ${Object.keys(definition.settings.fields).join(" ")} token credentials sign in`,
        ],
        environmentOnly: true,
        scope: "environment-defaults" as const,
      },
    ];
  });
}

/** For settings that apply to every host. */
const SOURCE_CONTROL_HOST_LABELS = sourceControlClients.definitions
  .map((definition) => definition.label)
  .join(" ");
const SOURCE_CONTROL_HOST_TERMS = sourceControlClients.definitions
  .flatMap((definition) => [definition.label, ...(definition.searchKeywords ?? [])])
  .join(" ");

type SettingsSearchSource = Omit<SettingsSearchItem, "title"> & {
  readonly title: (t: SettingsTranslation) => string;
  readonly englishTitle?: string;
};

const SETTINGS_SEARCH_ITEMS = [
  {
    id: "interface-language",
    title: (t) => t(($) => $.search.interfaceLanguage),
    englishTitle: resources.en.settings.search.interfaceLanguage,
    to: "/settings/general",
    searchTerms: [
      "Language / Sprache",
      "language sprache deutsch german english englisch locale übersetzung translation",
    ],
  },
  {
    id: "storage-worktree-keep-when",
    targetId: "storage-worktrees",
    title: (t) => t(($) => $.search.storageWorktreeKeepWhen),
    englishTitle: resources.en.settings.search.storageWorktreeKeepWhen,
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: [
      "any local files uncommitted changes edited tracked files ignored env build output cleanup",
    ],
  },
  {
    id: "storage-delete-now",
    title: (t) => t(($) => $.search.storageDeleteNow),
    englishTitle: resources.en.settings.search.storageDeleteNow,
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: ["storage cleanup run now results report removed kept failed"],
  },
  {
    id: "storage-worktrees",
    title: (t) => t(($) => $.search.storageWorktrees),
    englishTitle: resources.en.settings.search.storageWorktrees,
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: [
      "disk storage automatic delete deleted archived threads old inactive merged settled unchanged worktrees retention days project inherit off custom",
    ],
  },
  {
    id: "storage-worktrees-location",
    title: (t) => t(($) => $.search.storageWorktreesLocation),
    englishTitle: resources.en.settings.search.storageWorktreesLocation,
    to: "/settings/worktrees",
    scope: "environment-defaults",
    searchTerms: ["worktree location folder directory path drive external disk"],
  },
  {
    id: "storage-artifacts",
    title: (t) => t(($) => $.search.storageArtifacts),
    englishTitle: resources.en.settings.search.storageArtifacts,
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: [
      "disk storage delete old browser artifacts screenshots captures rotated logs cleanup retention",
    ],
  },
  {
    id: "project-defaults",
    title: (t) => t(($) => $.search.projectDefaults),
    englishTitle: resources.en.settings.search.projectDefaults,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["model workspace environments projects inheritance checkout"],
  },
  {
    id: "project-overview",
    title: (t) => t(($) => $.search.projectOverview),
    englishTitle: resources.en.settings.search.projectOverview,
    to: "/settings/projects",
    searchTerms: ["name icon emoji image checkout remove delete"],
  },
  {
    id: "default-model",
    title: (t) => t(($) => $.search.defaultModel),
    englishTitle: resources.en.settings.search.defaultModel,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["new thread project provider reasoning effort"],
  },
  {
    id: "fallback-model",
    title: (t) => t(($) => $.search.fallbackModel),
    englishTitle: resources.en.settings.search.fallbackModel,
    to: "/settings/threads",
    scope: "environment-defaults",
    searchTerms: ["fallback agent provider out of usage new threads"],
    environmentOnly: true,
  },
  {
    id: "default-permissions",
    title: (t) => t(($) => $.search.defaultPermissions),
    englishTitle: resources.en.settings.search.defaultPermissions,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: [
      "new thread default runtime mode supervised approvals auto accept edits full access",
    ],
  },
  {
    id: "color-scheme",
    title: (t) => t(($) => $.search.colorScheme),
    englishTitle: resources.en.settings.search.colorScheme,
    to: "/settings/appearance",
    searchTerms: ["appearance light dark system mode"],
    targetId: "appearance",
  },
  {
    id: "theme",
    title: (t) => t(($) => $.search.theme),
    englishTitle: resources.en.settings.search.theme,
    to: "/settings/appearance",
    searchTerms: ["appearance colors palette custom import"],
    targetId: "appearance",
  },
  {
    // Prefixed because the slider control already owns the `appearance-contrast` id.
    id: "setting-appearance-contrast",
    title: (t) => t(($) => $.search.settingAppearanceContrast),
    englishTitle: resources.en.settings.search.settingAppearanceContrast,
    to: "/settings/appearance",
    searchTerms: ["colors borders interface"],
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    title: (t) => t(($) => $.search.settingGlassOpacity),
    englishTitle: resources.en.settings.search.settingGlassOpacity,
    to: "/settings/appearance",
    searchTerms: ["transparent transparency solid menus dialogs composer"],
  },
  {
    id: "diff-color-scheme",
    title: (t) => t(($) => $.search.diffColorScheme),
    englishTitle: resources.en.settings.search.diffColorScheme,
    to: "/settings/diffs",
    searchTerms: ["red green blue orange additions deletions changes counts palette colorblind"],
  },
  {
    id: "chat-width",
    title: (t) => t(($) => $.search.chatWidth),
    englishTitle: resources.en.settings.search.chatWidth,
    to: "/settings/appearance",
    searchTerms: ["wide full width column layout messages composer monitor"],
  },
  {
    id: "thread-details-items",
    title: (t) => t(($) => $.search.threadDetailsItems),
    englishTitle: resources.en.settings.search.threadDetailsItems,
    to: "/settings/appearance",
    searchTerms: [
      "customize show hide panel card environment editor scripts branch pull request git changes servers automations lineage usage limits 5 hour weekly quota tokens context window",
    ],
  },
  {
    id: "effort-display",
    title: (t) => t(($) => $.search.effortDisplay),
    englishTitle: resources.en.settings.search.effortDisplay,
    to: "/settings/appearance",
    searchTerms: ["reasoning effort thinking bars graph word label level composer"],
  },
  {
    id: "math-rendering",
    title: (t) => t(($) => $.search.mathRendering),
    englishTitle: resources.en.settings.search.mathRendering,
    to: "/settings/appearance",
    searchTerms: ["latex tex katex equations formulas markdown"],
  },
  {
    id: "panel-animations",
    title: (t) => t(($) => $.search.panelAnimations),
    englishTitle: resources.en.settings.search.panelAnimations,
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    title: (t) => t(($) => $.search.environmentIdentification),
    englishTitle: resources.en.settings.search.environmentIdentification,
    to: "/settings/appearance",
    searchTerms: ["dev nightly latest channel artwork pill label hide none"],
    targetId: "appearance-interface",
  },
  {
    id: "interface-font",
    title: (t) => t(($) => $.search.interfaceFont),
    englishTitle: resources.en.settings.search.interfaceFont,
    to: "/settings/appearance",
    searchTerms: ["typography family size system sans"],
  },
  {
    id: "prompt-font",
    title: (t) => t(($) => $.search.promptFont),
    englishTitle: resources.en.settings.search.promptFont,
    to: "/settings/appearance",
    searchTerms: ["typography family size composer input"],
  },
  {
    id: "code-font",
    title: (t) => t(($) => $.search.codeFont),
    englishTitle: resources.en.settings.search.codeFont,
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace code blocks diffs file previews"],
  },
  {
    id: "terminal-font",
    title: (t) => t(($) => $.search.terminalFont),
    englishTitle: resources.en.settings.search.terminalFont,
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace output"],
  },
  {
    id: "separate-fonts",
    title: (t) => t(($) => $.search.separateFonts),
    englishTitle: resources.en.settings.search.separateFonts,
    to: "/settings/appearance",
    searchTerms: ["typography advanced prompt code terminal font family size individually"],
  },
  {
    id: "font-smoothing",
    title: (t) => t(($) => $.search.fontSmoothing),
    englishTitle: resources.en.settings.search.fontSmoothing,
    to: "/settings/appearance",
    searchTerms: ["typography text grayscale anti aliasing macos thin"],
    macOnly: true,
  },
  {
    id: "word-wrap",
    title: (t) => t(($) => $.search.wordWrap),
    englishTitle: resources.en.settings.search.wordWrap,
    to: "/settings/appearance",
    searchTerms: ["long lines code blocks diffs file previews"],
  },
  {
    id: "composer-context",
    title: (t) => t(($) => $.search.composerContext),
    englishTitle: resources.en.settings.search.composerContext,
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    title: (t) => t(($) => $.search.projectGrouping),
    englishTitle: resources.en.settings.search.projectGrouping,
    to: "/settings/general",
    searchTerms: ["combine matching repositories environments sidebar"],
  },
  {
    id: "project-order",
    title: (t) => t(($) => $.search.projectOrder),
    englishTitle: resources.en.settings.search.projectOrder,
    to: "/settings/general",
    searchTerms: ["sort projects sidebar manual created recent"],
  },
  {
    id: "snooze-options",
    title: (t) => t(($) => $.search.snoozeOptions),
    englishTitle: resources.en.settings.search.snoozeOptions,
    to: "/settings/threads",
    searchTerms: ["snooze presets times later tonight tomorrow next week remind"],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "snooze-limited-threads",
    title: (t) => t(($) => $.search.snoozeLimitedThreads),
    englishTitle: resources.en.settings.search.snoozeLimitedThreads,
    to: "/settings/threads",
    searchTerms: ["usage quota rate limit reset wake recover continue"],
  },
  {
    id: "auto-resume-limited-threads",
    title: (t) => t(($) => $.search.autoResumeLimitedThreads),
    englishTitle: resources.en.settings.search.autoResumeLimitedThreads,
    to: "/settings/threads",
    searchTerms: ["usage quota rate limit reset recover continue"],
  },
  {
    id: "working-shelf",
    title: (t) => t(($) => $.search.workingShelf),
    englishTitle: resources.en.settings.search.workingShelf,
    to: "/settings/general",
    searchTerms: ["hide fold running monitoring threads inbox sidebar shelf"],
  },
  {
    id: "boring-sidebar",
    title: (t) => t(($) => $.search.boringSidebar),
    englishTitle: resources.en.settings.search.boringSidebar,
    to: "/settings/labs",
    searchTerms: ["beta folders project tree classic sidebar"],
  },
  {
    id: "boring-sidebar-multiline",
    title: (t) => t(($) => $.search.boringSidebarMultiline),
    englishTitle: resources.en.settings.search.boringSidebarMultiline,
    to: "/settings/labs",
    // Shown inside the boring sidebar row only while it is on, so search lands on the parent.
    targetId: "boring-sidebar",
    searchTerms: ["beta boring sidebar folder rows multiline branch pull request details"],
  },
  {
    id: "tool-call-visibility",
    title: (t) => t(($) => $.search.toolCallVisibility),
    englishTitle: resources.en.settings.search.toolCallVisibility,
    to: "/settings/chat",
    searchTerms: [
      "hide tool calls commands edits searches work log activity quiet chat zen final answers only",
    ],
  },
  {
    id: "screen-reader-announcements",
    title: (t) => t(($) => $.search.screenReaderAnnouncements),
    englishTitle: resources.en.settings.search.screenReaderAnnouncements,
    to: "/settings/chat",
    searchTerms: [
      "accessibility a11y screen reader nvda jaws voiceover orca narrator speech announce read aloud messages activity steps",
    ],
  },
  {
    id: "guest-links",
    title: (t) => t(($) => $.search.guestLinks),
    englishTitle: resources.en.settings.search.guestLinks,
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta share guest invite link teammate watch t3 connect tunnel"],
  },
  {
    id: "linked-environments-beta",
    title: (t) => t(($) => $.search.linkedEnvironmentsBeta),
    englishTitle: resources.en.settings.search.linkedEnvironmentsBeta,
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta link another machine vps peer agents work there delegate"],
  },
  {
    id: "prompt-suggestions-beta",
    title: (t) => t(($) => $.search.promptSuggestionsBeta),
    englishTitle: resources.en.settings.search.promptSuggestionsBeta,
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta tab autocomplete predict next message claude codex ghost text"],
  },
  {
    id: "simlock-hosts",
    title: (t) => t(($) => $.search.simlockHosts),
    englishTitle: resources.en.settings.search.simlockHosts,
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta alpha simlock callstack simulator emulator ios android pool lease gateway"],
  },
  {
    id: "worktree-fast-checkout",
    title: (t) => t(($) => $.search.worktreeFastCheckout),
    englishTitle: resources.en.settings.search.worktreeFastCheckout,
    to: "/settings/labs",
    scope: "environment",
    fastWorktreeCheckoutOnly: true,
    searchTerms: ["beta fast worktree checkout clone apfs copy-on-write cache macos speed"],
  },
  {
    id: "voice-transcription-destination",
    title: (t) => t(($) => $.search.voiceTranscriptionDestination),
    englishTitle: resources.en.settings.search.voiceTranscriptionDestination,
    to: "/settings/voice",
    searchTerms: [
      "send microphone audio dictation destination speech voice stt transcription environment machine consent privacy cloud OpenAI Grok OpenRouter",
    ],
  },
  {
    id: "voice-microphone",
    title: (t) => t(($) => $.search.voiceMicrophone),
    englishTitle: resources.en.settings.search.voiceMicrophone,
    to: "/settings/voice",
    searchTerms: ["mic input audio device order priority preferred"],
  },
  {
    id: "dictation-shortcut-mode",
    title: (t) => t(($) => $.search.dictationShortcutMode),
    englishTitle: resources.en.settings.search.dictationShortcutMode,
    to: "/settings/voice",
    searchTerms: ["speech voice keyboard hotkey hold toggle auto"],
  },
  {
    id: "speech-language",
    title: (t) => t(($) => $.search.speechLanguage),
    englishTitle: resources.en.settings.search.speechLanguage,
    to: "/settings/voice",
    searchTerms: ["speech voice translate english auto detect"],
  },
  {
    id: "speech-dictionary",
    title: (t) => t(($) => $.search.speechDictionary),
    englishTitle: resources.en.settings.search.speechDictionary,
    to: "/settings/voice",
    searchTerms: ["speech voice transcription vocabulary names glossary alias"],
  },
  {
    id: "speech-project-dictionary",
    title: (t) => t(($) => $.search.speechProjectDictionary),
    englishTitle: resources.en.settings.search.speechProjectDictionary,
    to: "/settings/voice",
    scope: "project-defaults",
    searchTerms: [
      "speech voice transcription vocabulary shared dictionary team environment glossary",
    ],
  },
  {
    id: "speech-post-processing-model",
    title: (t) => t(($) => $.search.speechPostProcessingModel),
    englishTitle: resources.en.settings.search.speechPostProcessingModel,
    to: "/settings/voice",
    scope: "environment",
    searchTerms: ["speech voice transcript cleanup provider model post-processing"],
  },
  {
    id: "speech-correction-word",
    title: (t) => t(($) => $.search.speechCorrectionWord),
    englishTitle: resources.en.settings.search.speechCorrectionWord,
    to: "/settings/voice",
    searchTerms: ["speech voice cleanup sorry scratch that fix mistake"],
  },
  {
    id: "speech-silence-filtering",
    title: (t) => t(($) => $.search.speechSilenceFiltering),
    englishTitle: resources.en.settings.search.speechSilenceFiltering,
    to: "/settings/voice",
    searchTerms: ["voice speech vad silero pauses noise"],
  },
  {
    id: "remove-filler-words",
    title: (t) => t(($) => $.search.removeFillerWords),
    englishTitle: resources.en.settings.search.removeFillerWords,
    to: "/settings/voice",
    searchTerms: ["voice speech transcription hesitation um uh cleanup"],
  },
  {
    id: "speech-post-processing",
    title: (t) => t(($) => $.search.cleanUpTranscripts),
    englishTitle: resources.en.settings.search.cleanUpTranscripts,
    to: "/settings/voice",
    searchTerms: ["speech transcription polish clean provider prompt post-processing"],
  },
  {
    id: "speech-models",
    title: (t) => t(($) => $.search.speechModels),
    englishTitle: resources.en.settings.search.speechModels,
    to: "/settings/voice",
    searchTerms: [
      "speech voice stt download whisper parakeet canary moonshine accuracy speed benchmark languages",
    ],
  },
  {
    id: "speech-hardware",
    title: (t) => t(($) => $.search.speechHardware),
    englishTitle: resources.en.settings.search.speechHardware,
    to: "/settings/voice",
    searchTerms: ["speech voice stt advanced gpu cpu acceleration memory unload idle"],
  },
  {
    id: "microphone-test",
    title: (t) => t(($) => $.search.microphoneTest),
    englishTitle: resources.en.settings.search.microphoneTest,
    to: "/settings/voice",
    searchTerms: ["test mic audio playback loopback record input level"],
  },
  {
    id: "transcription-test",
    title: (t) => t(($) => $.search.transcriptionTest),
    englishTitle: resources.en.settings.search.transcriptionTest,
    to: "/settings/voice",
    searchTerms: ["test voice speech model transcription recognition"],
  },
  {
    id: "auto-settle-inactive-threads",
    title: (t) => t(($) => $.search.autoSettleInactiveThreads),
    englishTitle: resources.en.settings.search.autoSettleInactiveThreads,
    to: "/settings/threads",
    searchTerms: ["sidebar inactivity days no activity automatically"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "compact-idle-threads",
    title: (t) => t(($) => $.search.compactIdleThreads),
    englishTitle: resources.en.settings.search.compactIdleThreads,
    to: "/settings/providers",
    scope: "environment-defaults",
    searchTerms: ["claude context compaction idle cache tokens usage summary resume"],
  },
  {
    id: "auto-settle-merged-threads",
    title: (t) => t(($) => $.search.autoSettleMergedThreads),
    englishTitle: resources.en.settings.search.autoSettleMergedThreads,
    to: "/settings/threads",
    searchTerms: ["pull request merge closed automatically sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "keep-threads-with-pull-requests",
    title: (t) => t(($) => $.search.keepThreadsWithPullRequests),
    englishTitle: resources.en.settings.search.keepThreadsWithPullRequests,
    to: "/settings/threads",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["pull request inactivity auto-settle merge close sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "days-before-auto-settle",
    title: (t) => t(($) => $.search.daysBeforeAutoSettle),
    englishTitle: resources.en.settings.search.daysBeforeAutoSettle,
    to: "/settings/threads",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["thread timeout activity sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "thread-notifications",
    title: (t) => t(($) => $.search.threadNotifications),
    englishTitle: resources.en.settings.search.threadNotifications,
    to: "/settings/general",
    searchTerms: ["notification sound alert completion input approval desktop"],
  },
  {
    id: "in-app-notifications",
    title: (t) => t(($) => $.search.inAppNotifications),
    englishTitle: resources.en.settings.search.inAppNotifications,
    to: "/settings/general",
    searchTerms: ["notification toast popup completion input approval failure"],
  },
  {
    id: "time-format",
    title: (t) => t(($) => $.search.timeFormat),
    englishTitle: resources.en.settings.search.timeFormat,
    to: "/settings/general",
    searchTerms: ["timestamp clock locale system browser os 12 hour 24 hour"],
  },
  {
    id: "response-streaming",
    title: (t) => t(($) => $.search.responseStreaming),
    englishTitle: resources.en.settings.search.responseStreaming,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["output token paragraph buffered wait turn legacy"],
  },
  {
    id: "hide-whitespace-changes",
    title: (t) => t(($) => $.search.hideWhitespaceChanges),
    englishTitle: resources.en.settings.search.hideWhitespaceChanges,
    to: "/settings/diffs",
    searchTerms: ["diff ignore spaces edits default"],
  },
  {
    id: "default-diff-file-state",
    title: (t) => t(($) => $.search.defaultDiffFileState),
    englishTitle: resources.en.settings.search.defaultDiffFileState,
    to: "/settings/diffs",
    searchTerms: ["collapsed expanded collapse expand files pull request pr code tab"],
  },
  {
    id: "diff-layout",
    title: (t) => t(($) => $.search.diffLayout),
    englishTitle: resources.en.settings.search.diffLayout,
    to: "/settings/diffs",
    searchTerms: ["stacked split side by side unified inline view"],
  },
  {
    id: "proactive-panels",
    title: (t) => t(($) => $.search.proactivePanels),
    englishTitle: resources.en.settings.search.proactivePanels,
    to: "/settings/diffs",
    searchTerms: ["proactive automatically open diff pull request pr right panel agent completion"],
  },
  {
    id: "skills-in-slash-menu",
    title: (t) => t(($) => $.search.skillsInSlashMenu),
    englishTitle: resources.en.settings.search.skillsInSlashMenu,
    to: "/settings/chat",
    searchTerms: ["command menu dollar $ slash /"],
  },
  {
    id: "composer-rich-text",
    title: (t) => t(($) => $.search.composerRichText),
    englishTitle: resources.en.settings.search.composerRichText,
    to: "/settings/chat",
    searchTerms: ["composer rich text tiptap bold italic markdown styled wysiwyg"],
  },
  {
    id: "composer-spell-check",
    title: (t) => t(($) => $.search.composerSpellCheck),
    englishTitle: resources.en.settings.search.composerSpellCheck,
    to: "/settings/chat",
    searchTerms: ["spellcheck spelling typo misspelled underline red squiggle rechtschreibung"],
  },
  {
    id: "send-shortcut",
    title: (t) => t(($) => $.search.sendShortcut),
    englishTitle: resources.en.settings.search.sendShortcut,
    to: "/settings/chat",
    searchTerms: ["enter return command ctrl multiline prompt new line composer"],
  },
  {
    id: "follow-up-behavior",
    title: (t) => t(($) => $.search.followUpBehavior),
    englishTitle: resources.en.settings.search.followUpBehavior,
    to: "/settings/chat",
    searchTerms: ["queue steer running turn send default behavior composer"],
  },
  {
    id: "provider-update-checks",
    title: (t) => t(($) => $.search.providerUpdateChecks),
    englishTitle: resources.en.settings.search.providerUpdateChecks,
    to: "/settings/maintenance",
    searchTerms: [
      "installed cli versions newer available codex claude cursor grok fx kiro opencode",
    ],
    scope: "environment-defaults",
  },
  {
    id: "continue-threads-after-server-update",
    title: (t) => t(($) => $.search.continueThreadsAfterServerUpdate),
    englishTitle: resources.en.settings.search.continueThreadsAfterServerUpdate,
    to: "/settings/maintenance",
    scope: "project-defaults",
    searchTerms: [
      "resume running active interrupted work restart reboot machine crash desktop update automatically",
    ],
  },
  {
    id: "background-activity",
    title: (t) => t(($) => $.search.backgroundActivity),
    englishTitle: resources.en.settings.search.backgroundActivity,
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: [
      "balanced performance battery saver advanced git fetch provider health refresh host power monitor idle policy",
    ],
  },
  {
    id: "new-threads",
    title: (t) => t(($) => $.search.newThreads),
    englishTitle: resources.en.settings.search.newThreads,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["default workspace mode draft local worktree"],
  },
  {
    id: "worktree-submodules",
    title: (t) => t(($) => $.search.worktreeSubmodules),
    englishTitle: resources.en.settings.search.worktreeSubmodules,
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: ["git submodule init recursive top-level none worktree t3.json"],
  },
  {
    id: "start-from-origin",
    title: (t) => t(($) => $.search.startFromOrigin),
    englishTitle: resources.en.settings.search.startFromOrigin,
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: ["new worktrees start remote origin latest fetched branch local"],
  },
  {
    id: "add-project-starts-in",
    title: (t) => t(($) => $.search.addProjectStartsIn),
    englishTitle: resources.en.settings.search.addProjectStartsIn,
    to: "/settings/threads",
    scope: "environment-defaults",
    searchTerms: ["base directory folder browser path home"],
  },
  {
    id: "ghq-clone-layout",
    title: (t) => t(($) => $.search.ghqCloneLayout),
    englishTitle: resources.en.settings.search.ghqCloneLayout,
    to: "/settings/threads",
    scope: "environment-defaults",
    searchTerms: ["ghq clone destination host owner repository root layout"],
  },
  {
    id: "unpin-confirmation",
    title: (t) => t(($) => $.search.unpinConfirmation),
    englishTitle: resources.en.settings.search.unpinConfirmation,
    to: "/settings/general",
    searchTerms: ["ask before thread pinned section"],
  },
  {
    id: "archive-confirmation",
    title: (t) => t(($) => $.search.archiveConfirmation),
    englishTitle: resources.en.settings.search.archiveConfirmation,
    to: "/settings/general",
    searchTerms: ["ask before thread second click inline action"],
  },
  {
    id: "delete-confirmation",
    title: (t) => t(($) => $.search.deleteConfirmation),
    englishTitle: resources.en.settings.search.deleteConfirmation,
    to: "/settings/general",
    searchTerms: ["ask before thread chat history"],
  },
  {
    id: "quit-confirmation",
    title: (t) => t(($) => $.search.quitConfirmation),
    englishTitle: resources.en.settings.search.quitConfirmation,
    to: "/settings/general",
    searchTerms: ["confirmation desktop app exit direct hold double click press twice"],
    desktopOnly: true,
  },
  {
    id: "text-generation-model",
    title: (t) => t(($) => $.search.textGenerationModel),
    englishTitle: resources.en.settings.search.textGenerationModel,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["generated thread titles source control content default provider"],
  },
  {
    id: "thread-title-instructions",
    title: (t) => t(($) => $.search.threadTitleInstructions),
    englishTitle: resources.en.settings.search.threadTitleInstructions,
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["generated thread titles prompt custom style naming rename regenerate"],
  },
  {
    id: "app-version",
    title: (t) => t(($) => $.search.appVersion),
    englishTitle: resources.en.settings.search.appVersion,
    to: "/settings/about",
    searchTerms: ["about check for updates download install upgrade release"],
  },
  {
    id: "update-track",
    title: (t) => t(($) => $.search.updateTrack),
    englishTitle: resources.en.settings.search.updateTrack,
    to: "/settings/about",
    searchTerms: ["release channel stable latest nightly prerelease"],
    releaseChannelOnly: true,
  },
  {
    id: "cli-command",
    title: (t) => t(($) => $.search.cliCommand),
    englishTitle: resources.en.settings.search.cliCommand,
    to: "/settings/about",
    searchTerms: ["cli terminal shell path install command line"],
    desktopOnly: true,
  },
  {
    id: "mobile-app",
    title: (t) => t(($) => $.search.mobileApp),
    englishTitle: resources.en.settings.search.mobileApp,
    to: "/settings/about",
    searchTerms: ["phone tablet iPhone iPad iOS Android App Store Google Play QR"],
  },
  {
    id: "welcome-page",
    title: (t) => t(($) => $.search.welcomePage),
    englishTitle: resources.en.settings.search.welcomePage,
    to: "/settings/about",
    primaryEnvironmentOnly: true,
    searchTerms: ["onboarding setup first run getting started agents import projects"],
  },
  {
    id: "privacy-policy",
    title: (t) => t(($) => $.search.privacyPolicy),
    englishTitle: resources.en.settings.search.privacyPolicy,
    to: "/settings/about",
    searchTerms: ["telemetry analytics usage data tracking legal opt out"],
  },
  {
    id: "telemetry-export",
    title: (t) => t(($) => $.search.telemetryExport),
    englishTitle: resources.en.settings.search.telemetryExport,
    to: "/settings/diagnostics",
    targetId: "telemetry-export",
    scope: "environment",
    searchTerms: ["OTel OTLP telemetry export endpoints logs traces metrics Grafana"],
  },
  {
    id: "diagnostics",
    title: (t) => t(($) => $.search.diagnostics),
    englishTitle: resources.en.settings.search.diagnostics,
    to: "/settings/maintenance",
    searchTerms: ["logs traces processes resource history failures spans cpu memory"],
  },
  {
    id: "open-source-licenses",
    title: (t) => t(($) => $.search.openSourceLicenses),
    englishTitle: resources.en.settings.search.openSourceLicenses,
    to: "/settings/about",
  },
  {
    id: "keybindings",
    title: (t) => t(($) => $.search.keybindings),
    englishTitle: resources.en.settings.search.keybindings,
    to: "/settings/keybindings",
    searchTerms: ["keyboard shortcuts hotkeys commands bindings json"],
  },
  ...KEYBINDING_SEARCH_SOURCES,
  {
    id: "snap-shot-enabled",
    title: (t) => t(($) => $.search.snapShotEnabled),
    englishTitle: resources.en.settings.search.snapShotEnabled,
    searchTerms: ["window capture screenshot"],
    to: "/settings/snap-shot",
  },
  {
    id: "snap-shot-accessibility",
    title: (t) => t(($) => $.search.snapShotAccessibility),
    englishTitle: resources.en.settings.search.snapShotAccessibility,
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
    searchTerms: [
      "capture accessibility data text UI structure elements privacy omit agent context",
    ],
  },
  {
    id: "snap-shot-shortcut",
    title: (t) => t(($) => $.search.snapShotShortcut),
    englishTitle: resources.en.settings.search.snapShotShortcut,
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-sound",
    title: (t) => t(($) => $.search.snapShotSound),
    englishTitle: resources.en.settings.search.snapShotSound,
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-flash",
    title: (t) => t(($) => $.search.snapShotFlash),
    englishTitle: resources.en.settings.search.snapShotFlash,
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-animations",
    title: (t) => t(($) => $.search.snapShotAnimations),
    englishTitle: resources.en.settings.search.snapShotAnimations,
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "providers",
    title: (t) => t(($) => $.search.providers),
    englishTitle: resources.en.settings.search.providers,
    to: "/settings/providers",
    searchTerms: [
      "agents cli codex claude cursor grok fx kiro opencode antigravity google sign in sign out install subscription instances authentication api key models configuration binary path config directory codex_home shadow home endpoint arguments environment variables display name accent color custom favorite hidden auto compact native sessions import resume",
    ],
  },
  {
    id: "usage-providers",
    title: (t) => t(($) => $.search.usageProviders),
    englishTitle: resources.en.settings.search.usageProviders,
    to: "/settings/providers",
    searchTerms: [
      "usage sources CLIProxyAPI CLI proxy hub quota subscription limits management key add remove",
    ],
    providerSettingsOnly: true,
  },
  {
    id: "text-generators",
    title: (t) => t(($) => $.search.textGenerators),
    englishTitle: resources.en.settings.search.textGenerators,
    to: "/settings/providers",
    searchTerms: [
      "model api api key openai openrouter anthropic ollama lm studio custom endpoint base url thread titles commit messages",
    ],
    providerSettingsOnly: true,
    textGeneratorsOnly: true,
  },
  {
    id: "provider-health-check-interval",
    title: (t) => t(($) => $.search.providerHealthCheckInterval),
    englishTitle: resources.en.settings.search.providerHealthCheckInterval,
    to: "/settings/providers",
    searchTerms: ["refresh availability versions auth state models background probes seconds off"],
    providerSettingsOnly: true,
  },
  {
    id: "agent-browser-access",
    title: (t) => t(($) => $.search.agentBrowserAccess),
    englishTitle: resources.en.settings.search.agentBrowserAccess,
    to: "/settings/browser",
    scope: "project-defaults",
    searchTerms: ["allow disable enable open drive preview tools sessions project override"],
  },
  {
    id: "device-sources",
    title: (t) => t(($) => $.search.deviceSources),
    englishTitle: resources.en.settings.search.deviceSources,
    to: "/settings/devices",
    searchTerms: [
      "device hosts ssh remote mac mini identity key connection eas expo cloud simlock pool gateway local simulators",
    ],
  },
  {
    id: "agent-device-access",
    title: (t) => t(($) => $.search.agentDeviceAccess),
    englishTitle: resources.en.settings.search.agentDeviceAccess,
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["allow simulator emulator ios android drive tools sessions"],
  },
  {
    id: "device-hub",
    title: (t) => t(($) => $.search.deviceHub),
    englishTitle: resources.en.settings.search.deviceHub,
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["device hub simulator emulator ios android install start version"],
  },
  {
    id: "device-platform-support",
    title: (t) => t(($) => $.search.devicePlatformSupport),
    englishTitle: resources.en.settings.search.devicePlatformSupport,
    to: "/settings/devices",
    targetId: "device-sources",
    searchTerms: ["simulator support xcode android studio sdk avd runtime"],
  },
  {
    id: "browser-profiles",
    title: (t) => t(($) => $.search.browserProfiles),
    englishTitle: resources.en.settings.search.browserProfiles,
    to: "/settings/browser",
    targetId: "browser",
  },
  {
    id: "browser-default-profile",
    title: (t) => t(($) => $.search.browserDefaultProfile),
    englishTitle: resources.en.settings.search.browserDefaultProfile,
    to: "/settings/browser",
    targetId: "browser-profiles",
  },
  {
    id: "browser-default-viewport",
    title: (t) => t(($) => $.search.browserDefaultViewport),
    englishTitle: resources.en.settings.search.browserDefaultViewport,
    to: "/settings/browser",
    searchTerms: ["preview size width height device desktop mobile rotate"],
  },
  {
    id: "browser-default-zoom",
    title: (t) => t(($) => $.search.browserDefaultZoom),
    englishTitle: resources.en.settings.search.browserDefaultZoom,
    to: "/settings/browser",
    searchTerms: ["preview page scale tabs percent"],
  },
  {
    id: "browser-default-appearance",
    title: (t) => t(($) => $.search.browserDefaultAppearance),
    englishTitle: resources.en.settings.search.browserDefaultAppearance,
    to: "/settings/browser",
    searchTerms: ["preview color scheme light dark system os"],
  },
  {
    id: "browser-recording-frame-rate",
    title: (t) => t(($) => $.search.browserRecordingFrameRate),
    englishTitle: resources.en.settings.search.browserRecordingFrameRate,
    to: "/settings/browser",
  },
  {
    id: "browser-recording-key-presses",
    title: (t) => t(($) => $.search.browserRecordingKeyPresses),
    englishTitle: resources.en.settings.search.browserRecordingKeyPresses,
    to: "/settings/browser",
    searchTerms: ["browser preview keyboard shortcuts keystrokes overlay capture"],
  },
  {
    id: "browser-recording-mouse-presses",
    title: (t) => t(($) => $.search.browserRecordingMousePresses),
    englishTitle: resources.en.settings.search.browserRecordingMousePresses,
    to: "/settings/browser",
    searchTerms: ["browser preview clicks buttons drag overlay capture"],
  },
  {
    id: "browser-link-target",
    title: (t) => t(($) => $.search.browserLinkTarget),
    englishTitle: resources.en.settings.search.browserLinkTarget,
    to: "/settings/browser",
    searchTerms: ["links default browser in-app browser external open"],
  },
  {
    id: "browser-search-engine",
    title: (t) => t(($) => $.search.browserSearchEngine),
    englishTitle: resources.en.settings.search.browserSearchEngine,
    to: "/settings/browser",
    searchTerms: ["address bar duckduckgo google bing brave kagi ecosia custom url"],
  },
  {
    id: "pull-request-links-open-in-app",
    title: (t) => t(($) => $.search.pullRequestLinksOpenInApp),
    englishTitle: resources.en.settings.search.pullRequestLinksOpenInApp,
    to: "/settings/diffs",
    searchTerms: [
      `pr commit links ${SOURCE_CONTROL_HOST_LABELS} browser external click default pull request view panel`,
    ],
  },
  {
    id: "browser-auto-show-floating-preview",
    title: (t) => t(($) => $.search.browserAutoShowFloatingPreview),
    englishTitle: resources.en.settings.search.browserAutoShowFloatingPreview,
    to: "/settings/browser",
    searchTerms: ["agent opens browser device simulator pop into view hide"],
  },
  {
    id: "automatic-pull",
    title: (t) => t(($) => $.search.automaticPull),
    englishTitle: resources.en.settings.search.automaticPull,
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["auto pull default branch current checkout fast forward upstream"],
  },
  {
    id: "remove-agent-credits-on-merge",
    title: (t) => t(($) => $.search.removeAgentCreditsOnMerge),
    englishTitle: resources.en.settings.search.removeAgentCreditsOnMerge,
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: [
      `pull request ${SOURCE_CONTROL_HOST_LABELS} squash co-authored-by attribution claude codex generated`,
    ],
  },
  {
    id: "pull-request-merge-method",
    title: (t) => t(($) => $.search.pullRequestMergeMethod),
    englishTitle: resources.en.settings.search.pullRequestMergeMethod,
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request merge squash rebase last selected"],
  },
  {
    id: "source-control",
    title: (t) => t(($) => $.search.sourceControl),
    englishTitle: resources.en.settings.search.sourceControl,
    to: "/settings/source-control",
    scope: "environment-defaults",
    searchTerms: [
      `version control git ${SOURCE_CONTROL_HOST_TERMS} hosting integrations credentials scan server environment`,
    ],
  },
  {
    id: "git-fetch-interval",
    title: (t) => t(($) => $.search.gitFetchInterval),
    englishTitle: resources.en.settings.search.gitFetchInterval,
    to: "/settings/maintenance",
    targetId: "background-activity",
    searchTerms: [
      "automatic remote branch refresh background credentials security keys seconds off",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "worktree-branch-naming",
    title: (t) => t(($) => $.search.worktreeBranchNaming),
    englishTitle: resources.en.settings.search.worktreeBranchNaming,
    to: "/settings/worktrees",
    searchTerms: ["static semantic prefix custom prompt instructions feat fix refactor chore"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  ...sourceControlHostSearchSources(sourceControlClients.definitions),
  {
    id: "source-control-writing-style",
    title: (t) => t(($) => $.search.commitAndPullRequestWriting),
    englishTitle: resources.en.settings.search.commitAndPullRequestWriting,
    to: "/settings/source-control",
    searchTerms: [
      "repository conventions conventional commits custom instructions commit messages change pr pull request merge request titles descriptions body style prompt write my own",
    ],
    environmentOnly: true,
  },
  {
    id: "follow-change-request-templates",
    title: (t) => t(($) => $.search.followPullRequestTemplates),
    englishTitle: resources.en.settings.search.followPullRequestTemplates,
    to: "/settings/source-control",
    searchTerms: ["repository pr pull request merge request change request description structure"],
    environmentOnly: true,
  },
  {
    id: "source-control-writer-model",
    title: (t) => t(($) => $.search.sourceControlWriterModel),
    englishTitle: resources.en.settings.search.sourceControlWriterModel,
    to: "/settings/source-control",
    searchTerms: [
      "override generated commit change request pr titles descriptions branch bookmark",
    ],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "review-guides",
    title: (t) => t(($) => $.search.reviewGuides),
    englishTitle: resources.en.settings.search.reviewGuides,
    to: "/settings/source-control",
    searchTerms: ["pull request pr guided review guide tour beta experimental"],
    environmentOnly: true,
  },
  {
    id: "review-guide-model",
    title: (t) => t(($) => $.search.reviewGuideModel),
    englishTitle: resources.en.settings.search.reviewGuideModel,
    to: "/settings/source-control",
    // Hidden until review guides are on, so a search lands on the switch that shows it.
    targetId: "review-guides",
    searchTerms: ["pull request pr guided review guide brief maintainer"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "review-guide-instructions",
    title: (t) => t(($) => $.search.reviewGuideInstructions),
    englishTitle: resources.en.settings.search.reviewGuideInstructions,
    to: "/settings/source-control",
    targetId: "review-guides",
    searchTerms: ["pull request pr guided review guide preferences taste prompt custom"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "project-actions",
    title: (t) => t(($) => $.search.projectActions),
    englishTitle: resources.en.settings.search.projectActions,
    to: "/settings/projects",
    searchTerms: ["commands scripts setup run dev server checkout worktree t3.json import"],
  },
  {
    id: "environment-icon",
    title: (t) => t(($) => $.search.environmentIcon),
    englishTitle: resources.en.settings.search.environmentIcon,
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["machine glyph sidebar mac mini studio laptop desktop server cloud vm"],
  },
  {
    id: "local-environment",
    title: (t) => t(($) => $.search.localEnvironment),
    englishTitle: resources.en.settings.search.localEnvironment,
    to: "/settings/connections",
    searchTerms: ["turn off on disable enable local server agents remote only restart"],
    desktopOnly: true,
  },
  {
    id: "network-access",
    title: (t) => t(($) => $.search.networkAccess),
    englishTitle: resources.en.settings.search.networkAccess,
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["expose backend remote pairing local machine interfaces host restart"],
    localBackendManagementOnly: true,
  },
  {
    id: "tailscale-https",
    title: (t) => t(($) => $.search.tailscaleHttps),
    englishTitle: resources.en.settings.search.tailscaleHttps,
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["serve magicdns endpoint remote secure network"],
    desktopOnly: true,
    localBackendManagementOnly: true,
  },
  {
    id: "wsl-backend",
    title: (t) => t(($) => $.search.wslBackend),
    englishTitle: resources.en.settings.search.wslBackend,
    to: "/settings/access",
    searchTerms: [
      "windows subsystem linux distro second server projects stop windows backend restart wsl only",
    ],
    desktopOnly: true,
    windowsOnly: true,
    localBackendManagementOnly: true,
    wslAvailableOnly: true,
  },
  {
    id: "t3-connect",
    localEnvironmentOnly: true,
    title: (t) => t(($) => $.search.t3Connect),
    englishTitle: resources.en.settings.search.t3Connect,
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["managed tunnel cloud other devices remote tunnels limit t3 chat"],
    desktopOnly: true,
    cloudOnly: true,
  },
  {
    id: "hold-webhooks-while-offline",
    localEnvironmentOnly: true,
    title: (t) => t(($) => $.search.holdWebhooksWhileOffline),
    englishTitle: resources.en.settings.search.holdWebhooksWhileOffline,
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["webhook automations offline queue mailbox t3 connect"],
    cloudOnly: true,
    managedTunnelOnly: true,
  },
  {
    id: "publish-agent-activity",
    localEnvironmentOnly: true,
    title: (t) => t(($) => $.search.publishAgentActivity),
    englishTitle: resources.en.settings.search.publishAgentActivity,
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["mobile push notifications live activities cloud tunnel"],
    cloudOnly: true,
  },
  {
    id: "connections-environment",
    title: (t) => t(($) => $.search.connectionsEnvironment),
    englishTitle: resources.en.settings.search.connectionsEnvironment,
    to: "/settings/access",
    searchTerms: [
      "connections server backend local remote access administrative permissions scope pairing links qr code authorized clients sessions revoke endpoint",
    ],
  },
  {
    id: "linked-environments",
    peerLinksOnly: true,
    title: (t) => t(($) => $.search.linkedEnvironments),
    englishTitle: resources.en.settings.search.linkedEnvironments,
    to: "/settings/connections",
    targetId: "linked-environments",
    searchTerms: ["link peer another machine vps agents work there handoff pairing code"],
  },
  {
    id: "remote-environments",
    title: (t) => t(($) => $.search.remoteEnvironments),
    englishTitle: resources.en.settings.search.remoteEnvironments,
    to: "/settings/connections",
    searchTerms: ["add pair backend host code ssh config agent tunnel saved t3 connect"],
  },
  {
    id: "load-balancing",
    title: (t) => t(($) => $.search.loadBalancing),
    englishTitle: resources.en.settings.search.loadBalancing,
    to: "/settings/connections",
    searchTerms: [
      "automatic machine environment resources cpu memory capacity preference weight shared projects",
    ],
  },
  {
    id: "pull-request-routing",
    title: (t) => t(($) => $.search.pullRequestRouting),
    englishTitle: resources.en.settings.search.pullRequestRouting,
    to: "/settings/connections",
    searchTerms: [
      `pull request routing trusted environments shared credentials permissions read actions source control ${SOURCE_CONTROL_HOST_LABELS}`,
    ],
  },
  {
    id: "secret-providers",
    title: (t) => t(($) => $.search.secretProviders),
    englishTitle: resources.en.settings.search.secretProviders,
    to: "/settings/secrets",
    searchTerms: ["1password vault credentials api key"],
    secretsFeatureOnly: true,
  },
  {
    id: "secret-providers-add",
    title: (t) => t(($) => $.search.secretProvidersAdd),
    englishTitle: resources.en.settings.search.secretProvidersAdd,
    to: "/settings/secrets",
    targetId: "secret-providers",
    searchTerms: ["new 1password vault op cli account"],
    secretsFeatureOnly: true,
  },
  {
    id: "archive",
    title: (t) => t(($) => $.search.archive),
    englishTitle: resources.en.settings.search.archive,
    to: "/settings/archived",
    searchTerms: ["restore reopen deleted history projects"],
  },
] as const satisfies ReadonlyArray<SettingsSearchSource>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = new Map(SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item] as const));

const SETTINGS_CATEGORY_SCOPES: Readonly<Record<SettingsPath, SettingsSearchScope | null>> = {
  "/settings/diagnostics": "environment",
  "/settings/projects": "project",
  "/settings/general": null,
  "/settings/voice": null,
  "/settings/appearance": null,
  "/settings/chat": null,
  "/settings/diffs": null,
  "/settings/snap-shot": null,
  "/settings/keybindings": null,
  "/settings/providers": null,
  "/settings/threads": null,
  "/settings/browser": null,
  "/settings/devices": null,
  "/settings/source-control": "environment-defaults",
  "/settings/worktrees": "project-defaults",
  "/settings/connections": "connections",
  "/settings/access": "connections",
  "/settings/secrets": null,
  "/settings/scheduled-tasks": null,
  "/settings/maintenance": null,
  "/settings/labs": null,
  "/settings/about": null,
  "/settings/archived": "project-defaults",
};

const RENAMED_SETTINGS_PATHS: Readonly<Record<string, SettingsPath>> = {
  "/settings/integrations": "/settings/browser",
  "/settings/storage": "/settings/maintenance",
  "/settings/beta": "/settings/labs",
};
const SPLIT_SETTINGS_PATHS: ReadonlySet<string> = new Set([
  "/settings/general",
  "/settings/appearance",
  "/settings/source-control",
  "/settings/connections",
  ...Object.keys(RENAMED_SETTINGS_PATHS),
]);
// Section anchors that moved but are not search results themselves.
const MOVED_SECTION_ANCHORS: Readonly<Record<string, SettingsPath>> = {
  "authorized-clients": "/settings/access",
  "text-generation": "/settings/threads",
  about: "/settings/about",
};

/** Where an old settings link now lives. Its anchor finds the page its row moved to. */
export function movedSettingsPath(pathname: string, hash: string): SettingsPath | null {
  if (!SPLIT_SETTINGS_PATHS.has(pathname)) return null;
  const items: readonly SettingsSearchSource[] = SETTINGS_SEARCH_ITEMS;
  const anchored = hash
    ? (items.find((item) => item.id === hash) ?? items.find((item) => item.targetId === hash))
    : undefined;
  const to =
    anchored?.to ?? MOVED_SECTION_ANCHORS[hash] ?? RENAMED_SETTINGS_PATHS[pathname] ?? null;
  return to === pathname ? null : to;
}

export function getSettingsSearchTargetScope(targetId: string, t: SettingsTranslation) {
  const items: readonly SettingsSearchSource[] = SETTINGS_SEARCH_ITEMS;
  const item =
    items.find((candidate) => candidate.id === targetId) ??
    items.find((candidate) => candidate.targetId === targetId);
  return item
    ? {
        title: item.title(t),
        scope: item.scope ?? SETTINGS_CATEGORY_SCOPES[item.to],
        ...(item.requiresThreadAutoSettlement ? { requiresThreadAutoSettlement: true } : {}),
      }
    : null;
}

interface AutoSettlementSearchEnvironment {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: EnvironmentConnectionPhase };
  readonly serverConfig: object | null;
}

export function getThreadAutoSettlementSearchAvailability(
  environments: readonly AutoSettlementSearchEnvironment[],
  scope?: Pick<ResolvedSettingsScope, "kind" | "environmentIds">,
) {
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const eligibleEnvironmentIds = connected.map((environment) => environment.environmentId);
  const selected = connected.filter((environment) =>
    scope?.environmentIds.includes(environment.environmentId),
  );
  return {
    eligibleEnvironmentIds,
    isTargetAvailable:
      scope !== undefined &&
      scope.kind !== "unavailable" &&
      selected.length > 0 &&
      selected.every((environment) => eligibleEnvironmentIds.includes(environment.environmentId)),
  };
}

export function isSettingsSearchScopeAvailable(
  requiredScope: SettingsSearchScope | null,
  scopeKind: ResolvedSettingsScope["kind"],
): boolean {
  switch (requiredScope) {
    case null:
    case "connections":
      return true;
    case "environment":
    case "checkout":
      return requiredScope === scopeKind;
    case "project":
      return scopeKind === "project" || scopeKind === "checkout";
    case "environment-defaults":
      return scopeKind === "environment" || scopeKind === "all";
    case "project-defaults":
      return (
        scopeKind === "environment" ||
        scopeKind === "all" ||
        scopeKind === "project" ||
        scopeKind === "checkout"
      );
  }
}

export function searchableSetting(
  id: SettingsSearchItemId,
  t: SettingsTranslation,
): {
  readonly id: string;
  readonly title: string;
} {
  const item = SEARCH_ITEMS_BY_ID.get(id);
  if (!item) throw new Error(`Unknown setting: ${id}`);
  return { id: item.id, title: item.title(t) };
}

export function filterAvailableSettingsSearchItems(
  availability: SettingsSearchAvailability,
  t: SettingsTranslation,
): ReadonlyArray<SettingsSearchItem> {
  const items = settingsSearchItems(t);
  return items.filter(
    (item) =>
      (!item.cloudOnly || availability.hasCloudPublicConfig) &&
      (!item.environmentOnly || availability.hasEnvironment) &&
      (!item.providerSettingsOnly || availability.hasProviderSettingsEnvironment) &&
      (!item.localBackendManagementOnly || availability.canManageLocalBackend) &&
      (!item.localEnvironmentOnly || !availability.localEnvironmentDisabled) &&
      (!item.primaryEnvironmentOnly || availability.hasPrimaryEnvironment === true) &&
      (!item.wslAvailableOnly || availability.isWslSettingsRowVisible) &&
      (!item.requiresThreadAutoSettlement || availability.hasThreadAutoSettlement) &&
      (!item.managedTunnelOnly || availability.managedTunnelActive === true) &&
      (!item.peerLinksOnly || availability.hasPeerLinkHost === true) &&
      (!item.fastWorktreeCheckoutOnly ||
        availability.hasFastWorktreeCheckoutEnvironment === true) &&
      (!item.textGeneratorsOnly || availability.hasTextGeneratorsEnvironment === true),
  );
}

/** The settings that exist on this platform and app channel. */
export function settingsForThisPlatform(
  items: ReadonlyArray<SettingsSearchItem>,
): ReadonlyArray<SettingsSearchItem> {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return items.filter(
    (item) =>
      (isElectron || item.desktopOnly !== true) &&
      (!item.releaseChannelOnly || isElectron || HOSTED_APP_CHANNEL !== null) &&
      (!item.secretsFeatureOnly || isSecretsFeatureEnabled) &&
      (!item.macOnly || isMacPlatform(platform)) &&
      (!item.windowsOnly || isWindowsPlatform(platform)),
  );
}

export function settingsSearchItems(t: SettingsTranslation): ReadonlyArray<SettingsSearchItem> {
  return SETTINGS_SEARCH_ITEMS.map((item) => {
    const source: SettingsSearchSource = item;
    return {
      ...source,
      title: source.title(t),
      searchTerms: [
        ...(source.searchTerms ?? []),
        ...(source.englishTitle ? [source.englishTitle] : []),
      ],
    };
  });
}

export function sourceControlHostSearchItems(
  definitions: ReadonlyArray<SourceControlDefinition>,
  t: SettingsTranslation,
): ReadonlyArray<SettingsSearchItem> {
  return sourceControlHostSearchSources(definitions).map((item) => ({
    ...item,
    title: item.title(t),
  }));
}

export function searchSettings(
  query: string,
  t: SettingsTranslation,
  items: ReadonlyArray<SettingsSearchItem> = settingsSearchItems(t),
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const queryTokens = normalizedQuery.split(" ");
  const sectionLabels = settingsSectionLabels(t);

  return settingsForThisPlatform(items)
    .flatMap((item, index) => {
      const title = normalizeSearchText(item.title);
      const fields = [
        title,
        normalizeSearchText(sectionLabels[item.to]),
        normalizeSearchText(englishSectionLabels[item.to]),
        ...(item.searchTerms ?? []).map(normalizeSearchText),
      ];
      if (!queryTokens.every((token) => fields.some((field) => field.includes(token)))) return [];

      const exactPhraseField = fields.findIndex((field) => field.includes(normalizedQuery));
      const rank =
        title === normalizedQuery
          ? 5
          : title.startsWith(normalizedQuery)
            ? 4
            : title.includes(normalizedQuery)
              ? 3
              : queryTokens.every((token) => title.includes(token))
                ? 2
                : exactPhraseField >= 0
                  ? 1
                  : 0;
      return [{ item, index, rank }];
    })
    .toSorted(
      (left, right) =>
        Number(left.item.secondary ?? false) - Number(right.item.secondary ?? false) ||
        right.rank - left.rank ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

// These rows only exist with separate fonts on, so a search jump to one turns them on.
const ADVANCED_TYPOGRAPHY_TARGET_IDS: ReadonlySet<string> = new Set([
  "prompt-font",
  "terminal-font",
]);

export function isAdvancedTypographyTarget(targetId: string): boolean {
  return ADVANCED_TYPOGRAPHY_TARGET_IDS.has(targetId);
}

/**
 * Opens the persisted section a search result lives in before jumping to it, so
 * its row is mounted to scroll to. The terminal reads the same flag, so it must
 * stay on after the jump.
 */
export function revealSettingsSearchTarget(targetId: string): void {
  if (isAdvancedTypographyTarget(targetId)) {
    writeLocalStorageValue(TYPOGRAPHY_ADVANCED_STORAGE_KEY, true, false, Schema.Boolean);
  }
}
