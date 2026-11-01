import * as Schema from "effect/Schema";

type TranslationCatalog = {
  readonly [key: string]: string | TranslationCatalog;
};

type Message = {
  readonly pluralType: Intl.PluralRuleType | undefined;
  readonly forms: Map<string, ReadonlySet<string>>;
};

export class TranslationError extends Schema.TaggedError<TranslationError>()("TranslationError", {
  message: Schema.String,
}) {}

export const isTranslationError = Schema.is(TranslationError);

function parameters(value: string, path: string): ReadonlySet<string> {
  const names = new Set<string>();
  const remaining = value.replace(
    /{{\s*-?\s*([^{}]+?)\s*}}/g,
    (_match: string, expression: string) => {
      const name = expression.split(",")[0]?.trim();
      if (!name || !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name)) {
        throw new TranslationError({ message: `Invalid interpolation in ${path}.` });
      }
      names.add(name);
      return "";
    },
  );
  if (/{{|}}/.test(remaining)) {
    throw new TranslationError({ message: `Invalid interpolation in ${path}.` });
  }
  for (const match of value.matchAll(/<\/?([A-Za-z][\w-]*|\d+)(?:\s*\/)?>/g)) {
    names.add(`component:${match[1]}`);
  }
  return names;
}

function sameParameters(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((name) => right.has(name));
}

function messages(catalog: TranslationCatalog, language: string): Map<string, Message> {
  const result = new Map<string, Message>();

  function visit(node: TranslationCatalog, prefix: string): void {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value !== "string") {
        visit(value, path);
        continue;
      }
      if (!value.trim()) {
        throw new TranslationError({ message: `Empty translation: ${language}:${path}.` });
      }
      const suffix = /_(?:(ordinal)_)?(zero|one|two|few|many|other)$/.exec(key);
      const pluralType = suffix ? (suffix[1] ? "ordinal" : "cardinal") : undefined;
      const form = suffix ? suffix[2] : "text";
      if (!form) {
        throw new TranslationError({ message: `Invalid plural form: ${language}:${path}.` });
      }
      const identity = suffix ? path.slice(0, -suffix[0].length) : path;
      const id = `${identity}:${pluralType ?? "text"}`;
      const message = result.get(id) ?? { pluralType, forms: new Map() };
      message.forms.set(form, parameters(value, `${language}:${path}`));
      result.set(id, message);
    }
  }

  visit(catalog, "");

  for (const [identity, message] of result) {
    if (!message.pluralType) continue;
    const categories = new Intl.PluralRules(language, {
      type: message.pluralType,
    }).resolvedOptions().pluralCategories;
    for (const category of categories) {
      if (!message.forms.has(category)) {
        throw new TranslationError({
          message: `Missing plural form ${category}: ${language}:${identity}.`,
        });
      }
    }
  }

  return result;
}

export function validateCatalogs(
  catalogs: Readonly<Record<string, TranslationCatalog>>,
  referenceLanguage = "en",
): void {
  const reference = catalogs[referenceLanguage];
  if (!reference) {
    throw new TranslationError({ message: `Missing reference catalog: ${referenceLanguage}.` });
  }
  const referenceMessages = messages(reference, referenceLanguage);

  for (const [language, catalog] of Object.entries(catalogs)) {
    const translations = messages(catalog, language);
    for (const [identity, message] of referenceMessages) {
      const translated = translations.get(identity);
      if (!translated) {
        throw new TranslationError({ message: `Missing translation: ${language}:${identity}.` });
      }
      const expected = new Set([...message.forms.values()].flatMap((names) => [...names]));
      const actual = new Set([...translated.forms.values()].flatMap((names) => [...names]));
      if (!sameParameters(expected, actual)) {
        throw new TranslationError({ message: `Interpolation mismatch: ${language}:${identity}.` });
      }
      for (const [form, names] of translated.forms) {
        const referenceNames = message.forms.get(form);
        if (referenceNames && !sameParameters(referenceNames, names)) {
          throw new TranslationError({
            message: `Interpolation mismatch: ${language}:${identity}:${form}.`,
          });
        }
      }
    }
    for (const identity of translations.keys()) {
      if (!referenceMessages.has(identity)) {
        throw new TranslationError({ message: `Unknown translation: ${language}:${identity}.` });
      }
    }
  }
}
