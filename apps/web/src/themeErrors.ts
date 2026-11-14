import * as Schema from "effect/Schema";

const ThemeErrorSubject = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("manifest") }),
  Schema.Struct({ kind: Schema.Literal("file"), path: Schema.String }),
]);
export type ThemeErrorSubject = typeof ThemeErrorSubject.Type;

const ThemeErrorDetail = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals([
      "collectionEmpty",
      "collectionInvalid",
      "libraryChanged",
      "colorsObject",
      "colorRequired",
      "jsonObject",
      "invalidFileJson",
      "nameRequired",
      "appearanceRequired",
      "colorsRequired",
      "idInvalid",
      "collectionRequired",
      "variantsObject",
      "variantsNames",
      "backgroundRequired",
      "malformedDetails",
      "timeout",
      "searchUnavailable",
      "unreadableResponse",
      "unreadableSearch",
      "detailsUnavailable",
      "manifestUnavailable",
      "unreadableDetails",
      "detailsUnavailableNow",
      "unsafePath",
      "escapedPath",
      "zipDirectory",
      "zipInvalidDirectory",
      "zipTooManyFiles",
      "zip64",
      "zipExpansion",
      "zipRatio",
      "includeDepth",
      "includeCycle",
      "includeCount",
      "download",
      "manifestUnreadable",
      "noThemes",
      "tooManyThemes",
      "checksumUnreadable",
      "checksumInvalid",
      "integrity",
      "packageOpen",
      "packageMismatch",
      "licenseMismatch",
      "notVsCode",
      "unsafeImport",
      "noCompatibleThemes",
      "responseTooLarge",
      "detailsTooLarge",
      "manifestTooLarge",
      "packageTooLarge",
      "extensionManifestTooLarge",
      "checksumResponseInvalid",
    ]),
  }),
  Schema.Struct({ kind: Schema.Literal("reserved"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literals(["alreadyInstalled", "notInstalled"]),
    name: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literals(["unsupportedRole", "invalidColor"]),
    role: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("unsupportedVersion"), version: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("cssTooLong"), maxLength: Schema.Number }),
  Schema.Struct({
    kind: Schema.Literal("baseAppearance"),
    appearance: Schema.Literals(["light", "dark"]),
  }),
  Schema.Struct({
    kind: Schema.Literals(["invalidJson", "missingFile", "unreadableSize", "fileTooLarge"]),
    subject: ThemeErrorSubject,
  }),
]);
export type ThemeErrorDetail = typeof ThemeErrorDetail.Type;

export class ThemeError extends Schema.TaggedError<ThemeError>()("ThemeError", {
  message: Schema.String,
  detail: ThemeErrorDetail,
  cause: Schema.optional(Schema.Defect()),
}) {}

export const isThemeError = Schema.is(ThemeError);
