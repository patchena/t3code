import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlertIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { VoiceInputPill } from "./VoiceInputPill";

const LABELED_ERRORS = [
  "microphonePermission",
  "microphoneRequired",
  "draftUnavailable",
  "anotherRecording",
  "unavailable",
  "busy",
  "unsupportedLanguage",
  "prepareFailed",
  "startFailed",
  "interrupted",
  "finishFailed",
  "transcribeFailed",
  "environmentFailed",
  "draftChanged",
  "noSpeech",
  "processingFailed",
  "disconnected",
] as const;

function voiceErrorLabel(error: string | null, t: TFunction<"voice">): string {
  const key = error
    ? LABELED_ERRORS.find((candidate) => t(($) => $.errors[candidate]) === error)
    : undefined;
  return key ? t(($) => $.errorLabels[key]) : t(($) => $.errors.failed);
}

export function VoiceInputErrorPill(props: {
  error: string | null;
  errorAction: "retry" | "settings" | null;
  disabled?: boolean;
  cancelShortcutLabel?: string | null;
  size?: "default" | "compact" | undefined;
  onRetry(): void;
  onDismiss(): void;
}) {
  const { t } = useTranslation("voice");
  const navigate = useNavigate();
  const message = props.error ?? t(($) => $.errors.failed);
  const openSettings = props.errorAction === "settings";
  const compact = props.size === "compact";
  const action = openSettings
    ? { label: t(($) => $.input.openSettings), text: t(($) => $.input.settingsAction) }
    : props.error === t(($) => $.errors.transcribeFailed) ||
        props.error === t(($) => $.errors.environmentFailed)
      ? { label: t(($) => $.input.retryTranscription), text: t(($) => $.input.retryAction) }
      : { label: t(($) => $.input.recordAgain), text: t(($) => $.input.recordAgain) };
  const dismissLabel = t(($) => $.input.dismissError);
  const dismissText = t(($) => $.input.dismiss);
  return (
    <VoiceInputPill tone="error" size={props.size}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size={compact ? "icon-xs" : "icon-sm-pill"}
              variant="ghost"
              aria-label={dismissLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onDismiss}
              className="shrink-0"
            >
              <XIcon />
            </Button>
          }
        />
        <TooltipPopup side="top">
          {props.cancelShortcutLabel
            ? t(($) => $.input.withShortcut, {
                label: dismissText,
                shortcut: props.cancelShortcutLabel,
              })
            : dismissText}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              role="status"
              aria-label={message}
              className="flex min-w-0 items-center gap-1.5 rounded-sm text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            />
          }
        >
          <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{voiceErrorLabel(props.error, t)}</span>
        </TooltipTrigger>
        <TooltipPopup side="top">{message}</TooltipPopup>
      </Tooltip>
      {props.errorAction ? (
        <Button
          type="button"
          size={compact ? "xs" : "sm-pill"}
          variant="outline"
          aria-label={action.label}
          disabled={props.disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (openSettings) {
              props.onDismiss();
              void navigate({ to: "/settings/voice" });
            } else {
              props.onRetry();
            }
          }}
          className="ms-auto shrink-0"
        >
          {action.text}
        </Button>
      ) : (
        <span aria-hidden className="w-1.5 shrink-0" />
      )}
    </VoiceInputPill>
  );
}
