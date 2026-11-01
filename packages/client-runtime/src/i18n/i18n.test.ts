import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  createI18n,
  type i18n,
  resources,
  TranslationError,
  validateCatalogs,
} from "#client/i18n/index";

const fixture = {
  en: {
    greeting: "Hello, {{name}}!",
    continuation: "{{label, lowercaseFirst}}",
    threads_one: "{{count}} thread",
    threads_other: "{{count}} threads",
  },
  de: {
    greeting: "Hallo, {{name}}!",
    continuation: "{{label}}",
    threads_one: "{{count}} Thread",
    threads_other: "{{count}} Threads",
  },
} as const;

function translate(instance: i18n, key: string, options: Record<string, unknown> = {}): unknown {
  return Reflect.apply(instance.t, instance, [key, options]);
}

describe("interface translations", () => {
  it("validates every bundled message and interpolation", () => {
    expect(() => validateCatalogs(resources)).not.toThrow();
    expect(() => validateCatalogs(fixture)).not.toThrow();
    expect(() => validateCatalogs({ en: fixture.en, de: { ...fixture.de, greeting: "" } })).toThrow(
      TranslationError,
    );
    expect(() =>
      validateCatalogs({ en: fixture.en, de: { ...fixture.de, greeting: "Hallo, {{other}}!" } }),
    ).toThrow("Interpolation mismatch");
    expect(() =>
      validateCatalogs({ en: { rich: "Open <target/>." }, de: { rich: "Öffnen." } }),
    ).toThrow("Interpolation mismatch");
    expect(() =>
      validateCatalogs({ en: fixture.en, de: { ...fixture.de, extra: "Extra" } }),
    ).toThrow("Unknown translation");
    expect(() =>
      validateCatalogs({ en: fixture.en, de: { greeting: fixture.de.greeting } }),
    ).toThrow("Missing translation");
    expect(() => validateCatalogs({ en: { value: "{{name" }, de: { value: "{{name" } })).toThrow(
      "Invalid interpolation",
    );
    expect(() =>
      validateCatalogs({
        en: fixture.en,
        de: { greeting: fixture.de.greeting, threads_one: "Thread" },
      }),
    ).toThrow("Missing plural form other");
  });

  it("renders zero, one and multiple items with real i18next plural rules", async () => {
    const instance = createI18n("en");
    instance.addResourceBundle("en", "runtime", fixture.en);
    instance.addResourceBundle("de", "runtime", fixture.de);
    expect(instance.isInitialized).toBe(true);
    expect(instance.options.fallbackLng).toBe(false);
    for (const [language, expected] of [
      ["en", ["0 threads", "1 thread", "3 threads"]],
      ["de", ["0 Threads", "1 Thread", "3 Threads"]],
    ] as const) {
      await instance.changeLanguage(language);
      expect([0, 1, 3].map((count) => translate(instance, "runtime:threads", { count }))).toEqual(
        expected,
      );
      expect(translate(instance, "runtime:continuation", { label: "Browser" })).toBe(
        language === "en" ? "browser" : "Browser",
      );
    }
    await instance.changeLanguage("en");
    expect(translate(instance, "runtime:greeting", { name: "Ada" })).toBe("Hello, Ada!");
  });

  it("throws for missing keys, empty messages and absent interpolation values", () => {
    const instance = createI18n("de");
    instance.addResourceBundle("de", "runtime", {
      greeting: fixture.de.greeting,
      empty: "",
      whitespace: "   ",
    });
    instance.addResourceBundle("en", "runtime", { absentInGerman: "English replacement" });
    expect(() => translate(instance, "runtime:missing")).toThrow("Missing translation");
    expect(() => translate(instance, "runtime:absentInGerman")).toThrow("Missing translation");
    expect(() =>
      translate(instance, "runtime:missing", { defaultValue: "English replacement" }),
    ).toThrow("Missing translation");
    expect(() => translate(instance, "runtime:empty")).toThrow(TranslationError);
    expect(() => translate(instance, "runtime:whitespace")).toThrow("Empty translation");
    expect(() => translate(instance, "runtime:greeting")).toThrow("Missing interpolation");
    expect(() => translate(instance, "runtime:greeting", { name: undefined })).toThrow(
      "Missing interpolation",
    );
    expect(translate(instance, "runtime:greeting", { name: "<script>" })).toBe("Hallo, <script>!");
  });

  it("types selectors and named interpolation parameters from the reference catalog", () => {
    const instance = createI18n("en");
    const t = instance.getFixedT(null, "desktop");
    expect(t(($) => $.menu.about, { app: "T3 Code" })).toBe("About T3 Code");
    const invalidCalls = () => {
      // @ts-expect-error Nonexistent keys must be rejected before execution.
      t(($) => $.missing);
      // @ts-expect-error The named interpolation parameter is required when options are supplied.
      t(($) => $.menu.about, {});
      // @ts-expect-error Interpolation accepts text or numbers, not arbitrary objects.
      t(($) => $.menu.about, { app: {} });
    };
    expectTypeOf(invalidCalls).returns.toBeVoid();
  });
});
