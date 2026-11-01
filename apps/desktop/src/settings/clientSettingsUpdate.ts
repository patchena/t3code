import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import * as Cause from "effect/Cause";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";

import type {
  DesktopClientSettings,
  DesktopClientSettingsWriteError,
} from "#desktop/settings/DesktopClientSettings";
import type {
  DesktopApplicationMenu,
  DesktopApplicationMenuLanguageError,
} from "#desktop/window/DesktopApplicationMenu";
import type { DesktopSnapShot } from "#desktop/snapShot/DesktopSnapShot";

const writes = Semaphore.makeUnsafe(1);
type UpdateError = DesktopClientSettingsWriteError | DesktopApplicationMenuLanguageError;

export const saveClientSettings = Effect.fn("desktop.clientSettings.save")(
  function* (
    settings: ClientSettings,
    persistence: Context.Service.Shape<typeof DesktopClientSettings>,
    menu: Pick<Context.Service.Shape<typeof DesktopApplicationMenu>, "setLanguage">,
    snapShot: Pick<Context.Service.Shape<typeof DesktopSnapShot>, "configure">,
  ) {
    const previous = Option.getOrElse(yield* persistence.get, () => DEFAULT_CLIENT_SETTINGS);
    yield* persistence.set(settings);
    yield* Effect.gen(function* () {
      yield* snapShot.configure(settings);
      yield* menu.setLanguage(settings.interfaceLanguage);
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          const results: ReadonlyArray<Exit.Exit<void, UpdateError>> = yield* Effect.all([
            Effect.exit(persistence.set(previous)),
            Effect.exit(menu.setLanguage(previous.interfaceLanguage)),
            Effect.exit(snapShot.configure(previous)),
          ]);
          let failure: Cause.Cause<UpdateError> = cause;
          for (const result of results) {
            if (Exit.isFailure(result)) failure = Cause.combine(failure, result.cause);
          }
          return yield* Effect.failCause(failure);
        }),
      ),
    );
  },
  Effect.uninterruptible,
  writes.withPermits(1),
);
