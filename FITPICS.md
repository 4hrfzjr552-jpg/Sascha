# KI-Fitpic als erstes Verkaufsfoto

Sascha AI erstellt bei der **Einzelgenerierung** einer Anzeige ein zusätzliches, fiktives Spiegelselfie, in dem die Jeans aus dem ersten Originalfoto getragen wird. Die vorhandenen Fotos (max. fünf, einschließlich Tütenbild an Position 5) bleiben unverändert. KI-Bilder ersetzen keine Originalfotos.

## Verwendung
1. Für jede Hose die normalen Originalfotos hochladen, das Jeansfoto vorne an Position 1 platzieren. Wenn die Artikelnummer nicht manuell eingegeben ist, müssen es genau fünf Fotos sein (graue Tüte als Foto 5).
2. Auf „Anzeige generieren“ tippen. Die Anzeige wird analysiert, danach versucht Sascha AI ein Fitpic zu erstellen.
3. Das Fitpic wird separat gespeichert und beim Teilen sowie beim Anlegen neuer Vinted-Entwürfe als erstes Bild ausgegeben.
4. Im Fotobereich „Fitpic neu erstellen“ klicken, falls es nicht passt. „Fitpic entfernen“ verwirft es und lässt die Originale unangetastet.
5. Ein vorhandener Entwurf mit alten Bildreferenzen muss neu vorbereitet werden, um das Fitpic zu erhalten.

## Voraussetzungen
- Die serverseitige Umgebungsvariable `GEMINI_API_KEY` ist eingerichtet.
- Für die Authentifizierung des Bildendpunkts muss die Serverumgebung `SUPABASE_URL` bzw. `VITE_SUPABASE_URL` und `SUPABASE_ANON_KEY` bzw. `VITE_SUPABASE_PUBLISHABLE_KEY` enthalten.
- Optional `FITPIC_MODEL` zum Überschreiben des standardmäßig bereits vom bestehenden Bildeditor genutzten `gemini-3.1-flash-image`.
- Beim Aufruf werden Modellkontingent und eventuell Kosten verbraucht. Batch-Generierungen erstellen deshalb **nicht** automatisch ein Fitpic für jede Hose.
- Eine gültige Anmeldung in Sascha AI ist erforderlich.

## Grenzen
Der Bildgenerator verwendet feste Beschreibungen für zwei fiktive erwachsene Personen, aber keine fotografischen Identitätsreferenzen. Deshalb ist *identisches* Aussehen in jedem Bild nicht garantiert. Ebenso können Nähte, Waschungen und Passform durch das Modell fehlerhaft dargestellt werden. **Vor Veröffentlichung immer mit den echten Fotos vergleichen.** In vorbereiteten Vinted-Entwürfen wird das Tragebeispiel als KI-generiert deklariert.

Im Fehlerfall wird die Textanzeige weiterhin gespeichert und das Originalmaterial bleibt erhalten.
