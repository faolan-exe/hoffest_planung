#!/bin/sh
# Spielt ein Backup in die laufende Datenbank zurueck.
#
#   ./scripts/restore.sh backups/hoffest-2026-09-09-1200.sql.gz
#
# ACHTUNG: Der vorhandene Datenbestand wird dabei ersetzt.
set -e
cd "$(dirname "$0")/.."

# .env laden, damit PGPASSWORD gesetzt werden kann.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

DUMP="$1"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Aufruf: ./scripts/restore.sh <backup.sql.gz>"
  exit 1
fi

if [ "$HOFFEST_CONFIRM_RESTORE" != "yes" ]; then
  echo "Der aktuelle Datenbestand wird durch '$DUMP' ersetzt."
  echo "Zum Bestaetigen: HOFFEST_CONFIRM_RESTORE=yes ./scripts/restore.sh $DUMP"
  exit 1
fi

echo "Stoppe die Anwendung waehrend des Restores..."
docker compose stop app

gunzip -c "$DUMP" | docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db psql -U hoffest -d hoffest

echo "Starte die Anwendung..."
docker compose start app
echo "Restore abgeschlossen."
