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
