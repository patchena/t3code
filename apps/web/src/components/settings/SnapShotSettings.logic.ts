import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(
  state: DesktopSnapShotState | null,
  enabled: boolean,
  t: TFunction<"settings">,
): string {
  if (!state) return t(($) => $.extra.captureStatus.checking);
  if (state.mode === "unavailable")
    return state.message ?? t(($) => $.extra.captureStatus.unsupported);
  if (!enabled) return t(($) => $.extra.captureStatus.turnOn);
  return snapShotSetupSummary(state, enabled, t);
}

export function snapShotSetupSummary(
  state: DesktopSnapShotState,
  enabled: boolean,
  t: TFunction<"settings">,
): string {
  if (state.message) return t(($) => $.extra.captureStatus.attention);
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error"
      ? t(($) => $.extra.captureStatus.checkAccess)
      : t(($) => $.extra.captureStatus.installHelper);
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return t(($) => $.extra.captureStatus.setupActive);
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error"
      ? t(($) => $.extra.captureStatus.checkAccess)
      : t(($) => $.extra.captureStatus.installHelper);
  if (captureSetupBackend(state) === "picker") return t(($) => $.extra.captureStatus.manual);
  if (!enabled) return t(($) => $.extra.captureStatus.enable);
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland"
      ? t(($) => $.extra.captureStatus.connecting)
      : t(($) => $.extra.captureStatus.waiting);
  if (state.shortcutVerified) return t(($) => $.extra.captureStatus.ready);
  if (state.linuxBackend === "niri" && state.shortcutBinding)
    return t(($) => $.extra.captureStatus.useShortcut);
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return t(($) => $.extra.captureStatus.useShortcut);
  if (state.shortcutRegistered)
    return state.shortcutLabel
      ? t(($) => $.extra.captureStatus.ready)
      : t(($) => $.extra.captureStatus.saved);
  return t(($) => $.extra.captureStatus.finish);
}

export function snapShotShortcutStatus(
  state: DesktopSnapShotState | null,
  t: TFunction<"settings">,
): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending) return t(($) => $.extra.captureStatus.approve);
  if (state.shortcutRegistered)
    return state.mode === "portal" ? null : t(($) => $.extra.captureStatus.savedSentence);
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(
  state: DesktopSnapShotState | null,
  t: TFunction<"settings">,
): string {
  if (!state) return t(($) => $.extra.captureStatus.continueSetup);
  if (captureSetupAccessReady(state)) return t(($) => $.extra.captureStatus.manage);
  const desktop = captureSetupDesktopName(state);
  return desktop
    ? t(($) => $.extra.captureStatus.setupDesktop, { desktop })
    : t(($) => $.extra.captureStatus.continueSetup);
}

export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
  t: TFunction<"settings">,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? t(($) => $.extra.captureStatus.effectsUnsupported)
      : t(($) => $.extra.captureStatus.effectsHelper);
  if (state.linuxBackend === "niri") return t(($) => $.extra.captureStatus.effectsNiri);
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? t(($) => $.extra.captureStatus.effectsUnsupported)
      : t(($) => $.extra.captureStatus.effectsHelper);
  return state.linuxBackend === "gnome-extension"
    ? t(($) => $.extra.captureStatus.effectsGnome)
    : captureSetupBackend(state) === "gnome"
      ? t(($) => $.extra.captureStatus.finishExtension)
      : t(($) => $.extra.captureStatus.effectsUnsupported);
}

export function snapShotDescription(
  state: DesktopSnapShotState | null,
  t: TFunction<"settings">,
): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? t(($) => $.extra.captureStatus.automaticUnavailable)
    : t(($) => $.extra.captureStatus.description);
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
  t: TFunction<"settings">,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return t(($) => $.extra.captureStatus.onlyScreenshot);
  return undefined;
}

export function snapShotUnavailableMessage(
  hasBridge: boolean,
  t: TFunction<"settings">,
): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? t(($) => $.extra.captureStatus.updateApp)
    : t(($) => $.extra.captureStatus.onlyDesktop);
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
