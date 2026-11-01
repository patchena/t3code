import { systemLocale } from "~/timestampFormat";
import { useTranslation } from "react-i18next";
import type { PullRequestReplyAvailability } from "~/components/pullRequest/pullRequestDetail.logic";

export function PullRequestMoreReplies({
  moreReplies,
  hasMoreReplies,
  url,
}: PullRequestReplyAvailability) {
  const { t } = useTranslation("workspace");
  if (!hasMoreReplies) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1 text-xs text-muted-foreground">
      <span>
        {moreReplies > 0
          ? t(($) => $.git.moreReplies, {
              count: moreReplies,
              value: moreReplies.toLocaleString(systemLocale),
            })
          : t(($) => $.git.moreRepliesLabel)}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          {t(($) => $.git.viewOnHost)}
        </a>
      ) : null}
    </div>
  );
}
