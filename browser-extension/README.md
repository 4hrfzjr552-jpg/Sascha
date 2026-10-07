# Sascha AI &#8594; Vinted Assistant (WebExtension)

Diese WebExtension verbindet die Vinted-Entwürfe aus **Sascha AI** direkt mit der Verkaufsmaske auf **Vinted.de** (sowie Vinted.at).

Sie wurde primär für den **Orion Browser auf iPhone/iPad (iOS)** entwickelt, ist jedoch voll kompatibel mit Chrome, Edge, Firefox und Orion Desktop.

---

## 🎯 Hauptmerkmale & Sicherheit

* **Kein automatisches Veröffentlichen**: Artikel werden niemals ohne deine ausdrückliche Bestätigung auf Vinted veröffentlicht.
* **Sicher & Datenschutzkonform**: Es werden keine Session-Cookies, Login-Token oder Passwörter ausgelesen, gespeichert oder übertragen.
* **Keine API-Bypasses**: Die Extension arbeitet ausschließlich über die normale sichtbare Webseite im Browser.
* **Keine Captcha-Umgehung**: Du hast volle Kontrolle über alle Schritte.

---

## 📁 Ordnerstruktur

```text
browser-extension/
├── manifest.json       # WebExtension Manifest V3
├── popup.html          # Touchfreundliche Benutzeroberfläche
├── popup.js            # Steuerungslogik für Popup & Entwurfsverwaltung
├── styles.css          # Mobile-first CSS mit großen Touch-Zielen (iOS)
├── content-sascha.js   # Content Script für Sascha AI (postMessage-Bridge)
├── content-vinted.js   # Content Script für Vinted (Formularbefüllung)
├── background.js       # Extension Service Worker
└── README.md           # Dokumentation & Anleitung
```

---

## 📲 Installation in Orion Browser (iPhone / iPad)

1. **Dateien auf das Gerät / Cloud übertragen**:
   * Kopiere den Ordner `browser-extension` auf dein iPhone/iPad (z. B. via iCloud Drive, AirDrop oder Dateien-App).
2. **Orion Browser öffnen**:
   * Öffne den **Orion Browser** auf deinem iPhone oder iPad.
3. **Erweiterungs-Einstellungen öffnen**:
   * Tippe unten rechts auf das Drei-Punkte-Menü (`...`).
   * Wähle **Erweiterungen** (Extensions).
4. **Erweiterung laden**:
   * Aktiviere den **Entwicklermodus** (Developer Mode).
   * Tippe auf **Erweiterung aus Ordner laden** (Load Unpacked / Add Extension).
   * Wähle den Ordner `browser-extension` aus.
5. **Berechtigungen erlauben**:
   * Gehe sicher, dass die Erweiterung für `vinted.de` und deine Sascha-AI-Domain aktiviert ist.

---

## 💻 Installation in Desktop-Browsern (Chrome / Edge / Firefox / Orion Desktop)

### Chrome / Edge / Brave / Orion Desktop:
1. Öffne `chrome://extensions` (bzw. `edge://extensions`).
2. Aktiviere den **Entwicklermodus** (oben rechts).
3. Klicke auf **Entpackte Erweiterung laden** (Load unpacked).
4. Wähle den Ordner `browser-extension` im Repository aus.

### Firefox:
1. Öffne `about:debugging#/runtime/this-firefox`.
2. Klicke auf **Temporäres Add-on laden...** (Load Temporary Add-on).
3. Wähle die Datei `browser-extension/manifest.json` aus.

---

## 🚀 Nutzung im Alltag

### 1. Entwurf aus Sascha AI übernehmen
1. Öffne **Sascha AI** im Browser.
2. Bereite deine Hosen-Analyse vor, bis ein Vinted-Entwurf generiert wurde.
3. Öffne das **Extension-Popup** über die Menüleiste des Browsers.
4. Tippe auf den Button **[Entwurf aus Sascha AI übernehmen]**.
5. Der Entwurf (Artikelnummer, Titel, Preis, Marke, Größe, Farbe, Zustand, Kategorie, Bilder) wird lokal in der Extension gespeichert und im Popup angezeigt.

### 2. Vinted öffnen & Felder automatisch befüllen
1. Tippe im Popup auf **[Vinted öffnen]** (oder navigiere manuell zu `https://www.vinted.de/items/new`).
2. Sobald die Vinted-Verkaufsmaske geladen ist, öffne das Extension-Popup erneut.
3. Tippe auf **[In Vinted einfügen]**.
4. Die Extension befüllt automatisch:
   * **Titel**
   * **Beschreibung**
   * **Preis**
   * **Marke**
   * **Größe**
   * **Farbe**
   * **Zustand**
   * **Kategorie**
   * **Bilder** *(sofern vom Browser unterstützt)*

### 3. Ergebnis prüfen & selbst speichern
Nach dem Ausfüllen zeigt das Popup eine Checkliste der befüllten Felder an (z. B. `✓ Titel`, `✓ Preis`, `✓ Marke` ...).

> **Wichtig**: Prüfe alle Eingaben sorgfältig auf Richtigkeit und klicke anschließend auf Vinted selbst auf **Entwurf speichern** oder **Artikel hochladen**.

---

## ⚠️ Orion iOS / WebKit Einschränkungen (Bilder-Upload)

Aufgrund von **Sicherheitsbeschränkungen in Mobile Safari / iOS WebKit** erlaubt Orion Browser auf dem iPhone/iPad das automatische Setzen von `<input type="file">` via Skript (DataTransfer) in einigen Versionen nicht.

* **Sicherheitskonform**: Die Extension versucht nicht, diese Browser-Sperre zu umgehen.
* **Automatischer Fallback**: Falls das Setzen der Bilder durch iOS blockiert wird, zeigt die Extension im Popup an:
  `✗ Bilder (Bilder konnten unter iOS nicht automatisch eingefügt werden. Bitte Bilder manuell auswählen.)`
* **Textfelder bleiben unberührt**: Alle Text- und Dropdown-Felder (Titel, Beschreibung, Preis, Marke, Größe, etc.) werden trotzdem vollständig und korrekt ausgefüllt.

---

## 🐞 Debug-Modus

Sollte ein Feld auf Vinted nicht wie erwartet befüllt werden (z. B. wenn Vinted seine Formularstruktur geändert hat):

1. Aktiviere im Extension-Popup die Option **Debug-Modus**.
2. Tippe erneut auf **[In Vinted einfügen]**.
3. Das Log-Fenster zeigt dir genau an:
   * Welches Feld gesucht wurde
   * Welcher Selektor/Treffer verwendet wurde
   * Welcher Wert eingesetzt wurde
   * Welcher Schritt fehlgeschlagen ist

> **Hinweis**: Der Debug-Modus protokolliert reine Ausführungs-Schritte und niemals vertrauliche Daten oder Tokens.
