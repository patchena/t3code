import type { TFunction } from "@t3tools/client-runtime/i18n";

export const PREVIEW_RECENT_URL_LIMIT = 10;

export const PREVIEW_ERROR_CODE_MESSAGES = new Map<string, (t: TFunction<"tools">) => string>([
  ["ERR_NAME_NOT_RESOLVED", (t) => t(($) => $.previewDns)],
  ["ERR_NAME_RESOLUTION_FAILED", (t) => t(($) => $.previewDns)],
  ["ERR_CONNECTION_REFUSED", (t) => t(($) => $.previewConnectionRefused)],
  ["ERR_CONNECTION_RESET", (t) => t(($) => $.previewConnectionReset)],
  ["ERR_CONNECTION_CLOSED", (t) => t(($) => $.previewConnectionClosed)],
  ["ERR_CONNECTION_TIMED_OUT", (t) => t(($) => $.previewConnectionTimeout)],
  ["ERR_INTERNET_DISCONNECTED", (t) => t(($) => $.previewNoInternet)],
  ["ERR_TIMED_OUT", (t) => t(($) => $.previewConnectionTimeout)],
  ["ERR_CERT_AUTHORITY_INVALID", (t) => t(($) => $.previewCertificateAuthority)],
  ["ERR_CERT_COMMON_NAME_INVALID", (t) => t(($) => $.previewCertificateHostname)],
  ["ERR_CERT_DATE_INVALID", (t) => t(($) => $.previewCertificateDate)],
  ["ERR_TOO_MANY_REDIRECTS", (t) => t(($) => $.previewRedirects)],
]);
