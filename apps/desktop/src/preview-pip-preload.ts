import type { DesktopPreviewRecordingFrame } from "@t3tools/contracts";
import { contextBridge, ipcRenderer } from "electron";

import { ANNOTATION_LABELS_CHANNEL } from "#desktop/preview/GuestProtocol";
import { PREVIEW_PICTURE_IN_PICTURE_FRAME_CHANNEL } from "./ipc/channels.ts";

contextBridge.exposeInMainWorld("previewPictureInPicture", {
  onLabels: (
    listener: (labels: { readonly language: string; readonly livePreview: string }) => void,
  ) => {
    const receive = (_event: Electron.IpcRendererEvent, labels: unknown) => {
      if (
        typeof labels !== "object" ||
        labels === null ||
        !("language" in labels) ||
        typeof labels.language !== "string" ||
        !("livePreview" in labels) ||
        typeof labels.livePreview !== "string"
      )
        return;
      listener({ language: labels.language, livePreview: labels.livePreview });
    };
    ipcRenderer.on(ANNOTATION_LABELS_CHANNEL, receive);
    return () => ipcRenderer.removeListener(ANNOTATION_LABELS_CHANNEL, receive);
  },
  onFrame: (listener: (frame: DesktopPreviewRecordingFrame) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, frame: unknown) => {
      if (typeof frame !== "object" || frame === null) return;
      listener(frame as DesktopPreviewRecordingFrame);
    };
    ipcRenderer.on(PREVIEW_PICTURE_IN_PICTURE_FRAME_CHANNEL, wrappedListener);
    return () =>
      ipcRenderer.removeListener(PREVIEW_PICTURE_IN_PICTURE_FRAME_CHANNEL, wrappedListener);
  },
});
