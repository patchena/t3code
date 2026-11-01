import { createInstance } from "i18next";
import { InterfaceLanguage } from "@t3tools/contracts/settings";

import { resources } from "#client/i18n/resources";
import { isTranslationError, TranslationError, validateCatalogs } from "#client/i18n/validation";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof resources.en;
    enableSelector: true;
    strictKeyChecks: true;
    returnNull: false;
    returnEmptyString: false;
  }
}

export { isTranslationError, resources, TranslationError, validateCatalogs };
export type { i18n, TFunction } from "i18next";

export function createI18n(language: InterfaceLanguage) {
  validateCatalogs(resources);
  const instance = createInstance();
  instance.use({
    type: "postProcessor",
    name: "t3-text",
    process(value: string, key: string | string[]) {
      if (!value.trim()) {
        throw new TranslationError({ message: `Empty translation: ${String(key)}.` });
      }
      return value;
    },
  });
  void instance.init(
    {
      lng: language,
      supportedLngs: [...InterfaceLanguage.literals],
      load: "languageOnly",
      fallbackLng: false,
      fallbackNS: false,
      defaultNS: "common",
      ns: Object.keys(resources.en),
      resources: structuredClone(resources),
      initAsync: false,
      enableSelector: true,
      returnNull: false,
      returnEmptyString: false,
      interpolation: { escapeValue: false },
      postProcess: "t3-text",
      parseMissingKeyHandler(key: string) {
        throw new TranslationError({ message: `Missing translation: ${key}.` });
      },
      missingInterpolationHandler(text: string) {
        throw new TranslationError({ message: `Missing interpolation: ${text}.` });
      },
      returnedObjectHandler(key: string) {
        throw new TranslationError({ message: `Translation must be text: ${key}.` });
      },
    },
    (error: unknown) => {
      if (error) {
        throw new TranslationError({
          message: `Translation initialization failed: ${String(error)}.`,
        });
      }
    },
  );
  if (!instance.isInitialized) {
    throw new TranslationError({
      message: "Translation initialization did not complete synchronously.",
    });
  }
  const formatter = instance.services.formatter;
  if (!formatter) throw new TranslationError({ message: "Translation formatter is unavailable." });
  formatter.add("lowercaseFirst", (value: unknown, language) => {
    if (typeof value !== "string")
      throw new TranslationError({ message: "Expected text for lowercaseFirst." });
    return value.charAt(0).toLocaleLowerCase(language) + value.slice(1);
  });
  return instance;
}
