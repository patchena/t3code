import type { TFunction } from "@t3tools/client-runtime/i18n";
import {
  parseUsagePriceForm,
  usagePriceForm,
  USAGE_PRICE_FIELDS,
  type UsagePriceForm,
} from "./usagePriceForm";
import type { UsagePriceChange, UsagePriceTarget } from "./usagePriceTargets";

export type UsagePriceField = (typeof USAGE_PRICE_FIELDS)[number]["key"];

export interface UsagePriceDraft {
  readonly id: string;
  readonly model: string;
  readonly isNew: boolean;
  readonly values: Partial<Pick<UsagePriceForm, UsagePriceField>>;
  /** Edited "Map to" model. Absent keeps each environment's mapping; blank removes it. */
  readonly alias?: string;
  readonly removed?: boolean;
}

export function isEmptyUsagePriceDraft(draft: UsagePriceDraft) {
  return (
    draft.isNew &&
    draft.model.trim() === "" &&
    (draft.alias ?? "").trim() === "" &&
    Object.values(draft.values).every((value) => value.trim() === "")
  );
}

function modelPrice(target: UsagePriceTarget, model: string) {
  return target.prices && Object.hasOwn(target.prices, model) ? target.prices[model] : undefined;
}

function modelAlias(target: UsagePriceTarget, model: string) {
  return target.aliases && Object.hasOwn(target.aliases, model) ? target.aliases[model] : undefined;
}

export function usageAliasCell(
  targets: readonly UsagePriceTarget[],
  model: string,
  t: TFunction<"files">,
) {
  if (targets.some((target) => target.aliases === null))
    return { value: "", placeholder: t(($) => $.usage.unavailable), state: "unavailable" as const };
  const values = targets.map((target) => modelAlias(target, model) ?? "");
  if (values.some((value) => value !== values[0]))
    return { value: "", placeholder: t(($) => $.usage.prices.mixed), state: "mixed" as const };
  return {
    value: values[0] ?? "",
    placeholder: t(($) => $.usage.prices.none),
    state: "uniform" as const,
  };
}

export function usagePriceCell(
  targets: readonly UsagePriceTarget[],
  model: string,
  field: UsagePriceField,
  t: TFunction<"files">,
) {
  const optional = USAGE_PRICE_FIELDS.find((entry) => entry.key === field)!.optional;
  const values = targets.map((target) =>
    modelPrice(target, model) ? usagePriceForm(model, modelPrice(target, model))[field] : null,
  );
  if (targets.some((target) => target.prices === null))
    return { value: "", placeholder: t(($) => $.usage.unavailable), state: "unavailable" as const };
  if (values.some((value) => value !== values[0]))
    return { value: "", placeholder: t(($) => $.usage.prices.mixed), state: "mixed" as const };
  return {
    value: values[0] ?? "",
    state: "uniform" as const,
    placeholder:
      values[0] === null
        ? t(($) => $.usage.prices.automatic)
        : optional
          ? t(($) => $.usage.prices.inputRate)
          : "0.00",
  };
}

export function usagePriceTableChanges(
  target: UsagePriceTarget,
  drafts: readonly UsagePriceDraft[],
  t: TFunction<"files">,
) {
  const changes: UsagePriceChange[] = [];
  const errors = new Map<string, string>();
  for (const draft of drafts) {
    if (isEmptyUsagePriceDraft(draft)) continue;
    const model = draft.model.trim();
    const currentAlias = modelAlias(target, model);
    if (draft.removed) {
      if (modelPrice(target, model)) changes.push({ model, price: null });
      if (currentAlias !== undefined) changes.push({ model, alias: null });
      continue;
    }
    const alias = (draft.alias ?? currentAlias ?? "").trim();
    if (alias !== "") {
      if (draft.alias === undefined && Object.keys(draft.values).length > 0) {
        errors.set(
          draft.id,
          t(($) => $.usage.prices.mappedElsewhere, { environment: target.label }),
        );
        continue;
      }
      if (model === "")
        errors.set(
          draft.id,
          t(($) => $.usage.prices.enterModel),
        );
      else if (alias === model)
        errors.set(
          draft.id,
          t(($) => $.usage.prices.differentModel),
        );
      else {
        if (alias !== currentAlias) changes.push({ model, alias });
        if (modelPrice(target, model)) changes.push({ model, price: null });
      }
      continue;
    }
    if (currentAlias !== undefined) {
      changes.push({ model, alias: null });
      if (
        !modelPrice(target, model) &&
        Object.values(draft.values).every((value) => value.trim() === "")
      )
        continue;
    }
    const original = usagePriceForm(model, modelPrice(target, model));
    const form = { ...original, ...draft.values };
    const parsed = parseUsagePriceForm(form);
    if (parsed === null) {
      const missing = USAGE_PRICE_FIELDS.find(
        (field) => !field.optional && form[field.key].trim() === "",
      );
      errors.set(
        draft.id,
        model === ""
          ? t(($) => $.usage.prices.enterModel)
          : missing
            ? t(($) => $.usage.prices.requiredPrice, {
                field: missing.label(t),
                environment: target.label,
              })
            : t(($) => $.usage.prices.nonNegative),
      );
      continue;
    }
    const next = usagePriceForm(model, parsed.price);
    if (USAGE_PRICE_FIELDS.some((field) => original[field.key] !== next[field.key]))
      changes.push(parsed);
  }
  // Check the final batch so clearing a mapping and reversing it in one save stays valid.
  const aliases = new Map(Object.entries(target.aliases ?? {}));
  for (const change of changes) {
    if (!("alias" in change)) continue;
    if (change.alias === null) aliases.delete(change.model);
    else aliases.set(change.model, change.alias);
  }
  for (const draft of drafts) {
    if (draft.removed || errors.has(draft.id)) continue;
    let model = draft.model.trim();
    const seen = new Set<string>();
    while (aliases.has(model)) {
      if (seen.has(model)) {
        errors.set(
          draft.id,
          t(($) => $.usage.prices.cycle, { environment: target.label }),
        );
        break;
      }
      seen.add(model);
      model = aliases.get(model)!;
    }
  }
  return { changes, errors };
}

export function usagePriceTableErrors(
  targets: readonly UsagePriceTarget[],
  drafts: readonly UsagePriceDraft[],
  t: TFunction<"files">,
) {
  return new Map(
    targets
      .filter((target) => target.unavailable === null && target.prices !== null)
      .flatMap((target) => [...usagePriceTableChanges(target, drafts, t).errors]),
  );
}
