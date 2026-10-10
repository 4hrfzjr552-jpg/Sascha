# Sascha AI → Vinted Assistant 3.22

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
5. Vinted und Sascha AI **neu laden**. Im Popup muss **3.22.0** stehen.

**Updates:** Neue Dateien in denselben entpackten Erweiterungsordner kopieren, unter \`chrome://extensions/\` „Neu laden“ klicken und den Vinted-Tab aktualisieren. Nur „Download ZIP“ auszuführen aktualisiert die installierte Erweiterung nicht. Es ist weder \`git pull\` noch das Mergen eines GitHub-PR erforderlich, wenn die Version bereits in \`main\` liegt.

## Größe aus Bundweite schätzen (3.14)

Wenn **keine Etikettgröße angegeben** ist, nutzt die Extension bei eindeutig erkannten Herren-/Damen-Jeans die in Sascha AI gespeicherte **flach gemessene Bundweite**. Als Näherung gilt:

`W ≈ (Bundweite in cm × 2) / 2,54` – auf die nächste ganze W-Größe gerundet.

Beispiel: 39 cm Bundweite flach entsprechen rechnerisch 78 cm Umfang. Bei **Herrenjeans** wird ungefähr **W31** vorgeschlagen, bei **Damenjeans** ungefähr **M** (aus einer allgemeinen, nicht markenspezifischen Damengrößentabelle). Die tatsächliche Herstellergröße kann durch Schnitt, Stoffdehnung und Größenabweichungen deutlich abweichen.

- Eine vorhandene Größenangabe, beispielsweise `W36`, hat **immer Vorrang** und wird nicht überschrieben.
- Ohne zuverlässige flach gemessene Bundweite wird **keine Größe geraten**. Gesamtlänge, Innenbeinlänge oder Beinöffnung reichen für eine Taillenweite nicht aus.
- Bei Herren werden nur **echte Vinted-W-Größen aus dem Taillenumfang-Menü** gewählt. Bei Damenjeans werden verfügbare **Buchstabengrößen XS/S/M/L/XL/XXL/3XL** verwendet, statt nach einer nicht angebotenen W-Größe zu suchen.
- Hat eine Damenjeans ein Etikett mit W-Größe (z. B. `W36`), aber Vinted bietet nur Buchstabengrößen, wird eine **vorläufige Umrechnung** vorgeschlagen. Auch ausdrücklich als `US 8` oder `EU 40` angegebene Etikettgrößen können näherungsweise umgerechnet werden. Eine nackte `36` ohne Größenformat wird **nicht geraten**.
- Liegt eine echte Damen-Buchstabengröße wie `M` oder `L` vor, bleibt sie erhalten. Wenn Vinted die Original-Etikettgröße tatsächlich anbietet, bleibt sie ebenfalls erhalten.
- Das Einzelergebnis zeigt `[SIZE ESTIMATE]` und `[SIZE REVIEW]`. Bei einer Umrechnung ist die Original-Etikettgröße nicht identisch mit der angebotenen Buchstabengröße; das Ergebnis muss deshalb geprüft werden.
- **Stapelmodus (ab 3.19):** Geschätzte Größen dürfen nach ausdrücklicher Zustimmung als **Entwurf** gespeichert werden. Die Größe bleibt als unsicher gekennzeichnet und muss vor der Veröffentlichung geprüft werden. Ohne Zustimmung stoppt der Stapel.

So bleiben unbekannte Herstellergrößen im Stapel als Schätzung dokumentiert; vor einer Veröffentlichung ist eine echte Größenprüfung notwendig.

### Tab-Laden im Stapelmodus (3.15.0)

Nach `chrome.tabs.create()` hat ein neuer Chrome-Tab manchmal für kurze Zeit noch die Adresse `about:blank`, `chrome://newtab` oder nur `pendingUrl`. Vorher wurde dies irrtümlich als „Vinted-Tab hat die Verkaufsseite verlassen“ bewertet, sodass der Stapel schon vor dem ersten Formularfeld stoppte.

Die Erweiterung wartet jetzt bis zu **35 Sekunden** auf die echte Vinted-Verkaufsseite und darauf, dass die zwei Basis-Felder im Formular sichtbar sind. Nur temporäre Ladezustände auf einem neu geöffneten Tab werden abgewartet. Bei tatsächlicher Fremdseiten-Weiterleitung wird weiterhin **sofort gestoppt**, mit der URL ohne Query-Parameter oder Geheimtokens in der Fehlermeldung. Bei Login- oder Formularproblemen auf der Vinted-Domain gibt es einen aussagekräftigen Timeout statt einer falschen Weiterleitungsdiagnose. Ein nicht bestätigter Speicher-Schritt wird nie automatisch wiederholt.

### Vier übergebene Fotos trotz nicht lesbarer Vinted-Vorschau (3.16.0)

In einigen Vinted-Varianten nimmt das Datei-Eingabefeld die ersten vier bearbeiteten Bilder an und die Galerie zeigt sie an, aber die Extension findet die Vorschau nicht über ihre bisherigen HTML-Selektoren. Das führte im **Stapelmodus** zu `Feld images muss noch manuell geprüft werden`, auch wenn die Bilder sichtbar waren.

**Neu:** Die Galerie-Erkennung berücksichtigt zusätzlich einen Foto-Bereich ohne spezielle Test-ID, echte Bildvorschauen mit anderen CDN-Hosts und CSS-`background-image`-Thumbnails. Sie wartet bis zu **8,5 Sekunden**, bevor sie den Upload als nicht automatisch verifizierbar einstuft.

Sind die Vorschaubilder weiter nicht technisch auslesbar, darf **nur der ausdrücklich gestartete Entwurfs-Stapelmodus** nach dem erfolgreichen Übertragen von **genau vier bearbeiteten Dateien** mit „Entwurf speichern“ fortfahren. Dabei wird **nicht behauptet**, dass Vinted die Bilder bestätigt hat: Im Log erscheint `[IMAGES DRAFT-ONLY]`. Nach erfolgreichem Entwurf-Speichern zeigt das Popup zusätzlich einen auffälligen Hinweis mit der Artikelnummer an, dass du Bilder 1–4 **im gespeicherten Entwurf kontrollieren musst**.

Einzelmodus verlangt weiterhin eine manuelle Sichtprüfung, wenn die Galerie unbekannt bleibt. Werden zu wenige Dateien angenommen, scheitert die Bearbeitung, oder Vinted bestätigt das **Speichern** nicht, stoppt der Stapel weiterhin. **Kein automatisches Veröffentlichen.** Der Stapel erstellt im schlechtesten Fall einen unvollständigen Entwurf, deshalb nach dem Test unbedingt Fotoanzahl und Reihenfolge im Entwurf prüfen.

### Entwurf gespeichert, aber Vinted bestätigt nicht sichtbar (3.17.0)

Ein echter Nutzer-Test ergab, dass Vinted die Hose **#73 bereits als Entwurf angelegt** hatte, obwohl die Extension nur „0/1 bestätigt“ und einen Timeout meldete. Ursache ist eine zu enge Bestätigungserkennung: Vinted kann einen Entwurf ohne erkennbaren Wechsel auf eine unterstützte Entwurfs-URL speichern und eine andere oder sehr kurz sichtbare Bestätigung anzeigen.

- Die Extension beobachtet **vor dem Klick** auf „Entwurf speichern“ die Live-Regionen, Toasts und Benachrichtigungen und merkt sich auch schnell wieder verschwundene positive Erfolgsnachrichten. Deutsch und Englisch mit variierenden Formulierungen werden berücksichtigt. Fehlertexte gelten ausdrücklich **nicht** als Erfolg.
- Bleibt eine zweifelsfreie Bestätigung aus, wechselt der Stapel in **„Speicherung bitte prüfen“**. Es erfolgt weder ein zweiter Klick noch ein erneuter Upload.
- Im Extension-Popup erscheint dann **„Entwurf auf Vinted geprüft – als gespeichert bestätigen“**. **Nur anklicken, nachdem du den betreffenden Artikel tatsächlich im Vinted-Profil unter deinen Entwürfen gefunden hast.**
- Durch die Bestätigung wird **genau die aktuelle Artikelnummer** lokal als erledigt markiert. Bei weiteren Entwürfen setzt der Stapel mit der **nächsten Hose** fort, ohne den bestätigten Artikel erneut einzustellen.
- Die Bestätigungsfunktion kann auch den bestehenden **v3.16-Fehlerstatus** für #73 übernehmen, sofern im gespeicherten Log ein tatsächlicher Speicher-Klick dokumentiert ist. Voraussetzung: Die Extension wird aktualisiert, ohne ihren lokalen Speicher zu verlieren.
- Die Bestätigung ist die Aussage des Nutzers nach eigener Sichtprüfung, **keine behauptete automatische Vinted-Bestätigung**. Bei unbekannten Formular-/Foto-/Größenfehlern bleibt das Stoppen bestehen.

**Nicht einfach erneut auf „Stapel starten“ für #73 klicken:** Du würdest sonst womöglich doppelte Entwürfe anlegen. Keine automatische Veröffentlichung.

### Fehler „Formular nicht vollständig: size“ bei Hose #71 (3.18.0)

Bei Artikel **#71** zeigt Sascha AI eine **flach gemessene Bundweite von 38 cm** und keine Innenbeinlänge. Das entspricht rechnerisch ungefähr **W30** (bei Herren) beziehungsweise einem unverbindlichen Buchstabengrößen-Vorschlag **M** (bei Damen). Die fehlende Innenbeinlänge beeinflusst die Taillengröße nicht.

Die bisherige Stapelmeldung `Formular nicht vollständig: size` verschluckte den **konkreten Fehlergrund**, den die Vinted-Formular-Engine bereits liefert. Ab 3.18 zeigt sie stattdessen beispielsweise:

- `Formular nicht vollständig: Größe: Taillenumfang geöffnet, aber W30 nicht als Option gefunden`
- `Formular nicht vollständig: Größe: Keine Etikettgröße. Keine gültige flach gemessene Bundweite ... Die Maße sind ... nicht im Vinted-Entwurf mitgesendet ...`
- `Formular nicht vollständig: Größe: Größe angeklickt, aber nicht als Feldwert bestätigt`

Direkt vor dem Ausfüllen loggt die Extension `Größen-Daten für #71:` mit übertragener Etikettgröße, Bundweite und Zielbereich. Die Vinted-Seite loggt ergänzend `[SIZE INPUT]`. Dadurch ist klar unterscheidbar, ob die Website die **vorhandenen 38 cm tatsächlich an die Extension übermittelt**, Vinted den Taillenumfang-Dialog nicht öffnet oder Vinted die konkrete Größe nicht anbietet. Ein bereits vorhandenes echtes Größenetikett bleibt maßgeblich; unklare/geschätzte Größe muss vor dem Entwurf-Speichern überprüft werden.

Bei fehlender Bundweite im Datenpaket Sascha AI auf Vercel aktualisieren beziehungsweise die Web-App neu bereitstellen; nur die Extension zu aktualisieren reicht dann nicht. Keine automatische Auswahl einer unpassenden Größe und keine Veröffentlichung.

### Geschätzte Jeansgrößen auch automatisch als Entwurf speichern (3.19.0)

Fehlerbericht: #71 zeigte bei 38 cm flach gemessener Bundweite `Feld size muss noch manuell geprüft werden` – dabei war die Größe tatsächlich ausgewählt und vom Vinted-Formular übernommen, aber zu Recht als **Schätzung** gekennzeichnet. Der Stapel stoppte bisher trotzdem bei jedem `needsReview`-Feld.

**Neu:** Im Extension-Popup steht beim Stapelstart die standardmäßig aktivierte, abschaltbare Option **„Geschätzte Jeansgrößen auch als Entwurf speichern. Größen vor dem Veröffentlichen selbst überprüfen.“** Ein zusätzlicher Bestätigungsdialog nennt diese Konsequenz. Ist die Option aktiviert, darf nur das **erfolgreich im echten Vinted-Größenfeld bestätigte** Ergebnis `reviewType: "estimated-size"` mit validierter W- oder Buchstabengröße in einem **Vinted-Entwurf** gespeichert werden. Es bleibt ausdrücklich eine *Schätzung*, keine belegte Herstellergröße. Bei Herren-Jeans entspricht eine flach gemessene Bundweite von 38 cm rechnerisch etwa W30; bei Damen wird eine ungefähr passende Buchstabengröße vorgeschlagen. Marke, Schnitt und Größenetikett können abweichen.

**Wichtig:** Pro Artikel erscheint in der persistenten Fortschrittsanzeige eine Warnung wie „Artikel #71: geschätzte/umgerechnete Größe W30 – vor Veröffentlichung prüfen“. Diese Warnung wird auch beim nachträglichen manuellen Bestätigen eines bereits gespeicherten Entwurfs übernommen. Geschätzte Größen müssen vor einer tatsächlichen Veröffentlichung mit Artikel und Maßen abgeglichen werden.

Bei deaktivierter Option stoppt der Stapel nach wie vor vor dem Speichern. Eine **nicht bestätigte**, fehlende oder nicht auswählbare Größe, eine fragliche Kategorie, Fehler bei anderen Feldern oder eine unklare Speicherbestätigung bleiben weiterhin **harte Stopps**. Es wird nie automatisch veröffentlicht. Der Einzelmodus verhält sich unverändert.

### Ganze Hosenliste statt 0/1 und direkt zur nächsten (3.20.0)

Vorher übernahm der Vinted-Import nur **einzeln vorbereitete VintedDraftData** aus Sascha AI. Hatte die Anwendung nur den Entwurf #71 vorbereitet, zeigte der Stapel **0/1**; nach manueller Bestätigung war **1/1** tatsächlich korrekt „fertig“ und es konnte keine nächste Hose folgen.

**Neu ab 3.20:** „Entwurf aus Sascha AI übernehmen“ lädt auch noch nicht separat vorbereitete, bereits erfolgreich analysierte Hosen aus Sascha AI, sofern die Hose eine gültige Artikelnummer und Bilder hat und nicht als **hochgeladen, verkauft oder archiviert** markiert ist. Diese virtuellen Entwürfe werden mit stabiler ID erst beim Abruf gebaut und **ohne Änderung der Sascha-AI-Artikel** für den Stapel bereitgestellt. Bereits in Sascha AI als gespeichert markierte Vinted-Entwürfe werden übersprungen. Eine Bestätigung einer Vinted-Speicherung wird zusätzlich in der Extension als bestätigte Artikelnummer gespeichert, um spätere Dubletten zu vermeiden.

Die Extension zeigt vor dem Start die Zahl der importierten geeigneten Hosen und **ab der ausgewählten Hose** die Größe der Warteschlange an. Zum Start lädt sie die aktuelle Liste erneut aus Sascha AI; bereits bestätigte Artikelnummern werden herausgefiltert. Bei einer weiteren bestätigten Hose wird die nächste **sofort** gestartet (der Chrome-Alarm nach 30 Sekunden dient nur als Sicherheitsreserve bei unterbrochenem Hintergrundprozess). Beim manuellen Bestätigen eines **älteren Ein-Hosen-Stapels** kann die Erweiterung die folgenden geeigneten Hosen erneut abfragen und weiterarbeiten.

**Speicherbestätigung nach Weiterleitung aufs Vinted-Profil:** Nur eine eindeutig als Entwurf ausgewiesene Karte mit der **exakten Artikelnummer** kann als Bestätigung gelten; das bloße Öffnen einer Profilseite **beweist keine erfolgreiche Speicherung**. Wenn Vinted keine nachweisbare Speicherbestätigung zeigt, bleibt die einmalige manuelle Kontrolle notwendig. Die Erweiterung darf nicht blind einen zweiten Speicher-Klick auslösen.

**Wichtig:** Neue virtuelle Hosen erscheinen nur, wenn die **aktuelle Sascha-AI-Web-App** (nach GitHub-Merge via Vercel-Deployment) die erweiterte Liste bereits ausliefert. Aktualisiere die Website und die vorhandene Extension, ohne deren lokalen Speicher zu löschen. Prüfe den Import-Zähler vor dem Start. Bei nur einer geeigneten Hose zeigt die Extension ausdrücklich, dass es keine folgende Hose gibt. Bitte bestehende Vinted-Entwürfe vor der ersten größeren Serie auf Dubletten prüfen. Die Extension **veröffentlicht niemals automatisch**.

### Damenjeans mit numerischer Etikettgröße wie „6“ (3.21.0)

Fehler bei Artikel **#67**: Sascha AI lieferte die **Original-Etikettgröße `6`**, während das ausgewählte Vinted-Damen-Größenmenü nur `XXS / XS / S / M / L / XL …` anbot. Bisher wurde eine vorhandene Zahl als verbindliche Auswahl behandelt und die aus Sascha AI vorliegenden Maße wurden **nicht** als Alternative herangezogen.

Ab **3.21.0** gilt: Wenn es sich nach der Klassifikation um eine **Damenjeans** handelt, Vinted die Originalzahl nicht als auswählbare Größe anbietet und sie **ohne Länderangabe** nur aus einer ein- oder zweistelligen Zahl besteht (z. B. `6`, `36`), prüft die Extension die mitgelieferte **flach gemessene Bundweite**. Ist diese vorhanden und plausibel (28–62 cm), schlägt sie anhand des verdoppelten Umfangs eine **ungefähre Buchstabengröße** vor, wählt nur eine tatsächlich angezeigte Option und markiert das Ergebnis weiterhin als **geschätzt/umgerechnet**. Die `6` wird **nicht** pauschal als `US 6` oder `UK 6` interpretiert; die Originalgröße erscheint im Protokoll `[SIZE WOMEN NUMERIC WAIST]` sowie im Prüfhinweis für den Entwurf. **Beispiel ausschließlich zur Erklärung:** 39 cm flache Bundweite ergibt nach der allgemeinen Tabelle ungefähr `M`; für #67 ist keine Bundweite aus dem Fehlerprotokoll belegt.

Der **automatische Entwurfsmodus** darf diese nachweislich ausgewählte Schätzgröße bei aktivierter Option „Geschätzte Jeansgrößen auch als Entwurf speichern“ übernehmen und speichert einen Prüfhinweis zur tatsächlichen Größenbestimmung. Keine automatische Veröffentlichung. Ohne Bundweite, ohne bestätigte Größenauswahl, bei falscher Kategorie oder deaktivierter Opt-in-Option bleibt der Stopp bestehen. Echte Buchstabengrößen und explizite `US 6`/`EU 36`/`W36`-Etiketten nutzen weiterhin ihre gesonderten Regeln und werden nicht durch Maße überschrieben.

### Nach einer Hose mit #67 wirklich zur nächsten Hose (3.22.0)

**Fehlerursache bestätigt:** Frühere Stapel sortierten Artikelnummern **aufsteigend** und verwendeten `rows.slice(selected)`. Wählte man #67, wurden beispielsweise #66, #65 und #64 vollständig aus der Warteschlange ausgeschlossen, obwohl sie fertig vorbereitet sein konnten. Dasselbe Problem bestand bei der Erweiterung eines alten Ein-Hosen-Stapels nach manueller Entwurfsbestätigung: Es wurden nur höhere Artikelnummern gesucht.

**Neu:** Für einen Stapel ab der gewählten Hose werden alle geeigneten und noch unbestätigten Artikel aufgenommen: **zuerst die gewählte #67, dann #66, #65 usw. absteigend; anschließend gegebenenfalls höhere Nummern**. Der Popup-Zähler zeigt die Zahl der importierten geeigneten Hosen und die geplante Reihenfolge an. Bereits in dieser Extension bestätigte Artikelnummern werden vor der Verarbeitung weiterhin ausgeschlossen.

Wenn die Extension einen Stapel bereits mit **„Fertig · 1/1“** abgeschlossen hat, erscheint neu **„Weitere fertige Hosen laden und Stapel fortsetzen“**. Die Schaltfläche lädt die aktuelle Liste geeigneter Hosen aus Sascha AI und hängt unbestätigte kleinere und größere Artikelnummern an die bestehende Warteschlange an. Der bereits bestätigte Entwurf wie **#67** wird dabei **nicht erneut übertragen**; der bisherige Fortschritt und Größenprüfhinweise bleiben erhalten. Auch das Bestätigen eines älteren, noch auf Bestätigung wartenden Einzel-Stapels kann jetzt kleinere Nummern nachladen.

Falls die Web-App nur einen geeigneten Artikel liefert, erscheint statt eines falschen Erfolgsversprechens eine genaue Meldung: Prüfen, ob die übrigen Hosen fertig generiert sind, Fotos und Artikelnummer besitzen, nicht hochgeladen/verkauft/archiviert sind und ob die aktuelle Sascha-AI-Web-App auf Vercel bereitgestellt ist. Ohne weitere geeignete Hosen kann die Extension nicht automatisch fortsetzen.

**Sicherheit:** Kein erneuter Speicher-Klick bei unklarer Vinted-Bestätigung, kein doppelter Entwurf für lokal bestätigte Nummern, keine automatische Veröffentlichung. Vinted-Entwürfe, die außerhalb dieser Extension angelegt oder nicht von ihr als bestätigt erfasst wurden, vor einem neuen Stapel selbst auf Dubletten kontrollieren.

## Automatischer Entwurfsstapel (Version 3.12)

Die Extension kann die in Sascha AI **bereits vorbereiteten** Jeans-Hosen nacheinander als **Vinted-Entwürfe** speichern. Sie veröffentlicht niemals ein Angebot. Vinted dokumentiert einen eigenen Befehl zum Speichern als Entwurf; der Stapel darf ausschließlich einen genau als „Entwurf speichern“/„Save draft“ gekennzeichneten Button anklicken.

1. Sascha AI geöffnet lassen und in der Extension „Entwurf aus Sascha AI übernehmen“ klicken.
2. Bei mehreren Hosen im Dropdown die **Start-Hose** auswählen.
3. Auf „**Alle ab dieser Hose als Vinted-Entwürfe speichern**“ klicken und bestätigen.
4. Die Extension verarbeitet die Hosen in aufsteigender **numerischer Artikelnummer**, erzeugt für jede Hose ein neues Vinted-Verkaufsformular, überträgt alle Felder sowie **nur die ersten vier bearbeiteten Bilder** und klickt einmal auf **Entwurf speichern**.
5. **Erst nach einer eindeutig sichtbaren Speicherbestätigung oder bestätigten Vinted-Entwurfsseite** wird die Hose als fertig markiert und die nächste automatisch begonnen. Zwischen den Hosen kann eine kurze Chrome-bedingte Wartezeit liegen.

Der Stapel läuft im Erweiterungs-Hintergrund weiter, wenn das Popup geschlossen wird. Zwischen den Hosen wird der Fortschritt gespeichert und über `chrome.alarms` fortgesetzt. **Bei Browser-/Erweiterungsneustart während eines Speichervorgangs ist keine automatische Wiederholung vorgesehen**, weil sonst doppelte Entwürfe entstehen könnten. In diesem Fall Vinted-Entwürfe prüfen und den Stapel gegebenenfalls mit der nächsten noch offenen Hose erneut starten.

**Sicherheitsregeln:** Der Vorgang stoppt bei fehlender oder doppelter Artikelnummer, einem nicht bestätigten Formularfeld, unklarer Bildvorschau, fehlendem Entwurf-Speichern-Button oder unbestätigter Vinted-Speicherung. Die Extension klickt niemals „Veröffentlichen“. „Stapel stoppen“ hält nach einem bereits laufenden Vorgang sicher an. Die Liste der fertigen IDs wird lokal gespeichert. Bereits begonnene oder unbestätigte Einträge nicht blind ein zweites Mal starten.

**Hinweis:** Die Vinted-Speicheroberfläche wurde noch nicht in einer echten angemeldeten Sitzung getestet. Wenn Vinted nach dem Klick keinen eindeutigen Hinweis zeigt oder anders navigiert, stoppt die Extension absichtlich. Der erste Praxistest sollte mit wenigen Entwürfen durchgeführt werden, bevor ein größerer Stapel gestartet wird.

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

### iPhone-Fotos-Regler als Bildlook (Version 3.11)

Der automatische Bildlook orientiert sich an den zuletzt gezeigten Screenshots der iPhone-Fotos-App. Diese zeigen **keine lesbaren Zahlenwerte**. Die folgenden Werte sind deshalb **Näherungen**, keine 1:1-Übertragung:

| iPhone-Regler | Näherungswert |
| --- | ---: |
| Brillanz | +35 |
| Glanzlichter | −14 |
| Schatten | +12 |
| Kontrast | +14 |
| Schwarzpunkt | +32 |
| Helligkeit | −12 |
| Wärme | +3 |

**Nach dem Praxistest verstärkt:** Die Werte werden jetzt mit dem Faktor **1,85** verarbeitet (`iphone-photo-adjustments-v2-visible`). Das ist ein merklicherer Eingriff in Mittelton-/Kontrastwerte, keine Änderung von Motiven oder der tatsächlichen Hose. Der Debug-Log nennt je Bild `avgRgbDelta` (mittlere absolute RGB-Abweichung) und `noticeablePct` (Anteil der Pixel mit mindestens 12 RGB-Abweichung). Prüfe die Ergebnisse visuell, denn ein großer Zahlenwert garantiert weder einen korrekten Produktfarbton noch die Akzeptanz durch Vinted.

Der Effekt wird durch getrennte, sanfte Tonwertfunktionen umgesetzt, nicht durch einen globalen CSS-Filter. Ein einzelner Preset `iphone-photo-adjustments-v1` wird auf alle vier Bilder angewendet. Die tatsächlichen iPhone-Regler sind komplexer; das Ergebnis ist eine Annäherung und muss visuell geprüft werden. Bildausschnitt, Hintergrund, Jeansdetails und sichtbare Gebrauchsspuren bleiben erhalten. Keine Markierungsentfernung, keine automatische Veröffentlichung.

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
