import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useTranslation } from "react-i18next";
import { useAtomCommand } from "~/state/use-atom-command";
import { capitalizeTerm } from "@t3tools/client-runtime/source-control-clients";
import type { EnvironmentId, PullRequestRef, PullRequestReviewVerdict } from "@t3tools/contracts";
import { CheckIcon, MessageSquareIcon, XCircleIcon } from "lucide-react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";

import { TextFieldSpeechControls, useTextFieldSpeech } from "~/speech/useTextFieldSpeech";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { isCommentSubmitShortcut } from "~/components/diffs/commentSubmitShortcut";
import { Button } from "~/components/ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "~/components/ui/select";
import { toastManager } from "~/components/ui/toast";
import { readableFailure } from "~/components/pullRequest/pullRequestDetail.logic";
import {
  pullRequestReviewKey,
  usePendingReviewComments,
  usePullRequestReviewStore,
} from "~/components/pullRequest/pullRequestReviewStore";
import {
  PullRequestMarkdownTextarea,
  type PullRequestCompletionScope,
} from "~/components/pullRequest/PullRequestMarkdownTextarea";

const VERDICTS = (
  t: TFunction<"workspace">,
): ReadonlyArray<{
  readonly value: PullRequestReviewVerdict;
  readonly label: string;
  readonly sent: (term: string) => string;
  readonly icon: ReactNode;
}> => [
  {
    value: "comment",
    label: t(($) => $.git.comment),
    sent: () => t(($) => $.git.reviewSubmitted),
    icon: <MessageSquareIcon className="size-3" />,
  },
  {
    value: "approve",
    label: t(($) => $.git.approve),
    sent: (term) => t(($) => $.git.requestApproved, { term: capitalizeTerm(term) }),
    icon: <CheckIcon className="size-3" />,
  },
  {
    value: "request-changes",
    label: t(($) => $.git.requestChanges),
    sent: () => t(($) => $.git.changesRequested),
    icon: <XCircleIcon className="size-3" />,
  },
];

export function PullRequestReviewForm({
  environmentId,
  active,
  reference,
  completionScope,
  term,
  verdicts,
  requestChangesSummaryRequired,
  textareaRef,
  pending,
  onPendingChange,
  onSubmitted,
}: {
  environmentId: EnvironmentId;
  /** False while the form stays mounted but hidden; dictation is cancelled then. */
  active: boolean;
  reference: PullRequestRef;
  completionScope: PullRequestCompletionScope | null;
  /** The host's word for a change request, as in "pull request". */
  term: string;
  verdicts: ReadonlyArray<PullRequestReviewVerdict>;
  requestChangesSummaryRequired: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSubmitted: () => void;
}) {
  const { t } = useTranslation("workspace");
  const [requestedVerdict, setRequestedVerdict] = useState<PullRequestReviewVerdict>("comment");
  const comments = usePendingReviewComments(reference);
  const reviewKey = pullRequestReviewKey(reference);
  const body = usePullRequestReviewStore((store) => store.summaries[reviewKey] ?? "");
  const removeComments = usePullRequestReviewStore((store) => store.removeComments);
  const setSummary = usePullRequestReviewStore((store) => store.setSummary);
  const speech = useTextFieldSpeech({
    environmentId,
    projectId: reference.projectId,
    ownerKey: JSON.stringify(["pr-review", environmentId, reviewKey]),
    text: body,
    textareaRef,
    onTextChange: (text) => setSummary(reviewKey, text),
    disabled: !active || pending,
  });
  const { cancel } = speech;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- discards a recording when the hidden form can no longer be submitted
  useEffect(() => {
    if (!active) cancel();
  }, [active, cancel]);
  const clearSummary = usePullRequestReviewStore((store) => store.clearSummary);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview, {
    reportFailure: false,
  });

  const offered = VERDICTS(t).filter((verdict) => verdicts.includes(verdict.value));
  const selectedVerdict =
    offered.find((verdict) => verdict.value === requestedVerdict) ?? offered[0];

  const submit = async (verdict: ReturnType<typeof VERDICTS>[number], text: string) => {
    const submittedComments = usePullRequestReviewStore.getState().drafts[reviewKey] ?? [];
    if (pending || !canSubmit(verdict.value, text, submittedComments.length)) return;
    const submittedBody = text;
    onPendingChange(true);
    const result = await submitReview({
      environmentId,
      input: {
        ...reference,
        verdict: verdict.value,
        body: submittedBody,
        comments: submittedComments,
      },
    });
    onPendingChange(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: t(($) => $.git.submitReviewFailed),
        description: readableFailure(
          squashAtomCommandFailure(result),
          t(($) => $.git.reviewRefused),
        ),
      });
      return;
    }
    // Preserve comments and summary edits made during submission.
    removeComments(
      reviewKey,
      submittedComments.map((comment) => comment.id),
    );
    clearSummary(reviewKey, submittedBody);
    toastManager.add({ type: "success", title: verdict.sent(term) });
    onSubmitted();
  };

  // Forgejo requires a summary when requesting changes, even with inline comments.
  const canSubmit = (verdict: PullRequestReviewVerdict, summary: string, commentCount: number) =>
    verdict === "request-changes" && requestChangesSummaryRequired
      ? summary.trim().length > 0
      : verdict === "approve" || summary.trim().length > 0 || commentCount > 0;
  const placeholder =
    selectedVerdict === undefined || canSubmit(selectedVerdict.value, "", comments.length)
      ? t(($) => $.git.reviewSummaryOptional)
      : selectedVerdict.value === "request-changes" && requestChangesSummaryRequired
        ? t(($) => $.git.reviewSummaryRequired)
        : t(($) => $.git.reviewSummaryOrComments);

  return (
    <>
      <PullRequestMarkdownTextarea
        ref={textareaRef}
        completionScope={completionScope}
        rows={3}
        readOnly={speech.freezesEditor}
        value={body}
        placeholder={placeholder}
        aria-label={t(($) => $.git.reviewSummary)}
        onValueChange={(next) => setSummary(reviewKey, next)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return;
          if (
            selectedVerdict !== undefined &&
            isCommentSubmitShortcut(event, body, pending || speech.preparing, true)
          ) {
            event.preventDefault();
            event.stopPropagation();
            speech.submitAfterDictation((text) => void submit(selectedVerdict, text));
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <TextFieldSpeechControls speech={speech} disabled={pending} />
        {offered.length > 1 ? (
          <Select
            value={selectedVerdict?.value ?? null}
            disabled={pending}
            onValueChange={(value) => {
              if (value !== null) setRequestedVerdict(value);
            }}
          >
            <SelectTrigger
              size="xs"
              className="w-auto min-w-0"
              aria-label={t(($) => $.git.reviewVerdict)}
            >
              <span className="flex items-center gap-1.5">
                {selectedVerdict?.icon}
                {selectedVerdict?.label}
              </span>
            </SelectTrigger>
            <SelectPopup side="top" alignItemWithTrigger={false}>
              {offered.map((verdict) => (
                <SelectItem key={verdict.value} value={verdict.value}>
                  <span className="flex items-center gap-1.5">
                    {verdict.icon}
                    {verdict.label}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
        <Button
          size="xs"
          disabled={
            speech.preparing ||
            pending ||
            selectedVerdict === undefined ||
            (!canSubmit(selectedVerdict.value, body, comments.length) && !speech.blocksSubmission)
          }
          onClick={() => {
            if (selectedVerdict !== undefined)
              speech.submitAfterDictation((text) => void submit(selectedVerdict, text));
          }}
        >
          {pending ? t(($) => $.git.submitting) : t(($) => $.git.submitReview)}
        </Button>
      </div>
    </>
  );
}
