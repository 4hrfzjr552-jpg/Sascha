# Sascha AI Unified Inbox (MVP)

## Aktueller Stand

Über `/inbox` gibt es eine handygeeignete, gemeinsame Nachrichtenansicht mit:

- mehreren getrennt benannten Vinted-Konten,
- einem Filter „Alle Konten“ oder pro Konto,
- Suche über Chatpartner, Artikel und Kontoname,
- Chatverläufen und Markierung ungelesener Gespräche,
- manueller Erfassung bereits vorhandener Nachrichten und optionalem Chat-Link zurück zu Vinted.

**Wichtige Abgrenzung:** Das neue Feature **liest keine Nachrichten aus Vinted** und **sendet keine**. Es ist eine verschlüsselt transportierte und nutzerbezogen geschützte Datensammlung für eigene oder anderweitig rechtmäßig erhaltene Chatdaten. Die Option „Nachricht hinzufügen“ bedeutet *importieren*, nicht *antworten*. Der angezeigte Status „manuell“ ist kein Verbindungsstatus.

## Einrichtung

1. PR mergen und die Website über Vercel aktualisieren.
2. In Supabase unter SQL Editor die Datei `supabase/migrations/20261018_unified_inbox.sql` ausführen (vorher Datenbank-Backup).
3. Vom iPhone `https://DEINE-DOMAIN/inbox` öffnen und wie gewohnt mit Sascha AI anmelden.
4. Mit „Konto“ einen Anzeigenamen für **ein legitim selbst verwaltetes** Vinted-Konto anlegen. **Keine Passwörter, Session-Cookies, Proxy-Kennwörter oder API-Keys in diesem Formular eingeben.**
5. „Chat hinzufügen“ auswählen, Konto, Chatpartner und optional den passenden Vinted-Link angeben; bestehende Nachrichten manuell importieren.

## Warum das noch kein Vintz-Live-Chat ist

AdsPower stellt Browserprofile, Proxy-Einstellungen und Local API bereit. Es ist **kein Vinted-Messaging-Provider**. Eine vollautomatische Inbox benötigt eine vom Plattformbetreiber erlaubte Anbindung oder eine anderweitig autorisierte und zuverlässig getestete Nachrichtenquelle.

Die öffentlich dokumentierte Vinted-Pro-Integrations-API ist nur für freigeschaltete Unternehmen vorgesehen; die aktuell veröffentlichten Endpunkte dokumentieren Artikel-, Bestell- und Versandfunktionen, aber keinen öffentlich zugänglichen Chat-Endpunkt. Deshalb wäre die Aussage „deine Vinted-Chats synchronisieren jetzt live“ falsch.

Eine zukünftige Nachrichtenbrücke muss unabhängig von der Darstellung ergänzt werden: jeweils mit nachweisbarer Autorisierung, Account-Zuordnung, serverseitiger Authentifizierung, deduplizierten Nachrichten-IDs, Schonung der Plattform, sicherer Sitzungsverwaltung und klaren Fehlermeldungen. Kein ungeprüftes Sammeln von Anmeldedaten, keine Umgehung von Kontosperren oder technischen Schutzmaßnahmen.

## Datenschutz

Die SQL-Migration erstellt `inbox_accounts`, `inbox_threads`, `inbox_messages` mit RLS und Eigentümerprüfung über Fremdschlüssel. Nur der authentifizierte Besitzer kann seine Konversationen sehen, hinzufügen und bearbeiten. Supabase-Service-Role-Secrets bleiben ausschließlich serverseitig. Chattexte können persönliche Daten anderer Menschen enthalten; rechtmäßige Verarbeitung, Datensparsamkeit und Löschung sind wichtig.

## Aktuelle Einschränkungen

- Noch kein Online-Sync, keine Push-Nachrichten, keine echten Vinted-Ungelesen-Informationen.
- Ein neu angelegter Account ist nur ein Eintrag in Sascha AI, kein Login bei Vinted.
- Eigene Nachrichten in der Oberfläche sind importierte/vermerkte Nachrichten, sie werden nicht versendet.
- Bei mehr als 500 Nachrichten je Chat werden zunächst nur die ersten 500 in aufsteigender Zeitreihenfolge geladen. Pagination ist noch offen.
- Die Inbox-Verläufe werden aktuell nicht automatisch live neu geladen, wenn der Server parallel neue Nachrichten schreibt; die Chatliste lässt sich aktualisieren und wird während des geöffneten Fensters alle 15 Sekunden abgefragt.
