# Vinted-Veröffentlichungszeitplan: 10 / 14 / 16 / 18 Uhr

## In Sascha AI
Öffne **Vinted Entwürfe** und den Abschnitt **Täglicher Vinted-Zeitplan**.

- Jeden Kalendertag sind vier feste Uhrzeiten vorgesehen: 10:00, 14:00, 16:00 und 18:00 Uhr in `Europe/Berlin`.
- **Zeitplan anlegen** weist bereits analysierte, nicht verkaufte/archivierte Jeans mit Artikelnummer, Fotos, Beschreibung und positivem Preis dem nächsten freien Zeitpunkt zu. Hosen sind absteigend nach Artikelnummer sortiert.
- Abgelaufene Uhrzeiten werden bei der Erstellung nicht nachträglich befüllt. Einträge bleiben bis zur ausdrücklichen Verkäuferprüfung offen.
- Mit **Vinted öffnen** öffnet sich das offizielle Vinted-Verkaufsformular. Die bestehende PC-Erweiterung kann einen Entwurf übernehmen und die Maske befüllen. **Text kopieren** hilft beim manuellen Smartphone-Upload.
- **Veröffentlicht** darf erst nach eigener Prüfung auf Vinted bestätigt werden. Damit wird die Artikelnummer auch bei späterem „Zeitplan neu berechnen“ nicht erneut vorgeschlagen.
- **Überspringen** lässt eine einzelne Platzierung aus; sie kann bei einer späteren Neuberechnung erneut eingeplant werden.

## Was der Zeitplan NICHT kann
Der Plan löst **keine automatisierte Veröffentlichung** aus, klickt nicht für den Nutzer auf Vinted „Hochladen“ und öffnet nicht heimlich Vinted-Sessions. Es gibt **keinen Hintergrund-Job** und keine Push-Zustellung bei geschlossener App; der Plan ist nur ein lokal gespeicherter Kalender für die manuelle Veröffentlichung. Browserdaten sind nicht geräteübergreifend synchronisiert.

Vinted untersagt laut den aktuellen Nutzungsbedingungen nicht autorisierte externe automatisierte Tools. Die offizielle Vinted Pro Integrations API ist ausschließlich für freigeschaltete/allowlistete Pro-Unternehmen erreichbar. Eine echte zeitgesteuerte Server-Veröffentlichung braucht die entsprechende Vinted-Autorisierung sowie eine gesicherte, serverseitige Warteschlange und einen überprüfbaren Veröffentlichungsstatus; die Browser-Erweiterung ist dafür kein Ersatz.

Offizielle Quellen:
- Vinted Terms: https://www.vinted.com/terms-and-conditions
- Vinted Pro Integrations: https://pro-docs.svc.vinted.com/

## Technik & Tests
- Planung ist in `src/lib/vintedPublishSchedule.ts` isoliert und wird in `src/components/VintedDraftsModal.tsx` angezeigt.
- Uhrzeiten werden explizit in `Europe/Berlin` berechnet, sodass Sommer-/Winterzeitwechsel berücksichtigt werden.
- Lokale Zustände liegen unter `sascha-vinted-publish-plan-v1` in `localStorage`. Abgeschlossene **Artikelnummern** werden gespeichert, nicht nur vorläufige Entwurf-IDs.
- Tests: `tests/vinted-publish-schedule.test.mjs`; enthalten Zeitfenster, vergangene Slots, Sommerzeit, Filter, Dubletten und Neuplanung.
