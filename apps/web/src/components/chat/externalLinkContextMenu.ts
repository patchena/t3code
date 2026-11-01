import type { ContextMenuItem } from "@t3tools/contracts";
import { isTranslationError, type TFunction } from "@t3tools/client-runtime/i18n";

type ExternalLinkContextMenuAction =
  | "open-in-preview"
  | "open-external"
  | "copy-link"
  | "link-to-thread"
  | "unlink-from-thread";

type ExternalLinkContextMenuFailureOperation =
  | "show-link-context-menu"
  | "open-link-in-preview"
  | "open-link-external"
  | "copy-link"
  | "link-pull-request-to-thread"
  | "unlink-pull-request-from-thread";

const FAILURE_OPERATION_BY_ACTION = {
  "open-in-preview": "open-link-in-preview",
  "open-external": "open-link-external",
  "copy-link": "copy-link",
  "link-to-thread": "link-pull-request-to-thread",
  "unlink-from-thread": "unlink-pull-request-from-thread",
} as const satisfies Record<ExternalLinkContextMenuAction, ExternalLinkContextMenuFailureOperation>;

function externalLinkContextMenuItems(
  options: {
    readonly canOpenInPreview: boolean;
    readonly threadLinkAction?: "link-to-thread" | "unlink-from-thread" | undefined;
  },
  t: TFunction<"chat">,
): readonly ContextMenuItem<ExternalLinkContextMenuAction>[] {
  const menu = [
    { id: "open-in-preview", label: t(($) => $.markdown.openIntegrated) },
    { id: "open-external", label: t(($) => $.markdown.openSystem) },
    { id: "copy-link", label: t(($) => $.markdown.copyLink) },
  ] as const satisfies readonly ContextMenuItem<ExternalLinkContextMenuAction>[];
  const items = options.canOpenInPreview
    ? menu
    : menu.filter((item) => item.id !== "open-in-preview");
  if (options.threadLinkAction === undefined) return items;
  return [
    {
      id: options.threadLinkAction,
      label:
        options.threadLinkAction === "link-to-thread"
          ? t(($) => $.markdown.linkThread)
          : t(($) => $.markdown.unlinkThread),
    },
    ...items,
  ];
}

interface ShowExternalLinkContextMenuOptions {
  readonly href: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly canOpenInPreview?: boolean;
  readonly threadLinkAction?: "link-to-thread" | "unlink-from-thread" | undefined;
  readonly showContextMenu: (
    items: readonly ContextMenuItem<ExternalLinkContextMenuAction>[],
    position: { readonly x: number; readonly y: number },
  ) => Promise<ExternalLinkContextMenuAction | null>;
  readonly openInPreview: (href: string) => Promise<void>;
  readonly openExternal: (href: string) => Promise<void>;
  readonly copyLink: (href: string) => Promise<unknown>;
  readonly updateThreadLink?: (href: string, linked: boolean) => Promise<void>;
  readonly reportFailure: (
    operation: ExternalLinkContextMenuFailureOperation,
    cause: unknown,
  ) => void;
}

function resolveExternalWebLink(href: string | null | undefined): URL | null {
  if (!href) return null;
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveExternalWebLinkHref(href: string | null | undefined): string | null {
  return resolveExternalWebLink(href)?.href ?? null;
}

export function resolveExternalWebLinkHost(href: string | undefined): string | null {
  return resolveExternalWebLink(href)?.hostname || null;
}

export async function showExternalLinkContextMenu(
  {
    href,
    position,
    canOpenInPreview = true,
    threadLinkAction,
    showContextMenu,
    openInPreview,
    openExternal,
    copyLink,
    updateThreadLink,
    reportFailure,
  }: ShowExternalLinkContextMenuOptions,
  t: TFunction<"chat">,
): Promise<void> {
  let action: ExternalLinkContextMenuAction | null;
  try {
    action = await showContextMenu(
      externalLinkContextMenuItems({ canOpenInPreview, threadLinkAction }, t),
      position,
    );
  } catch (cause) {
    if (isTranslationError(cause)) throw cause;
    reportFailure("show-link-context-menu", cause);
    return;
  }

  try {
    if (action === "open-in-preview") {
      await openInPreview(href);
    } else if (action === "open-external") {
      await openExternal(href);
    } else if (action === "copy-link") {
      await copyLink(href);
    } else if (action === "link-to-thread" || action === "unlink-from-thread") {
      await updateThreadLink?.(href, action === "link-to-thread");
    }
  } catch (cause) {
    if (isTranslationError(cause)) throw cause;
    if (action) reportFailure(FAILURE_OPERATION_BY_ACTION[action], cause);
  }
}
