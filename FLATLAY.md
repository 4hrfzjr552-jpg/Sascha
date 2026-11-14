# Sascha AI – KI-Flatlay nach der Jeans-Vorlage

Die von dir hochgeladenen Originalfotos bleiben für Analyse, Maße und die handgeschriebene Tütennummer erhalten.
Die KI kann zusätzlich eine sauber ausgelegte Flatlay-Version erstellen, nach deinem **konkreten Beispielbild**:
hellbeiger, leicht gemusterter Teppich, senkrechte Draufsicht, Bund oben, beide Hosenbeine vollständig sichtbar,
glatter/ordentlicher als das Ausgangsfoto.

## Benutzung

1. In **Listings** die Hose öffnen, ein Foto mit vollständiger Vorder- oder Rückseite auswählen.
2. Beim Foto auf **„Flatlay“** drücken. Foto #5 (graue Artikelnummer-Tüte) wird bei fünf hochgeladenen Bildern nicht zur Flatlay-Optimierung angeboten.
3. **„Flatlay erstellen“** drücken. Sascha AI schickt das echte Foto und eine komprimierte Kopie deiner Beispielvorlage an Gemini.
4. In der Vorher-nachher-Ansicht **Waschung, Materialstruktur, Taschen, Labels, Abnutzung, Flecken, Löcher und Fransensäume** sorgfältig prüfen. Bei Fehlern **Abbrechen** oder **Neu erzeugen**.
5. Mit **„Als Flatlay übernehmen“** die Variante bewusst freigeben. Sie erscheint gesondert unter **„KI-Flatlays“**, lässt sich dort deaktivieren oder löschen; das Original bleibt unverändert.
6. Beim Vinted-Export oder bei neuen/aktualisierten Entwürfen werden nur **freigegebene** Flatlays bevorzugt. Der Fotoexport bewahrt mindestens ein authentisches Originalfoto als Zustandnachweis. Eine separate Fitpic-Freigabe gilt weiterhin unabhängig.

Die eingebaute Layout-Vorlage ist eine kleine (160×160) komprimierte Version des vom Nutzer bereitgestellten Beispielfotos. Die KI darf ihr ausschließlich die **Anordnung**, nicht die Hose oder ihre Markenmerkmale entnehmen. Über **„Vorlage austauschen“** kann im aktuellen Browser optional ein anderes Bild gespeichert und danach wieder zur Standardvorlage gewechselt werden.

## Wichtige Grenzen

- **Kein stilles automatisches Nachbearbeiten nach dem Upload:** Die KI wird pro Foto ausdrücklich mit einem Button gestartet. Automatische Änderungen an Originalen wären riskant.
- **Keine Garantie für 1:1-Identität:** Auch ein guter Bildprompt kann nicht verhindern, dass Gemini Details falsch darstellt. Verkäufer müssen optisch prüfen; KI-Bilder nicht als unveränderte Originalfotos ausgeben.
- **Keine Reparaturen retuschieren:** Mängel und echte dauerhafte Verfärbungen dürfen nicht entfernt werden. Die Originalbilder bleiben als Zustandsbeleg gespeichert.
- **Gemini-API-Nutzung kann Kosten/Kontingent verbrauchen.** Das Bildmodell ist standardmäßig `gemini-3.1-flash-image`, mit optionalem `FLATLAY_MODEL` in Vercel. Bei Modellfehlern gibt es sichtbare Meldungen.
- Das Hochladen oder Veröffentlichen auf Vinted erfolgt dadurch **nicht automatisch**. Bestehende Entwurfs-/Zeitplanfunktionen bleiben getrennt.

## Technik

- `api/optimize-flatlay.ts`: authentifizierter Gemini-Bild-Edit-Endpunkt, ohne Node-ESM-Problemimporte
- `src/lib/flatlayReference.ts`: eingebautes Layoutvorlagen-JPEG (komprimiertes Nutzerbeispiel)
- `src/lib/flatlay.ts`: Bildkompression, Supabase-Session, API-Client und optionale private Vorlagenüberschreibung im Browser
- `src/components/FlatlayEditModal.tsx`: Bildvergleich und ausdrückliche Freigabe
- `src/components/PantCard.tsx`: pro-Foto-Button, Variantenvorschau, Freigabe/Deaktivieren/Löschen
- `src/lib/supabase.ts`: speichert separate Varianten in demselben privaten Image-Bucket und signiert sie beim Laden
- `src/lib/listingPhotos.ts`: vor der Galerieausgabe freigegebene Flatlays auswählen und Originalnachweis behalten
- `src/lib/vintedDraftUtils.ts`, `src/lib/vintedShare.ts`: übernommene Varianten für Vinted bereitstellen

Es wird keine Änderung der Datenbankstruktur benötigt: `flatlays` liegt im bisherigen `pants.data`-JSON. Der GitHub-Test prüft, dass die Vinted-Fotoauswahl Originale und Foto #5 korrekt behandelt. Der Node-ESM-Smoketest prüft den Serverstart. Echte Gemini-Bildtreue lässt sich nicht ohne Testfoto/Livebildgenerierung garantieren.


## Erweiterung: echte Produktdaten, alle Bilder und eigene Hintergründe (14.11.2026)

- Die KI bekommt als ergänzende Identitätshinweise die **bereits generierte Vinted-Beschreibung**, Titel, Marke, Modell, Schnitt, Farbe, Größe, Maße und eigenen Hinweise sowie bis zu zwei weitere Originalansichten derselben Jeans. Im Konflikt hat immer das echte Produktfoto Vorrang.
- Bei vollständig abgebildeten Hosen gilt jetzt eine explizite Anordnung: **zwei erkennbare weiche Knicke pro Hosenbein** (Knie-/Wadenbereich) und **die inneren Beinöffnungen berühren sich unten**, ohne zu verschmelzen oder zu überlappen. Der reale Schnitt, Schäden und die Waschung bleiben entscheidend.
- Die Klassifizierung unterscheidet **komplette Vorderseite**, **komplette Rückseite**, **Detailfoto** und **Lager-/Artikelnummer-Tüte**. Bei Detailfotos (Bund, Tasche, Label, Saum) bleibt der ursprüngliche Bildausschnitt erhalten, statt eine erfundene ganze Hose zu generieren.
- Jede Bildkachel hat zwei Aktionen: **KI** öffnet die automatische Verschönerung, **BG** öffnet die Hintergrundbearbeitung. Der individuelle Hintergrund pro Foto kann aus Teppich, Weiß, Hellgrau, Mikrozement, hellem Holz oder Originaloberfläche gewählt werden. Ein Hintergrundwechsel verändert laut Bildanweisung keine Falten/Teile der Hose.
- Der neue Button **„Alle Bilder verschönern“** verarbeitet die bis zu vier Produktfotos einer Hose nacheinander, protokolliert einzelne Erfolge/Fehler und kann nach dem laufenden Foto gestoppt werden. Bei fünf Bildern bleibt Foto #5 als Tütenfoto unberührt. Der Server prüft jeden Bildtyp nochmals, damit eine falsch sortierte Tüte nicht als Jeans optimiert wird.
- **Sammelergebnisse sind zunächst nicht für Vinted freigegeben**. Jede Variante erscheint separat unter „KI-optimierte Fotos“ und muss einzeln mit dem echten Foto verglichen und manuell freigegeben werden. Fehlgeschlagene Bilder behalten ihre vorherigen Varianten. Originalbilder bleiben unverändert; bei einem Vinted-Export wird weiterhin mindestens ein echtes Foto als Zustandsnachweis gezeigt.
- Einzelbearbeitungen bleiben manuell bestätigt. Wenn ein Foto bereits eine andere Hintergrundwahl besitzt, benutzt die Sammelbearbeitung beim nächsten Durchlauf diese gespeicherte Einstellung für genau dieses Foto.

### Grenzen
Ein Sprach-/Bildmodell kann **nicht garantieren**, dass jede Tasche, jeder Defekt oder die zwei Knicke pixelgenau wiedergegeben werden. Falsche Ergebnisse nicht freigeben. Die automatische Klassifizierung plus Bildgenerierung benötigt mindestens zwei KI-Aufrufe pro Foto, bei Modell-Fallback mehr; vier Bilder können API-Kontingent verbrauchen. Die Sammelbearbeitung läuft nur, solange Sascha AI im Browser geöffnet bleibt, kein unbeaufsichtigter Hintergrundjob.


## Korrektur nach dem Bildvergleich: Originaltreue statt neu erfundener Jeans

- **Alle Hintergründe ändern:** Direkt beim Foto-Bereich gibt es nun einen *gemeinsamen Hintergrund-Wähler* und einen eigenen Button **„Alle Hintergründe ändern“**. Einmal z. B. „Hellgrau“ wählen und die vier Produktfotos nacheinander im Modus **nur Hintergrund** bearbeiten. Detailfotos bleiben Detailfotos, Foto #5 (Tüte) wird ausgeschlossen. Jede KI-Version muss vor Vinted noch einzeln freigegeben werden.
- Bei der Bildgenerierung ist **das ausgewählte Originalfoto jetzt die einzige Jeansbild-Referenz**. Zusätzliche Ansichten konnten die KI versehentlich zur falschen Vorder-/Rückseite oder zu einer gemischten Hose verleiten. Die Angebotsdaten (Titel/Beschreibung/Maße) bleiben unterstützend verfügbar.
- **Unabhängige Nachprüfung**: Eine separate Gemini-Vision-Prüfung vergleicht *das echte Original* mit *der generierten Version*, einschließlich Waschung, Schäden, Marken, Tasche/Label, Vorder-/Rückseite und Bildausschnitt. Für Flatlays kontrolliert sie zusätzlich die zwei Knicke pro Bein sowie innen aneinanderstoßende Säume; bei Hintergrundwechseln verlangt sie, dass die Hose nicht umgeformt wurde.
- Wenn die Kontrolle unsicher ist, wesentliche Änderungen erkennt oder technisch ausfällt, **wird das KI-Ergebnis abgelehnt und nicht als Variante gespeichert**. Das Original bleibt unverändert. Die unabhängige Prüfung benötigt mindestens einen zusätzlichen Gemini-Aufruf pro bearbeitetem Foto und kann auch gute Ergebnisse streng ablehnen.
- Die Bild-KI kann die physische Hose beim Neuanordnen weiterhin nicht absolut pixelgenau rekonstruieren. Ein sichtbarer Mangel oder eine falsch erzeugte Naht muss immer zum Verwerfen des bearbeiteten Fotos führen.
