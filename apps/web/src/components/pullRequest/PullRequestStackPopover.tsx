import { useTranslation } from "react-i18next";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";
import type { EnvironmentId, PullRequestRef, PullRequestStackMembership } from "@t3tools/contracts";
import { useState } from "react";
import { usePullRequestStack } from "~/state/usePullRequestStack";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
} from "~/components/ui/menu";
import { PullRequestStackLayers } from "~/components/pullRequest/PullRequestStackLayers";
import { PullRequestStackHeader } from "~/components/pullRequest/PullRequestStackHeader";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

// Mount only on open to avoid per-row stack fetches.
function StackBody({
  environmentId,
  reference,
  onSelect,
  stackNumber,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  onSelect: (reference: PullRequestRef) => void;
  stackNumber: number;
}) {
  const { t } = useTranslation("workspace");
  const query = usePullRequestStack(environmentId, reference);
  if (query.data !== null) {
    return (
      <>
        <PullRequestStackHeader
          number={query.data.number}
          notice={query.notice}
          stale={!!query.error}
        />
        {query.error ? (
          <MenuItem onClick={query.refresh}>{t(($) => $.git.retryStackRefresh)}</MenuItem>
        ) : null}
        <PullRequestStackLayers stack={query.data} reference={reference} onSelect={onSelect} />
      </>
    );
  }
  return (
    <>
      <PullRequestStackHeader number={stackNumber} />
      <MenuGroupLabel>
        {query.error ??
          (query.isPending ? t(($) => $.git.loadingStack) : t(($) => $.git.noLongerStacked))}
      </MenuGroupLabel>
    </>
  );
}

export function PullRequestStackPopover({
  environmentId,
  reference,
  membership,
  onSelect,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  membership: PullRequestStackMembership;
  onSelect: (reference: PullRequestRef) => void;
}) {
  const { t } = useTranslation("workspace");
  const [open, setOpen] = useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              nativeButton={false}
              render={
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-normal text-muted-foreground"
                />
              }
              aria-label={t(($) => $.git.stackPosition, {
                number: membership.number,
                position: membership.position,
                total: membership.size,
              })}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <PullRequestGlyph.stack aria-hidden className="size-3" />
              {membership.position}/{membership.size}
            </MenuTrigger>
          }
        />
        <TooltipPopup>
          {t(($) => $.git.viewStackPosition, {
            number: membership.number,
            position: membership.position,
            total: membership.size,
          })}
        </TooltipPopup>
      </Tooltip>
      <MenuPopup
        align="start"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MenuGroup>
          {open ? (
            <StackBody
              environmentId={environmentId}
              reference={reference}
              stackNumber={membership.number}
              onSelect={(target) => {
                setOpen(false);
                onSelect(target);
              }}
            />
          ) : null}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
