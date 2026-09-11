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

TMP="$(mktemp "${TMPDIR:-/tmp}/hoffest-backup.XXXXXX")"
trap 'rm -f "$TMP"' EXIT INT TERM

# pg_dump und gzip bewusst NICHT in einer Pipe: bricht pg_dump ab, schreibt
# gzip trotzdem eine gueltige - nur eben unvollstaendige - Datei, und der
# Fehler faellt erst beim Restore auf. /bin/sh kennt kein "pipefail".
#
# --no-owner/--no-acl: der Dump soll auf jedem Cluster einspielbar sein, auch
# wenn die Rolle dort anders heisst. Ohne das meldet der Restore zu jedem
# Objekt 'role "..." does not exist'.
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_dump -U hoffest -d hoffest --clean --if-exists --no-owner --no-acl > "$TMP"

# Ein vollstaendiger pg_dump endet mit dieser Zeile. Fehlt sie, ist die
# Verbindung mittendrin abgerissen.
if ! tail -5 "$TMP" | grep -q "PostgreSQL database dump complete"; then
  echo "FEHLER: Der Dump ist unvollstaendig - kein Backup geschrieben." >&2
  exit 1
fi

# Erst fertig komprimieren, dann an den Zielnamen schieben: ein abgebrochener
# Lauf hinterlaesst keine halbe Datei, die wie ein Backup aussieht.
gzip -c "$TMP" > "$OUT.part"
mv "$OUT.part" "$OUT"

echo "Backup geschrieben: $OUT ($(du -h "$OUT" | cut -f1))"
