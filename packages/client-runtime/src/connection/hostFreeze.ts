import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { ServerEventLoopStall } from "@t3tools/contracts";

export interface HostFreezeNotice {
  readonly title: string;
  readonly description: string;
}

/**
 * Says why a host stopped answering, from the recent stall it reports on
 * connect. Web shows it as a toast, mobile in the environment's connection row.
 */
export function hostFreezeNotice(
  hostLabel: string,
  stall: ServerEventLoopStall | undefined,
  t: TFunction<"workspace">,
): HostFreezeNotice | null {
  if (stall === undefined) return null;
  const { loadAverage, cpuCount } = stall;
  return {
    title: t(($) => $.updates.hostFroze, {
      host: hostLabel,
      seconds: Math.round(stall.durationMs / 1000),
    }),
    description:
      loadAverage !== undefined && loadAverage > cpuCount
        ? t(($) => $.updates.hostOverloaded, { load: Math.round(loadAverage), cores: cpuCount })
        : t(($) => $.updates.hostBusy, { host: hostLabel }),
  };
}
