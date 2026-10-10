# Sascha AI → Vinted Assistant 3.9

Die Chrome-Erweiterung übernimmt einen vollständigen Entwurf aus Sascha AI in die geöffnete Vinted-Verkaufsmaske. **Sie veröffentlicht und speichert nichts automatisch.** Alle Angaben vor dem Speichern prüfen.

## Neuentwicklung (v3)

Der alte Formular-Code (\`content-vinted.js\`) wird **nicht mehr geladen**. Chrome lädt jetzt:

- \`vinted-catalog-v3.js\`: ordnet erkannte Jeans anhand von Typ, Herren/Damen und Schnitt einer im echten Vinted-Katalog belegten Kategorie-ID zu
- \`content-vinted-v3.js\`: verarbeitet Titel, Beschreibung, Kategorie, Marke, Größe, Farbe, Zustand, Preis und Bilder in getrennten Schritten und prüft ihre Übernahme

Die Kategorie wird **nicht** durch blindes Klicken auf irgendeine „Jeans“-Zeile gesetzt. Die Extension sucht den genauen Eintrag, überprüft Kategorie-ID, Bezeichnung und Geschlechtszuordnung in den live angezeigten Ergebnissen und stoppt bei fehlender Eindeutigkeit.

### Bekannte Vinted-Kategorien

Die folgende Zuordnung stammt aus realen Vinted-Katalog-Suchergebnissen und ist bewusst begrenzt. Weitere Kategorien können ergänzt werden, sobald echte Vinted-Ergebnisse vorliegen.

| Bereich | Schnitt | Vinted Kategorie-ID |
| --- | --- | --- |
| Herrenjeans | Gerade geschnitten | 1819 |
| Herrenjeans | Slim | 1818 |
| Herrenjeans | Skinny | 1817 |
| Herrenjeans | Ripped | 1816 |
| Damenjeans | Gerade geschnitten | 1845 |
| Damenjeans | Skinny | 1844 |
| Damenjeans | Schlaghose / Bootcut | 1841 |
| Damenjeans | Boyfriend | 1839 |
| Damenjeans | Ripped | 1843 |
| Damenjeans | Cropped | 1840 |
| Damenjeans | Hohe Taille | 1842 |
| Herren-Jeansshorts | — | 1824 |
| Damen-Jeansshorts | — | 538 |

**Kein vollständiger offizieller Vinted-Katalog.** Für andere Artikelarten, unklare Geschlechter und nicht zugeordnete Schnitte ist eine manuelle Kategoriewahl erforderlich.

## Installation in Google Chrome unter Windows

1. Repository [Sascha](https://github.com/4hrfzjr552-jpg/Sascha) auf GitHub öffnen und **Code → Download ZIP** wählen.
2. ZIP entpacken und den **Ordner \`browser-extension\`** an einem festen Ort behalten.
3. In Chrome \`chrome://extensions/\` öffnen und den Entwicklermodus aktivieren.
4. „Entpackte Erweiterung laden“ wählen und den Ordner \`browser-extension\` auswählen.
5. Vinted und Sascha AI **neu laden**. Im Popup muss **3.9.0** stehen.

**Updates:** Neue Dateien in denselben entpackten Erweiterungsordner kopieren, unter \`chrome://extensions/\` „Neu laden“ klicken und den Vinted-Tab aktualisieren. Nur „Download ZIP“ auszuführen aktualisiert die installierte Erweiterung nicht. Es ist weder \`git pull\` noch das Mergen eines GitHub-PR erforderlich, wenn die Version bereits in \`main\` liegt.

## Ausfüllen

Sascha AI im Browser öffnen, vorhandene Vinted-Entwürfe übernehmen und einen Entwurf auswählen. Vinted-Verkaufsmaske in einem zweiten Tab öffnen. Im Extension-Popup „In Vinted einfügen“ klicken. Die Erweiterung bearbeitet jeden Schritt einzeln und stoppt bei einem nicht bestätigten Feld. Der Debug-Modus enthält konkrete Hinweise, warum ein Schritt gestoppt wurde.

Die Erweiterung verwendet keine Vinted-API, liest keine Kennwörter oder Cookies aus, umgeht keine Captchas und veröffentlicht nicht selbst.

### Größen

Vinted bietet bei manchen Jeans-Kategorien zuerst die allgemeinen Buchstabengrößen XS–7XL an. Bei einer Originalgröße wie W36 wählt die Extension zuerst die Unterkategorie **„Taillenumfang“** und danach **W36 bzw. 36**, sofern Vinted diese Größe wirklich anbietet.

**Es erfolgt keine automatische Umrechnung W36 → XXL mehr.** Wenn das Taillenumfang-Menü oder die exakte Originalgröße nicht erkennbar ist, stoppt die Extension, statt eine möglicherweise falsche Buchstabengröße einzutragen.

Im Log stehen [SIZE GROUPS], [SIZE WAIST] und [SIZE SELECTED]. Vor Veröffentlichung bitte die Originalgröße und alle Angaben kontrollieren.

### Zustandsauswahl

Vinted hängt an Zustände wie „Sehr gut“ längere Beschreibungen an. Die Extension erkennt deshalb den Zustandsnamen am Anfang des Auswahltexts und prüft anschließend, ob „Sehr gut“ auch wirklich als Feldwert übernommen wurde.

### Preisbestätigung

Der Preis wird **nach dem Verlassen des Eingabefelds** geprüft. Vinted kann `25,00`, `25.00` oder `25,00 €` anzeigen; diese Darstellungen entsprechen demselben Betrag. Die Extension vergleicht Cent-Beträge und kontrolliert, ob der Wert nach der Formatierung erhalten bleibt.

Bei Problemen protokolliert `[PRICE VERIFY]` Sollbetrag, tatsächlichen Feldtext und Prüfergebnis. Ein wirklich abweichender Preis wird weiterhin nicht als Erfolg gewertet.

### Fotos in Vinted

Aus dem Sascha-AI-Entwurf werden **nur Bilder 1–4 in ihrer ursprünglichen Reihenfolge** übernommen. Bild 5 und alle späteren Bilder werden ausdrücklich ausgelassen; bei weniger als vier Bildern werden nur die vorhandenen übertragen.

**Alle ersten vier Bilder werden vor dem Upload lokal neu aufbereitet:** Die Extension wendet auf das ganze Bild denselben dezenten Helligkeits-, Kontrast- und Farblook nach dem vom Nutzer vorgegebenen Vergleichsfoto an. Keine Entfernung von Schrift oder blauen Markierungen, kein Hintergrundtausch und kein absichtlicher Crop oder Zoom. Die blaue Zahl im Beispiel diente nur zur Unterscheidung der beiden Referenzbilder. Die Jeans, Nähte und sichtbaren Gebrauchsspuren bleiben erkennbar.

Anschließend werden die ersten vier Fotos als neue JPG-Dateien exportiert. Bild 5 und weitere Fotos werden nicht übernommen. Bildbearbeitung kann keine Akzeptanz durch Vinted garantieren. Kontrolliere vor dem Speichern, dass die tatsächliche Jeansfarbe korrekt dargestellt wird.

Die Extension führt keine Markierungsentfernung und keine generative Hintergrundersetzung aus. Bitte alle vier Bilder **vor dem Speichern kontrollieren**. Bei fehlgeschlagener Bearbeitung werden keine unbearbeiteten Originaldateien ersatzweise übertragen.

Vinted kann das native Dateifeld direkt nach der Übernahme leeren. Das ist für sich allein kein Upload-Fehler. Die Erweiterung kontrolliert daher nach Möglichkeit die Vinted-Fotovorschau. Kann sie die angezeigten Vorschaubilder nicht sicher zählen, meldet sie **„Bilder bitte prüfen“** und bezeichnet den Upload nicht als bestätigt.

Bitte immer ein **neues, leeres Vinted-Formular** verwenden, wenn beim vorherigen Versuch Bilder bereits eingefügt wurden. Bereits vorhandene Bilder einschließlich Bild 5 werden nicht automatisch entfernt.

### Fotoquellen und abgelaufene Links (3.8.0)

Die von Sascha AI bei Supabase gespeicherten Bilder können zeitlich begrenzte Links (ca. 1 Stunde) haben. Beim Abrufen des Vinted-Entwurfs werden gespeicherte Supabase-Bildlinks **immer erneuert**. Die ersten vier Fotos werden anschließend **im Sascha-AI-Tab selbst geladen und als data:image/-Bilddaten übertragen**, bevor die Extension sie lokal bearbeitet. So muss die Vinted-Seite keine abgelaufenen oder durch CORS gesperrten Supabase-Links selbst abrufen.

Im Debug-Log erscheinen `[IMAGE SOURCE]` und im Fehlerfall `[IMAGE LOAD ERROR]`, ohne geheime URL-Tokens zu veröffentlichen. Wenn ein Bild fehlt oder der Bildserver nicht erreichbar ist, wird der Fehler bereits beim Entwurfabruf genannt. Beide Browser-Tabs (Sascha AI **und** Vinted) nach Installation/Deployment aktualisieren.

Die Änderung an `src/lib/vintedDraftUtils.ts` ist eine **Web-App-Änderung**, keine bloße Erweiterungsdatei. Sie muss über die eigene Sascha-AI-Website bereitgestellt sein.

### Fehlersuche

Bitte den Abschnitt ab \`[ENGINE V3]\` bis \`[FERTIG]\` mit Debug-Modus senden. Bei Kategoriefehlern sind die Zeilen \`[CATEGORY INTENT]\`, \`[CATALOG SEARCH]\` und \`[CATALOG OPTIONS]\` relevant. Falls kein \`[ENGINE V3]\` erscheint, ist vermutlich noch die alte Chrome-Erweiterung oder ein alter Tab geladen.

### Tests

Die Katalogregressionen können ohne zusätzliche Abhängigkeiten mit \`node --test browser-extension/tests/catalog-v3.test.cjs\` gestartet werden. Dies ersetzt **keinen echten Integrationstest in einer angemeldeten Vinted-Sitzung**.
