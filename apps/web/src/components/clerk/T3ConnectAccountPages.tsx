import { useAuth, useClerk } from "@clerk/react";
import { MessageSquareIcon, ServerIcon, SmartphoneIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import { MobileClientsUserProfilePage } from "./MobileClientsUserProfilePage";
import { T3ChatUserProfilePage } from "./T3ChatUserProfilePage";
import { T3ConnectUserProfilePage } from "./T3ConnectUserProfilePage";

export const getT3ConnectAccountPages = (t: TFunction<"connect">) =>
  [
    {
      label: t(($) => $.profile.mobileClients),
      url: "mobile-clients",
      icon: <SmartphoneIcon className="size-4" />,
      content: <MobileClientsUserProfilePage />,
    },
    {
      label: "T3 Connect",
      url: "t3-connect",
      icon: <ServerIcon className="size-4" />,
      content: <T3ConnectUserProfilePage />,
    },
    {
      label: "T3 Chat",
      url: "t3-chat",
      icon: <MessageSquareIcon className="size-4" />,
      content: <T3ChatUserProfilePage />,
    },
  ] as const;

export type T3ConnectAccountPageUrl = ReturnType<typeof getT3ConnectAccountPages>[number]["url"];

type PortalTargets = Readonly<Record<string, HTMLDivElement | undefined>>;

/** Keep portals rendered while the modal can open; Clerk owns the custom-page DOM nodes. */
export function useT3ConnectAccountPage(): {
  readonly open: ((page?: T3ConnectAccountPageUrl) => void) | null;
  readonly portals: ReactNode;
} {
  const { t } = useTranslation("connect");
  const pages = getT3ConnectAccountPages(t);
  const clerk = useClerk();
  const { isSignedIn } = useAuth();
  const [targets, setTargets] = useState<PortalTargets>({});

  const open = (page: T3ConnectAccountPageUrl = "t3-connect") => {
    const setTarget = (key: string, element: HTMLDivElement | undefined) =>
      setTargets((current) => ({ ...current, [key]: element }));
    clerk.openUserProfile({
      __experimental_startPath: `/${page}`,
      customPages: pages.map((page) => ({
        label: page.label,
        url: page.url,
        mount: (element: HTMLDivElement) => setTarget(`content:${page.url}`, element),
        unmount: () => setTarget(`content:${page.url}`, undefined),
        mountIcon: (element: HTMLDivElement) => setTarget(`icon:${page.url}`, element),
        unmountIcon: () => setTarget(`icon:${page.url}`, undefined),
      })),
    });
  };

  const portals = pages.flatMap((page) => {
    const content = targets[`content:${page.url}`];
    const icon = targets[`icon:${page.url}`];
    return [
      content ? createPortal(page.content, content, `content:${page.url}`) : null,
      icon ? createPortal(page.icon, icon, `icon:${page.url}`) : null,
    ];
  });

  return { open: isSignedIn ? open : null, portals };
}
