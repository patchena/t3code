import { createI18n } from "@t3tools/client-runtime/i18n";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vite-plus/test";

import { DraftHeroProjectHeading } from "~/components/chat/DraftHeroProjectHeading";

it.each(["en", "de"] as const)("keeps project names literal in %s rich headings", (language) => {
  const name = "A<project>B</project>&{{value}}";
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={createI18n(language)}>
      <DraftHeroProjectHeading projectName={name}>
        <button type="button">{name}</button>
      </DraftHeroProjectHeading>
    </I18nextProvider>,
  );

  expect(html).toContain(
    '<button type="button">A&lt;project&gt;B&lt;/project&gt;&amp;{{value}}</button>',
  );
  expect(html).not.toContain("<project>");
});
