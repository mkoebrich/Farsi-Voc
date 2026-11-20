# Farsi-Voc

Karteikarten-Trainer für Farsi-Vokabeln aus dem Kurs „Ba ham“. Läuft als Web-App (PWA) auf dem Home-Bildschirm.

## Starten
1. Repo auf GitHub: Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
2. Nach kurzer Zeit ist die App unter `https://mkoebrich.github.io/Farsi-Voc/` erreichbar.
3. Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Dateien
- `index.html`, `style.css`, `app.js`: die App
- `data/vocab.json`: Vokabelliste, 916 Einträge (`id`, `fa`, `fin`, `de`, `bsp`, `quelle`, `manuell`). `bsp` ist eine Liste von Beispielsätzen mit `fa`, `fin`, `de`, `quelle`.
- `data/extra.json`: Zusatzdaten pro Wort-ID: Niveau (`n`), Themen (`t`) und Synonyme (`s`) mit Hinweis und Beispielsatz. Ein Entwurf, nicht aus dem Kurs: Niveau, Themen und besonders die Farsi-Sätze der Synonyme sollte jemand mit Farsi-Kenntnissen gegenlesen. Nicht jedes Wort hat Synonyme. Ohne diese Datei läuft die App weiter, nur Filter und Synonyme fehlen.
- `sw.js`: Offline-Nutzung (Cache `farsi-voc-v3`; bei jeder Änderung an Dateien die Versionsnummer erhöhen)
- `widget/wort-des-tages.js`: Scriptable-Widget für den Home-Bildschirm (zufälliges Wort mit zufälligem Beispielsatz)

## Lernlogik
- „Gewusst“: Wort kommt erst nach 8 bis 20 Sessions wieder.
- „Nicht gewusst“: Wort wird in dieser Session nicht wiederholt und landet im Haufen „nicht gewusst“.
- Eine Session hat 20 zufällig gewählte Wörter, danach folgt das Ergebnis (z. B. 16 gewusst, 4 nicht gewusst).
- Auf der Rückseite der Karte stehen die Beispielsätze (Farsi, Umschrift, Deutsch).
- Die Zähler auf der Karte (offen, ✓, ✗) ändern sich bei jedem Klick; auf der Startseite aktualisieren sie sich nach jeder Antwort.
- Auf jeder Karte ab Nummer 2 gibt es „Zurück“ und „Vor“. Die Kästchen über der Karte zeigen den Stand: aktuell = dicker Rand, bearbeitet = gestrichelt.
- Am Ende einer Session: „Nächste Session“ oder „Fertig“.
- Der Kasten „nicht gewusst“ auf der Startseite ist anklickbar, sobald mindestens ein Wort im Haufen liegt. Er startet eine eigene Session mit allen Wörtern aus dem Haufen (beliebig viele).
- Hell/Dunkel: Schalter oben rechts, die Wahl wird gemerkt (am ersten Start gilt die iPhone-Einstellung).

## Filter und Synonyme
- Dropdown auf der Startseite (alphabetisch): Berufe, Familie, Fragewörter, Kleidung, Kommunikation, Kultur, Lebensmittel + Läden, Lebensmittel + Speisen, Niveau A1 bis C2, Präpositionen, Temporaladverbien, Verben, Verkehr.
- Der Filter gilt für „Session starten“ und „heute offen“. Die „nicht gewusst“-Session nimmt immer alle Wörter aus dem Haufen.
- Unter den Beispielsätzen stehen die Synonyme, jeweils mit Hinweis (austauschbar, formeller, anderer Kontext) und Beispielsatz.

## Wort des Tages
- Zwei getrennte Klicks. Farsi-Modus: Umschrift, dann Übersetzung mit Beispielsatz. Deutsch-Modus: Farsi, dann Umschrift mit Beispielsatz.
- Nach dem zweiten Klick wechselt das Wort beim nächsten Öffnen.
- `?wod=1` in der Adresse (vom Widget) zeigt das Wort des Tages, ohne es zu wechseln. Mit `&id=<Wort-ID>` zeigt die App genau das Wort aus dem Widget.

## Lernstand
- Der Stand liegt im Browser (localStorage, Schlüssel `farsi-voc-v3`).
- „Sichern“ öffnet auf dem iPhone das Teilen-Menü (Web Share API, z. B. „In Dateien sichern“). Ohne Teilen-Menü wird die Datei heruntergeladen. Danach steht dort „Gesichert ✓“, bis du wieder lernst.
- „Wiederherstellen“ lädt eine Sicherung zurück. Sicherungen der alten Vokabelliste (ohne `dataVersion: 3`) werden abgelehnt, weil sich die Wort-Nummern geändert haben.
- Beim ersten Start nach dem Update zeigt die App einen Hinweis. Der alte Stand (`farsi-voc-v1`) wird nicht übernommen, kann aber vorher gesichert werden.
