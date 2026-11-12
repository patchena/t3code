import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Electron from "electron";
import type { InterfaceLanguage } from "@t3tools/contracts/settings";
import { desktopI18n, desktopT } from "#desktop/i18n";

import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

export class DesktopApplicationMenuActionError extends Schema.TaggedError<DesktopApplicationMenuActionError>()(
  "DesktopApplicationMenuActionError",
  {
    action: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Desktop menu action "${this.action}" failed.`;
  }
}

export class DesktopApplicationMenuLanguageError extends Schema.TaggedError<DesktopApplicationMenuLanguageError>()(
  "DesktopApplicationMenuLanguageError",
  { language: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `Could not update the native interface language to ${this.language}.`;
  }
}

export class DesktopApplicationMenu extends Context.Service<
  DesktopApplicationMenu,
  {
    readonly configure: Effect.Effect<void>;
    readonly setLanguage: (
      language: InterfaceLanguage,
    ) => Effect.Effect<void, DesktopApplicationMenuLanguageError>;
  }
>()("@t3tools/desktop/window/DesktopApplicationMenu") {}

type DesktopApplicationMenuRuntimeServices =
  | DesktopUpdates.DesktopUpdates
  | DesktopWindow.DesktopWindow
  | ElectronDialog.ElectronDialog;

const { logInfo: logUpdaterInfo } = makeComponentLogger("desktop-updater");

const { logError: logMenuError } = makeComponentLogger("desktop-menu");

const dispatchMenuAction = Effect.fn("desktop.menu.dispatchMenuAction")(function* (
  action: string,
): Effect.fn.Return<void, DesktopWindow.DesktopWindowError, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.dispatchMenuAction(action, {
    reveal: action !== "paste-as-text",
  });
});

const zoomMainWindow = Effect.fn("desktop.menu.zoomMainWindow")(function* (
  direction: DesktopWindow.MainWindowZoomDirection,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.zoomMain(direction);
});

const runMainContentsCommand = Effect.fn("desktop.menu.runMainContentsCommand")(function* (
  command: DesktopWindow.MainWindowContentsCommand,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.runMainContentsCommand(command);
});

const checkForUpdatesFromMenu = Effect.gen(function* () {
  const updates = yield* DesktopUpdates.DesktopUpdates;
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const result = yield* updates.check("menu");
  const updateState = result.state;

  if (updateState.status === "up-to-date") {
    yield* electronDialog.showMessageBox({
      type: "info",
      title: desktopT(($) => $.updates.current),
      message: desktopT(($) => $.updates.newest, { version: updateState.currentVersion }),
      buttons: [desktopT(($) => $.updates.ok)],
    });
  } else if (updateState.status === "error") {
    yield* electronDialog.showMessageBox({
      type: "warning",
      title: desktopT(($) => $.updates.failed),
      message: desktopT(($) => $.updates.cannotCheck),
      detail: updateState.message ?? desktopT(($) => $.updates.unknownError),
      buttons: [desktopT(($) => $.updates.ok)],
    });
  }
}).pipe(Effect.withSpan("desktop.menu.checkForUpdates"));

const handleCheckForUpdatesMenuClick = Effect.gen(function* () {
  const updates = yield* DesktopUpdates.DesktopUpdates;
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const disabledReason = yield* updates.disabledReason;
  if (Option.isSome(disabledReason)) {
    yield* logUpdaterInfo("manual update check requested, but updates are disabled", {
      disabledReason: disabledReason.value,
    });
    yield* electronDialog.showMessageBox({
      type: "info",
      title: desktopT(($) => $.updates.unavailable),
      message: desktopT(($) => $.updates.unavailableNow),
      detail: disabledReason.value,
      buttons: [desktopT(($) => $.updates.ok)],
    });
    return;
  }

  // Opening a window before backend confirmation can strand it on failed auth bootstrap.
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.activate;
  yield* checkForUpdatesFromMenu;
}).pipe(Effect.withSpan("desktop.menu.handleCheckForUpdatesClick"));

/** @public */
export const make = Effect.gen(function* () {
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const context = yield* Effect.context<DesktopApplicationMenuRuntimeServices>();
  const runPromise = Effect.runPromiseWith(context);

  const runMenuEffect = <E>(
    action: string,
    effect: Effect.Effect<void, E, DesktopApplicationMenuRuntimeServices>,
  ) => {
    void runPromise(
      effect.pipe(
        Effect.annotateLogs({ action }),
        Effect.withSpan("desktop.menu.action"),
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            const error = new DesktopApplicationMenuActionError({ action, cause });
            yield* logMenuError(error.message, { error });
            const dialog = yield* ElectronDialog.ElectronDialog;
            yield* dialog.showErrorBox("T3 Code", `UI-Fehler / UI error\n${Cause.pretty(cause)}`);
          }),
        ),
      ),
    );
  };

  const configure = Effect.gen(function* () {
    const checkForUpdatesClick = () => {
      runMenuEffect("check-for-updates", handleCheckForUpdatesMenuClick);
    };
    const settingsClick = () => {
      runMenuEffect("open-settings", dispatchMenuAction("open-settings"));
    };
    // Chromium and the renderer already handle this chord; injecting another paste duplicates text.
    const pasteAsTextClick = (
      _item: Electron.MenuItem,
      _window: Electron.BaseWindow | undefined,
      event: Electron.KeyboardEvent,
    ) => {
      if (event.triggeredByAccelerator === true) return;
      runMenuEffect("paste-as-text", dispatchMenuAction("paste-as-text"));
    };
    const zoomClick = (direction: DesktopWindow.MainWindowZoomDirection) => () => {
      runMenuEffect(`zoom-${direction}`, zoomMainWindow(direction));
    };
    const mainContentsClick = (command: DesktopWindow.MainWindowContentsCommand) => () => {
      runMenuEffect(command, runMainContentsCommand(command));
    };
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (environment.platform === "darwin") {
      template.push({
        label: environment.displayName,
        submenu: [
          { role: "about", label: desktopT(($) => $.menu.about, { app: environment.displayName }) },
          {
            label: desktopT(($) => $.menu.checkUpdates),
            click: checkForUpdatesClick,
          },
          { type: "separator" },
          {
            label: desktopT(($) => $.menu.settings),
            accelerator: "CmdOrCtrl+,",
            click: settingsClick,
          },
          { type: "separator" },
          { role: "services", label: desktopT(($) => $.menu.services) },
          { type: "separator" },
          { role: "hide", label: desktopT(($) => $.menu.hide, { app: environment.displayName }) },
          { role: "hideOthers", label: desktopT(($) => $.menu.hideOthers) },
          { role: "unhide", label: desktopT(($) => $.menu.showAll) },
          { type: "separator" },
          {
            role: "quit",
            label: desktopT(($) => $.menu.quitApp, { app: environment.displayName }),
          },
        ],
      });
    }

    template.push(
      {
        label: desktopT(($) => $.menu.file),
        submenu: [
          ...(environment.platform === "darwin"
            ? []
            : [
                {
                  label: desktopT(($) => $.menu.settings),
                  accelerator: "CmdOrCtrl+,",
                  click: settingsClick,
                },
                { type: "separator" as const },
              ]),
          {
            label: desktopT(($) => $.menu.closeDevTools),
            accelerator: "CmdOrCtrl+W",
            visible: false,
            click: () => {
              Electron.webContents
                .getAllWebContents()
                .find((contents) => !contents.isDestroyed() && contents.isDevToolsFocused())
                ?.closeDevTools();
            },
          },
          // Cmd/Ctrl+W belongs to the renderer's tab close; it must never close the window.
          environment.platform === "darwin"
            ? {
                label: desktopT(($) => $.menu.closeWindow),
                click: (_item, window) => window?.close(),
              }
            : { role: "quit", label: desktopT(($) => $.menu.quit) },
        ],
      },
      {
        label: desktopT(($) => $.menu.edit),
        submenu: [
          { role: "undo", label: desktopT(($) => $.menu.undo) },
          { role: "redo", label: desktopT(($) => $.menu.redo) },
          { type: "separator" },
          { role: "cut", label: desktopT(($) => $.menu.cut) },
          { role: "copy", label: desktopT(($) => $.menu.copy) },
          { role: "paste", label: desktopT(($) => $.menu.paste) },
          {
            label: desktopT(($) => $.menu.pasteText),
            accelerator: "CmdOrCtrl+Shift+V",
            click: pasteAsTextClick,
          },
          { role: "delete", label: desktopT(($) => $.menu.delete) },
          { type: "separator" },
          { role: "selectAll", label: desktopT(($) => $.menu.selectAll) },
          ...(environment.platform === "darwin"
            ? [
                { type: "separator" as const },
                {
                  label: desktopT(($) => $.menu.speech),
                  submenu: [
                    {
                      role: "startSpeaking" as const,
                      label: desktopT(($) => $.menu.startSpeaking),
                    },
                    { role: "stopSpeaking" as const, label: desktopT(($) => $.menu.stopSpeaking) },
                  ],
                },
              ]
            : []),
        ],
      },
      {
        label: desktopT(($) => $.menu.view),
        submenu: [
          /* Native reload/DevTools/zoom roles target focused guests; these commands must target the app. */
          {
            label: desktopT(($) => $.menu.reload),
            accelerator: "CmdOrCtrl+R",
            click: mainContentsClick("reload"),
          },
          {
            label: desktopT(($) => $.menu.forceReload),
            accelerator: "Shift+CmdOrCtrl+R",
            click: mainContentsClick("forceReload"),
          },
          {
            label: desktopT(($) => $.menu.devTools),
            accelerator: environment.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
            click: mainContentsClick("toggleDevTools"),
          },
          { type: "separator" },
          {
            label: desktopT(($) => $.menu.actualSize),
            accelerator: "CmdOrCtrl+0",
            click: zoomClick("reset"),
          },
          {
            label: desktopT(($) => $.menu.zoomIn),
            accelerator: "CmdOrCtrl+=",
            click: zoomClick("in"),
          },
          {
            label: desktopT(($) => $.menu.zoomIn),
            accelerator: "CmdOrCtrl+Plus",
            visible: false,
            click: zoomClick("in"),
          },
          ...(environment.platform === "darwin"
            ? [
                {
                  label: desktopT(($) => $.menu.zoomIn),
                  accelerator: "CmdOrCtrl+Shift+=",
                  visible: false,
                  click: zoomClick("in"),
                },
              ]
            : []),
          {
            label: desktopT(($) => $.menu.zoomOut),
            accelerator: "CmdOrCtrl+-",
            click: zoomClick("out"),
          },
          // Keypad codes do not match number-row accelerators.
          {
            label: desktopT(($) => $.menu.actualSize),
            accelerator: "CmdOrCtrl+num0",
            visible: false,
            click: zoomClick("reset"),
          },
          {
            label: desktopT(($) => $.menu.zoomIn),
            accelerator: "CmdOrCtrl+numadd",
            visible: false,
            click: zoomClick("in"),
          },
          {
            label: desktopT(($) => $.menu.zoomOut),
            accelerator: "CmdOrCtrl+numsub",
            visible: false,
            click: zoomClick("out"),
          },
          { type: "separator" },
          { role: "togglefullscreen", label: desktopT(($) => $.menu.fullscreen) },
        ],
      },
      {
        // Electron's default Window submenu adds a Ctrl+W close role off macOS.
        role: "windowMenu",
        label: desktopT(($) => $.menu.window),
        submenu: [
          { role: "minimize", label: desktopT(($) => $.menu.minimize) },
          { role: "zoom", label: desktopT(($) => $.menu.zoom) },
          ...(environment.platform === "darwin"
            ? [
                { type: "separator" as const },
                { role: "front" as const, label: desktopT(($) => $.menu.front) },
              ]
            : []),
        ],
      },
      {
        role: "help",
        label: desktopT(($) => $.menu.help),
        submenu: [
          {
            label: desktopT(($) => $.menu.checkUpdates),
            click: checkForUpdatesClick,
          },
        ],
      },
    );

    yield* electronMenu.setApplicationMenu(template);
  }).pipe(Effect.withSpan("desktop.menu.configure"));

  const setLanguage = Effect.fn("desktop.menu.setLanguage")(function* (
    language: InterfaceLanguage,
  ) {
    if (desktopI18n.language === language) return;
    const previousLanguage = desktopI18n.language;
    yield* Effect.tryPromise({
      try: () => desktopI18n.changeLanguage(language),
      catch: (cause) => new DesktopApplicationMenuLanguageError({ language, cause }),
    }).pipe(
      Effect.andThen(configure),
      Effect.catchCause((cause) =>
        Effect.tryPromise({
          try: () => desktopI18n.changeLanguage(previousLanguage),
          catch: (rollbackCause) =>
            new DesktopApplicationMenuLanguageError({
              language,
              cause: { update: cause, rollback: rollbackCause },
            }),
        }).pipe(
          Effect.andThen(Effect.fail(new DesktopApplicationMenuLanguageError({ language, cause }))),
        ),
      ),
    );
  });

  return DesktopApplicationMenu.of({ configure, setLanguage });
});

export const layer = Layer.effect(DesktopApplicationMenu, make);
