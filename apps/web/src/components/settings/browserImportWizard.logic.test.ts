import { createI18n } from "@t3tools/client-runtime/i18n";
import { describe, expect, it } from "vite-plus/test";
import type { BrowserImportSource } from "@t3tools/contracts";

import {
  formatSkippedDomains,
  initialWizardStep,
  initialTargetSelection,
  refreshedSourceProfileDirectory,
  resolveWizardTarget,
} from "./browserImportWizard.logic";

describe("wizard target selection", () => {
  it("treats an existing profile whose id is new as an existing target", () => {
    const profiles = [{ id: "new", name: "Existing new" }];
    const selection = initialTargetSelection(false, profiles);

    expect(selection).toEqual({ kind: "existing", profileId: "new" });
    expect(resolveWizardTarget(selection, "generated", profiles)).toEqual({
      kind: "existing",
      profileId: "new",
      name: "Existing new",
    });
  });

  it("rejects an existing target that is no longer listed", () => {
    expect(
      resolveWizardTarget({ kind: "existing", profileId: "removed" }, "generated", [
        { id: "default", name: "Default" },
      ]),
    ).toBeUndefined();
  });
});

const source = (over: Partial<BrowserImportSource> = {}): BrowserImportSource => ({
  id: "helium",
  name: "Helium",
  profiles: [{ directory: "Default", name: "You" }],
  ...over,
});

describe("initialWizardStep", () => {
  it("handles source availability before checking its profiles", () => {
    expect(
      initialWizardStep(source({ profiles: [], unavailable: "needsKeychainApproval" })),
    ).toEqual({ step: "blocked", reason: "needsKeychainApproval" });
  });
});

describe("refreshedSourceProfileDirectory", () => {
  const refreshed = source({
    profiles: [
      { directory: "Default", name: "Personal" },
      { directory: "Profile 2", name: "Work" },
    ],
  });

  it("preserves a selected non-first profile after the browser quits", () => {
    expect(refreshedSourceProfileDirectory("Profile 2", refreshed)).toBe("Profile 2");
  });

  it("falls back only when the old profile vanished and clears an empty result", () => {
    expect(refreshedSourceProfileDirectory("Removed", refreshed)).toBe("Default");
    expect(refreshedSourceProfileDirectory("Removed", source({ profiles: [] }))).toBe("");
  });
});

it.each(["en", "de"] as const)(
  "formats skipped domains in %s without changing them",
  (language) => {
    const t = createI18n(language).getFixedT(language, "tools");
    const format = new Intl.NumberFormat("en-US").format;
    expect(formatSkippedDomains([], t, format)).toBe("");
    expect(formatSkippedDomains(["a.test"], t, format)).toBe("a.test");
    expect(formatSkippedDomains(["a.test", "b.test", "c.test"], t, format)).toBe(
      language === "en" ? "a.test, b.test and c.test" : "a.test, b.test und c.test",
    );
    expect(formatSkippedDomains(["a.test", "b.test", "c.test", "d.test"], t, format)).toBe(
      language === "en"
        ? "a.test, b.test, c.test and 1 more"
        : "a.test, b.test, c.test und 1 weitere",
    );
    expect(
      formatSkippedDomains(["a.test", "b.test", "c.test", "d.test", "e.test"], t, format),
    ).toBe(
      language === "en"
        ? "a.test, b.test, c.test and 2 more"
        : "a.test, b.test, c.test und 2 weitere",
    );
  },
);
