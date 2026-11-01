import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { COMPOSER_CONTEXT_CLIPBOARD_MIME } from "@t3tools/shared/composerContextClipboard";
import { createI18n } from "@t3tools/client-runtime/i18n";

import {
  ClipboardApiUnavailableError,
  ClipboardWriteError,
  clipboardErrorMessage,
  writeTextToClipboard,
} from "~/hooks/useCopyToClipboard";

describe("writeTextToClipboard", () => {
  it("localizes structured error presentation while preserving diagnostics and target names", async () => {
    const instance = createI18n("de");
    const t = instance.getFixedT(null, "common");
    const error = new ClipboardWriteError({
      target: "branch name",
      cause: new Error("permission denied"),
    });
    expect(error.message).toBe("Failed to copy branch name to the clipboard.");
    expect(clipboardErrorMessage(error, t)).toBe(
      "Branch-Name konnte nicht in die Zwischenablage kopiert werden.",
    );
    const target = "source<model>&{{name}}.ts";
    expect(clipboardErrorMessage(new ClipboardApiUnavailableError({ target }), t)).toBe(
      `Die Zwischenablage ist beim Kopieren von ${target} nicht verfügbar.`,
    );
    expect(clipboardErrorMessage(new Error("Native browser diagnostic"), t)).toBe(
      "Native browser diagnostic",
    );
    await instance.changeLanguage("en");
    expect(clipboardErrorMessage(error, t)).toBe(error.message);
  });
  it("reserves plain text even when an extra flavor attempts to replace it", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { write, writeText: vi.fn() } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    await expect(
      writeTextToClipboard("original", "message", {
        "text/plain": "replacement",
        "text/html": "<b>original</b>",
      }),
    ).resolves.toBe(true);
    const items = write.mock.calls[0]![0] as Array<{ data: Record<string, Blob> }>;
    expect(await items[0]!.data["text/plain"]!.text()).toBe("original");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps caller-built rich HTML when attaching a context fragment", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { write, writeText: vi.fn() } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    const fragment = JSON.stringify({ version: 1, source: {}, records: [] });
    const rich = "<p><strong>Message</strong></p>";

    await expect(
      writeTextToClipboard("Message", "message", {
        [COMPOSER_CONTEXT_CLIPBOARD_MIME]: fragment,
        "text/html": rich,
      }),
    ).resolves.toBe(true);

    const items = write.mock.calls[0]![0] as Array<{ data: Record<string, Blob> }>;
    const html = await items[0]!.data["text/html"]!.text();
    expect(html).toContain(rich);
    expect(html).toContain("data-t3-context-fragment=");
  });
});
