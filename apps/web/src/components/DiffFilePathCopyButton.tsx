import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide";
import { useRef } from "react";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import {
  ANCHORED_COPY_TOAST_TIMEOUT_MS,
  showAnchoredCopyErrorToast,
  showAnchoredCopySuccessToast,
} from "~/components/ui/anchoredCopyToast";
import { Button } from "~/components/ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export function DiffFilePathCopyButton({ filePath }: { filePath: string }) {
  const { t } = useTranslation("workspace");
  const { t: tCommon } = useTranslation("common");
  const ref = useRef<HTMLButtonElement>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => showAnchoredCopySuccessToast(ref, tCommon),
    onError: (error) => showAnchoredCopyErrorToast(ref, error, tCommon),
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            ref={ref}
            size="icon-micro"
            variant="ghost-muted"
            aria-label={t(($) => $.git.copyFilePath)}
            onClick={() => copyToClipboard(filePath, undefined)}
          />
        }
      >
        <MorphIcon
          className={cn("size-3", isCopied && "text-success")}
          icon={isCopied ? Check : Copy}
        />
      </TooltipTrigger>
      <TooltipPopup>
        <p>{isCopied ? t(($) => $.git.copied) : t(($) => $.git.copyPath)}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
