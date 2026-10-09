# Sascha AI &#8594; Vinted Assistant (WebExtension)

Diese WebExtension verbindet die Vinted-Entwürfe aus **Sascha AI** direkt mit der Verkaufsmaske auf **Vinted.de** (sowie Vinted.at).

Sie wurde primär für den **Orion Browser auf iPhone/iPad (iOS)** entwickelt, ist jedoch voll kompatibel mit Chrome, Edge, Firefox und Orion Desktop.

---

## 🎯 Hauptmerkmale & Sicherheit

* **Vercel & Localhost Unterstützung**: Funktioniert sowohl mit Production-Deployments (`*.vercel.app`) als auch in der lokalen Entwicklung (`localhost`).
* **Optimierte Titel-Formatierung**: Die Artikelnummer wird automatisch am Ende des Titels angefügt (z. B. `Diesel Krooley Jeans W32 L32 #42`), ohne doppelt eingefügt zu werden.
* **Leichtgewichtige Speicherung**: Es werden nur kleine Metadaten der Entwürfe im Browser-Speicher abgelegt. Große Base64-Bilddaten werden erst direkt beim Einfügen geladen und nicht dauerhaft gespeichert.
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

## 👖 Jeans-W-Größen und Vinted-Buchstabengrößen

Wenn Vinted in einer Jeans-Kategorie nur XS–7XL anbietet, versucht die Extension zuerst weiterhin die unveränderte W-Größe. Nur wenn diese nicht angeboten wird, wird bei erkanntem Herren-/Damen-Kontext eine Größentabelle als Orientierung benutzt.

- Herrenjeans der Marke **Diesel**: Die Diesel-Herrentabelle wird vor der allgemeinen Vinted-Tabelle verwendet (z. B. W36 → XXL).
- Andere Herrenjeans: die allgemeine Vinted-Herrenbekleidungstabelle (z. B. W36 → L).
- Damenjeans: Vinteds Damenjeans-Tabelle (z. B. W36 → XXL).
- Mehrdeutige oder nicht eindeutig unterstützte Größen werden **nicht** automatisch ausgewählt. Die Extension stoppt, damit der Nutzer das Etikett bzw. Maße prüfen kann.

Im Debug-Log steht jeweils [SIZE CONVERSION] mit der Quelle. Die umgerechnete Buchstabengröße kann von Marke zu Marke abweichen und ist keine Messung der echten Hose. Die originale W-/L-Größe sollte in Titel/Beschreibung erhalten bleiben; vor Veröffentlichung alle Angaben kontrollieren.

Größentabellen:
- [Diesel Herrengrößentabelle](https://de.diesel.com/en/slim/slim-jeans-2019-d-strukt-0adbk-blue/A035580ADBK01.html)
- [Vinted internationale Herrengrößen](https://www.vinted.com/help/1214/515-mannenkleding-maattabel)
- [Vinted Damenjeans-Größen](https://www.vinted.com/help/507-guide-des-tailles-de-jeans-femme)

## 🔄 Updates ohne Neuinstallation (Chrome / Edge)

Wenn die Erweiterung einmal über **Entpackte Erweiterung laden** aus einem festen Ordner installiert ist, bleibt sie installiert. Für Updates **denselben Ordner** aktualisieren und dann auf `chrome://extensions/` (Edge: `edge://extensions/`) auf **Neu laden** klicken. Vinted-Tab ebenfalls neu laden. Nicht den Erweiterungsordner löschen oder verschieben.

Für eine einfache Git-basierte Aktualisierung: Repository einmal mit `git clone https://github.com/4hrfzjr552-jpg/Sascha.git` auf dem PC klonen und den Unterordner `Sascha/browser-extension` als entpackte Erweiterung laden. Später im Repository-Ordner `git pull` ausführen und die Erweiterung neu laden. Das funktioniert nur, wenn die Änderungen auf `main` übernommen wurden. Ein ZIP-Download alleine aktualisiert den bestehenden Ordner **nicht**.

Die Versionsnummer steht in `manifest.json` und wird auch im Extension-Popup angezeigt. Sie wird nicht automatisch durch GitHub aktualisiert; ein automatischer Browser-Update-Kanal erfordert eine reguläre signierte/distribuierte Erweiterung mit Update-Infrastruktur.

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

### 1. Entwurfsliste aus Sascha AI übernehmen
1. Öffne **Sascha AI** im Browser (`*.vercel.app` oder `localhost`).
2. Bereite deine Hosen-Analysen vor, sodass Vinted-Entwürfe existieren.
3. Öffne das **Extension-Popup** über die Menüleiste des Browsers.
4. Tippe auf den Button **[Entwurf aus Sascha AI übernehmen]**.
5. Die leichtgewichtige Liste aller vorbereiteten Entwürfe (Artikelnummer, Titel, Preis, Marke, Größe, Farbe, Zustand, Kategorie, Bildanzahl) wird aus Sascha AI abgerufen und gespeichert.

### 2. Vinted öffnen & Felder automatisch befüllen
1. Tippe im Popup auf **[Vinted öffnen]** (öffne Vinted in einem neuen Tab, ohne den Sascha-AI-Tab zu schließen).
2. Sobald die Vinted-Verkaufsmaske (`https://www.vinted.de/items/new`) geladen ist, öffne das Extension-Popup erneut.
3. Tippe auf **[In Vinted einfügen]**.
4. Die Extension ruft die vollständigen Daten (inklusive Bilder) dynamisch aus dem geöffneten Sascha-AI-Tab ab und befüllt:
   * **Titel** (Artikelnummer am Ende: `Titel ... #42`)
   * **Beschreibung**
   * **Preis**
   * **Marke**
   * **Größe**
   * **Farbe**
   * **Zustand**
   * **Kategorie**
   * **Bilder** *(sofern vom Browser unterstützt)*

> **Hinweis**: Falls der Sascha-AI-Tab geschlossen ist, wenn du auf „In Vinted einfügen“ klickst, wirst du aufgefordert:
> *„Bitte Sascha AI in einem Tab öffnen, damit die Bilder und Entwurfsdaten geladen werden können.“*

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
