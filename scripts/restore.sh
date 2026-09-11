#!/bin/sh
# Spielt ein Backup in die laufende Datenbank zurueck.
#
#   ./scripts/restore.sh backups/hoffest-2026-09-09-1200.sql.gz
#   ./scripts/restore.sh eventdb_2026-01-02.sql          # auch unkomprimiert
#
# ACHTUNG: Der vorhandene Datenbestand wird dabei ersetzt.
#
# Zwei Dinge macht dieses Skript bewusst anders als ein blosses
# "psql < dump.sql":
#
#   1. Das Schema wird vorher geleert. Nach "docker compose up" hat die
#      Anwendung bereits alle Tabellen angelegt - ein Dump lief frueher in
#      dieses bestehende Schema hinein: "relation ... already exists",
#      "duplicate key value violates unique constraint", und uebrig blieb eine
#      Mischung aus altem und neuem Datenbestand.
#   2. Der ganze Restore laeuft in EINER Transaktion mit ON_ERROR_STOP.
#      Entweder die Datenbank sieht danach exakt wie der Dump aus, oder sie
#      bleibt unveraendert. Ein halb eingespieltes Backup gibt es nicht mehr.
set -e
cd "$(dirname "$0")/.."

# .env laden, damit PGPASSWORD gesetzt werden kann.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

DUMP="$1"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Aufruf: ./scripts/restore.sh <backup.sql.gz|backup.sql>"
  exit 1
fi

if [ "$HOFFEST_CONFIRM_RESTORE" != "yes" ]; then
  echo "Der aktuelle Datenbestand wird durch '$DUMP' ersetzt."
  echo "Zum Bestaetigen: HOFFEST_CONFIRM_RESTORE=yes ./scripts/restore.sh $DUMP"
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/hoffest-restore.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM

# Komprimiert oder nicht - am Magic Byte erkennbar, nicht an der Endung.
if gzip -t "$DUMP" 2>/dev/null; then
  gunzip -c "$DUMP" > "$WORK/raw.sql"
else
  cat "$DUMP" > "$WORK/raw.sql"
fi

# Zeilenenden vereinheitlichen. Dumps, die einmal ueber einen Windows-Rechner
# gelaufen sind (z. B. eventdb_2026-01-02.sql), haben CRLF - psql kommt damit
# zurecht, die Filterung unten aber nicht.
awk '{ sub(/\r$/, ""); print }' "$WORK/raw.sql" > "$WORK/dump.sql"

# Vollstaendigkeitspruefung, bevor irgendetwas geloescht wird.
if ! tail -5 "$WORK/dump.sql" | grep -q "PostgreSQL database dump complete"; then
  echo "FEHLER: '$DUMP' ist kein vollstaendiger pg_dump (Endmarkierung fehlt)."
  echo "Nichts geaendert."
  exit 1
fi

# Besitzer- und Rechte-Anweisungen entfernen.
#
# Dumps aus der alten Installation gehoeren der Rolle "admin", die es in
# diesem Cluster nicht gibt - daher frueher zu jedem Objekt ein
# 'ERROR: role "admin" does not exist'. Die Anwendung benutzt genau eine
# Rolle; alles gehoert nach dem Restore der verbindenden Rolle (hoffest).
#
# COPY-Bloecke bleiben unangetastet: eine Datenzeile darf durchaus mit
# "GRANT" beginnen.
awk '
  inside_copy               { print; if ($0 == "\\.") inside_copy = 0; next }
  /^COPY .* FROM stdin;$/   { print; inside_copy = 1; next }
  skip_stmt                 { if (/;[[:space:]]*$/) skip_stmt = 0; next }
  / OWNER TO / && /;[[:space:]]*$/ { next }
  /^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES|SET SESSION AUTHORIZATION)/ {
      if (/;[[:space:]]*$/) next
      skip_stmt = 1
      next
  }
                            { print }
' "$WORK/dump.sql" > "$WORK/restore.sql.body"

# Das Leeren gehoert in dieselbe Transaktion wie das Einspielen - sonst steht
# bei einem fehlerhaften Dump am Ende eine leere Datenbank da.
{
  echo "DROP SCHEMA IF EXISTS public CASCADE;"
  echo "CREATE SCHEMA public;"
  cat "$WORK/restore.sql.body"
} > "$WORK/restore.sql"

echo "Stoppe die Anwendung waehrend des Restores..."
docker compose stop app

echo "Spiele '$DUMP' ein..."
if ! docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
       psql -U hoffest -d hoffest \
            -v ON_ERROR_STOP=1 --single-transaction --quiet \
       < "$WORK/restore.sql"; then
  echo
  echo "FEHLER: Restore abgebrochen, die Datenbank ist unveraendert."
  echo "Die Anwendung wird wieder gestartet."
  docker compose start app
  exit 1
fi

echo "Starte die Anwendung..."
docker compose start app

echo "Restore abgeschlossen. Pruefen mit:"
echo "  docker compose exec app python db.py check"
