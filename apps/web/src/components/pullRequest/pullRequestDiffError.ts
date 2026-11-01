import type { TFunction } from "@t3tools/client-runtime/i18n";
/** Diff failures currently include transport wrappers, so recognize the reason inside them. */
export function describePullRequestDiffError(
  error: string,
  providerName: string,
  term: string,
  t: TFunction<"workspace">,
) {
  if (/\brate limit\b|\brate[-_]limited\b|\btoo many requests\b/i.test(error)) {
    return {
      title: t(($) => $.git.providerRateLimited, { provider: providerName }),
      description: t(($) => $.git.providerRateLimitedDescription, { provider: providerName }),
    };
  }

  return {
    title: t(($) => $.git.loadChangesFailed),
    description: t(($) => $.git.requestDiffFailedDescription, {
      term: term,
      provider: providerName,
    }),
  };
}
