import { createI18n } from "@t3tools/client-runtime/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { expect, it } from "vite-plus/test";

import { PreviewFileNotShown } from "~/components/preview/PreviewUnreachable";

it.each(["en", "de"] as const)("preserves raw download names and hosts in %s", (language) => {
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={createI18n(language)}>
      <PreviewFileNotShown
        fileName="file<strong>name</strong>&{{missing}}.txt"
        url="host<strong>name</strong>&{{missing}}"
        downloadUrl={null}
        onOpen={() => {}}
      />
    </I18nextProvider>,
  );
  expect(html).toContain("file&lt;strong&gt;name&lt;/strong&gt;&amp;{{missing}}.txt");
  expect(html).toContain("host&lt;strong&gt;name&lt;/strong&gt;&amp;{{missing}}");
  expect(html).not.toContain("<strong>name</strong>");
});
