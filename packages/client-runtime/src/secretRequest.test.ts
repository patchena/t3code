import {
  SecretProviderId,
  SecretProviderKind,
  SecretRequestError,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { createI18n } from "@t3tools/client-runtime/i18n";

import {
  secretRequestAnswerInput,
  secretRequestDisplay,
  secretRequestFailureMessage,
  secretRequestPrivacyNote,
  secretRequestSources,
} from "./secretRequest.ts";

describe("secretRequestDisplay", () => {
  it("never offers the form for a request inherited from another thread", () => {
    const t = createI18n("en").getFixedT("en", "chat");
    expect(secretRequestDisplay({ secretStatus: "pending" }, "inherited", t)).toEqual({
      kind: "pending-elsewhere",
      label: "Waiting for an answer in the original thread",
    });
    expect(secretRequestDisplay({ secretStatus: "saved" }, "inherited", t)).toMatchObject({
      outcome: "saved",
    });
  });
});

describe("secretRequestPrivacyNote", () => {
  it("does not promise to hide a value that the agent's commands can read", () => {
    const t = createI18n("en").getFixedT("en", "chat");
    expect(secretRequestPrivacyNote({}, t)).toBe("Stored securely, never shown to the agent");
    expect(secretRequestPrivacyNote({ delivery: "file" }, t)).not.toContain("never shown");
    const de = createI18n("de").getFixedT("de", "chat");
    expect(secretRequestPrivacyNote({ delivery: "file" }, de)).toContain("24 Stunden");
    expect(secretRequestPrivacyNote({ delivery: "file" }, de)).not.toContain("nie angezeigt");
  });
});

describe("secretRequestFailureMessage", () => {
  it("passes through server errors but hides anything that could echo the payload", () => {
    const t = createI18n("en").getFixedT("en", "chat");
    expect(
      secretRequestFailureMessage(new SecretRequestError({ reason: "already_answered" }), t),
    ).toBe("This secret request was already answered.");
    expect(secretRequestFailureMessage(new Error('Expected string, got "whsec_1"'), t)).toBe(
      "Could not answer the request. Try again.",
    );
    expect(secretRequestFailureMessage(undefined, t)).toBe(
      "Could not answer the request. Try again.",
    );
  });
});

describe("secretRequestSources", () => {
  const onePassword = SecretProviderId.make("1password");
  const providers = {
    [onePassword]: {
      kind: SecretProviderKind.make("one_password"),
      label: "1Password",
      config: { account: "my" },
    },
    [SecretProviderId.make("later")]: {
      kind: SecretProviderKind.make("from_a_newer_build"),
      label: "Later",
      config: {},
    },
  };

  it("offers configured providers only when the server accepts reference answers", () => {
    expect(secretRequestSources({ secretRequestReferences: true }, providers)).toMatchObject([
      { id: onePassword, label: "1Password" },
    ]);
    expect(secretRequestSources({}, providers)).toEqual([]);
    expect(secretRequestSources({ secretRequestReferences: true }, {})).toEqual([]);
  });

  it("answers with a reference only in the provider's syntax", () => {
    const [source] = secretRequestSources({ secretRequestReferences: true }, providers);
    if (source === undefined) throw new Error("expected a source");
    const item = { id: TurnItemId.make("item-1"), threadId: ThreadId.make("thread-1") };
    expect(
      secretRequestAnswerInput(item, {
        type: "reference",
        source,
        reference: " op://vault/item/field ",
      })?.answer,
    ).toEqual({
      type: "reference",
      reference: { provider: onePassword, reference: "op://vault/item/field" },
    });
    expect(
      secretRequestAnswerInput(item, { type: "reference", source, reference: "vault/item" }),
    ).toBeNull();
  });
});
