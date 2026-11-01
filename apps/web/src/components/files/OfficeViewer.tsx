import { systemLocale } from "~/timestampFormat";
import { decodeFileWorkerError } from "~/components/files/fileWorkerError";
import {
  FilePreviewFailure,
  fileFailure,
  fileFailureText,
  type FileFailure,
} from "~/components/files/fileFailure";
import { useTranslation } from "react-i18next";
/* oxlint-disable react/no-array-index-key -- Spreadsheet rows and columns retain their source positions. */
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import type { OfficePreviewKind } from "@t3tools/shared/filePreview";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { VirtualTablePreview } from "~/components/files/VirtualTablePreview";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { FileSurfaceAction, FileSurfaceLoading, FileSurfaceNotice } from "./fileSurfaceChrome";
import { OFFICE_PREVIEW_MAX_BYTES, type OfficeWorkerResult } from "./officePreviewProtocol";

const numberFormat = new Intl.NumberFormat(systemLocale);

const DocumentPages = lazy(() =>
  import("~/components/files/DocumentPages").then((module) => ({ default: module.DocumentPages })),
);
const NotebookPreview = lazy(() =>
  import("~/components/files/NotebookPreview").then((module) => ({
    default: module.NotebookPreview,
  })),
);

type Workbook = Extract<OfficeWorkerResult, { type: "ods" }>;

const OpenXmlOfficeViewer = lazy(() =>
  import("~/components/files/OpenXmlOfficeViewer").then((module) => ({
    default: module.OpenXmlOfficeViewer,
  })),
);

async function readOfficeFile(src: string, signal: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok)
    throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.fileLoadRetry) });
  if (Number(response.headers.get("content-length")) > OFFICE_PREVIEW_MAX_BYTES)
    throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.limit50) });
  const reader = response.body?.getReader();
  if (!reader) throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.unavailable) });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > OFFICE_PREVIEW_MAX_BYTES)
        throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.limit50) });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).arrayBuffer();
}

export function OfficeViewer(props: {
  readonly src: string;
  readonly name: string;
  readonly kind: OfficePreviewKind;
  readonly sizeBytes?: number;
}) {
  if (props.kind === "docx" || props.kind === "xlsx" || props.kind === "pptx")
    return (
      <Suspense fallback={<FileSurfaceLoading />}>
        <OpenXmlOfficeViewer {...props} kind={props.kind} />
      </Suspense>
    );
  return <ExtendedOfficeViewer {...props} />;
}

function ExtendedOfficeViewer(props: {
  readonly src: string;
  readonly name: string;
  readonly kind: OfficePreviewKind;
  readonly sizeBytes?: number;
}) {
  const { t } = useTranslation("files");
  const [error, setError] = useState<FileFailure | null>(null);
  const [sheetPages, setSheetPages] = useState(new Map<string, string[][]>());
  const pendingPages = useRef(new Set<string>());
  const [previewDocument, setDocument] = useState<Extract<
    OfficeWorkerResult,
    { type: "document" }
  > | null>(null);
  const [notebook, setNotebook] = useState<Extract<
    OfficeWorkerResult,
    { type: "notebook" }
  > | null>(null);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [count, setCount] = useState(0);
  const [fileSize, setFileSize] = useState(props.sizeBytes);
  const [page, setPage] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Own the Office fetch, preparation worker, and timeout for this source and release them on cleanup.
  useEffect(() => {
    const controller = new AbortController();
    if ((props.sizeBytes ?? 0) > OFFICE_PREVIEW_MAX_BYTES) {
      // oxlint-disable-next-line react/set-state-in-effect -- The file metadata can reject the preview before loading bytes or engines.
      setError(new FilePreviewFailure({ describe: (t) => t(($) => $.document.limit50) }));
      return;
    }
    const worker = new Worker(new URL("./officePreview.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const fail = (message: FileFailure) => {
      if (!controller.signal.aborted) setError(message);
      controller.abort();
      worker.terminate();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    timerRef.current = setTimeout(
      () => fail(new FilePreviewFailure({ describe: (t) => t(($) => $.document.timeout) })),
      30_000,
    );
    worker.addEventListener("error", () =>
      fail(new FilePreviewFailure({ describe: (t) => t(($) => $.document.officeLoadFailed) })),
    );
    worker.addEventListener("message", (event: MessageEvent<OfficeWorkerResult>) => {
      if (controller.signal.aborted) return;
      const result = event.data;
      if (result.type === "error")
        fail(fileFailure(decodeFileWorkerError(result), (t) => t(($) => $.document.readFailed)));
      else if (result.type === "document") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setDocument(result);
        setCount(result.pages.length > 1 ? result.pages.length : 0);
      } else if (result.type === "notebook") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setNotebook(result);
      } else if (result.type === "ods") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setWorkbook(result);
        setCount(result.sheets.length);
      } else if (result.type === "sheet-page") {
        const key = `${result.sheet}:${result.index}`;
        pendingPages.current.delete(key);
        setSheetPages((old) => {
          const next = new Map(old);
          next.set(key, result.rows);
          if (next.size > 12) next.delete(next.keys().next().value!);
          return next;
        });
      }
    });
    void readOfficeFile(props.src, controller.signal)
      .then((bytes) => {
        if (!controller.signal.aborted) {
          setFileSize(bytes.byteLength);
          worker.postMessage({ type: "open", kind: props.kind, bytes }, [bytes]);
        }
      })
      .catch((cause: unknown) => fail(fileFailure(cause, (t) => t(($) => $.document.readFailed))));
    return () => {
      controller.abort();
      worker.terminate();
      workerRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [props.src, props.kind, props.sizeBytes]);
  const selectPage = setPage;
  if (error)
    return (
      <div
        role="alert"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 text-center"
      >
        <p className="text-sm font-medium">{t(($) => $.noPreview)}</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {fileFailureText(error, t)} {t(($) => $.document.saveExternal)}
        </p>
      </div>
    );
  if (notebook)
    return (
      <Suspense fallback={<FileSurfaceLoading />}>
        <NotebookPreview notebook={notebook} sizeBytes={fileSize} />
      </Suspense>
    );
  const sheet = workbook?.sheets[page];
  const documentPage = previewDocument?.pages[page];
  const sheetTitle = (
    item: { readonly name: string; readonly generatedName: boolean },
    index: number,
  ) => (item.generatedName ? t(($) => $.document.sheetName, { number: index + 1 }) : item.name);
  const pageTitle = (
    item: { readonly title: string; readonly generatedTitle: boolean },
    index: number,
  ) =>
    item.generatedTitle
      ? previewDocument?.navigation === "chapter"
        ? t(($) => $.document.chapterName, { number: index + 1 })
        : t(($) => $.document.pageName, { number: index + 1 })
      : item.title;
  const navigation = workbook ? "sheet" : (previewDocument?.navigation ?? "slide");
  const documentCount = previewDocument?.pages.length ?? 0;
  const documentDetails =
    navigation === "chapter"
      ? t(($) => $.document.chapterPosition, { number: page + 1, count: documentCount })
      : navigation === "slide"
        ? t(($) => $.document.slides, { count: documentCount, suffix: "" })
        : t(($) => $.document.pages, { count: documentCount, suffix: "" });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {count > 0 ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs">
          <FileSurfaceAction
            label={
              {
                sheet: t(($) => $.document.previousSheet),
                chapter: t(($) => $.document.previousChapter),
                slide: t(($) => $.document.previousSlide),
                page: t(($) => $.document.previousPage),
              }[navigation]
            }
            disabled={page === 0}
            onPress={() => selectPage(page - 1)}
          >
            <ChevronLeftIcon className="size-3.5" />
          </FileSurfaceAction>
          {workbook ? (
            <div className="min-w-0 flex-1">
              <Select
                value={page}
                onValueChange={(value) => {
                  if (value !== null) selectPage(value);
                }}
              >
                <SelectTrigger aria-label={t(($) => $.document.sheet)} size="xs">
                  <SelectValue>{sheet ? sheetTitle(sheet, page) : null}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {workbook.sheets.map((item, index) => (
                    <SelectItem key={index} value={index}>
                      {sheetTitle(item, index)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          ) : previewDocument?.navigation === "chapter" ? (
            <div className="min-w-0 flex-1">
              <Select
                value={page}
                onValueChange={(value) => {
                  if (value !== null) selectPage(value);
                }}
              >
                <SelectTrigger aria-label={t(($) => $.document.chapter)} size="xs">
                  <SelectValue>{documentPage ? pageTitle(documentPage, page) : null}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {previewDocument.pages.map((item, index) => (
                    <SelectItem key={index} value={index}>
                      {pageTitle(item, index)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          ) : (
            <span className="flex-1 text-center tabular-nums" aria-live="polite">
              {navigation === "slide"
                ? t(($) => $.document.slidePosition, { number: page + 1, count })
                : t(($) => $.document.pagePosition, { number: page + 1, count })}
            </span>
          )}
          <FileSurfaceAction
            label={
              {
                sheet: t(($) => $.document.nextSheet),
                chapter: t(($) => $.document.nextChapter),
                slide: t(($) => $.document.nextSlide),
                page: t(($) => $.document.nextPage),
              }[navigation]
            }
            disabled={page + 1 === count}
            onPress={() => selectPage(page + 1)}
          >
            <ChevronRightIcon className="size-3.5" />
          </FileSurfaceAction>
        </div>
      ) : null}
      {props.kind === "ods" && sheet ? (
        <div
          className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground tabular-nums"
          role="status"
        >
          {t(($) => $.document.sheetStats, {
            number: page + 1,
            count,
            rows: t(($) => $.document.rows, {
              count: sheet.rowCount,
              value: numberFormat.format(sheet.rowCount),
              suffix: "",
            }),
            columns: t(($) => $.document.columns, {
              count: sheet.columns,
              value: numberFormat.format(sheet.columns),
              suffix: "",
            }),
          })}
          {fileSize !== undefined
            ? ` · ${fileSize === 0 ? t(($) => $.document.bytes, { count: 0 }) : formatAttachmentSize(fileSize)}`
            : ""}
        </div>
      ) : null}
      {documentPage ? (
        <>
          {props.kind !== "epub" ? (
            <FileSurfaceNotice>{t(($) => $.document.layoutNotice)}</FileSurfaceNotice>
          ) : null}
          <Suspense fallback={<FileSurfaceLoading />}>
            <DocumentPages
              html={documentPage.html}
              name={`${props.name}: ${pageTitle(documentPage, page)}`}
              details={`${documentDetails}${fileSize !== undefined ? ` · ${fileSize === 0 ? t(($) => $.document.bytes, { count: 0 }) : formatAttachmentSize(fileSize)}` : ""}`}
            />
          </Suspense>
        </>
      ) : sheet ? (
        <>
          <FileSurfaceNotice>
            {t(($) => $.document.valuesOnly)}
            {sheet.truncated
              ? props.kind === "ods"
                ? t(($) => $.document.odsLimit)
                : t(($) => $.document.sheetLimit)
              : ""}
          </FileSurfaceNotice>
          {sheet.rowCount === 0 ? (
            <p className="p-6 text-xs text-muted-foreground">{t(($) => $.document.emptySheet)}</p>
          ) : (
            <VirtualTablePreview
              key={page}
              name={`${props.name}: ${sheetTitle(sheet, page)}`}
              count={sheet.rowCount}
              columns={sheet.columns}
              getRows={(index) => (index === 0 ? sheet.rows : sheetPages.get(`${page}:${index}`))}
              loadPage={(index) => {
                const key = `${page}:${index}`;
                if (pendingPages.current.has(key)) return;
                pendingPages.current.add(key);
                workerRef.current?.postMessage({ type: "sheet-page", sheet: page, index });
              }}
            />
          )}
        </>
      ) : (
        <FileSurfaceLoading />
      )}
    </div>
  );
}
