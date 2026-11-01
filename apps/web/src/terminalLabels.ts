import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { TerminalSummary } from "@t3tools/contracts";
import { terminalNumber } from "@t3tools/shared/terminalLabels";

export function getTerminalLabel(terminalId: string, t: TFunction<"tools">): string {
  const number = terminalNumber(terminalId);
  return number ? t(($) => $.terminalNumber, { number }) : terminalId;
}

export function resolveTerminalSessionLabel(
  terminalId: string,
  summary: Pick<TerminalSummary, "label"> | null | undefined,
  t: TFunction<"tools">,
): string {
  return summary?.label?.trim() || getTerminalLabel(terminalId, t);
}
