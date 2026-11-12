// @effect-diagnostics nodeBuiltinImport:off - Probes the server's native SQLite ownership lock.
import * as NodeSqlite from "node:sqlite";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { desktopT } from "#desktop/i18n";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";

// The fields of the server's `server-runtime.json` that identify the owner of a T3 home.
const HomeOwnerRuntimeState = Schema.Struct({
  pid: Schema.Int,
  port: Schema.Int,
  serviceManaged: Schema.optional(Schema.Boolean),
  serverVersion: Schema.optional(Schema.String),
});
export type HomeOwner = typeof HomeOwnerRuntimeState.Type;

const decodeHomeOwner = Schema.decodeUnknownOption(Schema.fromJsonString(HomeOwnerRuntimeState));

/** Signal 0 only probes existence; EPERM still means alive. */
const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

/**
 * Whether a server holds the T3 home's ownership lock (an exclusive transaction on
 * `server-owner.sqlite`). A read-only read is refused with SQLITE_BUSY only while it is held.
 */
export const isHomeOwnershipLocked = Effect.fn("DesktopHomeOwner.isHomeOwnershipLocked")(
  function* () {
    const path = yield* Path.Path;
    const { stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
    const lockPath = path.join(stateDir, "server-owner.sqlite");
    return yield* Effect.sync(() => {
      try {
        const db = new NodeSqlite.DatabaseSync(lockPath, { readOnly: true });
        try {
          db.exec("PRAGMA busy_timeout = 0");
          db.prepare("SELECT count(*) FROM sqlite_master").get();
          return false;
        } finally {
          db.close();
        }
      } catch (cause) {
        // Anything but SQLITE_BUSY (a missing file included) leaves the decision to the backend.
        return cause instanceof Error && "errcode" in cause && cause.errcode === 5;
      }
    });
  },
);

/** The live server recorded as owning the desktop's T3 home. Only call once the ownership lock is known held: a live PID alone may be reused. */
export const readLiveHomeOwner = Effect.fn("DesktopHomeOwner.readLiveHomeOwner")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
  const raw = yield* fs
    .readFileString(path.join(stateDir, "server-runtime.json"))
    .pipe(Effect.option);
  return Option.flatMap(raw, decodeHomeOwner).pipe(
    Option.filter((owner) => isProcessAlive(owner.pid)),
  );
});

export const homeOwnedMessage = (owner: Option.Option<HomeOwner>): string =>
  Option.match(owner, {
    onNone: () => desktopT(($) => $.startup.homeUnavailableDetail),
    onSome: (owner) => {
      const details = owner.serverVersion
        ? desktopT(($) => $.startup.homeOwnerDetailsVersion, {
            pid: owner.pid,
            port: owner.port,
            version: owner.serverVersion,
          })
        : desktopT(($) => $.startup.homeOwnerDetails, { pid: owner.pid, port: owner.port });
      return owner.serviceManaged
        ? desktopT(($) => $.startup.homeOwnedByService, { details })
        : desktopT(($) => $.startup.homeOwnedByServer, { details });
    },
  });
