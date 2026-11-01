import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";
import { useAtomCommand } from "~/state/use-atom-command";
import type {
  EnvironmentId,
  PullRequestRef,
  PullRequestReviewerCandidate,
} from "@t3tools/contracts";
import {
  hostReviewerQuery,
  reviewerCandidateView,
  type ReviewerTruncation,
} from "@t3tools/client-runtime/pull-request-reviewers";
import { CheckIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { useDebouncedValue } from "~/state/queries";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { toastManager } from "~/components/ui/toast";
import { PullRequestCandidatePicker } from "~/components/pullRequest/PullRequestCandidatePicker";
import { PullRequestActorLabel } from "~/components/pullRequest/pullRequestPresentation";
import { readableFailure } from "~/components/pullRequest/pullRequestDetail.logic";

const TRUNCATED_LABELS: Record<
  ReviewerTruncation,
  (t: TFunction<"workspace">, error: string | null) => string
> = {
  unsearchable: (t) => t(($) => $.git.peopleTruncated),
  searchable: (t) => t(($) => $.git.peopleTruncatedSearchable),
  "search-failed": (t, error) => t(($) => $.git.peopleSearchFailed, { error: error ?? "" }),
  "search-truncated": (t) => t(($) => $.git.peopleSearchTruncated),
};

export function PullRequestReviewerPicker({
  environmentId,
  reference,
  allowed,
  searchable,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  allowed: boolean;
  searchable: boolean;
}) {
  const { t } = useTranslation("workspace");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const candidatesQuery = useEnvironmentQuery(
    open ? pullRequestEnvironment.reviewerCandidates({ environmentId, input: reference }) : null,
  );
  // Past the first page the host is asked, since what was loaded cannot answer for the rest.
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searchInput = { loaded: candidatesQuery.data, searchable, query, debouncedQuery };
  const hostQuery = hostReviewerQuery(searchInput);
  const searchResult = useEnvironmentQuery(
    open && hostQuery !== null
      ? pullRequestEnvironment.reviewerSearch({
          environmentId,
          input: { ...reference, query: hostQuery },
        })
      : null,
  );
  const requestReviewers = useAtomCommand(pullRequestEnvironment.requestReviewers, {
    reportFailure: false,
  });

  const { candidates, searchPending, searchError, truncation } = reviewerCandidateView({
    ...searchInput,
    search: searchResult,
  });

  const toggle = async (candidate: PullRequestReviewerCandidate) => {
    if (pending !== null) return;
    setPending(candidate.id);
    const result = await requestReviewers({
      environmentId,
      input: {
        ...reference,
        reviewers: [{ id: candidate.id, kind: candidate.kind }],
        requested: !candidate.isRequested,
      },
    });
    setPending(null);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: candidate.isRequested
          ? t(($) => $.git.withdrawReviewFailed, { login: candidate.login })
          : t(($) => $.git.requestReviewFailed, { login: candidate.login }),
        description: readableFailure(
          squashAtomCommandFailure(result),
          t(($) => $.git.reviewerAccessRequired),
        ),
      });
      return;
    }
    // The command reads the loaded list again only for somebody it lacked, and a search result
    // is keyed by what was typed, so the one on screen is read here or it keeps the old request.
    if (hostQuery !== null) searchResult.refresh();
    toastManager.add({
      type: "success",
      title: candidate.isRequested
        ? t(($) => $.git.reviewWithdrawn, { login: candidate.login })
        : t(($) => $.git.reviewRequestedFrom, { login: candidate.login }),
    });
  };

  return (
    <PullRequestCandidatePicker
      icon={<UserPlusIcon className="size-3.5" />}
      label={t(($) => $.git.requestReview)}
      allowed={allowed}
      disabledReason={t(($) => $.git.reviewerWriteRequired)}
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={setQuery}
      searchLabel={t(($) => $.git.searchPeopleAccess)}
      isPending={(candidatesQuery.isPending && candidatesQuery.data === null) || searchPending}
      error={
        candidatesQuery.data === null
          ? candidatesQuery.error
          : candidates.length === 0
            ? searchError
            : null
      }
      candidates={candidates}
      emptyLabel={t(($) => $.git.noOtherPeopleAccess)}
      noMatchLabel={t(($) => $.git.noMatchingPeople)}
      errorLabel={t(($) => $.git.peopleReadFailed)}
      truncated={truncation !== null}
      truncatedLabel={truncation === null ? "" : TRUNCATED_LABELS[truncation](t, searchError)}
      candidateKey={(candidate) => `${candidate.kind}:${candidate.id}`}
      disabled={pending !== null}
      onSelect={(candidate) => void toggle(candidate)}
    >
      {(candidate) => (
        <>
          <PullRequestActorLabel actor={candidate} className="flex-1" />
          {candidate.kind === "team" ? (
            <span className="shrink-0 text-muted-foreground">{t(($) => $.git.team)}</span>
          ) : null}
          {candidate.isRequested ? (
            <CheckIcon aria-label={t(($) => $.git.alreadyAsked)} className="size-3.5 shrink-0" />
          ) : null}
        </>
      )}
    </PullRequestCandidatePicker>
  );
}
