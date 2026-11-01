import { FilePreviewFailure } from "~/components/files/fileFailure";
import { BINARY_PREVIEW_MAX_BYTES } from "./binaryPreviewProtocol";

export async function readBinaryPreview(src: string, signal: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok)
    throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.fileLoadRetry) });
  if (Number(response.headers.get("content-length")) > BINARY_PREVIEW_MAX_BYTES)
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
      if (size > BINARY_PREVIEW_MAX_BYTES)
        throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.limit50) });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).arrayBuffer();
}
