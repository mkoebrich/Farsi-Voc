# Farsi-Voc

Karteikarten-Trainer für Farsi-Vokabeln aus dem Kurs „Ba ham“. Läuft als Web-App (PWA) auf dem Home-Bildschirm.

## Starten
1. Repo auf GitHub: Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
2. Nach kurzer Zeit ist die App unter `https://mkoebrich.github.io/Farsi-Voc/` erreichbar.
3. Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Dateien
- `index.html`, `style.css`, `app.js`: die App
- `data/vocab.json`: Vokabelliste (aus der CSV, Umschrift vereinfacht)
- `sw.js`: Offline-Nutzung
- `widget/wort-des-tages.js`: Scriptable-Widget für den Home-Bildschirm

## Lernlogik
- „Gewusst“: Wort kommt erst nach 6 bis 15 Sitzungen wieder.
- „Nicht gewusst“: Wort bleibt im Haufen und kommt in jeder Sitzung wieder, bis es gewusst wird.
- Wort des Tages: zufällig, wechselt nach dem Ansehen.

## Lernstand
Der Stand liegt im Browser (localStorage). „Sichern“ speichert ihn als Datei, „Wiederherstellen“ lädt ihn zurück.
