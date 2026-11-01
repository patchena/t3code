import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export function revealInFileExplorerLabel(platform: string, t: TFunction<"tools">): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return t(($) => $.previewRevealFinder);
  if (normalized.includes("win")) return t(($) => $.previewRevealExplorer);
  return t(($) => $.previewRevealFiles);
}

export function revealInFileExplorerLabelForOs(
  os: ExecutionEnvironmentPlatformOs,
  t: TFunction<"tools">,
): string {
  if (os === "darwin") return t(($) => $.previewRevealFinder);
  if (os === "windows") return t(($) => $.previewRevealExplorer);
  return t(($) => $.previewRevealFiles);
}

export function revealInFileExplorerLabelForKind(
  kind: FileManagerRevealKind,
  t: TFunction<"tools">,
): string {
  if (kind === "finder") return t(($) => $.previewRevealFinder);
  if (kind === "file-explorer") return t(($) => $.previewRevealExplorer);
  return t(($) => $.previewRevealFiles);
}
