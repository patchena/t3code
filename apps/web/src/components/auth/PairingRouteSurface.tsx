import { Alert, AlertDescription } from "../ui/alert";
import type { AuthSessionState } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import React, { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";

import { connectPairing } from "../../connection/onboarding";
import {
  peekPairingTokenFromUrl,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
} from "../../environments/primary";
import { readHostedPairingRequest } from "../../hostedPairing";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { StandalonePage, StandalonePageHeader } from "../ui/standalone-page";
import { useAtomCommand } from "../../state/use-atom-command";

export function PairingPendingSurface() {
  const { t } = useTranslation("connect");
  return (
    <StandalonePage>
      <StandalonePageHeader
        title={t(($) => $.pairing.pending)}
        description={t(($) => $.pairing.pendingDescription)}
      />
    </StandalonePage>
  );
}

export function PairingRouteSurface({
  auth,
  initialErrorMessage,
  onAuthenticated,
}: {
  auth: AuthSessionState["auth"];
  initialErrorMessage?: string;
  onAuthenticated: () => void;
}) {
  const { t } = useTranslation("connect");
  const [autoPairToken] = useState(peekPairingTokenFromUrl);
  const [credential, setCredential] = useState(autoPairToken ?? "");
  const [error, setError] = useState<unknown>(initialErrorMessage || undefined);
  const errorMessage = error === undefined ? "" : errorMessageFromUnknown(error, t);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmitAttemptedRef = useRef(false);

  const submitCredential = async (nextCredential: string) => {
    setIsSubmitting(true);
    setError(undefined);

    const submitError = await submitServerAuthCredential(nextCredential).then(
      () => ({ status: "success" }) as const,
      (error: unknown) => ({ status: "error", error }) as const,
    );

    setIsSubmitting(false);

    if (submitError.status === "error") {
      setError(submitError.error);
      return;
    }

    startTransition(() => {
      onAuthenticated();
    });
  };

  const handleSubmit = async (event?: React.SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await submitCredential(credential);
  };

  const autoSubmit = useEffectEvent((token: string) => {
    void submitCredential(token);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- strips the pairing token from the URL and submits it once when the route carries one
  useEffect(() => {
    if (!autoPairToken || autoSubmitAttemptedRef.current) {
      return;
    }

    autoSubmitAttemptedRef.current = true;
    stripPairingTokenFromUrl();
    autoSubmit(autoPairToken);
  }, [autoPairToken]);

  return (
    <StandalonePage>
      <StandalonePageHeader
        title={t(($) => $.pairing.title)}
        description={describeAuthGate(auth.bootstrapMethods, t)}
      />

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="pairing-token">
            {t(($) => $.pairing.token)}
          </label>
          <Input
            id="pairing-token"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            disabled={isSubmitting}
            nativeInput
            onChange={(event) => setCredential(event.currentTarget.value)}
            placeholder={t(($) => $.pairing.placeholder)}
            spellCheck={false}
            value={credential}
          />
        </div>

        {errorMessage ? (
          <Alert variant="error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={isSubmitting} size="sm" type="submit">
            {isSubmitting ? t(($) => $.pairing.working) : t(($) => $.actions.continue)}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => window.location.reload()}
            size="sm"
            variant="outline"
          >
            {t(($) => $.actions.reload)}
          </Button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-border/70 bg-background/55 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        {describeSupportedMethods(auth.bootstrapMethods, t)}
      </div>
    </StandalonePage>
  );
}

export function HostedPairingRouteSurface() {
  const { t } = useTranslation("connect");
  const connectPairingEnvironment = useAtomCommand(connectPairing, {
    reportFailure: false,
  });
  const [request] = useState(readHostedPairingRequest);
  const [status, setStatus] = useState<"pairing" | "paired" | "error">(
    request ? "pairing" : "error",
  );
  const [failure, setFailure] = useState<
    { readonly kind: "submitted" } | { readonly kind: "request"; readonly cause: unknown } | null
  >(null);
  const message = !request
    ? t(($) => $.pairing.missing)
    : failure?.kind === "submitted"
      ? t(($) => $.pairing.submitted)
      : failure?.kind === "request"
        ? t(($) => $.pairing.requestFailed, { error: errorMessageFromUnknown(failure.cause, t) })
        : status === "paired"
          ? t(($) => $.pairing.saved, {
              environment: request.label || t(($) => $.pairing.environment),
            })
          : t(($) => $.pairing.connecting);
  const [canRetry, setCanRetry] = useState(false);
  const submitAttemptedRef = useRef(false);
  const tokenSubmittedRef = useRef(false);

  const submitHostedPairingRequest = async () => {
    if (!request) {
      setStatus("error");
      setCanRetry(false);
      return;
    }

    if (tokenSubmittedRef.current) {
      setStatus("error");
      setFailure({ kind: "submitted" });
      setCanRetry(false);
      return;
    }

    setStatus("pairing");
    setFailure(null);
    setCanRetry(false);
    tokenSubmittedRef.current = true;

    const result = await connectPairingEnvironment({
      host: request.host,
      pairingCode: request.token,
    });
    if (result._tag === "Success") {
      setStatus("paired");
      return;
    }

    tokenSubmittedRef.current = false;
    setStatus("error");
    setCanRetry(true);
    setFailure({ kind: "request", cause: squashAtomCommandFailure(result) });
  };

  const submitOnMount = useEffectEvent(() => {
    void submitHostedPairingRequest();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- strips the pairing token from the URL and submits the hosted pairing request once on mount
  useEffect(() => {
    if (submitAttemptedRef.current) {
      return;
    }
    submitAttemptedRef.current = true;

    stripPairingTokenFromUrl();
    submitOnMount();
  }, []);

  return (
    <StandalonePage>
      <StandalonePageHeader
        title={
          status === "paired"
            ? t(($) => $.pairing.paired)
            : status === "error"
              ? t(($) => $.pairing.failed)
              : t(($) => $.pairing.backend)
        }
        description={message}
      />

      {request ? (
        <div className="mt-5 rounded-lg border border-border/70 bg-background/55 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          <Trans
            t={t}
            i18nKey={($) => $.pairing.host}
            components={{
              host: <span className="font-mono text-foreground/80">{request.host}</span>,
            }}
          />
        </div>
      ) : null}

      {status === "error" ? (
        <Alert variant="error" className="mt-5">
          <AlertDescription>{t(($) => $.pairing.reachability)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {status === "pairing" ? (
          <Button disabled size="sm">
            {t(($) => $.pairing.working)}
          </Button>
        ) : canRetry ? (
          <Button size="sm" onClick={() => void submitHostedPairingRequest()}>
            {t(($) => $.actions.retry)}
          </Button>
        ) : null}
        {status === "paired" ? (
          <Button size="sm" variant="outline" onClick={() => (window.location.href = "/")}>
            {t(($) => $.actions.openApp)}
          </Button>
        ) : null}
      </div>
    </StandalonePage>
  );
}

function errorMessageFromUnknown(error: unknown, t: TFunction<"connect">): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return t(($) => $.pairing.authenticationFailed);
}

function describeAuthGate(
  bootstrapMethods: ReadonlyArray<string>,
  t: TFunction<"connect">,
): string {
  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return t(($) => $.pairing.trustedGate);
  }

  return t(($) => $.pairing.tokenGate);
}

function describeSupportedMethods(
  bootstrapMethods: ReadonlyArray<string>,
  t: TFunction<"connect">,
): string {
  if (
    bootstrapMethods.includes("desktop-bootstrap") &&
    bootstrapMethods.includes("one-time-token")
  ) {
    return t(($) => $.pairing.bothMethods);
  }

  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return t(($) => $.pairing.desktopMethod);
  }

  return t(($) => $.pairing.tokenMethod);
}
