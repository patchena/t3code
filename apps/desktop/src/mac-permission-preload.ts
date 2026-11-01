import type { MacPermissionHelperLabels } from "#desktop/permissions/MacPermission";
import { ipcRenderer } from "electron";
import { MAC_PERMISSION_HELPER_CHANNEL } from "./ipc/channels.ts";

ipcRenderer.on(MAC_PERMISSION_HELPER_CHANNEL, (_event, labels: MacPermissionHelperLabels) => {
  document.documentElement.lang = labels.language;
  document.title = labels.title;
  document.getElementById("close")?.setAttribute("aria-label", labels.close);
  const instruction = document.getElementById("instruction");
  if (instruction) instruction.textContent = labels.drag;
  document.getElementById("app")?.setAttribute("aria-label", labels.reveal);
});

window.addEventListener("DOMContentLoaded", () => {
  const send = (action: "drag" | "finder" | "close") =>
    ipcRenderer.send(MAC_PERMISSION_HELPER_CHANNEL, action);
  document.getElementById("app")?.addEventListener("dragstart", (event) => {
    event.preventDefault();
    send("drag");
  });
  document.getElementById("app")?.addEventListener("click", () => send("finder"));
  document.getElementById("close")?.addEventListener("click", () => send("close"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") send("close");
  });
});
