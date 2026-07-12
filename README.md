# Account Hub — iOS-Version (ohne Mac bauen)

Diese App ist ein Capacitor-Projekt (Web-App im nativen iOS-Wrapper). Da eine
IPA nur mit Xcode (macOS) kompiliert werden kann, du aber nur Windows hast,
baut **GitHub Actions** die IPA kostenlos in der Cloud für dich. Du musst
nichts installieren außer am Ende Sideloadly.

Wichtig: In diesem Projekt sind keine Bot-Tokens oder Passwörter enthalten.
Die trägst du erst später direkt in der App auf deinem iPhone ein, wenn du
eine Karte hinzufügst — sie bleiben nur lokal auf deinem Gerät gespeichert
(localStorage der App). Der Ordner kann also ohne Bedenken auf GitHub landen.

---

## Schritt 1 — GitHub-Konto + Repository

1. Falls noch nicht vorhanden: kostenlosen Account auf https://github.com anlegen.
2. Oben rechts auf **"+" → "New repository"** klicken.
3. Name z. B. `account-hub-ios`, Sichtbarkeit **Public** (dann sind die
   Build-Minuten komplett kostenlos/unlimitiert), Rest auf Standard lassen,
   **"Create repository"** klicken.

## Schritt 2 — Projektdateien hochladen

Du hast diesen Ordner als ZIP bekommen. Einfachster Weg ganz ohne Git/Kommandozeile:

1. ZIP auf deinem PC entpacken.
2. Auf der leeren GitHub-Repo-Seite auf **"uploading an existing file"**
   klicken (Link steht direkt auf der Seite).
3. Alle Dateien und Ordner aus dem entpackten `account-hub-ios`-Ordner
   per Drag & Drop reinziehen (inklusive des versteckten Ordners
   `.github` — falls der beim Ziehen nicht mitkommt, lade ihn separat hoch,
   siehe Hinweis unten).
4. Unten auf **"Commit changes"** klicken.

> **Hinweis zum `.github`-Ordner:** Windows Explorer zeigt Ordner, die mit
> einem Punkt beginnen, manchmal nicht sofort beim Reinziehen mehrerer
> Dateien an. Prüfe nach dem Upload auf GitHub, ob der Pfad
> `.github/workflows/build-ios.yml` existiert. Falls nicht: auf GitHub
> **"Add file" → "Create new file"**, als Dateiname exakt
> `.github/workflows/build-ios.yml` eintippen (die Schrägstriche legen die
> Ordner automatisch an) und den Inhalt der Datei aus dem ZIP reinkopieren.

*Alternative, falls du Git installiert hast:*
```bash
cd account-hub-ios
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/account-hub-ios.git
git push -u origin main
```

## Schritt 3 — Build starten

1. Im Repository oben auf den Tab **"Actions"** klicken.
2. Falls gefragt, Workflows aktivieren ("I understand my workflows, go ahead
   and enable them").
3. Links **"Build unsigned iOS IPA"** anklicken, dann rechts
   **"Run workflow" → "Run workflow"**.
4. Warten (ca. 5–10 Minuten), bis der Lauf ein grünes Häkchen bekommt.

## Schritt 4 — IPA herunterladen

1. Auf den fertigen (grünen) Workflow-Lauf klicken.
2. Ganz unten bei **"Artifacts"** liegt **AccountHub-ipa** — anklicken zum
   Herunterladen. Das ist ein ZIP, das die eigentliche `AccountHub.ipa`
   enthält — einfach entpacken.

## Schritt 5 — Mit Sideloadly installieren

1. Sideloadly für Windows von https://sideloadly.io herunterladen und
   installieren.
2. iPhone per Kabel an den PC anschließen, ggf. "Diesem Computer vertrauen"
   auf dem iPhone bestätigen.
3. Sideloadly öffnen, iPhone sollte oben erkannt werden.
4. `AccountHub.ipa` in das Sideloadly-Fenster ziehen.
5. Deine Apple-ID eintragen (eine kostenlose reicht) und auf **Start**
   klicken. Sideloadly signiert die App bei der Installation neu — deshalb
   ist es kein Problem, dass die IPA aus dem Cloud-Build unsigniert ist.
6. Auf dem iPhone: **Einstellungen → Allgemein → VPN & Geräteverwaltung**
   öffnen, das Profil mit deiner Apple-ID antippen und **"Vertrauen"**
   bestätigen.
7. App öffnen — fertig.

**Bekannte Einschränkung bei kostenloser Apple-ID:** Die App läuft nur
7 Tage, danach muss sie über Sideloadly erneut installiert werden (Apple
begrenzt das bei kostenlosen Entwickler-Zertifikaten). Mit einem
kostenpflichtigen Apple-Developer-Account (99 $/Jahr) hält die Signatur
1 Jahr.

---

## Was auf iOS anders ist als in der Windows/Desktop-Version

- **Kein lokaler Webhook-Server.** Auf iOS kann eine App keinen dauerhaft
  erreichbaren Server im Hintergrund betreiben — die Webhook-Karten-Option
  aus der Desktop-Version gibt es hier nicht.
- **Prüfungen laufen nur, während die App offen ist.** iOS pausiert
  JavaScript im Hintergrund. Es gibt keine echten Push-Benachrichtigungen
  (dafür bräuchte es einen eigenen Server + Apple-Push-Zertifikat) — nur
  lokale Benachrichtigungen, während die App aktiv ist.
- Rest (Discord/Telegram-Nachrichten inkl. Bild/Video, direktes Antworten
  als Bot, Wallet-Watcher) funktioniert wie in der Desktop-Version.

## Neu: KI-Tab & Spiele-Tab

**KI-Tab:** Chat mit deinem eigenen OpenAI-Key. API-Key, Modell und
optionalen System-Prompt trägst du unter Einstellungen ein (nur lokal auf
deinem Gerät gespeichert, nie irgendwo hochgeladen). Aktuelle Modellnamen
findest du auf platform.openai.com/docs/models — z. B. `gpt-4o-mini` als
günstiger Standard.

**Spiele-Tab:**
- **Brawl Stars** (offizielle API): API-Key von developer.brawlstars.com +
  Spieler-Tag eintragen. Da Handys keine feste IP haben, der Key aber an
  eine IP gebunden ist, nutzt die App standardmäßig den kostenlosen
  RoyaleAPI-Proxy — dafür einmalig die IP `45.79.218.79` (statt deiner
  eigenen) im Brawl-Stars-Developer-Portal freischalten.
- **Magic Brawl / eigene API:** generische Karte — du trägst die vollständige
  API-URL (muss JSON liefern) und optional einen Authorization-Header ein.
  Alle einfachen Felder der Antwort werden automatisch als Statistik-Liste
  angezeigt. Schick mir die genaue API-Doku von Magic Brawl, dann baue ich
  dir eine maßgeschneiderte Ansicht (z. B. mit Brawler-Liste wie bei Brawl
  Stars) statt der generischen Feldliste.


## Änderungen später vornehmen

Passt du `www/app.js`, `www/index.html` oder `www/styles.css` im Repo auf
GitHub an (direkt im Browser über den Stift-Button bei der Datei bearbeitbar)
und committest die Änderung, baut der Workflow bei jedem Push automatisch
eine neue IPA — einfach Schritt 3–5 wiederholen.
