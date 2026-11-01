import type { AuthGrantScope } from "@t3tools/contracts";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { AUTH_SCOPE_OPTIONS } from "@t3tools/shared/authScopeOptions";

export function authScopeOptions(t: TFunction<"connect">) {
  const labels: Record<AuthGrantScope, { readonly title: string; readonly description: string }> = {
    "orchestration:read": {
      title: t(($) => $.permissions.environmentRead.title),
      description: t(($) => $.permissions.environmentRead.description),
    },
    "orchestration:operate": {
      title: t(($) => $.permissions.orchestration.title),
      description: t(($) => $.permissions.orchestration.description),
    },
    "settings:write": {
      title: t(($) => $.permissions.settings.title),
      description: t(($) => $.permissions.settings.description),
    },
    "providers:manage": {
      title: t(($) => $.permissions.providers.title),
      description: t(($) => $.permissions.providers.description),
    },
    "environment:maintain": {
      title: t(($) => $.permissions.maintenance.title),
      description: t(($) => $.permissions.maintenance.description),
    },
    "preview:operate": {
      title: t(($) => $.permissions.previews.title),
      description: t(($) => $.permissions.previews.description),
    },
    "diagnostics:read": {
      title: t(($) => $.permissions.diagnostics.title),
      description: t(($) => $.permissions.diagnostics.description),
    },
    "terminal:read": {
      title: t(($) => $.permissions.terminalRead.title),
      description: t(($) => $.permissions.terminalRead.description),
    },
    "terminal:operate": {
      title: t(($) => $.permissions.terminalOperate.title),
      description: t(($) => $.permissions.terminalOperate.description),
    },
    "source-control:write": {
      title: t(($) => $.permissions.sourceControl.title),
      description: t(($) => $.permissions.sourceControl.description),
    },
    "filesystem:read": {
      title: t(($) => $.permissions.filesRead.title),
      description: t(($) => $.permissions.filesRead.description),
    },
    "filesystem:write": {
      title: t(($) => $.permissions.filesWrite.title),
      description: t(($) => $.permissions.filesWrite.description),
    },
    "access:read": {
      title: t(($) => $.permissions.accessRead.title),
      description: t(($) => $.permissions.accessRead.description),
    },
    "access:write": {
      title: t(($) => $.permissions.accessWrite.title),
      description: t(($) => $.permissions.accessWrite.description),
    },
    "relay:read": {
      title: t(($) => $.permissions.relayRead.title),
      description: t(($) => $.permissions.relayRead.description),
    },
    "relay:write": {
      title: t(($) => $.permissions.relayWrite.title),
      description: t(($) => $.permissions.relayWrite.description),
    },
  };
  return AUTH_SCOPE_OPTIONS.map(({ scope }) => ({ scope, ...labels[scope] }));
}
