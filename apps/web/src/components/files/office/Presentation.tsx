import { FilePreviewFailure } from "~/components/files/fileFailure";
import { useTranslation } from "react-i18next";
import type { OfficeDetails } from "~/components/files/office/OfficePages";
/* oxlint-disable react/no-unstable-nested-components -- These callbacks return overlays, and are invoked as render functions. */
import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  FileSurfaceAction,
  FileSurfaceLoading,
  FILE_SURFACE_SUBHEADER_CLASS,
} from "../fileSurfaceChrome";
import { OfficePages, type PaintPage } from "./OfficePages";
import { createWorkerClient } from "./worker-rpc";
import type { SlideMethods, SlideSummary } from "./slide-protocol";
import { rasterize } from "./vector-pictures";

type Opened = { slides: readonly SlideSummary[]; paint: PaintPage };
export function Presentation(props: {
  bytes: ArrayBuffer;
  onDetails: (details: OfficeDetails) => void;
  onError: (cause: unknown) => void;
}) {
  const { t } = useTranslation("files");
  const { onError, bytes: source, onDetails } = props;
  const [opened, setOpened] = useState<Opened>();
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const scroll = useRef<((index: number, y?: number) => void) | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Open and paint slides through a worker whose requests and lifetime belong to this presentation.
  useEffect(() => {
    const controller = new AbortController();
    const worker = new Worker(new URL("./presentation.worker.ts", import.meta.url), {
      type: "module",
    });
    const engine = createWorkerClient<SlideMethods>(worker);
    const fail = (cause: unknown) => {
      if (!controller.signal.aborted) onError(cause);
    };
    worker.addEventListener("error", fail);
    worker.addEventListener("messageerror", fail);
    const paint = async (
      index: number,
      canvas: HTMLCanvasElement,
      scale: number,
      signal: AbortSignal,
      again = false,
    ): Promise<void> => {
      const result = await engine.call(
        "paint",
        { index, density: (window.devicePixelRatio || 1) * scale },
        { key: `slide:${index}`, signal },
      );
      if (signal.aborted || result.kind === "cancelled") {
        if (result.kind === "painted") result.bitmap.close();
        return;
      }
      setFailed((previous) => ({ ...previous, [index]: result.kind === "failed" }));
      if (result.kind === "failed") return;
      const context = canvas.getContext("bitmaprenderer");
      if (!context) {
        result.bitmap.close();
        throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.noSlides) });
      }
      canvas.width = result.bitmap.width;
      canvas.height = result.bitmap.height;
      context.transferFromImageBitmap(result.bitmap);
      if (again || !result.vectors.length) return;
      const bitmaps = await Promise.all(result.vectors.map(rasterize));
      if (signal.aborted) {
        bitmaps.forEach((value) => value.bitmap?.close());
        return;
      }
      await engine.call("vectors", bitmaps, {
        transfer: bitmaps.flatMap((value) => (value.bitmap ? [value.bitmap] : [])),
        signal,
      });
      if (!signal.aborted) await paint(index, canvas, scale, signal, true);
    };
    const bytes = source.slice(0);
    void engine
      .call("open", { bytes }, { transfer: [bytes], signal: controller.signal })
      .then((slides) => {
        if (slides.length === 0 || slides.length > 500)
          throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.slideLimit) });
        setOpened({ slides, paint });
        onDetails({ count: slides.length, unit: "slides" });
      })
      .catch(fail);
    return () => {
      controller.abort();
      engine.close();
    };
  }, [source, onDetails, onError]);
  if (!opened) return <FileSurfaceLoading />;
  const select = (index: number) => {
    setPage(index);
    scroll.current?.(index);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={FILE_SURFACE_SUBHEADER_CLASS}>
        <FileSurfaceAction
          label={t(($) => $.document.previousSlide)}
          disabled={page === 0}
          onPress={() => select(page - 1)}
        >
          <ChevronLeftIcon className="size-3.5" />
        </FileSurfaceAction>
        <span className="flex-1 text-center text-xs tabular-nums" aria-live="polite">
          Slide {page + 1} of {opened.slides.length}
        </span>
        <FileSurfaceAction
          label={t(($) => $.document.nextSlide)}
          disabled={page + 1 === opened.slides.length}
          onPress={() => select(page + 1)}
        >
          <ChevronRightIcon className="size-3.5" />
        </FileSurfaceAction>
      </div>
      <OfficePages
        pages={opened.slides}
        paint={opened.paint}
        label={t(($) => $.document.slide)}
        scrollRef={scroll}
        onPageChange={setPage}
        onError={onError}
        overlay={(index) => (
          <>
            {opened.slides[index]?.hidden ? (
              <div className="pointer-events-none absolute inset-0 bg-white/50" />
            ) : null}
            {failed[index] ? (
              <p
                role="status"
                className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-xs text-foreground"
              >
                {t(($) => $.document.slideDrawFailed)}
              </p>
            ) : null}
          </>
        )}
        footer={(index) => {
          const slide = opened.slides[index];
          return slide?.notes || slide?.hidden ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              {slide.hidden ? <p>{t(($) => $.document.hiddenSlide)}</p> : null}
              {slide.notes ? (
                <p
                  role="note"
                  aria-label={t(($) => $.document.speakerNotes)}
                  className="select-text whitespace-pre-wrap break-words"
                >
                  {slide.notes}
                </p>
              ) : null}
            </div>
          ) : null;
        }}
      />
    </div>
  );
}
