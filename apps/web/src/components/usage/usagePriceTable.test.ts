import { createI18n } from "@t3tools/client-runtime/i18n";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  usagePriceCell,
  usagePriceTableChanges,
  usagePriceTableErrors,
  type UsagePriceDraft,
} from "./usagePriceTable";
import type { UsagePriceTarget } from "./usagePriceTargets";

const t = createI18n("en").getFixedT(null, "files");

const price = { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 };
const target = (
  name: string,
  prices: UsagePriceTarget["prices"],
  aliases: UsagePriceTarget["aliases"] = {},
): UsagePriceTarget => ({
  environmentId: EnvironmentId.make(name),
  label: name,
  prices,
  aliases,
  unavailable: null,
});
const draft = (values: UsagePriceDraft["values"]): UsagePriceDraft => ({
  id: "model:example",
  model: "example",
  isNew: false,
  values,
});

describe("price table edits", () => {
  it.each(["constructor", "toString", "__proto__"])(
    "handles an exact model ID named %s",
    (model) => {
      const environment = target("a", {});
      expect(usagePriceCell([environment], model, "inputCostPerMillionTokens", t)).toEqual({
        value: "",
        placeholder: "Automatic",
        state: "uniform",
      });
      const result = usagePriceTableChanges(
        environment,
        [
          {
            ...draft({ inputCostPerMillionTokens: "2", outputCostPerMillionTokens: "8" }),
            model,
            isNew: true,
          },
        ],
        t,
      );
      expect(result.changes).toEqual([{ model, price }]);
      expect(
        usagePriceCell([target("a", { [model]: price })], model, "inputCostPerMillionTokens", t)
          .value,
      ).toBe("2");
    },
  );

  it("changes only edited columns while preserving each environment's other prices and models", () => {
    const edits = [draft({ inputCostPerMillionTokens: "3" })];
    const a = usagePriceTableChanges(
      target("a", { example: { ...price, cacheReadCostPerMillionTokens: 0 }, untouched: price }),
      edits,
      t,
    );
    const b = usagePriceTableChanges(
      target("b", { example: { ...price, outputCostPerMillionTokens: 10 } }),
      edits,
      t,
    );
    expect(a.changes).toEqual([
      {
        model: "example",
        price: { ...price, inputCostPerMillionTokens: 3, cacheReadCostPerMillionTokens: 0 },
      },
    ]);
    expect(b.changes).toEqual([
      { model: "example", price: { inputCostPerMillionTokens: 3, outputCostPerMillionTokens: 10 } },
    ]);
  });

  it("batches new rows and resets, and distinguishes blank cache rates from explicit zero", () => {
    const plan = usagePriceTableChanges(
      target("a", { example: price }),
      [
        { ...draft({}), removed: true },
        {
          id: "new:1",
          model: "  vendor/Model  ",
          isNew: true,
          values: {
            inputCostPerMillionTokens: "2",
            outputCostPerMillionTokens: "8",
            cacheReadCostPerMillionTokens: "0",
            cacheWriteCostPerMillionTokens: "",
          },
        },
      ],
      t,
    );
    expect(plan.errors.size).toBe(0);
    expect(plan.changes).toEqual([
      { model: "example", price: null },
      { model: "vendor/Model", price: { ...price, cacheReadCostPerMillionTokens: 0 } },
    ]);
  });

  it("requires complete prices before turning automatic pricing into an override", () => {
    const edits = [draft({ inputCostPerMillionTokens: "3" })];
    expect(usagePriceTableChanges(target("a", { example: price }), edits, t).errors.size).toBe(0);
    const missing = usagePriceTableChanges(target("b", {}), edits, t);
    expect(missing.changes).toEqual([]);
    expect(missing.errors.has("model:example")).toBe(true);
  });

  it("mapping a model drops its own price and resetting removes the mapping", () => {
    const priced = target("a", { example: price });
    expect(usagePriceTableChanges(priced, [{ ...draft({}), alias: " example-model " }], t)).toEqual(
      {
        changes: [
          { model: "example", alias: "example-model" },
          { model: "example", price: null },
        ],
        errors: new Map(),
      },
    );
    const mapped = target("b", {}, { example: "example-model" });
    expect(usagePriceTableChanges(mapped, [{ ...draft({}), removed: true }], t).changes).toEqual([
      { model: "example", alias: null },
    ]);
    expect(
      usagePriceTableChanges(mapped, [{ ...draft({}), alias: "example" }], t).errors.get(
        "model:example",
      ),
    ).toBe("Map to a different model.");
  });

  it("requires clearing a mapping before a price edit can apply to every environment", () => {
    const mapped = target("mapped", {}, { example: "example-model" });
    const priced = target("priced", { example: price });
    const edit = draft({ inputCostPerMillionTokens: "3", outputCostPerMillionTokens: "8" });
    expect(usagePriceTableErrors([mapped, priced], [edit], t).get(edit.id)).toBe(
      'mapped maps this model. Remove it from "Apply to" or clear its mapping first.',
    );
    expect(usagePriceTableChanges(mapped, [edit], t).changes).toEqual([]);

    const cleared = { ...edit, alias: "" };
    expect(usagePriceTableErrors([mapped, priced], [cleared], t).size).toBe(0);
    expect(usagePriceTableChanges(mapped, [cleared], t).changes).toEqual([
      { model: "example", alias: null },
      { model: "example", price: { inputCostPerMillionTokens: 3, outputCostPerMillionTokens: 8 } },
    ]);
    expect(usagePriceTableChanges(priced, [cleared], t).changes).toEqual([
      { model: "example", price: { inputCostPerMillionTokens: 3, outputCostPerMillionTokens: 8 } },
    ]);
  });
});

describe("model mapping validation", () => {
  const mapping = (model: string, alias: string): UsagePriceDraft => ({
    id: `model:${model}`,
    model,
    alias,
    isNew: false,
    values: {},
  });

  it("rejects a cycle created by several mappings in one save", () => {
    const edits = [mapping("a", "b"), mapping("b", "c"), mapping("c", "a")];
    const result = usagePriceTableChanges(target("local", {}), edits, t);
    expect([...result.errors.keys()]).toEqual(["model:a", "model:b", "model:c"]);
  });

  it("checks each environment's saved chain when an edited mapping closes it", () => {
    const edits = [mapping("c", "a")];
    const acyclic = target("one", {}, { a: "b" });
    const cyclic = target("two", {}, { a: "b", b: "c" });
    expect(usagePriceTableChanges(acyclic, edits, t).errors.size).toBe(0);
    expect(usagePriceTableErrors([acyclic, cyclic], edits, t).get("model:c")).toBe(
      "Model mappings cannot form a cycle on two.",
    );
  });

  it("validates the final batch so a mapping can be reversed in either row order", () => {
    const environment = target("local", {}, { constructor: "__proto__" });
    const clear = mapping("constructor", "");
    const reverse = mapping("__proto__", "constructor");
    for (const edits of [
      [reverse, clear],
      [clear, reverse],
    ]) {
      const result = usagePriceTableChanges(environment, edits, t);
      expect(result.errors.size).toBe(0);
      expect(result.changes).toEqual(
        edits.map(({ model, alias }) => ({ model, alias: alias || null })),
      );
    }
  });
});
