# Rechtschreibprüfung im Eingabefeld abschaltbar machen

## Auftrag

Implementiere in T3 Code unter Einstellungen → Chat → Eingabe einen Schalter „Rechtschreibprüfung“. Er steuert die browserseitige Rechtschreibprüfung der Prompt-Eingabefelder in Web und Desktop. Ausgeschaltet erscheinen dort keine Rechtschreibmarkierungen mehr. Die Prüfung lässt sich wieder einschalten.

Annahme für die Umsetzung: Der Standardwert bleibt aktiviert. Die Einstellung gilt lokal für den jeweiligen Client und bleibt nach Neuladen beziehungsweise Neustart erhalten.

## Anforderungen

- Verwende den vorhandenen Client-Einstellungspfad mit einem booleschen Feld `composerSpellCheckEnabled` in `ClientSettingsSchema` und `ClientSettingsPatch`, einschließlich Standardwert.
- Integriere den Schalter in `ChatSettingsPanel`, die Einstellungssuche, die Anzeige geänderter Einstellungen sowie individuelles und allgemeines Zurücksetzen. Ergänze deutsche und englische Texte im vorhandenen i18n-System.
- Übergib den wirksamen Wert an den gemeinsamen Prompt-Editor und setze `spellcheck` explizit auf dessen bearbeitbarem DOM-Element. Berücksichtige Rich-Text- und Klartextmodus sowie alle produktiven Aufrufstellen einschließlich der Editorvorschau in den Einstellungen.
- Änderungen wirken auf bereits geöffnete Eingabefelder ohne Neustart, Remount, Verlust des Entwurfs oder Verschieben der Auswahl. Die deaktivierte Prüfung muss auch bereits sichtbare Markierungen entfernen.
- Verwende die vorhandene Persistenz für Browser und Desktop. Speicherfehler bleiben sichtbar. Ein Wechsel des verbundenen Environments verändert diese lokale Präferenz nicht.
- Begrenze die Einstellung auf T3-eigene Prompt-Editoren. Eingebettete Webseiten und bereits ausdrücklich deaktivierte Prüfungen anderer Felder bleiben unberührt. Verwende keine globale Abschaltung der Electron-Session, CSS-Unterdrückung oder eigene Rechtschreibprüfung.
- Rechtschreibsprache und Autokorrektur erhalten keine zusätzlichen Einstellungen.

## Einstiegspunkte

- `packages/contracts/src/settings.ts`: Client-Vertrag, Patch und Standardwerte.
- `apps/web/src/hooks/useSettings.ts`: Lesen, Aktualisieren und Persistieren lokaler Einstellungen.
- `apps/web/src/components/settings/SettingsPanels.tsx`: Chat-Einstellungen, Zurücksetzen und geänderte Einstellungen.
- `apps/web/src/components/settings/settingsSearch.ts`: Suchindex.
- `packages/client-runtime/src/i18n/{de,en}/settings.ts`: Übersetzungen.
- `apps/web/src/components/chat/ChatComposer.tsx` und `apps/web/src/components/settings/SettingsFontPreviews.tsx`: produktive Editor-Aufrufstellen.
- `apps/web/src/components/ComposerPromptEditorTiptap.tsx`: `editorAttributes`, `useEditor` und bestehende Aktualisierung über `editor.view.setProps`.
- `apps/desktop/src/settings/DesktopClientSettings.ts` und `apps/desktop/src/ipc/methods/clientSettings.ts`: Desktop-Persistenz und Schemaübertragung.

## Mobile-Abgrenzung

Der Implementierungsumfang ist Web und Desktop. Prüfe die betroffenen gemeinsamen Verträge auch gegen Mobile und benenne beim Abschluss ausdrücklich den Mobile-Status. Mobile verwendet einen eigenen Editor mit `spellCheck`-Prop in `apps/mobile/src/native/T3ComposerEditor*`. Android verknüpft in `updateInputFlags` derzeit `autoCorrect` und `spellCheck`; eine mobile Erweiterung benötigt deshalb eine gesonderte Entscheidung über die Tastaturvorschläge.

## Durchführung und Abnahme

1. Lies die geltenden Projektanweisungen und prüfe den aktuellen Arbeitsstand sowie die genannten Datenflüsse.
2. Implementiere die Einstellung über die vorhandenen Strukturen ohne zusätzliche Abhängigkeiten.
3. Erweitere vorhandene Tests nur für relevante Risiken der Speicherung und dynamischen Editoraktualisierung. Prüfe insbesondere Ausschalten und Wiedereinschalten bei bestehendem Entwurf und bestehender Auswahl; vermeide reine Prop- und Markup-Tests.
4. Baue die betroffenen Pakete mit dem Repository-Tooling und prüfe ihre Typen gezielt. Keine repo-weiten Prüfungen.
5. Prüfe den integrierten Ablauf mit `test-t3-app` in isoliertem Entwicklungszustand. Belege vorhandene und entfernte Markierungen am gleichen Text im Desktop-Client; prüfe zusätzlich Web, beide Editormodi, Neuladen, Zurücksetzen und Suche. Benenne nicht verfügbare Plattformen und verbleibende Abnahmegrenzen ausdrücklich.
6. Übergib Änderungen und Prüfergebnisse. Keine Installation in die laufende T3-Instanz, keine Commits, Pushes oder PRs ohne gesonderten Auftrag.
