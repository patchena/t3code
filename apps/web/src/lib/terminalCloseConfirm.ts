import type { TFunction } from "@t3tools/client-runtime/i18n";
import { readLocalApi } from "~/localApi";

let pendingConfirmations = 0;

export function isTerminalCloseConfirmPending(): boolean {
  return pendingConfirmations > 0;
}

export async function confirmTerminalClose(
  labels: readonly [string, ...string[]],
  t: TFunction<"tools">,
): Promise<boolean> {
  const localApi = readLocalApi();
  if (!localApi) return true;
  const message = t(($) => $.terminalConfirm, {
    count: labels.length,
    names: labels.length === 1 ? labels[0] : labels.map((label) => `"${label}"`).join(", "),
  });
  pendingConfirmations += 1;
  try {
    return await localApi.dialogs.confirm(message, { variant: "destructive" });
  } catch {
    return false;
  } finally {
    pendingConfirmations -= 1;
  }
}
