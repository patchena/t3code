import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type InterfaceLanguage,
} from "@t3tools/contracts/settings";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import { saveClientSettings } from "#desktop/settings/clientSettingsUpdate";

describe("client settings native update", () => {
  it.effect("restores persistence and native configuration when the language update fails", () =>
    Effect.gen(function* () {
      const previous = { ...DEFAULT_CLIENT_SETTINGS, snapShotEnabled: false };
      let saved: ClientSettings = previous;
      let language: InterfaceLanguage = "en";
      let snapshot = previous;
      const failure = new Error("native menu unavailable");
      const result = yield* Effect.exit(
        saveClientSettings(
          { ...previous, interfaceLanguage: "de", snapShotEnabled: true },
          {
            get: Effect.sync(() => Option.some(saved)),
            set: (next) =>
              Effect.sync(() => {
                saved = next;
              }),
          },
          {
            setLanguage: (next) =>
              next === "de"
                ? Effect.die(failure)
                : Effect.sync(() => {
                    language = next;
                  }),
          },
          {
            configure: (next) =>
              Effect.sync(() => {
                snapshot = next;
              }),
          },
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      expect(saved).toEqual(previous);
      expect(language).toBe("en");
      expect(snapshot).toEqual(previous);
    }),
  );

  it.effect("does not write defaults or update native UI after a failed read", () =>
    Effect.gen(function* () {
      let wrote = false;
      let updated = false;
      const result = yield* Effect.exit(
        saveClientSettings(
          { ...DEFAULT_CLIENT_SETTINGS, interfaceLanguage: "de" },
          {
            get: Effect.die(new Error("settings unreadable")),
            set: () =>
              Effect.sync(() => {
                wrote = true;
              }),
          },
          {
            setLanguage: () =>
              Effect.sync(() => {
                updated = true;
              }),
          },
          {
            configure: () =>
              Effect.sync(() => {
                updated = true;
              }),
          },
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      expect(wrote).toBe(false);
      expect(updated).toBe(false);
    }),
  );

  it.effect("retains both failures and restores native UI even when disk rollback fails", () =>
    Effect.gen(function* () {
      let language: InterfaceLanguage = "en";
      let restoredSnapshot = false;
      const result = yield* Effect.exit(
        saveClientSettings(
          { ...DEFAULT_CLIENT_SETTINGS, interfaceLanguage: "de" },
          {
            get: Effect.succeedSome(DEFAULT_CLIENT_SETTINGS),
            set: (next) =>
              next.interfaceLanguage === "en"
                ? Effect.die(new Error("disk rollback failed"))
                : Effect.void,
          },
          {
            setLanguage: (next) => {
              language = next;
              return next === "de" ? Effect.die(new Error("native menu failed")) : Effect.void;
            },
          },
          {
            configure: (next) =>
              Effect.sync(() => {
                restoredSnapshot = next.interfaceLanguage === "en";
              }),
          },
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(Cause.pretty(result.cause)).toContain("native menu failed");
        expect(Cause.pretty(result.cause)).toContain("disk rollback failed");
      }
      expect(language).toBe("en");
      expect(restoredSnapshot).toBe(true);
    }),
  );
});
