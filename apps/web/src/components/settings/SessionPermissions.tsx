import { type EnvironmentId, sessionGrantsScope } from "@t3tools/contracts";
import { useTranslation } from "react-i18next";
import { authScopeOptions } from "~/connection/permissions";
import { useEnvironmentSessionState } from "~/state/session";

export function SessionPermissions({
  environmentId,
  connected,
  routeContext = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
  readonly routeContext?: boolean;
}) {
  const { t } = useTranslation("connect");
  const session = useEnvironmentSessionState(environmentId);
  const authenticated = session.data?.authenticated === true ? session.data : null;
  return connected && !session.hasError && !session.isPending && session.data?.authenticated ? (
    <div className="space-y-3 py-3 text-xs">
      <p className="text-muted-foreground">
        {routeContext
          ? t(($) => $.permissions.routeDescription)
          : t(($) => $.permissions.clientDescription)}
      </p>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {authScopeOptions(t).map(({ scope, title }) => (
          <li key={scope} className="flex items-start justify-between gap-3">
            <span>{title}</span>
            <span className="shrink-0 text-muted-foreground">
              {authenticated && sessionGrantsScope(authenticated, scope)
                ? t(($) => $.permissions.allowed)
                : t(($) => $.permissions.notGranted)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <p className="py-3 text-xs text-muted-foreground">
      {!connected
        ? t(($) => $.permissions.connect)
        : !session.hasError && !session.isPending && session.data?.authenticated === false
          ? t(($) => $.permissions.rejected)
          : session.hasError
            ? t(($) => $.permissions.failed)
            : t(($) => $.permissions.checking)}
    </p>
  );
}
