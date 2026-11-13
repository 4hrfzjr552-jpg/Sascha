# KI-Fitpic als erstes Verkaufsfoto

Sascha AI erstellt bei der **Einzelgenerierung** einer Anzeige ein zusätzliches, fiktives Spiegelselfie, in dem die Jeans aus dem ersten Originalfoto getragen wird. Die vorhandenen Fotos (max. fünf, einschließlich Tütenbild an Position 5) bleiben unverändert. KI-Bilder ersetzen keine Originalfotos.

## Verwendung
1. Für jede Hose die normalen Originalfotos hochladen, das Jeansfoto vorne an Position 1 platzieren. Wenn die Artikelnummer nicht manuell eingegeben ist, müssen es genau fünf Fotos sein (graue Tüte als Foto 5).
2. Auf „Anzeige generieren“ tippen. Die Anzeige wird analysiert, danach versucht Sascha AI ein Fitpic zu erstellen.
3. Die KI prüft das neue Foto auf offensichtliche Fehler (z. B. erfundene Zahlen auf dem Hosenbein, veränderte Waschung und unnatürliche Posen). Fehlerhafte Bilder werden abgelehnt.
4. Ein bestandenes Fitpic ist zunächst **nur eine Vorschau**. Vor Verwendung Originaljeans und Fitpic selbst vergleichen und auf **„Geprüft – als Titelbild verwenden“** klicken. Ohne Freigabe werden ausschließlich Originalfotos exportiert.
5. Im Fotobereich „Fitpic neu erstellen“ klicken, falls es nicht passt. „Fitpic verwerfen“ lässt die Originale unangetastet.
6. Bestehende Fitpics wurden nicht automatisch freigegeben; auch alte Entwürfe übertragen unbestätigte Fitpics nicht. Einen Entwurf nach Freigabe bitte neu vorbereiten.

## Voraussetzungen
- Die serverseitige Umgebungsvariable `GEMINI_API_KEY` ist eingerichtet.
- Für die Authentifizierung des Bildendpunkts muss die Serverumgebung `SUPABASE_URL` bzw. `VITE_SUPABASE_URL` und `SUPABASE_ANON_KEY` bzw. `VITE_SUPABASE_PUBLISHABLE_KEY` enthalten.
- Optional `FITPIC_MODEL` zum Überschreiben des bereits vom Bildeditor genutzten `gemini-3.1-flash-image`. `FITPIC_QA_MODEL` steuert den Prüfer (Standard: `gemini-2.5-flash`).
- Eine Bilderzeugung umfasst den Bildgenerator und einen zusätzlichen günstigen Gemini-Bildvergleich. Beide Aufrufe können Kontingent/Kosten verbrauchen. Die Qualitätssicherung ist nicht perfekt; deshalb ist auch die manuelle Freigabe erforderlich. Batch-Generierungen erstellen **nicht** automatisch Fitpics für jede Hose.
- Eine gültige Anmeldung in Sascha AI ist erforderlich.

## Grenzen
Der Bildgenerator verwendet feste Beschreibungen für zwei fiktive erwachsene Personen, aber keine fotografischen Identitätsreferenzen. Deshalb ist *identisches* Aussehen in jedem Bild nicht garantiert. Ebenso können Nähte, Waschungen und Passform durch das Modell fehlerhaft dargestellt werden. **Vor Veröffentlichung immer mit den echten Fotos vergleichen.** In vorbereiteten Vinted-Entwürfen wird das Tragebeispiel als KI-generiert deklariert.

Im Fehlerfall wird die Textanzeige weiterhin gespeichert und das Originalmaterial bleibt erhalten.
