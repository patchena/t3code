import type { TFunction } from "@t3tools/client-runtime/i18n";
import { Trans, useTranslation } from "react-i18next";
import { useAtomValue } from "@effect/atom-react";
import type { OtlpEndpointCheckResult, OtlpSignal, ServerObservability } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ConnectionStatusDot } from "../ConnectionStatusDot";
import { useSettingsScope } from "./SettingsScopeContext";
import { useScopedSettings } from "./useScopedSettings";
import { SettingsSection } from "./settingsLayout";
import { SettingsScopeNotice } from "./SettingsScopeNotice";

const SIGNALS = [
  {
    key: "otlpTracesUrl",
    sourceKey: "otlpTracesSource",
    variableKey: "otlpTracesVariable",
    label: (t: TFunction<"settings">) => t(($) => $.diagnostics.exports.traces),
    signal: "traces",
  },
  {
    key: "otlpMetricsUrl",
    sourceKey: "otlpMetricsSource",
    variableKey: "otlpMetricsVariable",
    label: (t: TFunction<"settings">) => t(($) => $.diagnostics.exports.metrics),
    signal: "metrics",
  },
  {
    key: "otlpLogsUrl",
    sourceKey: "otlpLogsSource",
    variableKey: "otlpLogsVariable",
    label: (t: TFunction<"settings">) => t(($) => $.diagnostics.exports.logs),
    signal: "logs",
  },
] as const;

type SignalDescriptor = (typeof SIGNALS)[number];
type SignalKey = SignalDescriptor["key"];

const OVERRIDE_LABELS = {
  environment: (t: TFunction<"settings">) => t(($) => $.diagnostics.exports.byEnvironment),
  bootstrap: (t: TFunction<"settings">) => t(($) => $.diagnostics.exports.byDesktop),
} as const;

function runningOverride(
  running: ServerObservability | undefined,
  { key, sourceKey, variableKey }: SignalDescriptor,
  t: TFunction<"settings">,
) {
  const url = running?.[key];
  const source = running?.[sourceKey];
  if (url === undefined || (source !== "environment" && source !== "bootstrap")) return undefined;
  return { url, label: OVERRIDE_LABELS[source](t), variable: running?.[variableKey] };
}

type EndpointCheck = { readonly url: string; readonly result: OtlpEndpointCheckResult | null };

const isHttpUrl = (url: string) => /^https?:\/\/./i.test(url);

function endpointStatus(url: string, check: EndpointCheck | undefined, t: TFunction<"settings">) {
  if (url === "")
    return { label: t(($) => $.diagnostics.exports.off), dot: "bg-muted-foreground/40" };
  if (check?.url !== url)
    return { label: t(($) => $.diagnostics.exports.notChecked), dot: "bg-muted-foreground/40" };
  const { result } = check;
  if (result === null)
    return { label: t(($) => $.diagnostics.exports.checking), dot: "bg-warning" };
  switch (result._tag) {
    case "Accepted":
      return {
        label: t(($) => $.diagnostics.exports.connected, { latency: Math.round(result.latencyMs) }),
        dot: "bg-success",
      };
    case "Rejected":
      return {
        label: t(($) => $.diagnostics.exports.rejected, { status: result.status }),
        dot: "bg-destructive",
      };
    case t(($) => $.diagnostics.exports.unreachable):
      return {
        label: result.timedOut
          ? t(($) => $.diagnostics.exports.timedOut)
          : t(($) => $.diagnostics.exports.unreachable),
        dot: "bg-destructive",
      };
  }
}

export function TelemetryExportSettings() {
  const { t } = useTranslation("settings");
  const { environment, scope } = useSettingsScope();
  if (scope.kind !== "environment" || !environment) {
    return (
      <SettingsSection title={t(($) => $.diagnostics.exports.title)} id="telemetry-export">
        <SettingsScopeNotice target="environment">
          {t(($) => $.diagnostics.exports.chooseEnvironment)}
        </SettingsScopeNotice>
      </SettingsSection>
    );
  }
  return <TelemetryExportForm key={environment.environmentId} />;
}

function TelemetryExportForm() {
  const { t } = useTranslation("settings");
  const { environment } = useSettingsScope();
  const saved = useScopedSettings((settings) => settings.observability);
  const [draft, setDraft] = useState<Partial<typeof saved>>({});
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const environmentId = environment?.environmentId;
  const canEdit = useAtomValue(
    serverEnvironment.checkOtlpEndpoint.permissionAtom(environmentId ?? null),
  );
  const canCheck =
    canEdit && environment?.serverConfig?.environment.capabilities.otlpEndpointCheck === true;
  const running = environment?.serverConfig?.observability;
  const [checks, setChecks] = useState<Partial<Record<SignalKey, EndpointCheck>>>(() =>
    Object.fromEntries(
      SIGNALS.flatMap((descriptor) => {
        const url = runningOverride(running, descriptor, t)?.url ?? saved[descriptor.key];
        return isHttpUrl(url) ? [[descriptor.key, { url, result: null }]] : [];
      }),
    ),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: true });
  const checkOtlpEndpoint = useAtomCommand(serverEnvironment.checkOtlpEndpoint);
  const values = { ...saved, ...draft };
  const changedSignals = SIGNALS.filter(({ key }) => values[key].trim() !== saved[key]);
  const changed = changedSignals.length > 0;

  const sendCheck = async (key: SignalKey, signal: OtlpSignal, url: string) => {
    if (!environmentId) return;
    const response = await checkOtlpEndpoint({ environmentId, input: { signal, url } });
    setChecks((previous) => {
      if (previous[key]?.url !== url || previous[key].result !== null) return previous;
      const next = { ...previous };
      if (response._tag === "Success") next[key] = { url, result: response.value };
      else delete next[key];
      return next;
    });
  };

  const checkEndpoint = (key: SignalKey, signal: OtlpSignal, url: string) => {
    if (!isHttpUrl(url)) return;
    setChecks((previous) => ({ ...previous, [key]: { url, result: null } }));
    void sendCheck(key, signal, url);
  };

  const sendPendingChecks = useEffectEvent(() => {
    for (const { key, signal } of SIGNALS) {
      const check = checks[key];
      if (check?.result === null) void sendCheck(key, signal, check.url);
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- sends pending endpoint check requests once the environment can run them
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- State changes only after the response arrives.
    if (canCheck) sendPendingChecks();
  }, [canCheck]);

  return (
    <SettingsSection title={t(($) => $.diagnostics.exports.title)} id="telemetry-export">
      <form
        className="grid gap-4 px-4 py-4 sm:px-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!environment || saving) return;
          setSaving(true);
          setSavedNotice(false);
          const result = await updateSettings({
            environmentId: environment.environmentId,
            input: {
              patch: {
                observability: Object.fromEntries(
                  changedSignals.map(({ key }) => [key, values[key]]),
                ),
              },
            },
          });
          setSaving(false);
          if (result._tag === "Success") {
            setDraft({});
            setSavedNotice(true);
          }
        }}
      >
        <p className="text-xs text-muted-foreground">
          {t(($) => $.diagnostics.exports.description)}
        </p>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            {t(($) => $.diagnostics.exports.permission, {
              environment:
                environment?.label ?? t(($) => $.diagnostics.exports.selectedEnvironment),
            })}
          </p>
        )}
        {SIGNALS.map((descriptor) => {
          const { key, label, signal } = descriptor;
          const override = runningOverride(running, descriptor, t);
          const url = override?.url ?? values[key].trim();
          const check = canCheck ? endpointStatus(url, checks[key], t) : null;
          const status = override
            ? {
                label: check ? `${override.label} · ${check.label}` : override.label,
                dot: check?.dot ?? "bg-muted-foreground/40",
              }
            : check;
          return (
            <div key={key} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {status && <ConnectionStatusDot dotClassName={status.dot} />}
                  <Label htmlFor={key}>
                    {t(($) => $.diagnostics.exports.endpoint, { signal: label(t) })}
                  </Label>
                </div>
                {status && <span className="text-xs text-muted-foreground">{status.label}</span>}
              </div>
              <div className="flex gap-2">
                <Input
                  id={key}
                  size="sm"
                  type="url"
                  pattern="[Hh][Tt][Tt][Pp][Ss]?://.*"
                  title={t(($) => $.diagnostics.exports.endpointHint)}
                  placeholder={`http://localhost:4318/v1/${signal}`}
                  value={values[key]}
                  disabled={saving || !canEdit}
                  onChange={(event) => {
                    const value = event.target.value;
                    // Clear restored drafts so later saves cannot overwrite another client's changes.
                    setDraft((previous) => {
                      const next = { ...previous, [key]: value };
                      if (value.trim() === saved[key]) delete next[key];
                      return next;
                    });
                    setSavedNotice(false);
                  }}
                />
                {canCheck && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!isHttpUrl(url) || checks[key]?.result === null}
                    onClick={() => void checkEndpoint(key, signal, url)}
                  >
                    {t(($) => $.diagnostics.exports.test)}
                  </Button>
                )}
              </div>
              {(saved[key] !== (running?.[key] ?? "") || override?.variable) && (
                <p className="break-all text-xs text-muted-foreground">
                  {override?.variable ? (
                    <Trans
                      t={t}
                      i18nKey={($) => $.diagnostics.exports.runningFrom}
                      components={{
                        url: (
                          <span>{running?.[key] || t(($) => $.diagnostics.exports.disabled)}</span>
                        ),
                        variable: <code className="font-mono">{override.variable}</code>,
                      }}
                    />
                  ) : (
                    t(($) => $.diagnostics.exports.running, {
                      url: running?.[key] || t(($) => $.diagnostics.exports.disabled),
                    })
                  )}
                </p>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted-foreground">
            {savedNotice ? t(($) => $.diagnostics.exports.savedRestart) : null}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!changed || saving || !canEdit}
              onClick={() => {
                setDraft({});
                setSavedNotice(false);
                if (!canCheck) return;
                for (const descriptor of SIGNALS) {
                  const { key, signal } = descriptor;
                  if (runningOverride(running, descriptor, t)) continue;
                  if (checks[key]?.url !== saved[key]) checkEndpoint(key, signal, saved[key]);
                }
              }}
            >
              {t(($) => $.diagnostics.exports.discard)}
            </Button>
            <Button type="submit" size="xs" disabled={!changed || saving || !canEdit}>
              {saving
                ? t(($) => $.diagnostics.exports.saving)
                : t(($) => $.diagnostics.exports.save)}
            </Button>
          </div>
        </div>
      </form>
    </SettingsSection>
  );
}
