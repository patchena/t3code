import type { TFunction } from "@t3tools/client-runtime/i18n";
import type {
  ServerProvider,
  ServerProviderVersionAdvisory,
  ServerProviderCompatibilityAdvisory,
} from "@t3tools/contracts";

export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-muted-foreground/50",
  },
  error: {
    dot: "bg-destructive",
  },
  neutral: {
    dot: "bg-muted-foreground",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

// Antigravity's local health check verifies installation, not Google sign-in.
// API-key and Agent Platform warnings still need attention.
function isAntigravitySignInUnchecked(provider: ServerProvider): boolean {
  return (
    provider.driver === "antigravity" &&
    provider.installed &&
    provider.status === "warning" &&
    provider.auth.status === "unknown" &&
    (provider.auth.type === undefined ||
      provider.auth.type === "oauth-personal" ||
      provider.auth.type === "oauth-business")
  );
}

export function getProviderStatusKey(provider: ServerProvider | undefined): ProviderStatusKey {
  if (provider && !provider.enabled) return "disabled";
  if (provider && isAntigravitySignInUnchecked(provider)) return "neutral";
  return provider?.status ?? "warning";
}

export function getProviderSummary(provider: ServerProvider | undefined, t: TFunction<"settings">) {
  if (!provider) {
    return {
      headline: t(($) => $.providers.checkingProvider),
      detail: t(($) => $.providers.waitingProvider),
    };
  }
  if (!provider.enabled || provider.status === "disabled") {
    return {
      headline: t(($) => $.providers.disabled),
      detail: provider.message ?? t(($) => $.providers.disabledProviderHint),
    };
  }
  if (!provider.installed) {
    return {
      headline: t(($) => $.providers.notFound),
      detail: provider.message ?? t(($) => $.providers.cliNotFound),
    };
  }
  if (provider.auth.status === "unauthenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t(($) => $.providers.notAuthenticatedWith, { method: authLabel })
        : t(($) => $.providers.notAuthenticated),
      detail: provider.message ?? null,
    };
  }
  if (isAntigravitySignInUnchecked(provider)) {
    return {
      headline: t(($) => $.providers.installedSignInUnchecked),
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: t(($) => $.providers.needsAttention),
      detail: provider.message ?? t(($) => $.providers.providerUnverified),
    };
  }
  if (provider.status === "error") {
    return {
      headline: t(($) => $.providers.unavailable),
      detail: provider.message ?? t(($) => $.providers.providerStartupFailed),
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t(($) => $.providers.authenticatedWith, { method: authLabel })
        : t(($) => $.providers.authenticated),
      detail: provider.message ?? null,
    };
  }
  return {
    headline: t(($) => $.providers.available),
    detail: provider.message ?? null,
  };
}

export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  const antigravity = /^agy_acp_server_(\d{4})(\d{2})(\d{2})_\d+(?:_(\w+))?$/.exec(version);
  if (antigravity) {
    const [, year, month, day, candidate] = antigravity;
    return `${year}-${month}-${day}${candidate ? ` ${candidate}` : ""}`;
  }
  return /^\d/.test(version) ? `v${version}` : version;
}

export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  t: TFunction<"settings">,
  compatibility?: ServerProviderCompatibilityAdvisory | undefined,
  showCompatibility = true,
): {
  readonly title: string;
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
  readonly targetVersion: string | null;
} | null {
  const latestIsIncompatible =
    compatibility?.latestVersionStatus === "broken" ||
    compatibility?.latestVersionStatus === "unsupported";
  if (
    showCompatibility &&
    compatibility &&
    (compatibility.status === "graceful" ||
      compatibility.status === "unsupported" ||
      compatibility.status === "broken")
  ) {
    const targetVersion = compatibility.recommendedVersion;
    const recommendation = getProviderVersionLabel(targetVersion) ?? compatibility.recommendedRange;
    // Latest package versions cannot be updated into recommendations requiring another package.
    const isAlreadyLatest = advisory?.status === "current";
    return {
      title:
        compatibility.status === "graceful"
          ? t(($) => $.providers.limitedSupport)
          : compatibility.status === "unsupported"
            ? t(($) => $.providers.unsupportedVersion)
            : t(($) => $.providers.brokenVersion),
      detail:
        compatibility.message ??
        (recommendation
          ? t(($) => $.providers.useRecommended, { version: recommendation })
          : t(($) => $.providers.updateFullSupport)),
      updateCommand:
        targetVersion || latestIsIncompatible || isAlreadyLatest
          ? null
          : (advisory?.updateCommand ?? null),
      emphasis: compatibility.status === "graceful" ? "normal" : "strong",
      targetVersion,
    };
  }
  if (
    !advisory ||
    advisory.status === "current" ||
    advisory.status === "unknown" ||
    latestIsIncompatible
  ) {
    return null;
  }

  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    title: t(($) => $.providers.updateAvailable),
    detail:
      advisory.message ??
      (versionLabel
        ? t(($) => $.providers.installVersionUpdate, { version: versionLabel })
        : t(($) => $.providers.installLatestUpdate)),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
    targetVersion: null,
  };
}
