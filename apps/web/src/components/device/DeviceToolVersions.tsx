import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { DeviceToolVersions as ToolVersions } from "@t3tools/contracts";
import { InlineButton } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";

export function DeviceToolVersions({
  tools,
  action,
  kind,
  owner,
  error,
}: {
  tools: ToolVersions | undefined;
  action?: ReactNode;
  kind?: keyof ToolVersions;
  owner?: string | undefined;
  error?: string | undefined;
}) {
  const { t } = useTranslation("tools");
  const selected = kind ? tools?.[kind] : undefined;
  const version =
    selected?.runningVersion ??
    (selected?.installedVersions.includes(selected.requiredVersion)
      ? selected.requiredVersion
      : selected?.installedVersions
          .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .at(-1));
  const label = kind === "hub" ? t(($) => $.deviceHub) : t(($) => $.deviceAgent);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          kind
            ? version
              ? t(($) => $.deviceVersionLabel, { label, version })
              : selected
                ? t(($) => $.deviceNotInstalledLabel, { label })
                : t(($) => $.deviceVersionUnknownLabel, { label })
            : undefined
        }
        render={<InlineButton tone="muted" />}
      >
        {kind
          ? version
            ? `v${version}`
            : selected
              ? t(($) => $.deviceNotInstalled)
              : t(($) => $.deviceVersionUnknown)
          : error
            ? t(($) => $.deviceVersionsUnavailable)
            : t(($) => $.deviceVersions)}
      </PopoverTrigger>
      <PopoverPopup align="end" width="md">
        <PopoverTitle>{kind ? label : t(($) => $.deviceTools)}</PopoverTitle>
        {tools ? (
          <div className="mt-4 divide-y divide-border/50">
            {(
              [
                ["hub", t(($) => $.deviceHub), tools.hub],
                ["agent", t(($) => $.deviceAgent), tools.agent],
              ] as const
            )
              .filter(([id]) => !kind || id === kind)
              .map(([id, name, tool]) => (
                <div key={id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  {!kind ? <p className="text-xs font-medium">{name}</p> : null}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{t(($) => $.deviceRunning)}</dt>
                    <dd className="text-right font-mono">
                      {tool.runningVersion ?? t(($) => $.deviceNotRunning)}
                    </dd>
                    <dt className="text-muted-foreground">{t(($) => $.deviceRequired)}</dt>
                    <dd className="text-right font-mono">{tool.requiredVersion}</dd>
                    <dt className="text-muted-foreground">{t(($) => $.deviceInstalled)}</dt>
                    <dd className="text-right font-mono break-words">
                      {tool.installedVersions.join(", ") || t(($) => $.none)}
                    </dd>
                  </dl>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(($) => $.deviceVersionsUnchecked)}
          </p>
        )}
        <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {owner ? t(($) => $.deviceToolsManaged, { owner }) : t(($) => $.deviceToolsAutoUpdate)}
        </p>
        {error ? (
          <p role="status" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </PopoverPopup>
    </Popover>
  );
}
