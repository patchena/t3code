import { createI18n } from "@t3tools/client-runtime/i18n";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { navigateAfterThreadDeletion } from "./useThreadActions";
import { toastManager } from "../components/ui/toast";

const t = createI18n("en").getFixedT(null, "workspace");

describe("navigateAfterThreadDeletion", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a rejected navigation without failing the completed deletion", async () => {
    const addToast = vi.spyOn(toastManager, "add").mockReturnValue("navigation-error");

    await expect(
      navigateAfterThreadDeletion(() => Promise.reject(new Error("route unavailable")), t),
    ).resolves.toBeUndefined();

    expect(addToast).toHaveBeenCalledOnce();
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Thread deleted, but navigation failed",
        description: "route unavailable",
      }),
    );
  });
});
