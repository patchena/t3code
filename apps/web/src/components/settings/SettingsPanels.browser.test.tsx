import type { DesktopUpdateState } from "@t3tools/contracts";
import { createI18n } from "@t3tools/client-runtime/i18n";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render, stubGlobal } from "~/../test/render";
import { AboutSettingsPanel } from "~/components/settings/SettingsPanels";

const mocks = vi.hoisted(() => ({ update: null as DesktopUpdateState | null }));

vi.mock("~/state/desktopUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/state/desktopUpdate")>()),
  useDesktopUpdateState: () => mocks.update,
}));
vi.mock("~/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/env")>()),
  isElectron: true,
}));

it.each([
  ["en", true],
  ["de", true],
  ["en", false],
  ["de", false],
] as const)(
  "respects patch approval when downloading from settings in %s (approved: %s)",
  async (language, approved) => {
    const update: DesktopUpdateState = {
      enabled: true,
      status: "available",
      channel: "nightly",
      currentVersion: "0.0.50-nightly.1",
      hostArch: "arm64",
      appArch: "arm64",
      runningUnderArm64Translation: false,
      availableVersion: "0.0.50-nightly.2",
      downloadedVersion: null,
      releaseNotes: [],
      omittedReleaseCount: 0,
      downloadPercent: null,
      checkedAt: null,
      message: null,
      errorContext: null,
      canRetry: false,
    };
    mocks.update = update;
    const downloaded: DesktopUpdateState = {
      ...update,
      status: "downloaded",
      downloadedVersion: update.availableVersion,
    };
    let approve!: (ready: boolean) => void;
    const approval = new Promise<boolean>((resolve) => {
      approve = resolve;
    });
    const waitReady = vi.fn(() => approval);
    const downloadUpdate = vi.fn(async () => ({ completed: true, state: downloaded }));
    const installUpdate = vi.fn(async () => ({ accepted: true, state: downloaded }));
    using _patcher = stubGlobal("t3codePatcher", { waitReady });
    using _desktop = stubGlobal("desktopBridge", { downloadUpdate, installUpdate });
    const i18n = createI18n(language);
    await using screen = await render(<AboutSettingsPanel />, { i18n });

    await userEvent.click(
      screen.getByRole("button", {
        name: i18n.t(($) => $.panels.download, { ns: "settings" }),
        exact: true,
      }),
    );
    await vi.waitFor(() => expect(waitReady).toHaveBeenCalledOnce());
    expect(installUpdate).not.toHaveBeenCalled();
    await act(() => approve(approved));
    if (approved) {
      await vi.waitFor(() =>
        expect(installUpdate).toHaveBeenCalledExactlyOnceWith(downloaded.downloadedVersion),
      );
    } else {
      expect(installUpdate).not.toHaveBeenCalled();
    }
  },
);
