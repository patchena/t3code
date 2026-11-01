import type { SettingsTranslation } from "~/components/settings/settingsSearch";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_SERVER_SETTINGS,
  PROJECT_FILE_BACKED_SETTINGS,
  type ProjectFileBackedSettingKey,
  resolveEnvironmentMachineKind,
  type ServerSettings,
} from "@t3tools/contracts";
import { CheckIcon, ChevronRightIcon, LayersIcon } from "lucide-react";
import * as Equal from "effect/Equal";

import { cn } from "~/lib/utils";
import type { EnvironmentPresentation } from "~/state/environments";
import { EnvironmentMachineIcon } from "~/components/EnvironmentMachineIcon";
import { Button, InlineButton } from "~/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useOptionalSettingsScope } from "~/components/settings/SettingsScopeContext";
import type {
  ProjectOverrideEntry,
  ScopedSettingsTarget,
} from "~/components/settings/scopedSettings";
import { isProjectScopedSettingKey } from "~/components/settings/scopedSettings";
import { settingsScopeEnvironmentLabels } from "~/components/settings/settingsScopeAxis";

interface InheritanceLayer {
  readonly key: "project" | "environment" | "t3.json" | "built-in";
  readonly label: string;
  readonly value: string;
  readonly effective: boolean;
  readonly set: boolean;
}

function WRITING_STYLE_LABELS(t: SettingsTranslation): Record<string, string> {
  return {
    repo_conventions: t(($) => $.inheritance.repositoryConventions),
    conventional_commits: t(($) => $.inheritance.conventionalCommits),
    custom: t(($) => $.inheritance.customInstructions),
  };
}

function BACKGROUND_ACTIVITY_PROFILE_LABELS(t: SettingsTranslation): Record<string, string> {
  return {
    balanced: t(($) => $.inheritance.balanced),
    performance: t(($) => $.inheritance.performance),
    "battery-saver": t(($) => $.inheritance.batterySaver),
    custom: t(($) => $.inheritance.advanced),
  };
}

function formatValue(key: keyof ServerSettings, value: unknown, t: SettingsTranslation): string {
  if (value === null || value === undefined) {
    return key === "pullRequestMergeMethod"
      ? t(($) => $.inheritance.lastSelected)
      : key === "sidebarAutoSettleAfterDays"
        ? t(($) => $.inheritance.never)
        : key === "defaultModelSelection"
          ? t(($) => $.inheritance.automatic)
          : key === "sourceControlWriterModelSelection"
            ? t(($) => $.inheritance.textGenerationModel)
            : key === "reviewGuideModelSelection"
              ? t(($) => $.inheritance.sourceControlWriterModel)
              : key === "defaultThreadEnvMode" || key === "worktreeSubmodules"
                ? t(($) => $.inheritance.inherit)
                : t(($) => $.inheritance.notSet);
  }
  if (typeof value === "boolean")
    return value ? t(($) => $.inheritance.on) : t(($) => $.inheritance.off);
  if (typeof value === "number") {
    return key === "sidebarAutoSettleAfterDays"
      ? t(($) => $.inheritance.days, { count: value })
      : String(value);
  }
  if (typeof value === "string") {
    if (key === "defaultThreadEnvMode" && (value === "local" || value === "worktree")) {
      return value === "worktree"
        ? t(($) => $.inheritance.newWorktree)
        : t(($) => $.inheritance.currentCheckout);
    }
    if (key === "worktreeSubmodules") {
      if (value === "recursive") return t(($) => $.inheritance.recursive);
      if (value === "top-level") return t(($) => $.inheritance.topLevel);
      if (value === "none") return t(($) => $.inheritance.skip);
    }
    if (key === "pullRequestMergeMethod") {
      if (value === "squash") return t(($) => $.inheritance.squash);
      if (value === "rebase") return t(($) => $.inheritance.rebase);
      if (value === "merge") return t(($) => $.inheritance.merge);
    }
    return value === "" ? t(($) => $.inheritance.empty) : value;
  }
  if (Array.isArray(value)) return t(($) => $.inheritance.items, { count: value.length });
  if (typeof value === "object") {
    if (key === "backgroundActivity" && "profile" in value && typeof value.profile === "string") {
      return BACKGROUND_ACTIVITY_PROFILE_LABELS(t)[value.profile] ?? value.profile;
    }
    if ("model" in value && typeof value.model === "string") return value.model;
    if ("mode" in value && typeof value.mode === "string") {
      if (key === "worktreeCleanup")
        return value.mode === "off" ? t(($) => $.inheritance.off) : t(($) => $.inheritance.custom);
      return key === "sourceControlWritingStyle"
        ? (WRITING_STYLE_LABELS(t)[value.mode] ?? value.mode)
        : value.mode;
    }
  }
  return t(($) => $.inheritance.custom);
}

/** Matches resolveProjectSettings order. */
export function settingInheritanceLayers(
  target: ScopedSettingsTarget,
  environmentSettings: ServerSettings,
  key: keyof ServerSettings,
  t: SettingsTranslation,
): readonly InheritanceLayer[] {
  const environmentValue = environmentSettings[key];
  const source = isProjectScopedSettingKey(key) ? target.sources[key] : "environment";
  const environmentSet = !Equal.equals(environmentValue, DEFAULT_SERVER_SETTINGS[key]);
  const fileBacked = isProjectFileBackedSettingKey(key);
  const layers: InheritanceLayer[] = [];
  if (target.projectId !== null && isProjectScopedSettingKey(key)) {
    layers.push({
      key: "project",
      label: t(($) => $.inheritance.project),
      value:
        source === "project"
          ? formatValue(key, target.settings[key], t)
          : t(($) => $.inheritance.inherits),
      effective: source === "project",
      set: source === "project",
    });
  }
  layers.push({
    key: "environment",
    label: target.label,
    value: environmentSet
      ? formatValue(key, environmentValue, t)
      : t(($) => $.inheritance.inherits),
    effective: source === "environment" && environmentSet,
    set: environmentSet,
  });
  if (fileBacked && target.projectId !== null) {
    layers.push({
      key: "t3.json",
      label: "t3.json",
      value:
        source === "t3.json"
          ? formatValue(key, target.settings[key], t)
          : t(($) => $.inheritance.inherits),
      effective: source === "t3.json",
      set: source === "t3.json",
    });
  }
  // File-backed defaults come from the resolver, not the schema's decoded null.
  const builtIn = fileBacked
    ? PROJECT_FILE_BACKED_SETTINGS[key].builtIn
    : DEFAULT_SERVER_SETTINGS[key];
  layers.push({
    key: "built-in",
    label: t(($) => $.inheritance.default),
    value: formatValue(key, builtIn, t),
    effective: source === "environment" && !environmentSet,
    set: true,
  });
  return layers;
}

function isProjectFileBackedSettingKey(
  key: keyof ServerSettings,
): key is ProjectFileBackedSettingKey {
  return Object.hasOwn(PROJECT_FILE_BACKED_SETTINGS, key);
}

export type SettingInheritanceState =
  | "default"
  | "environment"
  | "inherited"
  | "overridden"
  | "mixed";

export interface SettingOverridingProject extends ProjectOverrideEntry {
  readonly label: string;
  readonly open: () => void;
}

export function SettingInheritance({
  state,
  summary,
  targets,
  environments,
  keys,
  overridingProjects = [],
  onClearOverrides,
}: {
  state: SettingInheritanceState;
  summary: string;
  targets: readonly ScopedSettingsTarget[];
  environments: readonly Pick<
    EnvironmentPresentation,
    "environmentId" | "label" | "displayUrl" | "serverConfig"
  >[];
  keys: readonly (keyof ServerSettings)[];
  overridingProjects?: readonly SettingOverridingProject[];
  onClearOverrides?: (entries: readonly ProjectOverrideEntry[]) => void;
}) {
  const { t } = useTranslation("settings");
  const scopeContext = useOptionalSettingsScope();
  const key = keys[0];
  if (!key || targets.length === 0) return null;
  const hasMultipleEnvironments = new Set(targets.map((target) => target.environmentId)).size > 1;
  const overrideSummary =
    overridingProjects.length > 0
      ? t(($) => $.inheritance.overrideSummary, { summary, count: overridingProjects.length })
      : summary;
  const chains = targets.flatMap((target) => {
    const environment = environments.find(
      (candidate) => candidate.environmentId === target.environmentId,
    );
    if (!environment?.serverConfig) return [];
    const labels = settingsScopeEnvironmentLabels(environment, environments);
    const path = scopeContext?.scope.members.find(
      (member) => member.environmentId === target.environmentId && member.id === target.projectId,
    )?.workspaceRoot;
    const secondary = [labels.secondary, path?.split(/[\\/]/).filter(Boolean).slice(-2).join("/")]
      .filter(Boolean)
      .join(" · ");
    const layers = settingInheritanceLayers(target, environment.serverConfig.settings, key, t);
    const winningLayer = layers.find((layer) => layer.effective);
    return [
      {
        id: `${target.environmentId}:${target.projectId ?? ""}`,
        target,
        label: [labels.primary, secondary].filter(Boolean).join(" · "),
        machineLabel: [labels.primary, labels.secondary].filter(Boolean).join(" · "),
        overrides: environment.serverConfig.settings.projectSettingsOverrides,
        machine: resolveEnvironmentMachineKind(environment.serverConfig),
        layers,
        winningLayer,
        resolution: {
          winner: winningLayer?.key,
          layers: layers.map(({ key, value }) => [key, value]),
          settings: keys.map((settingKey) => target.settings[settingKey]),
        },
      },
    ];
  });
  const primary =
    chains.find(
      ({ target }) =>
        target.environmentId === scopeContext?.target?.environmentId &&
        target.projectId === scopeContext?.target?.projectId,
    ) ?? chains[0];
  const machineLabelFor = (environmentId: string) =>
    chains.find((entry) => entry.target.environmentId === environmentId)?.machineLabel ?? "";
  const groups: (typeof chains)[] = [];
  for (const chain of hasMultipleEnvironments && primary
    ? [primary, ...chains.filter((entry) => entry !== primary)]
    : chains) {
    const group =
      hasMultipleEnvironments &&
      groups.find(([first]) => first && Equal.equals(first.resolution, chain.resolution));
    if (group) group.push(chain);
    else groups.push([chain]);
  }
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  size="icon-micro"
                  variant="ghost-muted"
                  aria-label={t(($) => $.inheritance.showSource, { summary: overrideSummary })}
                />
              }
            />
          }
        >
          <LayersIcon
            className={cn(
              "size-3",
              state === "overridden" && "text-primary",
              state === "mixed" && "text-warning",
            )}
          />
        </TooltipTrigger>
        <TooltipPopup side="top">{overrideSummary}</TooltipPopup>
      </Tooltip>
      <PopoverPopup align="start" width="md" padding="none">
        <div className="divide-y divide-border/60">
          {groups.map((members) => {
            const first = members[0];
            if (!first) return null;
            const { id, target, machine, layers, winningLayer } = first;
            const chain = (
              <ol role="list" className="text-sm">
                {layers.map((layer) => (
                  <li
                    key={layer.key}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1",
                      layer.effective && "bg-foreground/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        layer.effective ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {layer.key === "environment"
                        ? t(($) => $.inheritance.environment)
                        : layer.label}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1.5 tabular-nums",
                        layer.effective
                          ? "text-foreground"
                          : layer.set
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60",
                      )}
                    >
                      <span className="max-w-32 truncate">{layer.value}</span>
                      {layer.effective ? (
                        <CheckIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <span aria-hidden className="size-3.5 shrink-0" />
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            );
            return (
              <section key={id} className="px-3 py-2.5">
                {!hasMultipleEnvironments ? (
                  <h4 className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-muted-foreground">
                    <EnvironmentMachineIcon
                      aria-hidden
                      kind={machine}
                      className="size-3.5 shrink-0"
                    />
                    <span className="min-w-0 truncate">{target.label}</span>
                  </h4>
                ) : null}
                {hasMultipleEnvironments && groups.length > 1 ? (
                  <Collapsible>
                    <CollapsibleTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm-multiline"
                          className="w-full justify-start text-left"
                        />
                      }
                    >
                      <span className="flex w-full min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground tabular-nums">
                            {winningLayer?.value}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {winningLayer?.key === "environment"
                              ? t(($) => $.inheritance.environment)
                              : winningLayer?.label}
                          </span>
                          <ChevronRightIcon
                            aria-hidden
                            className="size-3 shrink-0 text-muted-foreground [[data-panel-open]_&]:rotate-90"
                          />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
                          {members.map((member) => (
                            <span
                              key={member.id}
                              className="flex min-w-0 max-w-full items-center gap-1"
                            >
                              <EnvironmentMachineIcon
                                aria-hidden
                                kind={member.machine}
                                className="size-3 shrink-0"
                              />
                              <span className="truncate">{member.label}</span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </CollapsibleTrigger>
                    <CollapsiblePanel>
                      <div className="pt-1.5">{chain}</div>
                    </CollapsiblePanel>
                  </Collapsible>
                ) : (
                  <>
                    {chain}
                    {hasMultipleEnvironments ? (
                      <p className="px-2 pt-1.5 text-xs text-muted-foreground">
                        {t(($) => $.inheritance.sameOnAllMachines)}
                      </p>
                    ) : null}
                  </>
                )}
                {(() => {
                  const overriding = overridingProjects.filter((project) =>
                    members.some((member) => member.target.environmentId === project.environmentId),
                  );
                  if (overriding.length === 0) return null;
                  const foldOverrides = hasMultipleEnvironments && overriding.length > 3;
                  const header = (
                    <div className="flex items-center justify-between gap-3 px-2 text-xs text-muted-foreground">
                      {foldOverrides ? (
                        <CollapsibleTrigger render={<InlineButton tone="muted" />}>
                          <ChevronRightIcon
                            aria-hidden
                            className="size-3 [[data-panel-open]_&]:rotate-90"
                          />
                          {t(($) => $.inheritance.overriddenBy)}
                        </CollapsibleTrigger>
                      ) : (
                        <span>{t(($) => $.inheritance.overriddenBy)}</span>
                      )}
                      {onClearOverrides ? (
                        <InlineButton onClick={() => onClearOverrides(overriding)}>
                          {overriding.length === 1
                            ? t(($) => $.inheritance.resetOne)
                            : t(($) => $.inheritance.resetAll)}
                        </InlineButton>
                      ) : null}
                    </div>
                  );
                  const projects = (
                    <ul
                      role="list"
                      className={cn("mt-0.5 text-sm", foldOverrides && "max-h-48 overflow-y-auto")}
                    >
                      {overriding.map((project) => (
                        <li
                          key={`${project.environmentId}:${project.projectId}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-1"
                        >
                          <span className="flex min-w-0 flex-col items-start">
                            <InlineButton
                              className="min-w-0 max-w-full justify-start"
                              onClick={project.open}
                            >
                              <span className="truncate">{project.label}</span>
                            </InlineButton>
                            {hasMultipleEnvironments ? (
                              <span className="max-w-full truncate text-xs text-muted-foreground">
                                {machineLabelFor(project.environmentId)}
                              </span>
                            ) : null}
                          </span>
                          <span className="max-w-32 truncate text-muted-foreground tabular-nums">
                            {isProjectScopedSettingKey(key)
                              ? formatValue(
                                  key,
                                  members.find(
                                    (member) =>
                                      member.target.environmentId === project.environmentId,
                                  )?.overrides[project.projectId]?.[key],
                                  t,
                                )
                              : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  );
                  return (
                    <div className="mt-2 border-t border-border/60 pt-2">
                      {foldOverrides ? (
                        <Collapsible>
                          {header}
                          <CollapsiblePanel>{projects}</CollapsiblePanel>
                        </Collapsible>
                      ) : (
                        <>
                          {header}
                          {projects}
                        </>
                      )}
                    </div>
                  );
                })()}
              </section>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
