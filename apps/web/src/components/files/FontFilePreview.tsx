import { lazy, Suspense } from "react";

import { FileSurfaceLoading } from "./fileSurfaceChrome";

const FontViewer = lazy(() =>
  import("~/components/files/FontViewer").then((module) => ({ default: module.FontViewer })),
);

export function FontFilePreview(props: { readonly src: string; readonly name: string }) {
  return (
    <Suspense fallback={<FileSurfaceLoading />}>
      <FontViewer key={props.src} {...props} />
    </Suspense>
  );
}
