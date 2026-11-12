import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useRef } from "react";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import {
  ANCHORED_COPY_TOAST_TIMEOUT_MS,
  showAnchoredCopyErrorToast,
  showAnchoredCopySuccessToast,
} from "~/components/ui/anchoredCopyToast";
import { Button } from "~/components/ui/button";
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
        {isCopied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{isCopied ? t(($) => $.git.copied) : t(($) => $.git.copyPath)}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
