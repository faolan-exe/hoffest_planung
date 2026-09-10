# Hoffest-Planung

Webanwendung für die Standanmeldung zum Hoffest und für den Diensteplan.
Flask + PostgreSQL, Betrieb über Docker Compose.

---

## Inhalt

- [Was die Anwendung macht](#was-die-anwendung-macht)
- [Erstinstallation auf einem neuen Server](#erstinstallation-auf-einem-neuen-server)
- [Umzug auf einen neuen Server](#umzug-auf-einen-neuen-server)
- [Backups](#backups)
- [Konfiguration](#konfiguration)
- [Anbindung an Moodle](#anbindung-an-moodle)
- [Der Jahreswechsel](#der-jahreswechsel)
- [Verwaltungsbefehle](#verwaltungsbefehle)
- [Fehlersuche](#fehlersuche)

---

## Was die Anwendung macht

**Standanmeldung.** Lehrkräfte melden über einen Link aus Moodle einen Stand an,
markieren dafür eine Fläche auf dem Schulhofplan und beantworten eine Prüfliste.
Die Orga bestätigt oder lehnt ab; beides löst eine E-Mail aus.

**Diensteplan.** Eine moodle integration, auf der sich
Lehrer in Zeitfenster eintragen. Die Orga legt im Adminbereich
Kategorien und Template-Slots an.

**Adminbereich** unter `/admin` mit Passwort-Login.

Die Anmeldung der Lehrkräfte läuft bewusst ohne Moodle-Plugin: ein JavaScript in
Moodle bildet `sha256(AUTH_SECRET + moodleUserId)` und meldet den Hash bei
`/register` an. Dieser Hash ist danach der Zugangsschlüssel.

---

## Erstinstallation auf einem neuen Server

Voraussetzung: Linux mit Docker und Docker Compose (Plugin `docker compose`,
nicht das alte `docker-compose`).

```bash
git clone <repo-url> hoffest
cd hoffest

cp .env.example .env
nano .env                 # siehe Konfiguration weiter unten
```

Schlüssel erzeugen:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # → FLASK_SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"   # → POSTGRES_PASSWORD
```

`AUTH_SECRET` **nicht** neu erzeugen, wenn eine bestehende Installation
übernommen wird — siehe [Umzug](#umzug-auf-einen-neuen-server).

Starten:

```bash
docker compose up -d --build
docker compose logs -f app
```

Der Container legt beim ersten Start das Schema an und wendet alle Migrationen
an. Danach läuft die Anwendung auf `127.0.0.1:8000`; davor gehört ein Reverse
Proxy (nginx, Caddy, Apache) mit TLS für die öffentliche Domain.

Erster Admin-Zugang: Benutzer `Admin`, Passwort `1234` — **sofort im
Adminbereich unter Einstellungen ändern.**

---

## Umzug auf einen neuen Server

Alles, was übertragen werden muss, sind **zwei Dinge**: die Datenbank und die
`.env`. Der Code kommt aus Git, sonst gibt es keinen Zustand.

**Auf dem alten Server:**

```bash
cd /pfad/zu/hoffest
./scripts/backup.sh                # schreibt backups/hoffest-JJJJ-MM-TT-HHMM.sql.gz
```

Dann die Sicherung und die `.env` auf den neuen Server kopieren:

```bash
scp backups/hoffest-*.sql.gz  neuer-server:/pfad/zu/hoffest/backups/
scp .env                      neuer-server:/pfad/zu/hoffest/.env
```

> Die `.env` enthält `AUTH_SECRET`. Bleibt das nicht identisch, sind **alle
> registrierten Lehrkräfte ausgesperrt** und müssen sich über Moodle neu
> registrieren. `POSTGRES_PASSWORD` darf sich dagegen ändern.

**Auf dem neuen Server:**

```bash
git clone <repo-url> hoffest && cd hoffest
# .env und Backup liegen bereits hier

docker compose up -d --build
HOFFEST_CONFIRM_RESTORE=yes ./scripts/restore.sh backups/hoffest-JJJJ-MM-TT-HHMM.sql.gz
docker compose restart app
docker compose logs -f app
```

Zum Schluss prüfen:

```bash
docker compose exec app python db.py check
```

Ausgabe muss lauten: `Schema vollstaendig. Abweichende stand-Zeilen: 0`.

Danach im Reverse Proxy die Domain auf den neuen Server zeigen lassen. Am
Moodle-Snippet ist **nichts** zu ändern, solange Domain und `AUTH_SECRET`
gleich bleiben.

---

## Backups

```bash
./scripts/backup.sh                          # nach backups/
./scripts/backup.sh /mnt/nas/hoffest.sql.gz  # an einen festen Ort
```

Ein täglicher Cron-Eintrag, empfohlen als Minimum:

```cron
30 3 * * * cd /pfad/zu/hoffest && ./scripts/backup.sh >> logs/backup.log 2>&1
15 4 * * * find /pfad/zu/hoffest/backups -name '*.sql.gz' -mtime +30 -delete
```

Wenn der Server ohnehin über ein zentrales Backup gesichert wird, reicht es,
das Verzeichnis `backups/` mit einzuschließen. Ein Snapshot des Docker-Volumes
allein ist **kein** brauchbares Backup — eine im laufenden Betrieb kopierte
Postgres-Datei kann inkonsistent sein. Immer den Dump nehmen.

Rückspielen:

```bash
HOFFEST_CONFIRM_RESTORE=yes ./scripts/restore.sh backups/<datei>.sql.gz
```

---

## Konfiguration

Alles läuft über die `.env` (Vorlage: `.env.example`).

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `POSTGRES_PASSWORD` | ja | Passwort der Datenbankrolle. Darf beim Umzug wechseln. |
| `FLASK_SECRET_KEY` | ja | Signiert die Sessions. Ändern meldet alle ab. |
| `AUTH_SECRET` | ja | Gemeinsames Geheimnis mit dem Moodle-Snippet. **Beim Umzug identisch lassen.** |
| `DOMAIN` | nein | Öffentliche Adresse für Links in E-Mails. |
| `SMTP_HOST` / `SMTP_PORT` | nein | Standard: `smtp.strato.com` / `587`. |
| `SMTP_USER` / `SMTP_PASS` | ja | Zugang des Absenderpostfachs. |

Weitere Schalter (normalerweise nicht nötig):

| Variable | Standard | Bedeutung |
|---|---|---|
| `HOFFEST_AUTO_MIGRATE` | `1` | Migrationen beim Start. Im Compose-Setup `0`, weil `entrypoint.sh` das übernimmt. |
| `HOFFEST_LOG_DIR` | `logs` | Ablage der Logdateien. |
| `HOFFEST_TEST_MODE` | – | Auf `1` **schaltet die Authentifizierung komplett ab.** Nur lokal. |

Ohne Docker liest die Anwendung dieselben Werte alternativ aus Dateien im
Projektverzeichnis: `flaskSecretKey.txt`, `secretAuthCode.txt`, `DOMAIN.txt`
und `credentials.txt` (SMTP-Benutzer in Zeile 1, Passwort in Zeile 2). Die
Umgebungsvariable hat Vorrang.

---

## Anbindung an Moodle

Zwei Bausteine, beide im Ordner `moodle code/`:

- `authCodeV2.js` — Registrierung und Weiterleitung. Der Platzhalter für
  `AUTH_SECRET` steckt in einem versteckten Feld der einbettenden Seite
  (`id="secretAuthCode"`).
- `tableView.html` — die Tabelle der angemeldeten Stände.

`moodle.html` im Projektwurzelverzeichnis ist die **alte** Fassung und
funktioniert nicht mehr. Nicht einbinden.

---

## Der Jahreswechsel

Der größte Teil passiert von selbst.

**Automatisch**, sobald nach dem 1. Januar die erste Seite aufgerufen wird:

- Die Stände des Vorjahres bleiben mit ihrer Jahreszahl in der Datenbank und
  sind im Adminbereich über die Jahresauswahl weiter einsehbar. Für das neue
  Jahr sind Karte und Antragslisten leer.
- Der komplette Diensteplan wird als JSON nach `diensteplan_archive`
  gesichert, danach werden alle Anmeldungen und alle frei angelegten Einträge
  gelöscht. Kategorien und Template-Slots bleiben stehen, das Datum wird
  geleert.
- Die Standanmeldung wird auf **gesperrt** gesetzt, damit die neue Saison nicht
  ungewollt offen startet.

**Von Hand zu erledigen:**

1. Im Adminbereich unter *Dienste* Datum, Zeitfenster und bei Bedarf die
   Template-Slots für das neue Jahr setzen.
2. Fragenliste durchsehen. **Fragen nur hinzufügen, nicht löschen** — gelöschte
   Fragen bleiben in Altanträgen referenziert und werden dort als
   „(gelöschte Frage)" angezeigt.
3. Karte prüfen: ausgeblendete Zellen und Steckdosen werden übernommen.
   Beständige Stände (Jahr `0`) belegen ihre Fläche weiterhin.
4. Unter *Einstellungen* die Registrierungen aktivieren und entscheiden, ob
   „Bearbeitung eigener Anträge" offen sein soll (dieser Schalter wird beim
   Jahreswechsel bewusst **nicht** zurückgesetzt).
5. Nach dem Fest: Registrierungen wieder schließen.

Ein Archiv des Vorjahres-Diensteplans lässt sich so ansehen:

```bash
docker compose exec db psql -U hoffest -d hoffest \
  -c "SELECT jahr, archived_at, jsonb_array_length(snapshot->'assignments') AS anmeldungen FROM diensteplan_archive ORDER BY jahr DESC;"
```

Für eine Auswertung des ganzen Jahrgangs:

```bash
docker compose exec db psql -U hoffest -d hoffest \
  -c "SELECT jsonb_pretty(snapshot) FROM diensteplan_archive WHERE jahr = 2026;"
```

Eine Oberfläche dafür gibt es nicht.

---

## Verwaltungsbefehle

Alle im laufenden Container, aus dem Projektverzeichnis:

```bash
docker compose exec app python db.py check     # Schema und Konsistenz prüfen
docker compose exec app python db.py migrate   # ausstehende Migrationen anwenden
```

Zusätzlichen Admin-Account anlegen oder dessen Passwort zurücksetzen — das
Passwort wird zufällig erzeugt und nur einmal ausgegeben:

```bash
docker compose exec app python create_recovery_admin.py --email name@schule.de
```

Erstanlage des Schemas (passiert normalerweise automatisch beim ersten Start):

```bash
docker compose exec app python db.py init --if-empty
```

> `python db.py init --force` **löscht die komplette Datenbank** und verlangt
> zusätzlich `HOFFEST_CONFIRM_WIPE=yes`. Es gibt keinen anderen Weg im Code, der
> Daten großflächig löscht.

Neue Migration anlegen: eine Datei
`dbscripts/postgres/migrations/migration_0XX_name.sql` nach dem Muster von
`migration.scheme` — der abschließende `INSERT INTO migrations` ist Pflicht,
sonst läuft sie bei jedem Start erneut. Die Dateien werden alphabetisch
angewendet.

---

## Fehlersuche

```bash
docker compose logs -f app     # Anwendungslog
docker compose logs -f db      # Datenbank
tail -f logs/logs.log          # ausführliches Log der Anwendung
```

**`[entrypoint] FEHLER: Anmeldung an der Datenbank fehlgeschlagen`.**
Fast immer stammt das Docker-Volume aus einer älteren Installation. Postgres
wertet `POSTGRES_USER` und `POSTGRES_PASSWORD` **nur beim allerersten Start
eines leeren Datenverzeichnisses** aus — danach gelten die Zugangsdaten von
damals weiter, egal was in der `.env` steht. Prüfen mit:

```bash
docker volume ls | grep hoffest
docker compose exec db psql -U hoffest -d postgres -c "\l"
```

Der richtige Weg ist nicht, das Volume zu löschen, sondern die Daten daraus als
Dump zu holen und regulär einzuspielen — siehe unten.

**Daten aus einem alten Volume übernehmen.**
Das aktuelle Setup benutzt das Volume `hoffest-db-data`. Ein Volume aus einer
älteren Fassung (z. B. `hoffest_planung_postgres-data`, Rolle `admin`,
Datenbank `hoffest-postgresDB`) bleibt davon unberührt. So kommen die Daten
herüber:

```bash
# 1. Altes Volume einmalig mit den alten Zugangsdaten anhängen und ausleeren
docker run --rm -v hoffest_planung_postgres-data:/var/lib/postgresql/data   -e POSTGRES_PASSWORD=egal -d --name alt-db postgres:17
sleep 10
docker exec alt-db pg_dump -U admin -d hoffest-postgresDB --clean --if-exists   | gzip > backups/alt.sql.gz
docker rm -f alt-db

# 2. In das neue Setup einspielen
HOFFEST_CONFIRM_RESTORE=yes ./scripts/restore.sh backups/alt.sql.gz
docker compose exec app python db.py migrate
docker compose exec app python db.py check
```

**Der Container startet nicht und meldet „Die Datenbank ist leer".**
Das Volume ist weg oder zeigt woanders hin. Nicht neu initialisieren, sondern
zuerst das Backup einspielen. Die Anwendung legt bewusst nichts mehr von selbst
neu an.

**„Datenbankschema unvollstaendig, es fehlen folgende Tabellen: …".**
Eine Migration ist nicht durchgelaufen. `docker compose logs app` zeigt, welche.

**„Migration … FEHLGESCHLAGEN".**
Die Anwendung startet absichtlich nicht mit halb migriertem Schema. Fehler in
der SQL-Datei beheben oder Backup zurückspielen.

**Lehrkräfte kommen nicht mehr rein.**
Meist stimmt `AUTH_SECRET` nicht mehr mit dem Wert im Moodle-Snippet überein.
Ein Wechsel des Geheimnisses entzieht bestehende Zugänge übrigens **nicht** —
dafür muss die Tabelle `trusted_ids` geleert werden.

**E-Mails kommen nicht an.**
`SMTP_USER` / `SMTP_PASS` prüfen; der Versand läuft in einem Hintergrund-Thread
und schreibt Fehler nach `docker compose logs app`.

---

## Bekannte Einschränkungen

- Die Diensteplan-Endpunkte unter `/moodle/api/dienste/*` sind **ohne
  Anmeldung** erreichbar. Das ist Absicht (Schülerinnen und Schüler haben
  keine Kennung), heißt aber: wer die Adresse kennt, kann Einträge anlegen und
  löschen.
- Es gibt keinen CSRF-Schutz auf den Adminrouten.
- Das Archiv des Diensteplans ist nur per SQL einsehbar.
- Die E-Mail-Vorlagen „Stand verschoben" und „An Orga — Neuer Stand" liegen
  weiterhin in der Datenbank, werden aber nicht versendet und sind deshalb aus
  der Oberfläche entfernt.
