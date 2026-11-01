import { parseNewThreadLink } from "@t3tools/shared/promptLinks";
import { formatPromptLinkError } from "@t3tools/client-runtime/prompt-links";
import { useTranslation } from "react-i18next";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { NewThreadLinkView } from "../components/promptLinks/NewThreadLinkView";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";

// The query is read raw: the router's own search parsing turns `prompt=123` into a number.
function NewThreadLinkRoute() {
  const { t } = useTranslation("common");
  const { t: tChat } = useTranslation("chat");
  const search = useLocation({ select: (location) => location.searchStr });
  const parsed = parseNewThreadLink(search);
  if (!parsed.ok) {
    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
        <Empty className="flex-1">
          <EmptyHeader className="max-w-md">
            <EmptyTitle>{t(($) => $.errors.linkFailed)}</EmptyTitle>
            <EmptyDescription>{formatPromptLinkError(parsed.error, tChat)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SidebarInset>
    );
  }
  return <NewThreadLinkView key={search} link={parsed.value} />;
}

export const Route = createFileRoute("/_chat/new")({
  component: NewThreadLinkRoute,
});
