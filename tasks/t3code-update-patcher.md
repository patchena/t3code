# Patcher-Anbindung abgleichen

1. Lies die geltenden Projektanweisungen und prüfe den Arbeitszustand von T3 Code und `<projekte>/t3code-patcher`. `<projekte>` stammt aus `~/.t3code-patcher/config.json`.
2. Vergleiche die Frontend-Anbindung in T3 Code mit `frontend.patch`, `controller.cts` und `preload.cts` des Patcherprojekts. Übernimm fehlende Patcheränderungen; erhalte unabhängige Änderungen des jeweiligen T3-Quellstands.
3. Prüfe den Webbuild, die Typen der betroffenen Pakete und die geänderten Zustandsübergänge mit gezielten Tests.
4. Einrichtung und Aktivierung erfolgen nach `~/.t3code-patcher/tasks/setup.md`, die Prüfung einer aktivierten Installation nach `~/.t3code-patcher/tasks/verify-setup.md`. Installationen und Neustarts benötigen einen entsprechenden Auftrag.
