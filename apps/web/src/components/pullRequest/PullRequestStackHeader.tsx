import { useTranslation } from "react-i18next";
import { MenuGroupLabel } from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export function PullRequestStackHeader({
  number,
  notice,
  stale = false,
}: {
  number: number;
  notice?: string | null | undefined;
  stale?: boolean;
}) {
  const { t } = useTranslation("workspace");
  return (
    <MenuGroupLabel>
      <div className="flex items-center justify-between gap-2">
        <span>{t(($) => $.git.stackNumber, { number })}</span>
        {notice ? (
          <Tooltip>
            <TooltipTrigger render={<span role="status" className="text-xs font-normal" />}>
              {stale ? t(($) => $.git.mayBeStale) : t(($) => $.git.refreshing)}
            </TooltipTrigger>
            <TooltipPopup>{notice}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    </MenuGroupLabel>
  );
}
