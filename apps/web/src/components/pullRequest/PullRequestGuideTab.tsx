import { useTranslation } from "react-i18next";
import type { EnvironmentId, PullRequestRef, PullRequestReviewGuideStop } from "@t3tools/contracts";
import { ScrollTextIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useEffectEvent } from "react";

import type { ReviewCommentContext } from "~/reviewCommentContext";

import { Alert, AlertAction, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import type { ExcerptCommenting } from "~/components/pullRequest/guide/GuideExcerpt";
import { GuideProseContext } from "~/components/pullRequest/guide/GuideProse";
import { GuideTour } from "~/components/pullRequest/guide/GuideTour";
import { useReviewGuideWriter } from "~/components/pullRequest/guide/useReviewGuideWriter";
import {
  nextPendingReviewCommentId,
  pullRequestReviewKey,
  usePendingReviewComments,
  usePullRequestReviewStore,
} from "~/components/pullRequest/pullRequestReviewStore";
import type { PullRequestCompletionScope } from "~/components/pullRequest/PullRequestMarkdownTextarea";

export function PullRequestGuideTab({
  environmentId,
  reference,
  title,
  workspaceRoot,
  active,
  canComment,
  rangeComments,
  completionScope,
  onAskAboutLines,
  onAskAboutStop,
  onFinishReview,
  onOpenFile,
  onTourShown,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  title: string | null;
  workspaceRoot: string;
  active: boolean;
  canComment: boolean;
  rangeComments: boolean;
  completionScope: PullRequestCompletionScope | null;
  onAskAboutLines: ((comment: ReviewCommentContext, request: string) => void) | null;
  onAskAboutStop:
    | ((stop: PullRequestReviewGuideStop, index: number, question: string) => void)
    | null;
  onFinishReview: (() => void) | null;
  onOpenFile: (path: string) => void;
  onTourShown?: (() => void) | undefined;
}) {
  const { t } = useTranslation("workspace");
  const { query, data, running, canWrite, write } = useReviewGuideWriter({
    environmentId,
    reference,
    title,
  });
  const reviewKey = pullRequestReviewKey(reference);
  const pending = usePendingReviewComments(reference);
  const addComment = usePullRequestReviewStore((store) => store.addComment);
  const removeComment = usePullRequestReviewStore((store) => store.removeComment);
  const commenting: ExcerptCommenting | null =
    !canComment && onAskAboutLines === null
      ? null
      : {
          canComment,
          rangeComments,
          completionScope,
          pending,
          onComment: ({ path, oldPath, position, startPosition, body }) =>
            addComment(reviewKey, {
              id: nextPendingReviewCommentId(),
              path,
              ...(oldPath === null ? {} : { oldPath }),
              ...(startPosition === undefined ? {} : { startPosition }),
              position,
              body,
            }),
          onRemove: (commentId) => removeComment(reviewKey, commentId),
          onAskAgent: onAskAboutLines,
        };
  const guide = data?.guide ?? null;
  const tourShown = active && guide !== null;
  const reportTourShown = useEffectEvent(() => onTourShown?.());
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells the parent once the loaded guide tour is on screen, which data arrival can cause
  useEffect(() => {
    if (tourShown) reportTourShown();
  }, [tourShown]);
  const runState = data?.run ?? null;
  const currentHeadSha = data?.currentHeadSha ?? null;
  const stale = guide !== null && currentHeadSha !== null && currentHeadSha !== guide.headSha;
  const failure =
    runState?._tag === "Failed" && runState.headSha === currentHeadSha ? runState.detail : null;
  const writeButton = (label: string, size: "sm" | "xs") =>
    canWrite ? (
      <Button size={size} variant="outline" disabled={running} onClick={() => void write()}>
        {running ? <Spinner /> : <ScrollTextIcon aria-hidden className="size-3.5" />}
        {running ? t(($) => $.git.readingChange) : label}
      </Button>
    ) : null;

  if (guide === null) {
    if (query.isPending && data === null) {
      return (
        <div className="flex min-h-48 items-center justify-center">
          <Spinner />
        </div>
      );
    }
    return (
      <div className="scrollbar-gutter-both flex h-full flex-col items-center justify-center-safe gap-2 overflow-y-auto px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          {running
            ? t(($) => $.git.writingReviewGuide)
            : failure === null
              ? t(($) => $.git.noReviewGuide)
              : t(($) => $.git.writeReviewGuideFailed)}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {running
            ? t(($) => $.git.writingGuideDescription)
            : failure === null
              ? (query.error ?? t(($) => $.git.reviewGuideDescription))
              : t(($) => $.git.checkGuideModel)}
        </p>
        {writeButton(
          failure === null ? t(($) => $.git.writeGuide) : t(($) => $.git.tryAgain),
          "sm",
        )}
        {failure === null || running ? null : <FailureDetails detail={failure} />}
      </div>
    );
  }

  const banner =
    stale || failure !== null || running ? (
      <Alert variant={running ? "info" : "warning"}>
        {running ? <Spinner /> : <TriangleAlertIcon />}
        <AlertDescription>
          {running ? (
            t(($) => $.git.rewritingGuideDescription)
          ) : failure === null ? (
            t(($) => $.git.guideBeforeLatestPush)
          ) : (
            <>
              {t(($) => $.git.rewriteGuideFailedDescription)}
              <FailureDetails detail={failure} />
            </>
          )}
        </AlertDescription>
        {!running && canWrite ? (
          <AlertAction>
            {writeButton(
              t(($) => $.git.rewrite),
              "xs",
            )}
          </AlertAction>
        ) : null}
      </Alert>
    ) : null;

  return (
    <GuideProseContext value={{ environmentId, cwd: workspaceRoot }}>
      <GuideTour
        environmentId={environmentId}
        reference={reference}
        guide={guide}
        banner={banner}
        active={active}
        commenting={commenting}
        onAsk={
          onAskAboutStop === null
            ? null
            : (index, question) => {
                const stop = guide.stops[index];
                if (stop !== undefined) onAskAboutStop(stop, index, question);
              }
        }
        onFinish={onFinishReview}
        onOpenFile={onOpenFile}
      />
    </GuideProseContext>
  );
}

function FailureDetails({ detail }: { detail: string }) {
  const { t } = useTranslation("workspace");
  return (
    <details className="w-full max-w-lg text-xs text-muted-foreground">
      <summary className="cursor-pointer rounded-sm -outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {t(($) => $.git.technicalDetails)}
      </summary>
      <pre className="scrollbar-gutter-both mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-left font-mono text-xs">
        {detail}
      </pre>
    </details>
  );
}
