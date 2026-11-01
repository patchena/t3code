import { useTranslation } from "react-i18next";

export function ProviderAuthFailureTitle() {
  const { t } = useTranslation("connect");
  return t(($) => $.providerAuth.failed);
}

export function ProviderAuthFailureDescription({ reconnect }: { readonly reconnect: boolean }) {
  const { t } = useTranslation("connect");
  return reconnect ? t(($) => $.providerAuth.reconnect) : t(($) => $.providerAuth.retry);
}
