import { decodeFileWorkerError } from "~/components/files/fileWorkerError";
import {
  FilePreviewFailure,
  fileFailure,
  fileFailureText,
  type FileFailure,
} from "~/components/files/fileFailure";
import type { OfficeDetails } from "~/components/files/office/OfficePages";
import { useTranslation } from "react-i18next";
import { useStableCallback } from "~/hooks/useStableCallback";
import type { OfficePreviewKind } from "@t3tools/shared/filePreview";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  FileSurfaceLoading,
  FileSurfaceNotice,
  FILE_SURFACE_SUBHEADER_CLASS,
} from "./fileSurfaceChrome";
import { OFFICE_PREVIEW_MAX_BYTES, type OfficeWorkerResult } from "./officePreviewProtocol";
const WordDocument = lazy(() =>
  import("~/components/files/office/WordDocument").then((module) => ({
    default: module.WordDocument,
  })),
);
const Spreadsheet = lazy(() =>
  import("~/components/files/office/Spreadsheet").then((module) => ({
    default: module.Spreadsheet,
  })),
);
const Presentation = lazy(() =>
  import("~/components/files/office/Presentation").then((module) => ({
    default: module.Presentation,
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

export function OpenXmlOfficeViewer(props: {
  readonly src: string;
  readonly name: string;
  readonly kind: Extract<OfficePreviewKind, "docx" | "xlsx" | "pptx">;
  readonly sizeBytes?: number;
}) {
  const { t } = useTranslation("files");
  const [error, setError] = useState<FileFailure | null>(null);
  const [prepared, setPrepared] = useState<Extract<OfficeWorkerResult, { bytes: ArrayBuffer }>>();
  const [details, setDetails] = useState<OfficeDetails | null>(null);
  const fail = useStableCallback((cause: unknown) =>
    setError(fileFailure(cause, (t) => t(($) => $.document.officeRenderFailed))),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Own the Open XML fetch, preparation worker, and timeout for this source and release them on cleanup.
  useEffect(() => {
    if ((props.sizeBytes ?? 0) > OFFICE_PREVIEW_MAX_BYTES) {
      // Metadata bounds are checked before fetching or starting an engine.
      // oxlint-disable-next-line react/set-state-in-effect
      setError(new FilePreviewFailure({ describe: (t) => t(($) => $.document.limit50) }));
      return;
    }
    const controller = new AbortController();
    const worker = new Worker(new URL("./officePreview.worker.ts", import.meta.url), {
      type: "module",
    });
    const failure = (cause: unknown) => {
      if (!controller.signal.aborted) fail(cause);
      controller.abort();
      worker.terminate();
    };
    const timer = setTimeout(
      () => failure(new FilePreviewFailure({ describe: (t) => t(($) => $.document.timeout) })),
      30000,
    );
    worker.addEventListener("error", () =>
      failure(
        new FilePreviewFailure({ describe: (t) => t(($) => $.document.officeLoadFailedShort) }),
      ),
    );
    worker.addEventListener("messageerror", () =>
      failure(
        new FilePreviewFailure({ describe: (t) => t(($) => $.document.officeResponseFailed) }),
      ),
    );
    worker.addEventListener("message", (event: MessageEvent<OfficeWorkerResult>) => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      if (event.data.type === "error") failure(decodeFileWorkerError(event.data));
      else if ("bytes" in event.data) {
        setPrepared(event.data);
        worker.terminate();
      }
    });
    void readOfficeFile(props.src, controller.signal)
      .then((bytes) => {
        if (!controller.signal.aborted)
          worker.postMessage({ type: "open", kind: props.kind, bytes }, [bytes]);
      })
      .catch(failure);
    return () => {
      controller.abort();
      worker.terminate();
      clearTimeout(timer);
    };
  }, [props.src, props.kind, props.sizeBytes, fail]);
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
  if (!prepared) return <FileSurfaceLoading />;
  const Viewer = props.kind === "docx" ? WordDocument : Presentation;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {details ? (
        <div className={FILE_SURFACE_SUBHEADER_CLASS}>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {details.unit === "pages"
              ? t(($) => $.document.pages, {
                  count: details.count,
                  suffix: details.loading ? "+" : "",
                })
              : details.unit === "slides"
                ? t(($) => $.document.slides, { count: details.count, suffix: "" })
                : t(($) => $.document.sheets, { count: details.count, suffix: "" })}
            {props.kind !== "xlsx" ? ` · ${t(($) => $.document.fitWidth)}` : ""}
          </span>
        </div>
      ) : null}
      {prepared.truncated ? (
        <FileSurfaceNotice>{t(($) => $.document.previewLimited)}</FileSurfaceNotice>
      ) : null}
      <Suspense fallback={<FileSurfaceLoading />}>
        {prepared.view ? (
          <Spreadsheet
            bytes={prepared.bytes}
            view={prepared.view}
            onDetails={setDetails}
            onError={fail}
          />
        ) : (
          <Viewer bytes={prepared.bytes} onDetails={setDetails} onError={fail} />
        )}
      </Suspense>
    </div>
  );
}
