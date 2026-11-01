import type { TFunction } from "@t3tools/client-runtime/i18n";
import type {
  EnvironmentId,
  ServerSettingsPatch,
  UsageModelPriceOverride,
} from "@t3tools/contracts";

export interface UsagePriceTarget {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly prices: Readonly<Record<string, UsageModelPriceOverride>> | null;
  readonly aliases: Readonly<Record<string, string>> | null;
  readonly unavailable:
    | "offline"
    | "not-loaded"
    | "checking"
    | "read-only"
    | "removed"
    | { readonly message: string }
    | null;
}

/** `null` removes the model's custom price or mapping. */
export type UsagePriceChange =
  | { readonly model: string; readonly price: UsageModelPriceOverride | null }
  | { readonly model: string; readonly alias: string | null };

export type UsagePriceWriteResult =
  | { readonly status: "saved" }
  | { readonly status: "failed"; readonly error: string };

/** Destinations settle independently; retries pass only failures. */
export async function writeUsagePrices(input: {
  readonly t: TFunction<"files">;
  readonly targets: readonly UsagePriceTarget[];
  readonly changes: ReadonlyMap<EnvironmentId, readonly UsagePriceChange[]>;
  readonly write: (input: {
    environmentId: EnvironmentId;
    input: { patch: ServerSettingsPatch };
  }) => Promise<{ readonly _tag: "Success" | "Failure" }>;
  readonly onResult: (environmentId: EnvironmentId, result: UsagePriceWriteResult) => void;
}) {
  await Promise.all(
    input.targets.map(async (target) => {
      let result: UsagePriceWriteResult;
      const changes = input.changes.get(target.environmentId) ?? [];
      const prices = changes.flatMap((change) =>
        "price" in change ? [[change.model, change.price] as const] : [],
      );
      const aliases = changes.flatMap((change) =>
        "alias" in change ? [[change.model, change.alias] as const] : [],
      );
      if (target.unavailable !== null) {
        result = {
          status: "failed",
          error: usagePriceUnavailableLabel(target.unavailable, input.t),
        };
      } else if (aliases.length > 0 && target.aliases === null) {
        result = { status: "failed", error: input.t(($) => $.usage.prices.updateServer) };
      } else {
        try {
          const saved =
            changes.length === 0
              ? { _tag: "Success" as const }
              : await input.write({
                  environmentId: target.environmentId,
                  input: {
                    patch: {
                      ...(prices.length > 0
                        ? { usagePriceOverrides: Object.fromEntries(prices) }
                        : {}),
                      ...(aliases.length > 0
                        ? { usageModelAliases: Object.fromEntries(aliases) }
                        : {}),
                    },
                  },
                });
          result =
            saved._tag === "Success"
              ? { status: "saved" }
              : { status: "failed", error: input.t(($) => $.usage.prices.saveFailed) };
        } catch {
          result = { status: "failed", error: input.t(($) => $.usage.prices.saveFailed) };
        }
      }
      input.onResult(target.environmentId, result);
    }),
  );
}

export function usagePriceUnavailableLabel(
  reason: NonNullable<UsagePriceTarget["unavailable"]>,
  t: TFunction<"files">,
) {
  if (typeof reason !== "string") return reason.message;
  switch (reason) {
    case "offline":
      return t(($) => $.usage.prices.offline);
    case "not-loaded":
      return t(($) => $.usage.prices.pricesNotLoaded);
    case "checking":
      return t(($) => $.usage.prices.checkingPermissions);
    case "read-only":
      return t(($) => $.usage.prices.readOnly);
    case "removed":
      return t(($) => $.usage.prices.environmentRemoved);
  }
}
