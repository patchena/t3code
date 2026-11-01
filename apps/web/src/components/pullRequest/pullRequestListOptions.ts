import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import {
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  PenLineIcon,
  UserLockIcon,
} from "lucide-react";

import type { PullRequestFilterOption } from "~/components/pullRequest/PullRequestListFilters";
import type { PullRequestListSort } from "~/components/pullRequest/pullRequestListPreferences";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

export const INVOLVEMENT_TABS = (t: TFunction<"workspace">) =>
  [
    { value: "all", label: t(($) => $.git.all), Icon: LayersIcon },
    { value: "reviewing", label: t(($) => $.git.reviewing), Icon: EyeIcon },
    { value: "authored", label: t(($) => $.git.authored), Icon: PenLineIcon },
  ] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

export const STATE_TABS = (t: TFunction<"workspace">) =>
  [
    { value: "all", label: t(($) => $.git.all), Icon: LayersIcon },
    { value: "open", label: t(($) => $.git.open), Icon: PullRequestGlyph.pullRequest },
    { value: "closed", label: t(($) => $.git.closed), Icon: PullRequestGlyph.closed },
    { value: "merged", label: t(($) => $.git.merged), Icon: PullRequestGlyph.merged },
  ] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

export const SORT_OPTIONS = (t: TFunction<"workspace">) =>
  [
    { value: "ready", label: t(($) => $.git.mergeReadiness), Icon: ListChecksIcon },
    { value: "blocked", label: t(($) => $.git.blockedOnMe), Icon: UserLockIcon },
    { value: "updated", label: t(($) => $.git.recentlyUpdated), Icon: ClockIcon },
    { value: "newest", label: t(($) => $.git.newestShown), Icon: CalendarArrowDownIcon },
    { value: "oldest", label: t(($) => $.git.oldestShown), Icon: CalendarArrowUpIcon },
    { value: "largest", label: t(($) => $.git.largestShown), Icon: Maximize2Icon },
    { value: "smallest", label: t(($) => $.git.smallestShown), Icon: Minimize2Icon },
  ] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;
