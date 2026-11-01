import type { TFunction } from "@t3tools/client-runtime/i18n";
import { PROVIDER_DISPLAY_NAMES, type ServerProvider } from "@t3tools/contracts";
import { compareSemverVersions } from "@t3tools/shared/semver";

const RUNTIME_NAMES: Partial<Record<string, string>> = {
  claudeAgent: "Claude Code",
};

export function formatProviderUpdateRequiredNotice(
  provider: Pick<ServerProvider, "driver" | "updateRequiredModels">,
  searchQuery: string,
  t: TFunction<"chat">,
): string | null {
  const query = searchQuery.trim().toLocaleLowerCase();
  const models = (provider.updateRequiredModels ?? []).filter(
    (model) =>
      query.length === 0 ||
      model.name.toLocaleLowerCase().includes(query) ||
      model.slug.toLocaleLowerCase().includes(query),
  );
  if (models.length === 0) return null;
  const minVersion = models
    .map((model) => model.minVersion)
    .reduce((highest, version) =>
      compareSemverVersions(version, highest) > 0 ? version : highest,
    );
  const providerName =
    provider.driver === "codex"
      ? t(($) => $.composer.codexCli)
      : (RUNTIME_NAMES[provider.driver] ??
        PROVIDER_DISPLAY_NAMES[provider.driver] ??
        provider.driver);
  const version = minVersion.startsWith("v") ? minVersion : `v${minVersion}`;
  return t(($) => $.composer.updateProviderForModels, {
    provider: providerName,
    version,
    models: models.map((model) => model.name),
  });
}
