import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { RepositoryIdentity } from "@t3tools/contracts";
import { canonicalizeGitCafePullRequestUrl } from "@t3tools/source-control-definitions/registry";

import { sourceControlClients, type ChangeRequestTerminology } from "./sourceControlClients.ts";

const PULL_REQUEST_NUMBER_PATTERN = /^#?(\d+)$/;

export function parsePullRequestReference(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalizedInput =
    sourceControlClients.definitions
      .map((definition) => definition.checkoutCommandArgument(trimmed))
      .find((argument) => argument !== null) ?? trimmed;
  if (normalizedInput.length === 0) {
    return null;
  }

  if (
    sourceControlClients.definitions.some((definition) =>
      definition.isChangeRequestReference(normalizedInput),
    )
  ) {
    return normalizedInput;
  }

  const numberMatch = PULL_REQUEST_NUMBER_PATTERN.exec(normalizedInput);
  if (numberMatch?.[1]) {
    return numberMatch[1];
  }

  return null;
}

/** The thread project's repository, so a bare number resolves to one of its pull requests. */
export function pullRequestLinkProject(identity: RepositoryIdentity | null | undefined) {
  if (!identity) return null;
  const repository =
    identity.displayName ??
    (identity.owner && identity.name ? `${identity.owner}/${identity.name}` : null);
  if (repository === null) return null;
  const definition = sourceControlClients.get(identity.provider ?? "unknown");
  const host = sourceControlClients.changeRequestHost(identity, definition.kind);
  return {
    host,
    repository,
    terminology: definition.changeRequest,
    webUrl: (number: number) =>
      definition.changeRequestUrl({
        host,
        repository,
        number,
        remoteUrl: identity.locator.remoteUrl,
        webUrl: identity.webUrl,
      }),
  };
}

export type PullRequestLinkInputError =
  | { readonly kind: "project-unavailable"; readonly host: string; readonly repository: string }
  | { readonly kind: "repository-required" }
  | { readonly kind: "unknown-host-url"; readonly term: string };

export function formatPullRequestLinkInputError(
  error: PullRequestLinkInputError,
  t: TFunction<"workspace">,
): string {
  switch (error.kind) {
    case "project-unavailable":
      return t(($) => $.git.projectCannotRead, { host: error.host, repository: error.repository });
    case "repository-required":
      return t(($) => $.git.repositoryRequired);
    case "unknown-host-url":
      return t(($) => $.git.unknownRequestUrl, { term: error.term });
  }
}

interface ResolvedLink {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
}

export function resolveLinkPullRequestInput(input: {
  readonly reference: string;
  readonly project: {
    readonly host: string;
    readonly repository: string;
    readonly terminology: ChangeRequestTerminology;
    readonly webUrl: (number: number) => string | null;
  } | null;
  readonly hasProject: (reference: ResolvedLink) => boolean;
}): { link: ResolvedLink } | { error: PullRequestLinkInputError } | null {
  const parsed =
    sourceControlClients.parseChangeRequestUrl(input.reference.trim()) !== null
      ? input.reference.trim()
      : parsePullRequestReference(input.reference);
  if (parsed === null) return null;
  const url = sourceControlClients.parseChangeRequestUrl(parsed)?.link;
  if (url !== undefined) {
    if (!input.hasProject({ ...url, url: parsed })) {
      return { error: { kind: "project-unavailable", host: url.host, repository: url.repository } };
    }
    return {
      link: {
        host: url.host,
        repository: url.repository,
        number: url.number,
        url: canonicalizeGitCafePullRequestUrl(parsed),
      },
    };
  }
  const number = Number(parsed);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  if (input.project === null) {
    return {
      error: { kind: "repository-required" },
    };
  }
  const webUrl = input.project.webUrl(number);
  const webReference =
    webUrl === null ? undefined : sourceControlClients.parseChangeRequestUrl(webUrl)?.link;
  if (webUrl === null || webReference === undefined) {
    return {
      error: { kind: "unknown-host-url", term: input.project.terminology.singular },
    };
  }
  return {
    link: {
      host: webReference.host,
      repository: webReference.repository,
      number: webReference.number,
      url: webUrl,
    },
  };
}
