export const DEFAULT_VINTED_PROMPT = `Ich schicke dir gleich Fotos von einem Kleidungsstück für Vinted.

Erstell daraus bitte eine komplette Vinted-Anzeige mit Titel, Beschreibung und passenden Keywords.

Wichtig:
Schreib locker, natürlich und menschlich. Es soll sich so lesen, als hätte ich die Anzeige selbst geschrieben und nicht wie ein KI- oder Shoptext.

Nutze die Fotos, um möglichst viel selbst zu erkennen:
- Marke
- Modell, falls erkennbar
- Kleidungsart
- Farbe / Waschung
- Schnitt / Fit
- Größe
- Material, falls Etikett sichtbar
- besondere Details
- sichtbare Gebrauchsspuren oder Mängel

Wenn du dir bei etwas nicht sicher bist, erfinde nichts.

TITEL:
Mach einen kurzen, suchfreundlichen Titel mit den wichtigsten Begriffen wie Marke, Modell, Größe, Farbe und Schnitt. Keine unnötigen Emojis und kein Keyword-Spam.

BESCHREIBUNG:

✅ ZUSTAND
Kurz und ehrlich beschreiben. Sichtbare Mängel unbedingt nennen.

👕 GRÖẞE
Größe laut Etikett nennen. Wenn der Fit anhand der Bilder gut erkennbar ist, kurz dazuschreiben.

📐 MAẞE
Wenn ich Maße mitschicke, hier sauber auflisten.

🪡 DETAILS
Farbe, Waschung, Schnitt, Taschen, Logos, Nähte und andere auffällige Details kurz beschreiben.

↘️ EXTRAS
1–2 lockere Sätze zum Style oder wie man das Piece kombinieren kann. Nicht übertreiben.

🚚 VERSAND
Kurz erwähnen, dass ich schnell verschicke.

💬
Am Ende:
„Bei Fragen gerne melden :)“

KEYWORDS:
Danach 20–25 passende Suchbegriffe ohne Hashtags.
Nur Begriffe verwenden, die wirklich zum Piece passen.
Deutsche und englische Begriffe dürfen gemischt werden.
Keine fremden Marken als Keywords benutzen.

Vermeide typische KI-Sätze wie:
„absolutes Must-have“
„perfekt für jeden Anlass“
„zeitloses Design“
„ein echter Hingucker“

Die Anzeige soll eher wie eine normale gute Vinted-Anzeige wirken: kurz, sauber und sympathisch.`;

// List of historical default prompts used to detect unedited defaults
export const LEGACY_DEFAULT_PROMPTS = [
  `Ich schicke dir Fotos von einem Kleidungsstück für Vinted.

Erstell daraus bitte eine komplette Vinted-Anzeige mit Titel, Beschreibung und passenden Keywords.

Wichtig:
Schreib locker, natürlich und menschlich. Es soll sich so lesen, als hätte ich die Anzeige selbst geschrieben und nicht wie ein KI- oder Shoptext.

Nutze die Fotos, um möglichst viel selbst zu erkennen:
- Marke
- Modell, falls erkennbar
- Kleidungsart
- Farbe / Waschung
- Schnitt / Fit
- Größe
- Material, falls Etikett sichtbar
- besondere Details
- sichtbare Gebrauchsspuren oder Mängel

Wenn du dir bei etwas nicht sicher bist, erfinde nichts.

TITEL:
Mach einen kurzen, suchfreundlichen Titel mit den wichtigsten Begriffen wie Marke, Modell, Größe, Farbe und Schnitt.
Keine unnötigen Emojis.
Kein Keyword-Spam.
Maximal 100 Zeichen.

BESCHREIBUNG:

✅ ZUSTAND
Kurz und ehrlich beschreiben.
Sichtbare Mängel unbedingt nennen.

👕 GRÖẞE
Größe laut Etikett nennen.
Falls W/L sicher erkennbar ist, ebenfalls nennen.

📐 MAẞE
Vom Nutzer eingegebene Maße übernehmen.
Immer „ca.“ vor Maße schreiben.

🪡 DETAILS
Farbe, Waschung, Schnitt, Material und besondere Details nennen.

↘️ EXTRAS
Kurze zusätzliche relevante Informationen.

🚚 VERSAND
Versand erfolgt schnell und sicher verpackt.

💬 Fragen
Bei Fragen gerne melden.

Danach genau 25 passende Suchbegriffe / Keywords erstellen.

Die Keywords sollen wirklich zum Kleidungsstück passen und nicht einfach wahllos sein.

Keine erfundenen Marken oder Modelle.`,
];

