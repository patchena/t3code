import type { ServerConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { createI18n } from "@t3tools/client-runtime/i18n";

import { resolveEnvironmentIconPickerLock } from "./EnvironmentIconPicker";

const config = { environment: { capabilities: {} } } as unknown as ServerConfig;

describe("resolveEnvironmentIconPickerLock", () => {
  it("waits for a settings grant before allowing changes", () => {
    const t = createI18n("en").getFixedT(null, "connect");
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config, operateAccess: "pending" }, t),
    ).toMatch(/cannot change/);
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config, operateAccess: "granted" }, t),
    ).toBeNull();
  });
});
