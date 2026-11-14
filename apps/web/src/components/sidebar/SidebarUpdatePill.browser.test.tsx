import type { DesktopUpdateState } from "@t3tools/contracts";
import { createI18n } from "@t3tools/client-runtime/i18n";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render, stubGlobal } from "../../../test/render";
import type { PatcherBridge, PatchState } from "~/state/patcher";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import type { UpdateEverythingRow } from "./updateEverything.logic";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    update: null as DesktopUpdateState | null,
    hasUpdates: false,
    rows: [] as ReadonlyArray<UpdateEverythingRow>,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
});
vi.mock("../../state/desktopUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/desktopUpdate")>()),
  useDesktopUpdateState: (await import("react")).useSyncExternalStore.bind(
    null,
    mocks.subscribe,
    () => mocks.update,
  ),
}));
// The pill only renders in the desktop app.
vi.mock("../../env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../env")>()),
  isElectron: true,
}));
vi.mock("./useUpdateEverything", () => ({
  useUpdateEverything: () => ({
    hasUpdates: mocks.hasUpdates,
    summary: "Update everything",
    version: null,
    providerCount: 0,
    rows: mocks.rows,
    restarts: [],
  }),
}));

function nightlyUpdate(releaseNotes: DesktopUpdateState["releaseNotes"]): DesktopUpdateState {
  return {
    enabled: true,
    status: "available",
    channel: "nightly",
    currentVersion: "0.0.50-nightly.1",
    hostArch: "arm64",
    appArch: "arm64",
    runningUnderArm64Translation: false,
    availableVersion: "0.0.50-nightly.2",
    downloadedVersion: null,
    releaseNotes,
    omittedReleaseCount: 0,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

const RELEASE_NOTES: DesktopUpdateState["releaseNotes"] = [
  { version: "0.0.50-nightly.2", items: ["Faster sidebar."], totalItems: 1 },
];

function setup(
  update: DesktopUpdateState | null,
  {
    hasUpdates = false,
    rows = [],
  }: { hasUpdates?: boolean; rows?: ReadonlyArray<UpdateEverythingRow> } = {},
) {
  mocks.update = update;
  mocks.hasUpdates = hasUpdates;
  mocks.rows = rows;
}

function publish(update: DesktopUpdateState | null) {
  return act(() => {
    mocks.update = update;
    mocks.notify();
  });
}

const releaseNotes = () => document.querySelector('[aria-label="Update release notes"]');

describe("SidebarUpdatePill patcher", () => {
  it.each([
    ["en", "Patched update ready", "Install", "Open thread"],
    ["de", "Gepatchtes Update bereit", "Installieren", "Thread öffnen"],
  ] as const)(
    "installs a ready patch before its thread is bound in %s",
    async (language, label, install, openThread) => {
      const update: DesktopUpdateState = {
        ...nightlyUpdate([]),
        status: "downloaded",
        downloadedVersion: "0.0.50-nightly.2",
      };
      setup(update);
      const state: PatchState = {
        phase: "ready",
        job: "patch-job",
        version: update.downloadedVersion,
        message: "",
        threadLink: null,
      };
      const listeners = new Set<(state: PatchState) => void>();
      const patcher: PatcherBridge = {
        getState: async () => state,
        onState: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        waitReady: async () => true,
        cancel: async () => {},
        retry: async () => true,
      };
      const installUpdate = vi.fn(async () => ({ accepted: true, state: update }));
      using _patcher = stubGlobal("t3codePatcher", patcher);
      using _desktop = stubGlobal("desktopBridge", { installUpdate });
      await using screen = await render(<SidebarUpdatePill />, { i18n: createI18n(language) });
      await using _reset = {
        async [Symbol.asyncDispose]() {
          await act(() => {
            for (const listener of listeners) listener({ ...state, phase: "idle" });
          });
        },
      };
      await expect.element(screen.getByRole("button", { name: label, exact: true })).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Thread", exact: true }))
        .not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: label, exact: true }));
      await expect
        .element(page.getByRole("button", { name: openThread, exact: true }))
        .not.toBeInTheDocument();
      await userEvent.click(page.getByRole("button", { name: install, exact: true }));
      expect(installUpdate).toHaveBeenCalledExactlyOnceWith(update.downloadedVersion);
    },
  );
});

describe("SidebarUpdatePill release notes", () => {
  it("closes when the release notes stop applying", async () => {
    setup(nightlyUpdate(RELEASE_NOTES));
    await using _screen = await render(<SidebarUpdatePill />);
    await userEvent.tab();
    await vi.waitFor(() => expect(releaseNotes()).not.toBeNull());

    await publish(nightlyUpdate([]));
    await vi.waitFor(() => expect(releaseNotes()).toBeNull());
  });

  it("opens when release notes arrive while the trigger has keyboard focus", async () => {
    setup(nightlyUpdate([]));
    await using _screen = await render(<SidebarUpdatePill />);
    await userEvent.tab();
    expect(releaseNotes()).toBeNull();

    await publish(
      nightlyUpdate([
        {
          version: "0.0.50-nightly.2",
          items: ["**One-time tasks.** Pick a date."],
          totalItems: 1,
          stats: "3 changes from 2 contributors",
          footer: "Plus 2 more bug fixes.",
        },
      ]),
    );
    await expect.element(page.getByText("One-time tasks.", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Plus 2 more bug fixes.")).toBeVisible();
  });
});

describe("SidebarUpdatePill update everything", () => {
  it("does not refocus the update button after a pointer cancel", async () => {
    setup(null, { hasUpdates: true });
    await using screen = await render(<SidebarUpdatePill />);
    const button = screen.getByRole("button", { name: "Update everything" });
    await userEvent.click(button);
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect.element(cancel).toBeVisible();

    await userEvent.click(cancel);
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
    expect(document.activeElement).not.toBe(button.element());
  });

  it("returns focus to the update button after Escape", async () => {
    setup(null, { hasUpdates: true });
    await using screen = await render(<SidebarUpdatePill />);
    const button = screen.getByRole("button", { name: "Update everything" });
    await userEvent.click(button);
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(document.activeElement).toBe(button.element()));
  });

  it("exposes the machines as a table with each value in its column", async () => {
    const label = "DESKTOP-WORKSTATION-UPSTAIRS";
    setup(null, {
      hasUpdates: true,
      rows: [{ environmentId: null, label, app: "this-app", skipped: null, providers: ["Claude"] }],
    });
    await using screen = await render(<SidebarUpdatePill />);
    await userEvent.click(screen.getByRole("button", { name: "Update everything" }));

    const table = page.getByRole("table");
    await expect.element(table.getByRole("columnheader", { name: "Machine" })).toBeVisible();
    await expect.element(table.getByRole("columnheader", { name: "T3 Code" })).toBeVisible();
    await expect.element(table.getByRole("columnheader", { name: "Providers" })).toBeVisible();
    const row = table.getByRole("row", { name: new RegExp(label) });
    await expect.element(row.getByRole("cell", { name: label, exact: true })).toBeVisible();
    await expect.element(row.getByRole("cell", { name: "Claude", exact: true })).toBeVisible();
  });
});
