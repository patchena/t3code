import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  managedRuntimeModeDenial,
  type ManagedPolicySummary,
  type RuntimeMode,
} from "@t3tools/contracts";
import {
  type LucideIcon,
  LockIcon,
  PenLineIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from "lucide-react";

export function getRuntimeModeConfig(
  t: TFunction<"chat">,
): Record<RuntimeMode, { label: string; description: string; icon: LucideIcon }> {
  return {
    "approval-required": {
      label: t(($) => $.composer.supervised),
      description: t(($) => $.composer.supervisedDescription),
      icon: LockIcon,
    },
    "auto-accept-edits": {
      label: t(($) => $.composer.autoAcceptEdits),
      description: t(($) => $.composer.autoAcceptDescription),
      icon: PenLineIcon,
    },
    auto: {
      label: t(($) => $.composer.auto),
      description: t(($) => $.composer.autoDescription),
      icon: ShieldCheckIcon,
    },
    "full-access": {
      label: t(($) => $.composer.fullAccess),
      description: t(($) => $.composer.fullAccessDescription),
      // An open lock reads like a closed one at small sizes; a crossed shield does not.
      icon: ShieldOffIcon,
    },
  };
}

export const runtimeModeOptions = [
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
] as const satisfies ReadonlyArray<RuntimeMode>;

/** The modes a provider supports (all when it reports none) and the mode a thread really runs in. */
export function resolveCompatibleRuntimeMode(
  runtimeMode: RuntimeMode,
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
) {
  const modes =
    supportedRuntimeModes && supportedRuntimeModes.length > 0
      ? runtimeModeOptions.filter((mode) => supportedRuntimeModes.includes(mode))
      : runtimeModeOptions;
  return { modes, mode: modes.includes(runtimeMode) ? runtimeMode : (modes[0] ?? runtimeMode) };
}

export function resolveRuntimeModeOptions(
  modes: ReadonlyArray<RuntimeMode>,
  managedPolicy: ManagedPolicySummary | undefined,
  t: TFunction<"chat">,
) {
  const runtimeModeConfig = getRuntimeModeConfig(t);
  return modes.map((mode) => {
    const option = { mode, ...runtimeModeConfig[mode] };
    const disabledReason = managedRuntimeModeDenial(managedPolicy, mode);
    return disabledReason === undefined ? option : { ...option, disabledReason };
  });
}
