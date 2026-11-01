import type { TFunction } from "@t3tools/client-runtime/i18n";
import { type ServerConfig, ServerNpmReleaseError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

import { environmentSummaries } from "./presentation";
import { primaryEnvironmentIdAtom } from "./primaryEnvironment";
import { serverEnvironment } from "./server";

const isServerNpmReleaseError = Schema.is(ServerNpmReleaseError);

class NpmReleaseUnavailable extends Schema.TaggedError<NpmReleaseUnavailable>()(
  "NpmReleaseUnavailable",
  { reason: Schema.Literals(["disconnected", "unsupported", "noServer"]) },
) {}

const isNpmReleaseUnavailable = Schema.is(NpmReleaseUnavailable);

function unsupportedLookup(config: ServerConfig | null): NpmReleaseUnavailable | null {
  if (config === null) {
    return new NpmReleaseUnavailable({ reason: "disconnected" });
  }
  return config.environment.capabilities.npmReleaseLookup === true
    ? null
    : new NpmReleaseUnavailable({ reason: "unsupported" });
}

export function npmReleaseFailureMessage(
  cause: Cause.Cause<unknown>,
  t: TFunction<"settings">,
): string {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause));
  if (isNpmReleaseUnavailable(error)) {
    const messages = {
      disconnected: t(($) => $.extra.updates.registryDisconnected),
      unsupported: t(($) => $.extra.updates.registryUnsupported),
      noServer: t(($) => $.extra.updates.registryNoServer),
    };
    return messages[error.reason];
  }
  return isServerNpmReleaseError(error) ? error.message : t(($) => $.extra.updates.registryUnknown);
}

export const npmReleaseAtom = Atom.family((spec: string) =>
  Atom.make((get) => {
    const primary = get(primaryEnvironmentIdAtom);
    // With the desktop's local server turned off there is no primary, so a connected server answers.
    const candidates =
      primary === null ? get(environmentSummaries.connectedEnvironmentIdsAtom) : [primary];
    const environmentId =
      candidates.find(
        (id) => unsupportedLookup(get(serverEnvironment.configValueAtom(id))) === null,
      ) ?? candidates[0];
    if (environmentId === undefined) {
      return Effect.fail(new NpmReleaseUnavailable({ reason: "noServer" }));
    }
    const unsupported = unsupportedLookup(get(serverEnvironment.configValueAtom(environmentId)));
    if (unsupported !== null) return Effect.fail(unsupported);
    return get
      .result(serverEnvironment.npmRelease({ environmentId, input: { spec } }))
      .pipe(
        Effect.map((release) =>
          release === null
            ? null
            : { version: release.version, databaseMigration: release.databaseMigration },
        ),
      );
  }).pipe(Atom.withLabel(`npm-release:${spec}`)),
);
