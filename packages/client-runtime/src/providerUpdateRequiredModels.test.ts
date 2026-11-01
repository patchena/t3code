import { ProviderDriverKind } from "@t3tools/contracts";
import { createI18n } from "@t3tools/client-runtime/i18n";
import { expect, it } from "vite-plus/test";

import { formatProviderUpdateRequiredNotice } from "./providerUpdateRequiredModels.ts";

it("formats model lists in the selected language and keeps model names unchanged", async () => {
  const provider = {
    driver: ProviderDriverKind.make("codex"),
    updateRequiredModels: [
      { slug: "alpha", name: "Alpha 3", minVersion: "1.0.0" },
      { slug: "beta", name: "Beta 4", minVersion: "2.0.0" },
      { slug: "gamma", name: "Gamma 5", minVersion: "1.5.0" },
    ],
  };
  const instance = createI18n("en");
  const t = instance.getFixedT(null, "chat");

  expect(formatProviderUpdateRequiredNotice(provider, "", t)).toBe(
    "Update the Codex CLI to v2.0.0 or newer to use Alpha 3, Beta 4, and Gamma 5.",
  );

  await instance.changeLanguage("de");

  expect(formatProviderUpdateRequiredNotice(provider, "", t)).toBe(
    "Aktualisiere die Codex CLI auf v2.0.0 oder neuer, um Alpha 3, Beta 4 und Gamma 5 zu verwenden.",
  );
  expect(formatProviderUpdateRequiredNotice(provider, "alpha", t)).toBe(
    "Aktualisiere die Codex CLI auf v1.0.0 oder neuer, um Alpha 3 zu verwenden.",
  );
  expect(formatProviderUpdateRequiredNotice(provider, "unknown", t)).toBeNull();
});
