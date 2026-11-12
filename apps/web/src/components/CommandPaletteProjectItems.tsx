import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";
import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";

import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import type { Project } from "../types";
import {
  buildCommandPaletteProjectMetadata,
  buildProjectActionItems,
  type CommandPaletteItemPin,
  type CommandPaletteProject,
  ITEM_ICON_CLASS,
} from "./CommandPalette.logic";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { ProjectFavicon } from "./ProjectFavicon";
import { COMMAND_PALETTE_META_ICON_CLASS, CommandPaletteMetaDot } from "./ThreadCommandSubtitle";

export interface CommandPaletteProjectLocation {
  readonly kind: "local" | "remote";
  readonly label: string;
  readonly machine: EnvironmentMachineKind;
  readonly searchTerms?: ReadonlyArray<string>;
}

interface ProjectItemsInput {
  readonly t: TFunction<"workspace">;
  readonly projects: ReadonlyArray<CommandPaletteProject>;
  readonly projectGroupByTargetKey: ReadonlyMap<string, SidebarProjectSnapshot>;
  readonly locationByEnvironmentId: ReadonlyMap<EnvironmentId, CommandPaletteProjectLocation>;
  readonly runProject: (project: CommandPaletteProject) => Promise<void>;
  readonly pin?: (project: CommandPaletteProject) => CommandPaletteItemPin | null;
}

function projectFaviconIcon(project: Project) {
  return <ProjectFavicon project={project} className={ITEM_ICON_CLASS} />;
}

/** Projects as root search results; a grouped project matches on every member. */
export function buildProjectSearchItems(input: ProjectItemsInput) {
  const membersOf = (project: CommandPaletteProject) =>
    input.projectGroupByTargetKey.get(`${project.environmentId}:${project.id}`)?.memberProjects ?? [
      project,
    ];
  return buildProjectActionItems({
    projects: input.projects,
    valuePrefix: "project",
    searchTerms: (project) =>
      buildCommandPaletteProjectMetadata({
        t: input.t,
        projects: membersOf(project),
        locationByEnvironmentId: input.locationByEnvironmentId,
      }).searchTerms,
    renderDescription: (project) => {
      const members = membersOf(project);
      const metadata = buildCommandPaletteProjectMetadata({
        t: input.t,
        projects: members,
        locationByEnvironmentId: input.locationByEnvironmentId,
      });
      return members.length > 1 ? (
        <span className="truncate">{metadata.environmentLabels.join(" · ")}</span>
      ) : (
        <ProjectLocationDescription
          location={input.locationByEnvironmentId.get(project.environmentId)}
          workspaceRoot={project.workspaceRoot}
        />
      );
    },
    icon: projectFaviconIcon,
    runProject: input.runProject,
    ...(input.pin ? { pin: input.pin } : {}),
  });
}

/** Projects as targets of the "New thread in..." submenu. */
export function buildNewThreadInProjectItems(
  input: Omit<ProjectItemsInput, "t"> & { readonly currentProjectKey: string | null },
) {
  return buildProjectActionItems({
    projects: input.projects,
    valuePrefix: "new-thread-in",
    searchTerms: (project) => {
      const group = input.projectGroupByTargetKey.get(`${project.environmentId}:${project.id}`);
      const location = input.locationByEnvironmentId.get(project.environmentId);
      return [
        ...(group?.memberProjects.flatMap((member) => [member.title, member.workspaceRoot]) ?? []),
        ...(location ? [location.label] : []),
        ...(location?.searchTerms ?? []),
      ];
    },
    renderDescription: (project) => (
      <ProjectLocationDescription
        location={input.locationByEnvironmentId.get(project.environmentId)}
        workspaceRoot={project.workspaceRoot}
        current={input.currentProjectKey === `${project.environmentId}:${project.id}`}
      />
    ),
    icon: projectFaviconIcon,
    runProject: input.runProject,
    ...(input.pin ? { pin: input.pin } : {}),
  });
}

function ProjectLocationDescription(props: {
  readonly location: CommandPaletteProjectLocation | undefined;
  readonly workspaceRoot: string;
  readonly current?: boolean;
}) {
  const { t } = useTranslation("workspace");
  const location = props.location ?? {
    kind: "remote",
    label: t(($) => $.remote),
    machine: "server" as const,
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      {props.current ? (
        <>
          <span className="shrink-0">{t(($) => $.palette.current)}</span>
          <CommandPaletteMetaDot />
        </>
      ) : null}
      <span className="inline-flex min-w-0 items-center gap-1">
        {location.kind === "remote" ? (
          <EnvironmentMachineIcon
            aria-hidden
            kind={location.machine}
            className={COMMAND_PALETTE_META_ICON_CLASS}
          />
        ) : null}
        <span className="truncate">{location.label}</span>
      </span>
      <CommandPaletteMetaDot />
      <span className="min-w-0 flex-1 truncate">{props.workspaceRoot}</span>
    </span>
  );
}
