#!/usr/bin/env python3
"""
Legt einen zusaetzlichen Admin-Account fuer den Notfall an (oder setzt dessen
Passwort zurueck, falls er schon existiert).

Kein Passwort steht im Code - es wird bei jedem Lauf neu zufaellig erzeugt und
NUR auf der Konsole ausgegeben. Direkt danach in einen Passwort-Manager
uebernehmen; es wird nirgendwo gespeichert oder verschickt.

Aufruf (dort, wo DATABASE_URL auf die echte DB zeigt, z.B. im Container):
    python create_recovery_admin.py --email deine@echte-adresse.de
"""
import argparse
import secrets

import argon2

from db import DatabaseManager

ph = argon2.PasswordHasher()


def reset_password(db, name, password):
    query = "UPDATE admin SET password = %s WHERE LOWER(name) = LOWER(%s)"
    with db._lock:
        try:
            db.cursor.execute(query, (ph.hash(password), name))
            db.conn.commit()
            return db.cursor.rowcount > 0
        except Exception:
            db.conn.rollback()
            return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="recovery_admin", help="Login-Name des Recovery-Accounts")
    parser.add_argument("--email", required=True, help="Email des Recovery-Accounts (muss eindeutig in der DB sein)")
    args = parser.parse_args()

    password = secrets.token_urlsafe(18)

    db = DatabaseManager()
    created = db.add_admin_account(args.name, password, args.email)

    if not created:
        updated = reset_password(db, args.name, password)
        if not updated:
            print(f"FEHLER: Konnte weder Account '{args.name}' anlegen noch dessen Passwort zuruecksetzen.")
            return
        print(f"Account '{args.name}' existierte bereits - Passwort wurde zurueckgesetzt.")
    else:
        print(f"Neuer Admin-Account '{args.name}' angelegt.")

    print("=" * 60)
    print(f"Name:     {args.name}")
    print(f"Passwort: {password}")
    print("=" * 60)
    print("Dieses Passwort wird nur JETZT angezeigt und nirgendwo gespeichert.")
    print("Sofort in einen Passwort-Manager uebernehmen.")


if __name__ == "__main__":
    main()
