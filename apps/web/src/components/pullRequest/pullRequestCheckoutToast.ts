import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export function offHeadPullRequestCheckoutToast(
  terminology: ChangeRequestTerminology,
  t: TFunction<"workspace">,
) {
  return {
    type: "warning",
    title: t(($) => $.git.checkoutNotConfirmed),
    description: t(($) => $.git.checkoutNotConfirmedDescription, { term: terminology.singular }),
  } as const;
}
