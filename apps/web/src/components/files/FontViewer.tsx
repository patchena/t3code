import { encodeHTML } from "entities";
import {
  FilePreviewFailure,
  fileFailure,
  fileFailureText,
  type FileFailure,
} from "~/components/files/fileFailure";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

import { useTheme } from "~/hooks/useTheme";

import { FileSurfaceLoading } from "./fileSurfaceChrome";

const MAX_FONT_BYTES = 10 * 1024 * 1024;

async function readFont(src: string, signal: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new FilePreviewFailure({ describe: (t) => t(($) => $.font.loadFailed) });
  if (Number(response.headers.get("content-length")) > MAX_FONT_BYTES)
    throw new FilePreviewFailure({ describe: (t) => t(($) => $.font.limit) });
  const reader = response.body?.getReader();
  if (!reader) throw new FilePreviewFailure({ describe: (t) => t(($) => $.font.unavailable) });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_FONT_BYTES)
        throw new FilePreviewFailure({ describe: (t) => t(($) => $.font.limit) });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const blob = new Blob(chunks);
  await new FontFace("file-preview", await blob.arrayBuffer()).load();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener(
      "error",
      () => reject(new FilePreviewFailure({ describe: (t) => t(($) => $.font.decodeFailed) })),
      {
        once: true,
      },
    );
    reader.readAsDataURL(blob);
  });
}

export function FontViewer(props: { readonly src: string; readonly name: string }) {
  const { t, i18n } = useTranslation("files");
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<FileFailure | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Load the font from its URL and abort the request and timeout when the source changes or unmounts.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setError(new FilePreviewFailure({ describe: (t) => t(($) => $.font.timeout) }));
      controller.abort();
    }, 30_000);
    void readFont(props.src, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(fileFailure(cause, (t) => t(($) => $.font.unsupported)));
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [props.src]);
  if (error)
    return (
      <div
        role="alert"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 text-center"
      >
        <p className="text-sm font-medium">{t(($) => $.noPreview)}</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {fileFailureText(error, t)} {t(($) => $.saveExternal)}
        </p>
      </div>
    );
  if (!data) return <FileSurfaceLoading />;
  const tokens = getComputedStyle(document.documentElement);
  const background = tokens.getPropertyValue("--background");
  const foreground = tokens.getPropertyValue("--foreground");
  const srcDoc = `<!doctype html><html lang="${encodeHTML(i18n.language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>@font-face{font-family:preview;src:url('${data}')}html{color-scheme:${resolvedTheme};background:${background};color:${foreground}}body{margin:0;padding:32px;font-family:preview;overflow-wrap:anywhere}h1{font-size:40px;font-weight:normal}p{line-height:1.4}small{font:12px monospace;display:block;opacity:.6;margin-bottom:8px}</style></head><body><h1>${encodeHTML(t(($) => $.font.title))}</h1><p style="font-size:24px">${encodeHTML(t(($) => $.font.alphabetUpper))}<br>${encodeHTML(t(($) => $.font.alphabetLower))}<br>0123456789 !?&amp;@#%(){}[]</p>${[12, 16, 24, 40, 64].map((size) => `<p style="font-size:${size}px"><small>${size} px</small>${encodeHTML(t(($) => $.font.sample))}</p>`).join("")}</body></html>`;
  return (
    <iframe title={props.name} srcDoc={srcDoc} sandbox="" className="min-h-0 flex-1 border-0" />
  );
}
