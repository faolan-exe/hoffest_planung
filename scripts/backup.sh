#!/bin/sh
# Erzeugt ein vollstaendiges, komprimiertes Backup der Datenbank.
#
#   ./scripts/backup.sh                -> backups/hoffest-JJJJ-MM-TT-HHMM.sql.gz
#   ./scripts/backup.sh /pfad/zur.sql.gz
#
# Diese eine Datei reicht, um die Anwendung auf einem neuen Server komplett
# wiederherzustellen (siehe README.md, "Umzug auf einen neuen Server").
set -e
cd "$(dirname "$0")/.."

# .env laden, damit PGPASSWORD gesetzt werden kann.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

OUT="${1:-backups/hoffest-$(date +%Y-%m-%d-%H%M).sql.gz}"
mkdir -p "$(dirname "$OUT")"

docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db pg_dump -U hoffest -d hoffest --clean --if-exists \
  | gzip > "$OUT"

echo "Backup geschrieben: $OUT ($(du -h "$OUT" | cut -f1))"
