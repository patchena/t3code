import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcwIcon, SettingsIcon, XIcon } from "lucide-react";
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
  onRetry(): void;
  onDismiss(): void;
}) {
  const { t } = useTranslation("voice");
  const navigate = useNavigate();
  const openSettings = props.errorAction === "settings";
  const actionLabel = openSettings
    ? t(($) => $.input.openSettings)
    : props.error === t(($) => $.errors.transcribeFailed) ||
        props.error === t(($) => $.errors.environmentFailed)
      ? t(($) => $.input.retryTranscription)
      : t(($) => $.input.recordAgain);
  const dismissLabel = t(($) => $.input.dismissError);
  const errorText = props.error ?? t(($) => $.errors.failed);
  return (
    <VoiceInputPill>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-sm-pill"
              variant="ghost"
              aria-label={dismissLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onDismiss}
            >
              <XIcon />
            </Button>
          }
        />
        <TooltipPopup side="top">
          {props.cancelShortcutLabel
            ? t(($) => $.input.withShortcut, {
                label: dismissLabel,
                shortcut: props.cancelShortcutLabel,
              })
            : dismissLabel}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              role="status"
              aria-label={errorText}
              className="min-w-0 flex-1 truncate text-sm text-destructive"
            />
          }
        >
          {voiceErrorLabel(props.error, t)}
        </TooltipTrigger>
        <TooltipPopup side="top">{errorText}</TooltipPopup>
      </Tooltip>
      {props.errorAction ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm-pill"
                variant="ghost"
                aria-label={actionLabel}
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
              >
                {openSettings ? <SettingsIcon /> : <RotateCcwIcon />}
              </Button>
            }
          />
          <TooltipPopup side="top">{actionLabel}</TooltipPopup>
        </Tooltip>
      ) : null}
    </VoiceInputPill>
  );
}
