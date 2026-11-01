import { ZipValidationError } from "@t3tools/client-runtime/zip/directory";
import * as Schema from "effect/Schema";

export const FileWorkerCode = Schema.Literals([
  "expandedArchiveLimit",
  "tarNumberFormat",
  "archiveEntryCount",
  "tarHeader",
  "archiveEntryDamaged",
  "archiveMetadataSize",
  "tarMetadata",
  "archiveEmpty",
  "archiveEntryUnavailable",
  "archiveEntryLimit",
  "tableUnavailable",
  "fileSizeLimit",
  "databaseTableLimit",
  "fileDownload",
  "textSizeLimit",
  "textBinary",
  "textRecordLimit",
  "textRowLimit",
  "downloadIncomplete",
  "copyBeforeLoaded",
  "sheetUnavailable",
  "documentXml",
  "documentNesting",
  "documentContentLimit",
  "documentRenderLimit",
  "sheetRepeatedCells",
  "openDocumentContent",
  "sheetCount",
  "cellSize",
  "sheetTextLimit",
  "documentPageCount",
  "epubPackage",
  "epubChapterCount",
  "epubChapters",
  "notebookCellSize",
  "notebookSize",
  "notebookVersion",
  "notebookOutputCount",
  "richTextSize",
  "richTextInvalid",
  "richTextPageCount",
  "richTextContent",
  "richTextNesting",
  "richTextDamaged",
  "richTextByteEscape",
  "richTextBinary",
  "richTextCodePage",
  "xmlDeclarations",
  "wordNesting",
  "wordSections",
  "wordSectionLimit",
  "wordBody",
  "cellCoordinates",
  "worksheetDimensions",
  "workbookNesting",
  "worksheetStructure",
  "rowCoordinates",
  "workbookRowLimit",
  "cellRows",
  "workbookCellLimit",
  "cellMetadata",
  "worksheetData",
  "workbookSheets",
  "worksheetMissing",
  "wordAliasedPart",
  "wordRelationship",
  "wordNestingLimit",
  "officeDamaged",
  "officeArchiveEntries",
  "wordArchivePaths",
  "documentExpandedLimit",
  "wordAuxiliaryLimit",
  "wordMarkupLimit",
  "openXmlInvalid",
  "workerHasDocument",
  "workerNoDocument",
  "documentFonts",
  "documentNoPages",
  "workerHasDeck",
  "workerNoDeck",
  "workerNoFonts",
  "workerHasWorkbook",
  "workerNoWorkbook",
  "embeddedImagePixels",
  "officeEngineStopped",
  "officeEngineReply",
  "officeCallAborted",
  "officeTimeout",
  "officeEngineClosed",
  "parseFailed",
  "readFailed",
  "previewFailed",
  "zipUnreadable",
  "zip64Unsupported",
  "zip64Damaged",
  "zipDirectoryDamaged",
  "zipPathLimit",
]);
export type FileWorkerCode = typeof FileWorkerCode.Type;

const FileWorkerDetail = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("sheet"), sheet: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("method"), method: Schema.String }),
]);
export type FileWorkerDetail = typeof FileWorkerDetail.Type;

interface FileWorkerFailureData {
  readonly message: string;
  readonly code?: FileWorkerCode;
  readonly detail?: FileWorkerDetail;
}

export class FileWorkerError extends Schema.TaggedError<FileWorkerError>()("FileWorkerError", {
  message: Schema.String,
  code: Schema.optional(FileWorkerCode),
  detail: Schema.optional(FileWorkerDetail),
}) {}

export const isFileWorkerError = Schema.is(FileWorkerError);

const isZipValidationError = Schema.is(ZipValidationError);

export function decodeFileWorkerError(input: FileWorkerFailureData) {
  return new FileWorkerError({ message: input.message, code: input.code, detail: input.detail });
}

const zipCodes = {
  unreadable: "zipUnreadable",
  "zip64-unsupported": "zip64Unsupported",
  "zip64-damaged": "zip64Damaged",
  "entry-limit": "archiveEntryCount",
  "directory-damaged": "zipDirectoryDamaged",
  "path-limit": "zipPathLimit",
  "file-limit": "fileSizeLimit",
  "expanded-limit": "expandedArchiveLimit",
} as const satisfies Record<ZipValidationError["kind"], FileWorkerCode>;

export function encodeFileWorkerError(cause: unknown): FileWorkerFailureData {
  if (isFileWorkerError(cause))
    return {
      message: cause.message,
      ...(cause.code === undefined ? {} : { code: cause.code }),
      ...(cause.detail === undefined ? {} : { detail: cause.detail }),
    };
  if (isZipValidationError(cause)) return { message: cause.message, code: zipCodes[cause.kind] };
  return { message: cause instanceof Error ? cause.message : String(cause) };
}
