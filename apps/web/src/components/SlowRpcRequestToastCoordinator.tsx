import { resolveHour12 } from "~/timestampFormat";
import { useClientSettings } from "~/hooks/useSettings";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { appI18n } from "~/i18n";
import { useTranslation } from "react-i18next";
import { type SlowRpcAckRequest, subscribeSlowRpcAckRequests } from "~/rpc/requestLatencyState";
import { toastManager } from "~/components/ui/toast";

function describeSlowRequests(
  requests: ReadonlyArray<SlowRpcAckRequest>,
  t: TFunction<"workspace">,
): string {
  const count = requests.length;
  const thresholdSeconds = Math.round(
    Math.min(...requests.map((request) => request.thresholdMs)) / 1000,
  );

  return t(($) => $.updates.slowRequests, { count, seconds: thresholdSeconds });
}

function SlowRequestDetails({ requests }: { requests: ReadonlyArray<SlowRpcAckRequest> }) {
  const { t } = useTranslation("workspace");
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  return (
    <ul className="space-y-2.5 text-xs text-muted-foreground">
      {requests.map((request) => (
        <li
          className="min-w-0 border-border/50 border-b pb-2 last:border-b-0 last:pb-0"
          key={request.requestId}
        >
          <div className="wrap-break-word font-medium text-foreground">{request.tag}</div>
          <div className="mt-0.5 text-3xs opacity-75">
            {t(($) => $.updates.requestStarted, {
              time: new Date(request.startedAt).toLocaleTimeString(
                window.desktopBridge?.getSystemLocale() ?? undefined,
                { hour12: resolveHour12(timestampFormat) },
              ),
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One warning toast that tracks the set of slow requests while any are outstanding. */
export function startSlowRpcRequestToasts(): () => void {
  const t = appI18n.getFixedT(null, "workspace");
  let toastId: ReturnType<typeof toastManager.add> | null = null;

  let currentRequests: ReadonlyArray<SlowRpcAckRequest> = [];
  const update = (slowRequests: ReadonlyArray<SlowRpcAckRequest>) => {
    currentRequests = slowRequests;
    if (slowRequests.length === 0) {
      if (toastId !== null) {
        toastManager.close(toastId);
        toastId = null;
      }
      return;
    }

    const nextToast = {
      data: {
        expandableContent: <SlowRequestDetails requests={slowRequests} />,
        expandableDescriptionTrigger: true,
        expandableLabels: {
          collapse: t(($) => $.updates.hideRequests),
          expand: t(($) => $.updates.showRequests),
        },
      },
      description: describeSlowRequests(slowRequests, t),
      timeout: 0,
      title: t(($) => $.updates.someRequestsAreSlow),
      type: "warning" as const,
    };

    if (toastId === null) {
      toastId = toastManager.add(nextToast);
    } else {
      toastManager.update(toastId, nextToast);
    }
  };
  const unsubscribe = subscribeSlowRpcAckRequests(update);
  const refreshLanguage = () => update(currentRequests);
  appI18n.on("languageChanged", refreshLanguage);

  return () => {
    unsubscribe();
    appI18n.off("languageChanged", refreshLanguage);
    if (toastId !== null) toastManager.close(toastId);
  };
}
