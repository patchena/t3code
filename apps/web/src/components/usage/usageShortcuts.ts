import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import type { UsageChartMetric } from "./UsageProviderChart";
import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = UsageChartMetric | "limits";
export const METRIC_OPTIONS = [
  {
    value: "cost",
    label: (t: TFunction<"files">) => t(($) => $.usage.cost),
    command: "usage.cost",
  },
  {
    value: "tokens",
    label: (t: TFunction<"files">) => t(($) => $.usage.tokens),
    command: "usage.tokens",
  },
  {
    value: "limits",
    label: (t: TFunction<"files">) => t(($) => $.usage.limits),
    command: "usage.limits",
  },
] as const satisfies readonly {
  value: UsageMetric;
  label: (t: TFunction<"files">) => string;
  command: KeybindingCommand;
}[];

export const WINDOW_OPTIONS = [
  {
    days: 1,
    label: (t: TFunction<"files">) => t(($) => $.usage.pastDay),
    command: "usage.period.day",
  },
  {
    days: 7,
    label: (t: TFunction<"files">) => t(($) => $.usage.sevenDays),
    command: "usage.period.week",
  },
  {
    days: 30,
    label: (t: TFunction<"files">) => t(($) => $.usage.thirtyDays),
    command: "usage.period.month",
  },
  {
    days: 90,
    label: (t: TFunction<"files">) => t(($) => $.usage.ninetyDays),
    command: "usage.period.quarter",
  },
] as const;

export function resolveUsageShortcut(
  event: ShortcutEventLike & { target: EventTarget | null },
  keybindings: ResolvedKeybindingsConfig,
) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable ||
      target.closest(
        '[role="dialog"]:not([data-app-modal]), [aria-modal="true"]:not([data-app-modal]), [data-slot$="popup"]:not([data-app-modal])',
      ))
  ) {
    return null;
  }

  return resolveShortcutCommand(event, keybindings, {
    context: { usagePageOpen: true },
  });
}
