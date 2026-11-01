import { createI18n } from "@t3tools/client-runtime/i18n";
import * as Electron from "electron";

function createDesktopI18n() {
  try {
    return createI18n("en");
  } catch (error) {
    Electron.dialog.showErrorBox("T3 Code", `UI-Fehler / UI error\n${String(error)}`);
    throw error;
  }
}

export const desktopI18n = createDesktopI18n();
export const desktopT = desktopI18n.getFixedT(null, "desktop");

export function getAnnotationLabels() {
  return {
    language: desktopI18n.language,
    livePreview: desktopT(($) => $.browser.livePreview),
    describeChange: desktopT(($) => $.picker.describeChange),
    capturing: desktopT(($) => $.picker.capturing),
    expand: desktopT(($) => $.picker.expand),
    collapse: desktopT(($) => $.picker.collapse),
    drag: desktopT(($) => $.picker.drag),
    attach: desktopT(($) => $.picker.attach),
    attachHint: desktopT(($) => $.picker.attachHint),
    sendHint: desktopT(($) => $.picker.sendHint),
    font: desktopT(($) => $.picker.font),
    fontSize: desktopT(($) => $.picker.fontSize),
    fontWeight: desktopT(($) => $.picker.fontWeight),
    lineHeight: desktopT(($) => $.picker.lineHeight),
    textColor: desktopT(($) => $.picker.textColor),
    textColorValue: desktopT(($) => $.picker.textColorValue),
    background: desktopT(($) => $.picker.background),
    backgroundValue: desktopT(($) => $.picker.backgroundValue),
    opacity: desktopT(($) => $.picker.opacity),
    radius: desktopT(($) => $.picker.radius),
    borderColor: desktopT(($) => $.picker.borderColor),
    borderColorValue: desktopT(($) => $.picker.borderColorValue),
    borderWidth: desktopT(($) => $.picker.borderWidth),
    width: desktopT(($) => $.picker.width),
    height: desktopT(($) => $.picker.height),
    aspectRatio: desktopT(($) => $.picker.aspectRatio),
    padding: desktopT(($) => $.picker.padding),
    margin: desktopT(($) => $.picker.margin),
    gap: desktopT(($) => $.picker.gap),
    select: desktopT(($) => $.picker.select),
    selectHint: desktopT(($) => $.picker.selectHint),
    region: desktopT(($) => $.picker.region),
    regionHint: desktopT(($) => $.picker.regionHint),
    draw: desktopT(($) => $.picker.draw),
    drawHint: desktopT(($) => $.picker.drawHint),
    erase: desktopT(($) => $.picker.erase),
    eraseHint: desktopT(($) => $.picker.eraseHint),
    voiceStart: desktopT(($) => $.picker.voiceStart),
    voiceSettings: desktopT(($) => $.picker.voiceSettings),
    voiceCancel: desktopT(($) => $.picker.voiceCancel),
    voiceDismissError: desktopT(($) => $.picker.voiceDismissError),
    voiceFinish: desktopT(($) => $.picker.voiceFinish),
    voiceSkip: desktopT(($) => $.picker.voiceSkip),
    voiceSkipHint: desktopT(($) => $.picker.voiceSkipHint),
    voiceInput: desktopT(($) => $.picker.voiceInput),
    voiceBusy: desktopT(($) => $.picker.voiceBusy),
  };
}
