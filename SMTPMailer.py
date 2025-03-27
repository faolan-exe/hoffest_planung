import smtplib
import threading
import queue
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

class SMTPMailer:
    def __init__(self, smtp_server, smtp_port, username, password):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
        self.email_queue = queue.Queue()
        self.running = True

        # Starte den SMTP-Worker-Thread
        self.worker_thread = threading.Thread(target=self._smtp_worker, daemon=True)
        self.worker_thread.start()

    def _smtp_worker(self):
        """SMTP-Worker, der eine persistente Verbindung aufbaut und Mails verarbeitet."""
        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.username, self.password)

                while self.running:
                    try:
                        recipient, text = self.email_queue.get(timeout=2)
                        if recipient is None:
                            break  # Beenden, wenn None empfangen wird
                        self._send_email(server, recipient, text)
                        self.email_queue.task_done()
                    except queue.Empty:
                        pass  # Keine Mails -> Warten
        except Exception as e:
            print(f"SMTP-Worker Fehler: {e}")

    def _send_email(self, server, recipient, text):
        """Sendet eine E-Mail über eine bestehende SMTP-Verbindung."""
        sender_email = self.username
        msg = MIMEMultipart()
        msg["From"] = sender_email
        msg["To"] = recipient
        msg["Subject"] = "Test HTML E-Mail"
        msg.attach(MIMEText(text, "html"))

        try:
            server.sendmail(sender_email, recipient, msg.as_string())
            print(f"E-Mail an {recipient} erfolgreich gesendet!")
        except Exception as e:
            print(f"Fehler beim Senden an {recipient}: {e}")

    def send_email(self, recipient, text):
        """Fügt eine E-Mail zur Warteschlange hinzu."""
        self.email_queue.put((recipient, text))

    def stop(self):
        """Beendet den SMTP-Worker-Thread."""
        self.running = False
        self.email_queue.put((None, None))  # Beenden-Signal für Thread
        self.worker_thread.join()


# Beispiel-Nutzung
if __name__ == "__main__":
    # Lade Zugangsdaten aus Datei
    with open("./credentials.txt", "r") as file:
        SMTP_USER = file.readline().strip()
        SMTP_PASS = file.readline().strip()

    mailer = SMTPMailer("smtp.strato.com", 587, SMTP_USER, SMTP_PASS)

    # Mehrere E-Mails versenden (asynchron)
    # mailer.send_email("test1@t-auer.com", "Hallo, dies ist eine Nachricht.")
    # mailer.send_email("test2@t-auer.com", "Noch eine Nachricht.")
    mailer.send_email("balu.safemail@gmail.com", "Dritte Nachricht.")

    # Warten, bis alle E-Mails versendet wurden
    mailer.email_queue.join()

    # SMTP-Verbindung beenden
    mailer.stop()
