import { createI18n, type i18n } from "@t3tools/client-runtime/i18n";
import { setI18n } from "react-i18next";

export const appI18n: i18n = createI18n("en");

setI18n(appI18n);
