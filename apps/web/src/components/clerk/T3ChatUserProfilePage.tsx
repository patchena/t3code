import { T3CHAT_PLAN_TUNNEL_LIMITS, type RelayT3ChatLink } from "@t3tools/contracts/relay";
import { MessageSquareIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import { useManagedTunnelUsage } from "../../cloud/managedRelayState";
import { T3CHAT_SUBSCRIPTION_URL, TunnelUsageMeter } from "../cloud/TunnelUsage";
import { Button } from "../ui/button";
import {
  ClerkUserProfilePage,
  ClerkUserProfileRefreshButton,
  ClerkUserProfileRow,
} from "./ClerkUserProfilePage";
import { useT3ChatLink } from "./useT3ChatLink";

const upgradeLink = (
  <a
    className="underline"
    href={T3CHAT_SUBSCRIPTION_URL}
    target="_blank"
    rel="noopener noreferrer"
  ></a>
);

function planLabel(link: RelayT3ChatLink, t: TFunction<"connect">): ReactNode {
  switch (link.plan) {
    case "premier":
      return t(($) => $.profile.premierPlan, { limit: T3CHAT_PLAN_TUNNEL_LIMITS.premier });
    case "pro":
      return (
        <Trans
          t={t}
          i18nKey={($) => $.profile.proPlan}
          values={{
            pro: T3CHAT_PLAN_TUNNEL_LIMITS.pro,
            premier: T3CHAT_PLAN_TUNNEL_LIMITS.premier,
          }}
          components={{ upgrade: upgradeLink }}
        />
      );
    case "free":
      return (
        <Trans t={t} i18nKey={($) => $.profile.freePlan} components={{ upgrade: upgradeLink }} />
      );
  }
}

/** Links a T3 Chat account so paid subscribers get more tunnels. */
export function T3ChatUserProfilePage() {
  const { t } = useTranslation("connect");
  const { linkState, pending, linkUrl, link: handleLink, unlink: handleUnlink } = useT3ChatLink();
  const usage = useManagedTunnelUsage();

  const data = linkState.data;
  const link = data?.link ?? null;

  return (
    <ClerkUserProfilePage
      title="T3 Chat"
      description={t(($) => $.profile.chatDescription, {
        pro: T3CHAT_PLAN_TUNNEL_LIMITS.pro,
        premier: T3CHAT_PLAN_TUNNEL_LIMITS.premier,
      })}
      action={
        <ClerkUserProfileRefreshButton
          disabled={pending !== null}
          isPending={linkState.isPending}
          onClick={usage.refresh}
        />
      }
    >
      {linkState.error ? (
        <div className="border-t py-3 text-xs" role="alert">
          <p className="font-medium text-destructive-foreground">
            {t(($) => $.profile.chatLoadFailed)}
          </p>
          <p className="mt-0.5 text-muted-foreground">{linkState.error}</p>
        </div>
      ) : data === null ? null : !data.available ? (
        <p className="border-t py-4 text-xs text-muted-foreground">
          {t(($) => $.profile.chatUnsupported)}
        </p>
      ) : (
        <ul className="border-t">
          <ClerkUserProfileRow icon={<MessageSquareIcon className="size-4" />}>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm leading-4.5 font-medium text-foreground">
                  {link ? link.email : t(($) => $.profile.notLinked)}
                </h3>
                <p className="mt-1 text-xs leading-4.5 text-muted-foreground">
                  {link ? (
                    planLabel(link, t)
                  ) : linkUrl ? (
                    <Trans
                      t={t}
                      i18nKey={($) => $.profile.confirmChat}
                      components={{
                        chat: (
                          <a
                            className="underline"
                            href={linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        ),
                      }}
                    />
                  ) : (
                    t(($) => $.profile.confirmChatDescription)
                  )}
                </p>
              </div>
              {link ? (
                <Button
                  size="sm"
                  variant="destructive-outline"
                  disabled={pending !== null}
                  onClick={() => void handleUnlink()}
                >
                  {pending === "unlink"
                    ? t(($) => $.actions.unlinking)
                    : t(($) => $.actions.unlink)}
                </Button>
              ) : (
                <Button size="sm" disabled={pending !== null} onClick={() => void handleLink()}>
                  {pending === "link" ? t(($) => $.actions.opening) : t(($) => $.actions.linkChat)}
                </Button>
              )}
            </div>
          </ClerkUserProfileRow>
          {usage.used !== null && usage.limit !== null ? (
            <li className="border-t py-4">
              <TunnelUsageMeter used={usage.used} limit={usage.limit} />
            </li>
          ) : null}
        </ul>
      )}
    </ClerkUserProfilePage>
  );
}
