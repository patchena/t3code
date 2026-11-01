import { createI18n } from "@t3tools/client-runtime/i18n";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { expect, it } from "vite-plus/test";

import { SourceControlAccountSettings } from "~/components/settings/SourceControlAccountSettings";

it.each(["en", "de"] as const)(
  "keeps source control names literal in %s rich descriptions",
  (language) => {
    const name = "A<project>B</project>&{{value}}";
    const definition = sourceControlClients.find("github");
    if (!definition?.credentials) throw new Error("Expected GitHub account settings.");
    const i18n = createI18n(language);
    const escaped = "A&lt;project&gt;B&lt;/project&gt;&amp;{{value}}";

    for (const accounts of [
      [],
      [{ host: "github.com", account: "personal", active: true, authenticated: true }],
    ]) {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <SourceControlAccountSettings
            environmentId={EnvironmentId.make("literal-names")}
            definition={{ ...definition, label: name }}
            credentials={{ ...definition.credentials, cliName: name, loginCommand: name }}
            auth={{
              status: "authenticated",
              account: Option.none(),
              host: Option.none(),
              detail: Option.none(),
              accounts,
            }}
            onSaved={() => undefined}
          />
        </I18nextProvider>,
      );

      expect(html).toContain(
        `<code class="rounded bg-muted px-1 py-px text-2xs">${escaped}</code>`,
      );
      if (accounts.length > 0) expect(html).toContain(`<span>${escaped}</span>`);
      expect(html).not.toContain("<project>");
    }
  },
);
