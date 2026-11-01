import { lazy, Suspense } from "react";
import { FileSurfaceLoading } from "./fileSurfaceChrome";

const LargeTextViewer = lazy(() =>
  import("~/components/files/LargeTextViewer").then((module) => ({
    default: module.LargeTextViewer,
  })),
);
export function DelimitedTablePreview(props: {
  readonly name: string;
  readonly text: string;
  readonly delimiter: "," | "\t";
}) {
  return (
    <Suspense fallback={<FileSurfaceLoading />}>
      <LargeTextViewer key={props.name} {...props} />
    </Suspense>
  );
}
