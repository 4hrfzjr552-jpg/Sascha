# Sascha AI Listings-Workspace

## Zugang
Nach dem Vercel-Deployment `/listings` auf der Sascha-AI-Domain öffnen oder in der bestehenden App auf **Listings** klicken. Die Seite benutzt die bestehende Supabase-Anmeldung.

## Bereits umgesetzt
- Moderner Seller-Workspace mit eigenem Sascha-AI-Branding, Sidebar, KPI-Karten und responsiver Tabellen-/Kartenansicht
- Daten kommen aus den realen `PantItem`-Einträgen im bestehenden Sascha-AI-Speicher
- Suche nach Artikelnummer, Titel, Marken, Größe und generierter Beschreibung; Statusfilter und Sortierung
- Artikeldetails: Titel, Beschreibung, Angebotspreis und interne Notizen bearbeiten, über bestehende Supabase-Handler speichern
- Einzelne oder mehrere KI-generierte Hosen für die bestehende Vinted-Entwurfs-Extension vorbereiten
- Artikelstatus ändern, Verkaufspreis im bestehenden SoldModal erfassen, CSV-Export, Navigation zurück zum KI-Studio
- Keine Veröffentlichung durch die neue Listings-Seite

## Noch nicht umgesetzt
- Kein Vinted-Live-Sync (Aufrufe, Favoriten, Verkäufernachrichten, echte Anzeigen-IDs oder Bestellungen)
- Kein automatisches Relisting, Preis-Dropping, Chat-Bot, Cloud-Verbindung oder Mehrkonto-Sync
- Kein Anspruch auf pixelgenaue Nachbildung der nicht öffentlich zugänglichen `vintz.ai/listings`-Ansicht
- Online-Status ist ein manueller `SaleStatus`; „Vinted-Entwurf vorbereitet“ bedeutet nicht veröffentlicht

## Technik
- `src/components/ListingsWorkspace.tsx`: neuer Workspace
- `src/App.tsx`: Sichtbarkeit nur unter `/listings`, Daten und Aktionen aus bestehender App
- `src/components/Header.tsx`: Link zum Workspace
- `vercel.json`: SPA-Rewrite für direkte /listings-Aufrufe
- `.github/workflows/listings-ui.yml`: `npm run lint` und `npm run build`

### Wichtige Sicherheitsregel
Die vorhandene Browser-Extension wird nicht verändert. In Vinted wird weiterhin nur ein Entwurf gespeichert, solange der Verkäufer nicht eigenständig veröffentlicht. Eine spätere Vinted-Synchronisierung erfordert einen separaten geprüften Auth-/Sync-Ansatz und darf keine Zugangsdaten, Sitzungscookies oder Nachrichten unkontrolliert weitergeben.
