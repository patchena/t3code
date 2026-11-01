import { isFileWorkerError, type FileWorkerCode } from "~/components/files/fileWorkerError";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import * as Schema from "effect/Schema";

type DescribeFailure = (t: TFunction<"files">) => string;

const DescribeFailure = Schema.declare(
  (value: unknown): value is DescribeFailure => typeof value === "function",
);

export class FilePreviewFailure extends Schema.TaggedError<FilePreviewFailure>()(
  "FilePreviewFailure",
  { describe: DescribeFailure },
) {
  override get message(): string {
    return "File preview failed";
  }
}

export const isFilePreviewFailure = Schema.is(FilePreviewFailure);

export type FileFailure = string | FilePreviewFailure;

export function fileFailure(
  cause: unknown,
  unexpected: (t: TFunction<"files">) => string,
): FileFailure {
  if (isFilePreviewFailure(cause)) return cause;
  if (isFileWorkerError(cause)) {
    const detail = cause.detail;
    if (detail?.kind === "sheet")
      return new FilePreviewFailure({
        describe: (t) => t(($) => $.worker.sheetOpen, { sheet: detail.sheet }),
      });
    if (detail?.kind === "method")
      return new FilePreviewFailure({
        describe: (t) => t(($) => $.worker.unknownMethod, { method: detail.method }),
      });
    if (cause.code !== undefined)
      return new FilePreviewFailure({ describe: workerMessages[cause.code] });
  }
  return cause instanceof Error ? cause.message : new FilePreviewFailure({ describe: unexpected });
}

export function fileFailureText(failure: FileFailure, t: TFunction<"files">): string {
  return isFilePreviewFailure(failure) ? failure.describe(t) : failure;
}

const workerMessages = {
  expandedArchiveLimit: (t: TFunction<"files">) => t(($) => $.worker.expandedArchiveLimit),
  tarNumberFormat: (t: TFunction<"files">) => t(($) => $.worker.tarNumberFormat),
  archiveEntryCount: (t: TFunction<"files">) => t(($) => $.worker.archiveEntryCount),
  tarHeader: (t: TFunction<"files">) => t(($) => $.worker.tarHeader),
  archiveEntryDamaged: (t: TFunction<"files">) => t(($) => $.worker.archiveEntryDamaged),
  archiveMetadataSize: (t: TFunction<"files">) => t(($) => $.worker.archiveMetadataSize),
  tarMetadata: (t: TFunction<"files">) => t(($) => $.worker.tarMetadata),
  archiveEmpty: (t: TFunction<"files">) => t(($) => $.worker.archiveEmpty),
  archiveEntryUnavailable: (t: TFunction<"files">) => t(($) => $.worker.archiveEntryUnavailable),
  archiveEntryLimit: (t: TFunction<"files">) => t(($) => $.worker.archiveEntryLimit),
  tableUnavailable: (t: TFunction<"files">) => t(($) => $.worker.tableUnavailable),
  fileSizeLimit: (t: TFunction<"files">) => t(($) => $.document.limit50),
  databaseTableLimit: (t: TFunction<"files">) => t(($) => $.worker.databaseTableLimit),
  fileDownload: (t: TFunction<"files">) => t(($) => $.document.fileLoadRetry),
  textSizeLimit: (t: TFunction<"files">) => t(($) => $.worker.textSizeLimit),
  textBinary: (t: TFunction<"files">) => t(($) => $.worker.textBinary),
  textRecordLimit: (t: TFunction<"files">) => t(($) => $.worker.textRecordLimit),
  textRowLimit: (t: TFunction<"files">) => t(($) => $.worker.textRowLimit),
  downloadIncomplete: (t: TFunction<"files">) => t(($) => $.worker.downloadIncomplete),
  copyBeforeLoaded: (t: TFunction<"files">) => t(($) => $.preview.waitBeforeCopy),
  sheetUnavailable: (t: TFunction<"files">) => t(($) => $.worker.sheetUnavailable),
  documentXml: (t: TFunction<"files">) => t(($) => $.worker.documentXml),
  documentNesting: (t: TFunction<"files">) => t(($) => $.worker.documentNesting),
  documentContentLimit: (t: TFunction<"files">) => t(($) => $.worker.documentContentLimit),
  documentRenderLimit: (t: TFunction<"files">) => t(($) => $.worker.documentRenderLimit),
  sheetRepeatedCells: (t: TFunction<"files">) => t(($) => $.worker.sheetRepeatedCells),
  openDocumentContent: (t: TFunction<"files">) => t(($) => $.worker.openDocumentContent),
  sheetCount: (t: TFunction<"files">) => t(($) => $.worker.sheetCount),
  cellSize: (t: TFunction<"files">) => t(($) => $.worker.cellSize),
  sheetTextLimit: (t: TFunction<"files">) => t(($) => $.worker.sheetTextLimit),
  documentPageCount: (t: TFunction<"files">) => t(($) => $.worker.documentPageCount),
  epubPackage: (t: TFunction<"files">) => t(($) => $.worker.epubPackage),
  epubChapterCount: (t: TFunction<"files">) => t(($) => $.worker.epubChapterCount),
  epubChapters: (t: TFunction<"files">) => t(($) => $.worker.epubChapters),
  notebookCellSize: (t: TFunction<"files">) => t(($) => $.worker.notebookCellSize),
  notebookSize: (t: TFunction<"files">) => t(($) => $.worker.notebookSize),
  notebookVersion: (t: TFunction<"files">) => t(($) => $.worker.notebookVersion),
  notebookOutputCount: (t: TFunction<"files">) => t(($) => $.worker.notebookOutputCount),
  richTextSize: (t: TFunction<"files">) => t(($) => $.worker.richTextSize),
  richTextInvalid: (t: TFunction<"files">) => t(($) => $.worker.richTextInvalid),
  richTextPageCount: (t: TFunction<"files">) => t(($) => $.worker.richTextPageCount),
  richTextContent: (t: TFunction<"files">) => t(($) => $.worker.richTextContent),
  richTextNesting: (t: TFunction<"files">) => t(($) => $.worker.richTextNesting),
  richTextDamaged: (t: TFunction<"files">) => t(($) => $.worker.richTextDamaged),
  richTextByteEscape: (t: TFunction<"files">) => t(($) => $.worker.richTextByteEscape),
  richTextBinary: (t: TFunction<"files">) => t(($) => $.worker.richTextBinary),
  richTextCodePage: (t: TFunction<"files">) => t(($) => $.worker.richTextCodePage),
  xmlDeclarations: (t: TFunction<"files">) => t(($) => $.worker.xmlDeclarations),
  wordNesting: (t: TFunction<"files">) => t(($) => $.worker.wordNesting),
  wordSections: (t: TFunction<"files">) => t(($) => $.worker.wordSections),
  wordSectionLimit: (t: TFunction<"files">) => t(($) => $.worker.wordSectionLimit),
  wordBody: (t: TFunction<"files">) => t(($) => $.worker.wordBody),
  cellCoordinates: (t: TFunction<"files">) => t(($) => $.worker.cellCoordinates),
  worksheetDimensions: (t: TFunction<"files">) => t(($) => $.worker.worksheetDimensions),
  workbookNesting: (t: TFunction<"files">) => t(($) => $.worker.workbookNesting),
  worksheetStructure: (t: TFunction<"files">) => t(($) => $.worker.worksheetStructure),
  rowCoordinates: (t: TFunction<"files">) => t(($) => $.worker.rowCoordinates),
  workbookRowLimit: (t: TFunction<"files">) => t(($) => $.worker.workbookRowLimit),
  cellRows: (t: TFunction<"files">) => t(($) => $.worker.cellRows),
  workbookCellLimit: (t: TFunction<"files">) => t(($) => $.worker.workbookCellLimit),
  cellMetadata: (t: TFunction<"files">) => t(($) => $.worker.cellMetadata),
  worksheetData: (t: TFunction<"files">) => t(($) => $.worker.worksheetData),
  workbookSheets: (t: TFunction<"files">) => t(($) => $.worker.workbookSheets),
  worksheetMissing: (t: TFunction<"files">) => t(($) => $.worker.worksheetMissing),
  wordAliasedPart: (t: TFunction<"files">) => t(($) => $.worker.wordAliasedPart),
  wordRelationship: (t: TFunction<"files">) => t(($) => $.worker.wordRelationship),
  wordNestingLimit: (t: TFunction<"files">) => t(($) => $.worker.wordNestingLimit),
  officeDamaged: (t: TFunction<"files">) => t(($) => $.worker.officeDamaged),
  officeArchiveEntries: (t: TFunction<"files">) => t(($) => $.worker.officeArchiveEntries),
  wordArchivePaths: (t: TFunction<"files">) => t(($) => $.worker.wordArchivePaths),
  documentExpandedLimit: (t: TFunction<"files">) => t(($) => $.worker.documentExpandedLimit),
  wordAuxiliaryLimit: (t: TFunction<"files">) => t(($) => $.worker.wordAuxiliaryLimit),
  wordMarkupLimit: (t: TFunction<"files">) => t(($) => $.worker.wordMarkupLimit),
  openXmlInvalid: (t: TFunction<"files">) => t(($) => $.worker.openXmlInvalid),
  workerHasDocument: (t: TFunction<"files">) => t(($) => $.worker.workerHasDocument),
  workerNoDocument: (t: TFunction<"files">) => t(($) => $.worker.workerNoDocument),
  documentFonts: (t: TFunction<"files">) => t(($) => $.worker.documentFonts),
  documentNoPages: (t: TFunction<"files">) => t(($) => $.worker.documentNoPages),
  workerHasDeck: (t: TFunction<"files">) => t(($) => $.worker.workerHasDeck),
  workerNoDeck: (t: TFunction<"files">) => t(($) => $.worker.workerNoDeck),
  workerNoFonts: (t: TFunction<"files">) => t(($) => $.worker.workerNoFonts),
  workerHasWorkbook: (t: TFunction<"files">) => t(($) => $.worker.workerHasWorkbook),
  workerNoWorkbook: (t: TFunction<"files">) => t(($) => $.worker.workerNoWorkbook),
  embeddedImagePixels: (t: TFunction<"files">) => t(($) => $.worker.embeddedImagePixels),
  officeEngineStopped: (t: TFunction<"files">) => t(($) => $.worker.officeEngineStopped),
  officeEngineReply: (t: TFunction<"files">) => t(($) => $.worker.officeEngineReply),
  officeCallAborted: (t: TFunction<"files">) => t(($) => $.worker.officeCallAborted),
  officeTimeout: (t: TFunction<"files">) => t(($) => $.document.timeout),
  officeEngineClosed: (t: TFunction<"files">) => t(($) => $.worker.officeEngineClosed),
  parseFailed: (t: TFunction<"files">) => t(($) => $.worker.parseFailed),
  readFailed: (t: TFunction<"files">) => t(($) => $.document.readFailed),
  previewFailed: (t: TFunction<"files">) => t(($) => $.worker.previewFailed),
  zipUnreadable: (t: TFunction<"files">) => t(($) => $.worker.zipUnreadable),
  zip64Unsupported: (t: TFunction<"files">) => t(($) => $.worker.zip64Unsupported),
  zip64Damaged: (t: TFunction<"files">) => t(($) => $.worker.zip64Damaged),
  zipDirectoryDamaged: (t: TFunction<"files">) => t(($) => $.worker.zipDirectoryDamaged),
  zipPathLimit: (t: TFunction<"files">) => t(($) => $.worker.zipPathLimit),
} as const satisfies Record<FileWorkerCode, (t: TFunction<"files">) => string>;
