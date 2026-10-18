# Sascha AI Cloud – erste Version

Diese Erweiterung ergänzt die bisherige iPhone-taugliche Website um eine **echte serverseitige Warteschlange für KI-Artikelanalysen**. Ein dauerhaft laufender Worker bearbeitet Aufträge, wenn Safari und der PC geschlossen sind.

**Nicht enthalten:** Vinted-Anmeldung, Vinted-Publishing, Auto-Relisting, Käufernachrichten, Session-Token, Proxys oder das Umgehen von Schutzmaßnahmen. „Fertig“ heißt hier **KI-Analyse abgeschlossen**, nicht „auf Vinted hochgeladen“.

## Architektur

1. Ein bei Supabase angemeldeter Nutzer öffnet `/cloud` am Handy.
2. Die App prüft die Artikelnummer und synchronisierten Bilder und ruft `enqueue_cloud_analysis_job` auf. Die SQL-Funktion prüft den Besitzer, verhindert gleichzeitige Doppelaufträge und limitiert die Anzahl auf 100 je 24 Stunden.
3. `cloud_jobs` ist mit RLS geschützt: Nutzer können ausschließlich ihre eigenen Aufträge **lesen**; Einreihen geht nur über die validierende RPC-Funktion. Nutzer können Status/Ergebnisse nicht selber manipulieren.
4. Ein privater Node-Worker übernimmt per `claim_cloud_analysis_job` atomar einen Auftrag, erzeugt temporäre Storage-URLs für genau den zugehörigen Artikel und ruft die bestehende KI-Analyse auf `/api/analyze-pant` auf.
5. Der Worker speichert das KI-Ergebnis mit optimistischer Sperre in `pants.data`, setzt den Auftrag auf `completed` oder schreibt einen Fehler. Bei unerwartetem Neustart schützt `cloudLastAnalysisJobId` vor erneuter KI-Analyse eines bereits vollständig geschriebenen Auftrags.
6. Die Handy-Seite liest alle 8 Sekunden neue Auftragsstatus, solange sie geöffnet ist. Bei geschlossener Seite arbeitet der Worker unabhängig weiter.

## Einrichtung (einmalig durch Administrator)

1. Die bestehende Supabase-Datenbank mit Tabelle `public.pants`, Spalte `data jsonb`, Supabase Auth und Storage-Bucket `pant-images` muss bereits eingerichtet sein. **Vor der SQL-Änderung Backup anlegen.**
2. Die SQL-Datei `supabase/migrations/20261018_cloud_jobs.sql` im Supabase SQL Editor ausführen. Danach prüfen, ob `cloud_jobs` existiert und die beiden RPC-Funktionen verfügbar sind.
3. Den GitHub-PR mergen und Vercel aktualisieren. Dann ist `https://DEINE-DOMAIN/cloud` vom Handy erreichbar. Ohne SQL-Schritt zeigt die Seite einen Datenbankfehler.
4. Auf einem dauerhaft laufenden privaten Server, z. B. Railway, Render Background Worker oder eigenem VPS, diesen Worker bereitstellen. Im Root des Repos `npm ci` und `node cloud/worker.mjs` ausführen, alternativ `cloud/Dockerfile` verwenden.
5. **Nur in den privaten Server-Secrets** setzen:

   - `SUPABASE_URL`: bestehende Supabase-Projekt-URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: geheimer Supabase-Service-Role-Key, niemals `VITE_`-Variable und niemals im Browser.
   - `CLOUD_APP_URL`: HTTPS-Ursprung der bereits betriebenen Sascha-AI-App (Vercel), auf der `/api/analyze-pant` erreichbar ist.
   - optional `CLOUD_POLL_MS=10000`.
   
6. Auf dem bestehenden Vercel-Projekt muss `GEMINI_API_KEY` gesetzt sein. Ohne KI-Key oder verfügbares Kontingent schlagen Cloud-Aufträge fehl.
7. Einen Artikel mit gespeicherter Artikelnummer und in Supabase Storage synchronisierten Bildern auswählen, starten, Jobstatus beobachten, danach das Ergebnis unter Listings kontrollieren.

## Sicherheiten und Grenzen

- Der Worker benötigt **kein Vinted-Passwort** und keinen Proxy. Er arbeitet ausschließlich mit den vom Nutzer gespeicherten Artikelbildern und deren KI-Analyse.
- Es werden nur die ersten fünf hochgeladenen Bilder eines Artikels analysiert (Limit des vorhandenen API-Endpunkts).
- Änderungen an Artikeln während einer laufenden Analyse werden nicht überschrieben. Der Auftrag endet dann mit einem erklärenden Konfliktfehler.
- Bei bekanntem API-/Analysefehler wird der Auftrag als fehlgeschlagen markiert. Er kann bewusst erneut gestartet werden.
- Nach unerwartetem Worker-Ausfall ist ein Auftrag maximal zehn Minuten gesperrt. Er kann bis zu dreimal übernommen werden, danach wird er als fehlerhaft markiert.
- Der Worker arbeitet standardmäßig einen Artikel zur Zeit ab; dadurch ist die API-Last planbarer.
- Die normale Web-App speichert benutzerdefinierte Text-Prompts teilweise lokal im Browser. Der Cloud-Worker verwendet die Standardanweisungen der bestehenden KI-API; individuelle Prompt-Synchronisierung ist noch nicht implementiert.
- Die Angebotsbilder können KI-Kosten verursachen. Ein Cloud-Server oder Proxy ist **nicht automatisch kostenlos**.
- Die Ergebnisse werden erst bei erneutem Laden der normalen Listings-Ansicht angezeigt; die Cloud-Seite zeigt den Auftragsstatus.
- Externe KI-Aufrufe über die bestehenden öffentlichen API-Endpunkte benötigen vor einer breiteren Bereitstellung zusätzliche serverseitige Authentisierung und Rate-Limits. Dieses PR baut eine persönliche Worker-Warteschlange, **keine fertig gehärtete Multi-Tenant-SaaS**.

## Für spätere Ausbaustufen

Mobile Push-Benachrichtigungen, Cloud-Bildbearbeitung, verlässliche Fehler-Wiederaufnahme, separate legale Anbieter-Integrationen, rollenbasierte Teams, nachvollziehbare Zustimmungs-Workflows. Keine Vinted-Schutzumgehung oder automatische Veröffentlichung in diesem PR.
