import type { SettingsTranslation } from "~/components/settings/settingsSearch";
import {
  STATIC_KEYBINDING_COMMANDS,
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingRule,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  DEFAULT_RESOLVED_KEYBINDINGS,
  parseKeybindingShortcut,
  parseKeybindingWhenExpression,
  US_SHIFTED_TO_UNSHIFTED_KEYS,
} from "@t3tools/shared/keybindings";

import { shortcutConflictKey, shortcutKeyFromEvent } from "../../keybindings";
import { isMacPlatform } from "../../lib/utils";
import { METRIC_OPTIONS, WINDOW_OPTIONS } from "../usage/usageShortcuts";

// Rank every usage command; mixing rank and alphabetical comparisons makes order input-dependent.
const usageCommandOrder = new Map<KeybindingCommand, number>(
  [
    "usage.open" as const,
    ...[...METRIC_OPTIONS, ...WINDOW_OPTIONS].map((option) => option.command),
  ].map((command, index) => [command, index]),
);

const firstUsageCommand = METRIC_OPTIONS[0].command;

function compareCommands(
  left: KeybindingCommand,
  right: KeybindingCommand,
  key: (command: KeybindingCommand) => string,
): number {
  const leftRank = usageCommandOrder.get(left);
  const rightRank = usageCommandOrder.get(right);
  if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
  return key(leftRank === undefined ? left : firstUsageCommand).localeCompare(
    key(rightRank === undefined ? right : firstUsageCommand),
  );
}

export type KeybindingSource = "Default" | "Custom" | "Project";

export interface KeybindingRow {
  readonly id: string;
  readonly command: KeybindingCommand;
  readonly key: string;
  readonly when: string;
  readonly source: KeybindingSource;
  readonly defaultKey: string | null;
  readonly defaultWhen: string;
  readonly binding: ResolvedKeybindingRule;
  readonly conflicts: ReadonlyArray<string>;
}

export type WhenVariableOption = string;
export type KeybindingCommandOption = KeybindingCommand;

const CORE_WHEN_VARIABLES = [
  "terminalFocus",
  "terminalOpen",
  "previewOpen",
  "isWeb",
  "isDesktop",
  "true",
  "false",
] as const;

const DEFAULT_WHEN_VARIABLES = new Set<string>(CORE_WHEN_VARIABLES);
for (const binding of DEFAULT_RESOLVED_KEYBINDINGS) {
  collectWhenIdentifiersFromNode(binding.whenAst, DEFAULT_WHEN_VARIABLES);
}

export const DEFAULT_WHEN_VARIABLE =
  [...DEFAULT_WHEN_VARIABLES].find(
    (identifier) => identifier !== "true" && identifier !== "false",
  ) ?? "terminalFocus";
const KNOWN_WHEN_VARIABLES = new Set(DEFAULT_WHEN_VARIABLES);

export function shortcutToKeybindingInput(shortcut: KeybindingShortcut): string {
  const parts: string[] = [];
  if (shortcut.modKey) parts.push("mod");
  if (shortcut.metaKey) parts.push("meta");
  if (shortcut.ctrlKey) parts.push("ctrl");
  if (shortcut.altKey) parts.push("alt");
  if (shortcut.shiftKey) parts.push("shift");
  parts.push(shortcut.key === " " ? "space" : shortcut.key === "escape" ? "esc" : shortcut.key);
  return parts.join("+");
}

export function whenAstToExpression(node: KeybindingWhenNode | undefined): string {
  if (!node) return "";
  switch (node.type) {
    case "identifier":
      return node.name;
    case "not":
      return `!${wrapWhenExpression(node.node)}`;
    case "and":
      return `${wrapWhenExpression(node.left)} && ${wrapWhenExpression(node.right)}`;
    case "or":
      return `${wrapWhenExpression(node.left)} || ${wrapWhenExpression(node.right)}`;
  }
}

export function whenNodeRemoveLabel(
  node: KeybindingWhenNode,
  depth: number,
  t: SettingsTranslation,
): string {
  if (depth === 0) return t(($) => $.extra.keybindings.clearConditions);
  if (node.type === "identifier" || (node.type === "not" && node.node.type === "identifier")) {
    return t(($) => $.extra.keybindings.removeCondition);
  }
  return t(($) => $.extra.keybindings.removeGroup);
}

function wrapWhenExpression(node: KeybindingWhenNode): string {
  if (node.type === "identifier" || node.type === "not") return whenAstToExpression(node);
  return `(${whenAstToExpression(node)})`;
}

export function parseWhenExpressionDraft(
  expression: string,
  t: SettingsTranslation,
): { ok: true; value: KeybindingWhenNode | undefined } | { ok: false; message: string } {
  const trimmed = expression.trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };

  const ast = parseKeybindingWhenExpression(trimmed);
  if (!ast) {
    return {
      ok: false,
      message: t(($) => $.extra.keybindings.syntax),
    };
  }

  return { ok: true, value: ast };
}

function sourceForBinding(binding: ResolvedKeybindingRule): KeybindingSource {
  if (String(binding.command).startsWith("script.")) {
    return "Project";
  }

  const bindingKey = shortcutToKeybindingInput(binding.shortcut);
  const bindingWhen = whenAstToExpression(binding.whenAst);
  const isDefault = DEFAULT_RESOLVED_KEYBINDINGS.some(
    (entry) =>
      entry.command === binding.command &&
      shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
      whenAstToExpression(entry.whenAst) === bindingWhen,
  );

  return isDefault ? "Default" : "Custom";
}

function defaultBindingForBinding(
  binding: ResolvedKeybindingRule,
): ResolvedKeybindingRule | undefined {
  const bindingKey = shortcutToKeybindingInput(binding.shortcut);
  const bindingWhen = whenAstToExpression(binding.whenAst);

  return (
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command &&
        shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
        whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command && whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find((entry) => entry.command === binding.command)
  );
}

function keybindingRowId(command: KeybindingCommand, key: string, when: string): string {
  return `${command}\u0000${key}\u0000${when}`;
}

function conflictsWithWhen(leftWhen: string, rightWhen: string): boolean {
  return leftWhen.length === 0 || rightWhen.length === 0 || leftWhen === rightWhen;
}

export function keybindingConflictLabels(
  rows: ReadonlyArray<KeybindingRow>,
  input: { readonly rowId: string; readonly key: string; readonly when: string },
  t: SettingsTranslation,
  platform = navigator.platform,
): ReadonlyArray<string> {
  if (input.key.trim().length === 0) return [];
  const shortcut = parseKeybindingShortcut(input.key);
  if (!shortcut) return [];
  // Compare resolved chords so mod+k and ctrl+k collide where mod is Ctrl.
  const conflictKey = shortcutConflictKey(shortcut, platform);
  const conflicts: Array<string> = [];
  for (const candidate of rows) {
    if (
      candidate.id !== input.rowId &&
      shortcutConflictKey(candidate.binding.shortcut, platform) === conflictKey &&
      conflictsWithWhen(candidate.when, input.when)
    ) {
      conflicts.push(commandLabel(candidate.command, t));
    }
  }
  return [...new Set(conflicts)].toSorted();
}

export interface KeybindingGroup {
  readonly id: string;
  readonly title: string;
  readonly rows: ReadonlyArray<KeybindingRow>;
}

const KEYBINDING_GROUPS = [
  {
    id: "navigation",
    title: "Navigation",
    prefixes: ["sidebar", "rightPanel", "commandPalette", "filePicker", "projectSearch", "editor"],
  },
  { id: "threads", title: "Threads", prefixes: ["thread", "chat", "pullRequest"] },
  { id: "composer", title: "Composer", prefixes: ["composer", "modelPicker"] },
  { id: "terminal", title: "Terminal", prefixes: ["terminal"] },
  { id: "preview", title: "Preview & diff", prefixes: ["preview", "diff"] },
  { id: "appearance", title: "Appearance", prefixes: ["theme", "appearance", "themeEditor"] },
  { id: "scripts", title: "Project scripts", prefixes: ["script"] },
] as const;
const OTHER_KEYBINDING_GROUP = { id: "other", title: "Other" } as const;

function keybindingGroupFor(command: KeybindingCommand): { id: string; title: string } {
  const prefix = String(command).split(".")[0] ?? "";
  return (
    KEYBINDING_GROUPS.find((group) => (group.prefixes as ReadonlyArray<string>).includes(prefix)) ??
    OTHER_KEYBINDING_GROUP
  );
}

export function groupKeybindingRows(
  rows: ReadonlyArray<KeybindingRow>,
  t: SettingsTranslation,
): ReadonlyArray<KeybindingGroup> {
  const rowsByGroup = new Map<string, Array<KeybindingRow>>();
  for (const row of rows) {
    const group = keybindingGroupFor(row.command);
    const bucket = rowsByGroup.get(group.id);
    if (bucket) bucket.push(row);
    else rowsByGroup.set(group.id, [row]);
  }
  return [...KEYBINDING_GROUPS, OTHER_KEYBINDING_GROUP].flatMap((group) => {
    const groupRows = rowsByGroup.get(group.id);
    return groupRows
      ? [{ id: group.id, title: t(($) => $.extra.keybindingGroups[group.id]), rows: groupRows }]
      : [];
  });
}

export function buildKeybindingRows(
  keybindings: ResolvedKeybindingsConfig,
  t: SettingsTranslation,
  platform = navigator.platform,
): ReadonlyArray<KeybindingRow> {
  const rowsById = new Map<string, KeybindingRow>();
  for (const binding of keybindings) {
    const defaultBinding = defaultBindingForBinding(binding);
    const key = shortcutToKeybindingInput(binding.shortcut);
    const when = whenAstToExpression(binding.whenAst);
    const id = keybindingRowId(binding.command, key, when);
    rowsById.set(id, {
      id,
      command: binding.command,
      key,
      when,
      source: sourceForBinding(binding),
      defaultKey: defaultBinding ? shortcutToKeybindingInput(defaultBinding.shortcut) : null,
      defaultWhen: whenAstToExpression(defaultBinding?.whenAst),
      binding,
      conflicts: [],
    });
  }
  const rows = [...rowsById.values()];

  const rowsWithConflicts = rows.map((row) => {
    const conflicts = keybindingConflictLabels(
      rows,
      {
        rowId: row.id,
        key: row.key,
        when: row.when,
      },
      t,
      platform,
    );
    return conflicts.length > 0
      ? Object.assign({}, row, { conflicts: [...new Set(conflicts)].toSorted() })
      : row;
  });

  rowsWithConflicts.sort((left, right) => {
    const commandCompare = compareCommands(left.command, right.command, (command) => command);
    if (commandCompare !== 0) return commandCompare;
    return left.key.localeCompare(right.key);
  });

  return rowsWithConflicts;
}

export function filterKeybindingRows(
  rows: ReadonlyArray<KeybindingRow>,
  query: string,
  t: SettingsTranslation,
): ReadonlyArray<KeybindingRow> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return rows;
  return rows.filter((row) => {
    return (
      row.command.toLowerCase().includes(normalizedQuery) ||
      commandLabel(row.command, t).toLowerCase().includes(normalizedQuery) ||
      row.key.toLowerCase().includes(normalizedQuery) ||
      row.when.toLowerCase().includes(normalizedQuery) ||
      row.source.toLowerCase().includes(normalizedQuery)
    );
  });
}

function collectWhenIdentifiersFromNode(
  node: KeybindingWhenNode | undefined,
  identifiers: Set<string>,
): void {
  if (!node) return;
  switch (node.type) {
    case "identifier":
      identifiers.add(node.name);
      return;
    case "not":
      collectWhenIdentifiersFromNode(node.node, identifiers);
      return;
    case "and":
    case "or":
      collectWhenIdentifiersFromNode(node.left, identifiers);
      collectWhenIdentifiersFromNode(node.right, identifiers);
      return;
  }
}

export function isKnownWhenVariable(identifier: string): boolean {
  return KNOWN_WHEN_VARIABLES.has(identifier);
}

export function unknownWhenVariables(node: KeybindingWhenNode | undefined): ReadonlyArray<string> {
  const identifiers = new Set<string>();
  collectWhenIdentifiersFromNode(node, identifiers);
  return [...identifiers].filter((identifier) => !isKnownWhenVariable(identifier)).toSorted();
}

export function buildWhenVariableOptions(): ReadonlyArray<WhenVariableOption> {
  return [...KNOWN_WHEN_VARIABLES].toSorted((left, right) => {
    const leftCoreIndex = CORE_WHEN_VARIABLES.indexOf(left as (typeof CORE_WHEN_VARIABLES)[number]);
    const rightCoreIndex = CORE_WHEN_VARIABLES.indexOf(
      right as (typeof CORE_WHEN_VARIABLES)[number],
    );
    if (leftCoreIndex !== -1 || rightCoreIndex !== -1) {
      return (
        (leftCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : leftCoreIndex) -
        (rightCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : rightCoreIndex)
      );
    }
    return left.localeCompare(right);
  });
}

export function buildKeybindingCommandOptions(
  keybindings: ResolvedKeybindingsConfig,
  t: SettingsTranslation,
): ReadonlyArray<KeybindingCommandOption> {
  const commands = new Set<KeybindingCommand>(STATIC_KEYBINDING_COMMANDS);
  for (const binding of keybindings) {
    commands.add(binding.command);
  }
  return [...commands].toSorted((left, right) =>
    compareCommands(left, right, (command) => commandLabel(command, t)),
  );
}

const commandLabels = {
  "thread.jump.1": (t) => t(($) => $.commands.threadJump1),
  "thread.jump.2": (t) => t(($) => $.commands.threadJump2),
  "thread.jump.3": (t) => t(($) => $.commands.threadJump3),
  "thread.jump.4": (t) => t(($) => $.commands.threadJump4),
  "thread.jump.5": (t) => t(($) => $.commands.threadJump5),
  "thread.jump.6": (t) => t(($) => $.commands.threadJump6),
  "thread.jump.7": (t) => t(($) => $.commands.threadJump7),
  "thread.jump.8": (t) => t(($) => $.commands.threadJump8),
  "thread.jump.9": (t) => t(($) => $.commands.threadJump9),
  "modelPicker.jump.1": (t) => t(($) => $.commands.modelPickerJump1),
  "modelPicker.jump.2": (t) => t(($) => $.commands.modelPickerJump2),
  "modelPicker.jump.3": (t) => t(($) => $.commands.modelPickerJump3),
  "modelPicker.jump.4": (t) => t(($) => $.commands.modelPickerJump4),
  "modelPicker.jump.5": (t) => t(($) => $.commands.modelPickerJump5),
  "modelPicker.jump.6": (t) => t(($) => $.commands.modelPickerJump6),
  "modelPicker.jump.7": (t) => t(($) => $.commands.modelPickerJump7),
  "modelPicker.jump.8": (t) => t(($) => $.commands.modelPickerJump8),
  "modelPicker.jump.9": (t) => t(($) => $.commands.modelPickerJump9),
  "thread.stop": (t) => t(($) => $.commands.threadStop),
  "thread.steerQueuedMessage": (t) => t(($) => $.commands.threadSteerQueuedMessage),
  "thread.editQueuedMessage": (t) => t(($) => $.commands.threadEditQueuedMessage),
  "thread.previous": (t) => t(($) => $.commands.threadPrevious),
  "thread.next": (t) => t(($) => $.commands.threadNext),
  "thread.copyReference": (t) => t(($) => $.commands.threadCopyReference),
  "thread.settle": (t) => t(($) => $.commands.threadSettle),
  "thread.pin": (t) => t(($) => $.commands.threadPin),
  "thread.undo": (t) => t(($) => $.commands.threadUndo),
  "thread.regenerateTitle": (t) => t(($) => $.commands.threadRegenerateTitle),
  "modelPicker.toggle": (t) => t(($) => $.commands.modelPickerToggle),
  "modelPicker.previousProvider": (t) => t(($) => $.commands.modelPickerPreviousProvider),
  "modelPicker.nextProvider": (t) => t(($) => $.commands.modelPickerNextProvider),
  "workspace.focusNext": (t) => t(($) => $.commands.workspaceFocusNext),
  "workspace.focusPrevious": (t) => t(($) => $.commands.workspaceFocusPrevious),
  "sidebar.toggle": (t) => t(($) => $.commands.sidebarToggle),
  "navigation.back": (t) => t(($) => $.commands.navigationBack),
  "navigation.forward": (t) => t(($) => $.commands.navigationForward),
  "terminal.toggle": (t) => t(($) => $.commands.terminalToggle),
  "terminal.split": (t) => t(($) => $.commands.terminalSplit),
  "terminal.splitVertical": (t) => t(($) => $.commands.terminalSplitVertical),
  "terminal.new": (t) => t(($) => $.commands.terminalNew),
  "terminal.close": (t) => t(($) => $.commands.terminalClose),
  "rightPanel.toggle": (t) => t(($) => $.commands.rightPanelToggle),
  "rightPanel.new": (t) => t(($) => $.commands.rightPanelNew),
  "threadPanel.toggle": (t) => t(($) => $.commands.threadPanelToggle),
  "rightPanel.toggleMaximized": (t) => t(($) => $.commands.rightPanelToggleMaximized),
  "rightPanel.close": (t) => t(($) => $.commands.rightPanelClose),
  "view.reopenClosed": (t) => t(($) => $.commands.viewReopenClosed),
  "pullRequest.copyNumber": (t) => t(($) => $.commands.pullRequestCopyNumber),
  "diff.toggle": (t) => t(($) => $.commands.diffToggle),
  "preview.toggle": (t) => t(($) => $.commands.previewToggle),
  "preview.refresh": (t) => t(($) => $.commands.previewRefresh),
  "preview.focusUrl": (t) => t(($) => $.commands.previewFocusUrl),
  "preview.find": (t) => t(($) => $.commands.previewFind),
  "preview.zoomIn": (t) => t(($) => $.commands.previewZoomIn),
  "preview.zoomOut": (t) => t(($) => $.commands.previewZoomOut),
  "preview.resetZoom": (t) => t(($) => $.commands.previewResetZoom),
  "commandPalette.toggle": (t) => t(($) => $.commands.commandPaletteToggle),
  "filePicker.toggle": (t) => t(($) => $.commands.filePickerToggle),
  "projectSearch.toggle": (t) => t(($) => $.commands.projectSearchToggle),
  "usage.open": (t) => t(($) => $.commands.usageOpen),
  "theme.select": (t) => t(($) => $.commands.themeSelect),
  "appearance.cycle": (t) => t(($) => $.commands.appearanceCycle),
  "themeEditor.toggle": (t) => t(($) => $.commands.themeEditorToggle),
  "composer.stash": (t) => t(($) => $.commands.composerStash),
  "composer.sendAlternate": (t) => t(($) => $.commands.composerSendAlternate),
  "composer.sendBackground": (t) => t(($) => $.commands.composerSendBackground),
  "composer.sendAndNewThread": (t) => t(($) => $.commands.composerSendAndNewThread),
  "composer.dictation": (t) => t(($) => $.commands.composerDictation),
  "composer.host": (t) => t(($) => $.commands.composerHost),
  "composer.cycleHost": (t) => t(($) => $.commands.composerCycleHost),
  "composer.effort": (t) => t(($) => $.commands.composerEffort),
  "composer.increaseEffort": (t) => t(($) => $.commands.composerIncreaseEffort),
  "composer.decreaseEffort": (t) => t(($) => $.commands.composerDecreaseEffort),
  "composer.mode": (t) => t(($) => $.commands.composerMode),
  "composer.workspace": (t) => t(($) => $.commands.composerWorkspace),
  "composer.previousWorktree": (t) => t(($) => $.commands.composerPreviousWorktree),
  "composer.branch": (t) => t(($) => $.commands.composerBranch),
  "chat.new": (t) => t(($) => $.commands.chatNew),
  "chat.newLocal": (t) => t(($) => $.commands.chatNewLocal),
  "chat.newWithoutProject": (t) => t(($) => $.commands.chatNewWithoutProject),
  "chat.find": (t) => t(($) => $.commands.chatFind),
  "editor.openFavorite": (t) => t(($) => $.commands.editorOpenFavorite),
  "usage.cost": (t) => t(($) => $.commands.usageCost),
  "usage.tokens": (t) => t(($) => $.commands.usageTokens),
  "usage.limits": (t) => t(($) => $.commands.usageLimits),
  "usage.period.day": (t) => t(($) => $.commands.usagePeriodDay),
  "usage.period.week": (t) => t(($) => $.commands.usagePeriodWeek),
  "usage.period.month": (t) => t(($) => $.commands.usagePeriodMonth),
  "usage.period.quarter": (t) => t(($) => $.commands.usagePeriodQuarter),
} satisfies Record<(typeof STATIC_KEYBINDING_COMMANDS)[number], (t: SettingsTranslation) => string>;

export function commandLabel(command: KeybindingCommand, t: SettingsTranslation): string {
  const known = STATIC_KEYBINDING_COMMANDS.find((candidate) => candidate === command);
  if (known) return commandLabels[known](t);
  const raw = String(command);
  if (!raw.startsWith("script.") || !raw.endsWith(".run"))
    throw new Error(`Unknown keybinding command: ${raw}`);
  return t(($) => $.commands.runScript, {
    script: titleCaseCommandSegment(raw.slice("script.".length, -".run".length)),
  });
}

function titleCaseCommandSegment(segment: string): string {
  const words: Array<string> = [];
  for (const part of segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[-_\s]+/)) {
    if (part.length > 0) {
      words.push(part.slice(0, 1).toUpperCase() + part.slice(1));
    }
  }
  return words.join(" ");
}

function recordedLayoutShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "altKey">,
): string {
  const physicalKey = shortcutKeyFromEvent(event);
  const layoutKey = event.key.toLowerCase();
  if (event.altKey || layoutKey.length !== 1) return physicalKey;
  // Normalize only US shifted glyphs at their US position. Other layouts can
  // produce the same glyph without Shift or at a different position.
  const unshiftedKey = event.shiftKey ? US_SHIFTED_TO_UNSHIFTED_KEYS.get(layoutKey) : undefined;
  return unshiftedKey === physicalKey ? physicalKey : layoutKey;
}

function normalizeShortcutKeyToken(key: string): string | null {
  const normalized = key.toLowerCase();
  if (
    normalized === "meta" ||
    normalized === "control" ||
    normalized === "ctrl" ||
    normalized === "shift" ||
    normalized === "alt" ||
    normalized === "option"
  ) {
    return null;
  }
  if (normalized === " ") return "space";
  if (normalized === "escape") return "esc";
  if (normalized === "arrowup") return "arrowup";
  if (normalized === "arrowdown") return "arrowdown";
  if (normalized === "arrowleft") return "arrowleft";
  if (normalized === "arrowright") return "arrowright";
  if (normalized.length === 1) return normalized;
  if (/^f\d{1,2}$/.test(normalized)) return normalized;
  if (normalized === "enter" || normalized === "tab" || normalized === "backspace") {
    return normalized;
  }
  if (normalized === "delete" || normalized === "home" || normalized === "end") {
    return normalized;
  }
  if (normalized === "pageup" || normalized === "pagedown") return normalized;
  return null;
}

export function keybindingFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: string,
  options?: {
    readonly layoutCharacter?: boolean;
  },
): string | null {
  const keyToken = normalizeShortcutKeyToken(
    options?.layoutCharacter ? recordedLayoutShortcutKey(event) : shortcutKeyFromEvent(event),
  );
  if (!keyToken) return null;

  const parts: string[] = [];
  if (isMacPlatform(platform)) {
    if (event.metaKey) parts.push("mod");
    if (event.ctrlKey) parts.push("ctrl");
  } else {
    if (event.ctrlKey) parts.push("mod");
    if (event.metaKey) parts.push("meta");
  }
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(keyToken);
  return parts.join("+");
}
