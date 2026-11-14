import { isTranslationError, type TFunction } from "@t3tools/client-runtime/i18n";
import * as Schema from "effect/Schema";

import { isThemeError, type ThemeErrorSubject } from "~/themeErrors";
import { ThemeLibraryStorageError } from "~/themePalette";

const isThemeLibraryStorageError = Schema.is(ThemeLibraryStorageError);

function subjectLabel(subject: ThemeErrorSubject, t: TFunction<"settings">): string {
  return subject.kind === "manifest" ? t(($) => $.extra.themes.manifest) : subject.path;
}

export function themeErrorMessage(error: unknown, t: TFunction<"settings">): string {
  if (isTranslationError(error)) throw error;
  if (isThemeLibraryStorageError(error)) {
    return error.operation === "read"
      ? t(($) => $.extra.themes.libraryRead, { key: error.storageKey })
      : t(($) => $.extra.themes.libraryWrite, { key: error.storageKey });
  }
  if (!isThemeError(error)) return error instanceof Error ? error.message : String(error);
  const detail = error.detail;
  switch (detail.kind) {
    case "reserved":
      return t(($) => $.extra.themeErrors.reserved, { id: detail.id });
    case "alreadyInstalled":
      return t(($) => $.extra.themeErrors.alreadyInstalled, { name: detail.name });
    case "notInstalled":
      return t(($) => $.extra.themeErrors.notInstalled, { name: detail.name });
    case "unsupportedRole":
      return t(($) => $.extra.themeErrors.unsupportedRole, { role: detail.role });
    case "invalidColor":
      return t(($) => $.extra.themeErrors.invalidColor, { role: detail.role });
    case "unsupportedVersion":
      return t(($) => $.extra.themeErrors.unsupportedVersion, { version: detail.version });
    case "cssTooLong":
      return t(($) => $.extra.themeErrors.cssTooLong, { maxLength: detail.maxLength });
    case "baseAppearance":
      return t(($) => $.extra.themeErrors.baseAppearance, { appearance: detail.appearance });
    case "invalidJson":
      return t(($) => $.extra.themeErrors.invalidJson, {
        subject: subjectLabel(detail.subject, t),
      });
    case "missingFile":
      return t(($) => $.extra.themeErrors.missingFile, {
        subject: subjectLabel(detail.subject, t),
      });
    case "unreadableSize":
      return t(($) => $.extra.themeErrors.unreadableSize, {
        subject: subjectLabel(detail.subject, t),
      });
    case "fileTooLarge":
      return t(($) => $.extra.themeErrors.fileTooLarge, {
        subject: subjectLabel(detail.subject, t),
      });
    default:
      return t(($) => $.extra.themeErrors[detail.kind]);
  }
}
