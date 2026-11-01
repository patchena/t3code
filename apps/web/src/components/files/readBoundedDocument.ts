import { FilePreviewFailure } from "~/components/files/fileFailure";
export async function readBoundedDocument(
  src: string,
  signal: AbortSignal,
  limit: number,
  cache: RequestCache = "default",
) {
  const response = await fetch(src, { signal, cache });
  if (!response.ok || Number(response.headers.get("content-length")) > limit)
    throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.unavailableOrLarge) });
  const reader = response.body?.getReader();
  if (!reader)
    throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.unavailableShort) });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new FilePreviewFailure({ describe: (t) => t(($) => $.document.tooLarge) });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).arrayBuffer();
}
