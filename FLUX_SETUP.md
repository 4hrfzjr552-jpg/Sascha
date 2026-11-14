# Sascha AI – FLUX.2 Bildbearbeitung (Spar- und Qualitätsmodus)

## Vor dem ersten kostenpflichtigen Test

1. Bei [Black Forest Labs](https://dashboard.bfl.ai/) ein Konto/API-Projekt anlegen und unter **API Keys** einen Schlüssel erstellen. Falls noch kein Guthaben vorhanden ist, erst ein kleines Prepaid-Guthaben hinzufügen.
2. Unter **Credits** die **automatische Aufladung AUS lassen**. Das prepaid Guthaben ist dann die **harte kontoweite Ausgabengrenze** (nach Aufbrauchen gibt BFL HTTP 402 zurück). Die Browser-Budgetschätzung in Sascha AI ist keine globale Kontosperre.
3. In Vercel für das **Sascha**-Projekt unter **Settings → Environment Variables** `BFL_API_KEY` als **Secret** für **Production** hinterlegen; wenn Preview-Tests nötig sind, auch Preview auswählen. Schlüssel **niemals** in GitHub-Quelltext, Screenshots oder Browser-LocalStorage eintragen.
4. Erneutes Deployment auslösen, damit die neue Environment-Variable wirksam wird. Optional: `BFL_MAX_REQUEST_USD=0.06`; ohne Angabe gelten 0,06 USD als serverseitiger **Preflight-Richtwert pro Bild**. Dieser Wert blockiert teurere Modellwahlen *bevor* der Auftrag an BFL gesendet wird, ist aber **keine Abrechnungsgarantie** bei Preisänderungen von BFL.

## Bedienung in Sascha AI

Öffne eine Jeans → Foto → **Foto** / **BG**:

- **Bild-KI auswählen**: FLUX.2 Klein (günstig, Standard), FLUX.2 Pro (Qualität), oder bisheriges Gemini.
- **Klein 4B**: offizieller Image-Edit-Grundpreis bei ungefähr 1 MP mit einem bis 1 MP großen Originalreferenzfoto ab ca. **$0.015**. Sascha AI plant vorsichtig **$0.025** im lokalen Budget ein.
- **Pro**: entsprechend ab ca. **$0.045**, vorsichtig **$0.060** im lokalen Budget.
- **Lokales Monatsbudget**: $0.50, $1, $2 oder $5, anfänglich $1. Die Einplanung wird je kostenpflichtigem FLUX-Bearbeitungsversuch im Browser gespeichert. **NICHT** kontoweit, nicht geräteübergreifend, und nicht die tatsächlich vom Anbieter abgerechnete Summe. BFL-Credits und Auto-Top-up steuern das echte Anbieter-Guthaben.
- **Experimentelles Flatlay**: Bitte explizit **Vorderseite** oder **Rückseite** wählen. Nur das echte Jeansfoto wird zur Bildbearbeitung geschickt – keine andere Jeans als Referenz. Zwei Knicke pro Bein und sich berührende Beinöffnungen sind Prompt-Vorgaben, nicht garantiert.
- **Detail/Bund/Etikett**: Close-up bleibt Close-up.
- **Alle Hintergründe ändern**: gemeinsame Hintergrundwahl + separate **Bild-KI für Hintergründe** direkt über den vier Produktfotos; der gewählte Anbieter wird nacheinander für die Produktfotos angewandt, mit lokalem Kostenschutz. Der fünfte Tüten-/Artikelnummer-Slot bleibt ausgeschlossen. Alle Ergebnisse müssen vor Vinted einzeln kontrolliert/freigegeben werden.
- **Alle Bilder verschönern**: weiterhin die kostenfreie, nicht-generative, originalgetreue Licht-/Kontrastverbesserung. Dafür wird weder BFL noch Gemini aufgerufen.

## Technik und Ausgabenschutz

- `api/flux-edit.ts`: eigener authentifizierter Vercel-API-Endpunkt. Nur eine kostenpflichtige BFL-Bildgenerierung je Aufruf, **kein Gemini-Zusatzprüfer und kein automatischer zweiter Versuch**. FLUX-Preflight-Preisgrenze auf dem Server: Klein bis Schätzwert $0.025, Pro bis Schätzwert $0.060, konfigurierbar per `BFL_MAX_REQUEST_USD`.
- Anfrage: `POST https://api.bfl.ai/v1/flux-2-klein-4b` oder `POST .../flux-2-pro`, mit **x-key nur serverseitig**, tatsächlichem Original als Base64-Referenz und 992×992 Bildausgabe. Die 992-px-Ausgabe und auf max. 960 px komprimierte Eingabe halten beide unter 1 MP. Ein extra Layoutbild wird bewusst nicht geschickt, um eine falsche Vorder-/Rückseite und zusätzliche Referenzkosten zu vermeiden.
- BFL antwortet asynchron mit `polling_url`; der Server prüft streng die URL-Domains, fragt den Status ab und lädt das temporäre JPEG-Bild aus der BFL-Delivery-Domain. Kein automatischer kostenpflichtiger Retry.
- Nur bei einem **eindeutig nicht berechneten** Fehler (etwa ohne BFL_API_KEY oder vor Akzeptanz eines Auftrags) wird eine lokale Budgetreservierung wieder gelöst; Netzwerkfehler nach Einreichung bleiben vorsichtshalber gezählt.
- Die BFL-Abrechnung kann sich ändern, und die Browser-Schätzung kann von den tatsächlichen Credits abweichen. Ein garantiertes, serverweit konsistentes monatliches Limit würde eine separate transaktionale Datenbank/Abrechnungsfunktion erfordern und ist **nicht** implementiert.
- Die KI kann Jeans-Details auch mit FLUX verändern. **Vor Freigabe für Vinted alle Fotos mit ihren echten Originalen vergleichen.** Ungeprüfte KI-Fotos dürfen nicht als authentische Zustandsbelege dienen.

## Offizielle Quellen
- BFL API endpoints: https://github.com/black-forest-labs/skills/blob/master/skills/bfl-api/references/endpoints.md
- BFL API Schnellstart: https://help.bfl.ai/articles/8446125349-quickstart-guide
- BFL Preise: https://bfl.ai/pricing
- BFL Prepaid / Auto Top-up: https://help.bfl.ai/articles/5259400552-what-happens-when-i-run-out-of-credits
