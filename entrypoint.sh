#!/bin/sh
# Startreihenfolge der Anwendung im Container.
#
# Wichtig ist, dass Schema-Anlage und Migration EINMAL vor dem Start der
# Webworker laufen. Frueher hat das jeder Worker beim Import selbst gemacht -
# bei vier Workern also achtmal gleichzeitig.
set -e

echo "[entrypoint] Warte auf die Datenbank..."
until pg_isready -q -d "$DATABASE_URL"; do
  sleep 1
done
echo "[entrypoint] Datenbank erreichbar."

# pg_isready prueft nur, ob der Server antwortet - nicht, ob die Zugangsdaten
# stimmen. Ohne diesen Test kaeme hier ein 40-zeiliger Python-Traceback.
if ! psql "$DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; then
  echo "[entrypoint] FEHLER: Anmeldung an der Datenbank fehlgeschlagen."
  echo "[entrypoint]"
  echo "[entrypoint] Haeufigste Ursache: das Docker-Volume stammt aus einer aelteren"
  echo "[entrypoint] Installation. Postgres uebernimmt POSTGRES_USER und"
  echo "[entrypoint] POSTGRES_PASSWORD nur beim ERSTEN Start eines leeren Volumes -"
  echo "[entrypoint] danach gelten die Zugangsdaten von damals weiter."
  echo "[entrypoint]"
  echo "[entrypoint] Siehe README.md, Abschnitt 'Fehlersuche'."
  exit 1
fi
echo "[entrypoint] Anmeldung an der Datenbank erfolgreich."

# Legt das Grundschema nur an, wenn die Datenbank vollstaendig leer ist.
# Nach einem Restore ist sie das nicht - dann passiert hier nichts.
echo "[entrypoint] Schema pruefen..."
python db.py init --if-empty

echo "[entrypoint] Migrationen anwenden..."
python db.py migrate

echo "[entrypoint] Starte gunicorn."
# Ein Worker mit Threads: der Prozess haelt genau einen Verbindungspool und
# genau eine Mailer-Warteschlange. Fuer die Last dieser Anwendung reichlich.
exec gunicorn \
    --workers 1 \
    --threads 8 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile - \
    --bind 0.0.0.0:8000 \
    main:app
