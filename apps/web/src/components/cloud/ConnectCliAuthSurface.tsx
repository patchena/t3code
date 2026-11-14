import { useAuth, useClerk } from "@clerk/react";
import { readConnectAuthorizeRequest } from "@t3tools/shared/connectAuth";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildConnectCliClerkAuthorizeUrl,
  connectCliSignInRedirectUrl,
} from "../../cloud/connectCliAuth";
import { isElectron } from "../../env";
import { StandalonePage, StandalonePageHeader } from "../ui/standalone-page";
import { resolveClerkSignInProps } from "../clerk/authRedirect";
import { retryClerkLoad, useClerkLoadFailed } from "../clerk/clerkLoadFailure";
import { Button } from "../ui/button";

export function ConnectCliAuthorizeSurface() {
  const { t } = useTranslation("connect");
  const [request] = useState(() => readConnectAuthorizeRequest(new URL(window.location.href)));
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const loadFailed = useClerkLoadFailed();
  const signInOpened = useRef(false);
  const redirecting = useRef(false);

  const openSignIn = () => {
    if (!request) {
      return;
    }
    clerk.openSignIn(
      resolveClerkSignInProps(
        connectCliSignInRedirectUrl(request, window.location.href),
        isElectron,
      ),
    );
  };
  const openSignInOnLoad = useEffectEvent(openSignIn);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens Clerk sign-in or navigates the window to the authorize URL once Clerk has loaded
  useEffect(() => {
    if (!request || !isLoaded || redirecting.current) {
      return;
    }
    if (!isSignedIn) {
      if (!signInOpened.current) {
        signInOpened.current = true;
        openSignInOnLoad();
      }
      return;
    }
    const authorizeUrl = buildConnectCliClerkAuthorizeUrl(request);
    if (!authorizeUrl) {
      return;
    }
    redirecting.current = true;
    window.location.assign(authorizeUrl);
  }, [isLoaded, isSignedIn, request]);

  if (!request) {
    return (
      <StandalonePage>
        <StandalonePageHeader
          context={t(($) => $.cli.invalidContext)}
          title={t(($) => $.cli.invalidTitle)}
          description={t(($) => $.cli.invalidDescription)}
        />
      </StandalonePage>
    );
  }

  return (
    <StandalonePage>
      <StandalonePageHeader
        context={t(($) => $.cli.context)}
        title={t(($) => $.cli.title)}
        description={isSignedIn ? t(($) => $.cli.redirecting) : t(($) => $.cli.signIn)}
      />
      {loadFailed ? (
        <div className="mt-6">
          <Button type="button" onClick={retryClerkLoad}>
            Retry sign-in
          </Button>
        </div>
      ) : isLoaded && !isSignedIn ? (
        <div className="mt-6">
          <Button type="button" onClick={openSignIn}>
            {t(($) => $.actions.signIn)}
          </Button>
        </div>
      ) : null}
    </StandalonePage>
  );
}
