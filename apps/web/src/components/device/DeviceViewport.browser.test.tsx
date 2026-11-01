import { createI18n } from "@t3tools/client-runtime/i18n";
import { resolveDeviceShape } from "@t3tools/client-runtime/device/shape-profile";
import type { DeviceStreamClient } from "@t3tools/client-runtime/device/stream";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { DeviceDuoViewport } from "~/components/device/DeviceDuoViewport";
import { DevicePhoneViewport } from "~/components/device/DevicePhoneViewport";

const state = vi.hoisted(() => ({
  mount: vi.fn<(canvas: HTMLCanvasElement) => () => void>(),
  dispose: vi.fn<() => void>(),
}));

vi.mock(import("./mountDeviceViewer"), () => ({ mountDeviceViewer: state.mount }));

it.each(["phone", "duo"] as const)("keeps the %s viewer while changing language", async (kind) => {
  state.dispose.mockReset();
  state.mount.mockReset().mockImplementation(() => state.dispose);
  const i18n = createI18n("en");
  const client: DeviceStreamClient = {
    start: vi.fn(),
    stop: vi.fn(),
    setMjpegImage: vi.fn(),
    sendTouch: vi.fn(),
    sendKey: vi.fn(),
    sendText: vi.fn(),
    pressButton: vi.fn(),
    rotate: vi.fn(),
    setOrientation: vi.fn(),
    controlDuo: vi.fn(),
    setDuoPanels: vi.fn(),
    sendRawTouch: vi.fn(),
  };
  const shared = {
    source: document.createElement("canvas"),
    onFrameListener: vi.fn(),
    onResetReady: vi.fn(),
    onInputCancel: vi.fn(),
    onUnavailable: vi.fn(),
    client,
    screen: null,
  };
  await using screen = await render(
    kind === "phone" ? (
      <DevicePhoneViewport
        {...shared}
        profile={resolveDeviceShape({ platform: "ios", portraitAspect: 0.5 })}
        model={null}
        accessory={null}
        foldAngle={null}
      />
    ) : (
      <DeviceDuoViewport
        {...shared}
        model={{ id: "iphone-duo", url: "test.glb" }}
        hingePreview={null}
        onControlRejectedListener={vi.fn()}
      />
    ),
    { i18n },
  );
  await expect.element(screen.getByLabelText(/^Interactive 3D/)).toBeInTheDocument();
  await act(() => i18n.changeLanguage("de"));
  await expect.element(screen.getByLabelText(/^Interaktives 3D/)).toBeInTheDocument();
  expect(state.mount).toHaveBeenCalledTimes(1);
  expect(state.dispose).not.toHaveBeenCalled();
});
