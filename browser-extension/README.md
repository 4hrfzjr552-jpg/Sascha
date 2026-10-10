# Sascha AI → Vinted Assistant 3.0

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
5. Vinted und Sascha AI **neu laden**. Im Popup muss **3.0.0** stehen.

**Updates:** Neue Dateien in denselben entpackten Erweiterungsordner kopieren, unter \`chrome://extensions/\` „Neu laden“ klicken und den Vinted-Tab aktualisieren. Nur „Download ZIP“ auszuführen aktualisiert die installierte Erweiterung nicht. Es ist weder \`git pull\` noch das Mergen eines GitHub-PR erforderlich, wenn die Version bereits in \`main\` liegt.

## Ausfüllen

Sascha AI im Browser öffnen, vorhandene Vinted-Entwürfe übernehmen und einen Entwurf auswählen. Vinted-Verkaufsmaske in einem zweiten Tab öffnen. Im Extension-Popup „In Vinted einfügen“ klicken. Die Erweiterung bearbeitet jeden Schritt einzeln und stoppt bei einem nicht bestätigten Feld. Der Debug-Modus enthält konkrete Hinweise, warum ein Schritt gestoppt wurde.

Die Erweiterung verwendet keine Vinted-API, liest keine Kennwörter oder Cookies aus, umgeht keine Captchas und veröffentlicht nicht selbst.

### Größen

Bei Jeans mit W-Größen wird zuerst die **Originalgröße** gesucht. Gibt Vinted nur Buchstabengrößen an, können Hersteller- und Vinted-Tabellen voneinander abweichen. Eine W36 einer Diesel-Herrenjeans entspricht nach der bisherigen Referenztabelle ungefähr XXL, ist aber **keine automatisch bestätigte Etikettgröße**. Die Extension markiert solche Fälle im Log mit \`[SIZE REVIEW]\`. Unbekannte und nicht unterstützte Umrechnungen werden nicht geraten.

### Fehlersuche

Bitte den Abschnitt ab \`[ENGINE V3]\` bis \`[FERTIG]\` mit Debug-Modus senden. Bei Kategoriefehlern sind die Zeilen \`[CATEGORY INTENT]\`, \`[CATALOG SEARCH]\` und \`[CATALOG OPTIONS]\` relevant. Falls kein \`[ENGINE V3]\` erscheint, ist vermutlich noch die alte Chrome-Erweiterung oder ein alter Tab geladen.

### Tests

Die Katalogregressionen können ohne zusätzliche Abhängigkeiten mit \`node --test browser-extension/tests/catalog-v3.test.cjs\` gestartet werden. Dies ersetzt **keinen echten Integrationstest in einer angemeldeten Vinted-Sitzung**.
