import time
import logger
import psycopg2
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging

from logger import get_logger
logger = get_logger("databaseManager",logging.DEBUG)
RESET_DATABASE = False

def read_sql_file(filepath):
    with open(filepath, "r") as file:
        return file.read()

class DatabaseManager:
    TABLE_COUNT = 4  # minimum table count
    LOWEST_WEB_ACCESS_LEVEL = 0

    def __init__(self):
        self.CURRENT_DOMAIN = open("DOMAIN.txt", "r").readline().strip()
        logger.debug("Initializing database manager")
        self.conn = psycopg2.connect(
            database="hoffest-postgresDB",
            host="localhost",
            user="admin",
            password="admin",
            port="5432",
        )
        logger.info("Established connection to the database")
        self.cursor = self.conn.cursor()

        if not self.check_database_integrity() or RESET_DATABASE:
            self.init_tables()
    ################################ INIT FUNCTIONS ###################################
    def check_database_integrity(self):
        """
        Checks the integrity of the database by comparing the number of tables with the expected count.

        Parameters:
        self (DatabaseManager): The instance of the DatabaseManager class.

        Returns:
        bool: True if the database integrity check passes, False otherwise.
        """
        logger.debug("check_database_integrity is called")
        logger.debug(f"Expected table count: {self.TABLE_COUNT}")
        actual_table_count = len(self.get_all_tables())
        if actual_table_count < self.TABLE_COUNT:
            logger.critical("Database integrity check failed.")
            logger.debug(f"Actual table count: {actual_table_count}")
            return False
        else:
            logger.info("Database integrity check passed.")
        return True
    
    def get_all_tables(self):
        """
        Retrieves all table names from the connected database.

        Parameters:
        None

        Returns:
        tables (list): A list of tuples, where each tuple contains one table name.
        """
        logger.debug("get_all_tables is called")
        query = "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');"
        logger.debug(f"executing SQL query: {query}")
        self.cursor.execute(query)
        tables = self.cursor.fetchall()
        logger.debug(f"Table names retrieved: {tables}")
        return tables
    
    def init_tables(self):
        """
        WARNING: This function wipes the whole database.

        This function drops the existing database schema and recreates it by executing the SQL query from the initDB.sql file.
        It then commits the changes and prints a success message.

        Returns:
        bool: True if the tables are successfully initiated, False otherwise.

        Raises:
        Exception: If an error occurs while executing the SQL query or committing the changes.
        """
        logger.debug("create_tables is called")
        logger.debug("dropping existing tables in 5 seconds...\nPress strg+c to cancel")
        
            
        self.drop_db()
        query = read_sql_file("./dbInit.sql")
        logger.debug(f"executing SQL query: {query}")
        try:
            self.cursor.execute(query)
            self.conn.commit()
            logger.info("Tables initiated successfully")
            self.init_item_blocks_lookup_table("database/blocks.json")
            self.init_item_items_lookup_table("database/itemlist.json")
            logger.info("block and item data initiated successfully")
        except Exception as e:
            logger.error(f"Error creating tables: {e}")
            self.conn.rollback()
            return False
        return True

    def drop_db(self):
        """
        WARNING: This function wipes the whole database. Only run on critical errors.

        Drops the public schema and recreates it. This is used to reset the database.

        Parameters:
        None

        Returns:
        None
        """
        logger.debug("drop_db is called")
        logger.warning("\nDropping database in 5 Seconds!!!\n\n!!! To cancel press CTRL+C !!!\n")
        for i in range(5, 0, -1):
            print(f"Reset in {i}...")
            time.sleep(1)
        query = "DROP SCHEMA public CASCADE;CREATE SCHEMA public;"
        logger.debug(f"executing SQL query: {query}")
        self.cursor.execute(query)
        logger.warning("Database dropped")
        self.conn.commit()


    def send_email(self, recipient, text):
            SMTP_SERVER = "smtp.strato.com"
            SMTP_PORT = 587  
            with open("./credentials.txt", "r") as file:
                SMTP_USER = file.readline().strip()
                SMTP_PASS = file.readline().strip()

            # E-Mail Details
            sender_email = SMTP_USER
            receiver_email = recipient
            subject = "Test HTML E-Mail"

            # HTML-Inhalt der E-Mail
            html_content = f"""\
            <html>
            <body>
                {text}
            </body>
            </html>
            """

            # E-Mail Nachricht erstellen
            msg = MIMEMultipart()
            msg["From"] = sender_email
            msg["To"] = receiver_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html_content, "html"))

            # E-Mail senden
            try:
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    server.starttls()  # TLS-Verschlüsselung aktivieren
                    server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(sender_email, receiver_email, msg.as_string())
                print("E-Mail erfolgreich gesendet!")
            except Exception as e:
                print(f"Fehler beim Senden: {e}")
                
                
if __name__ == "__main__":
    db_manager = DatabaseManager()
