import random
import time
import logger
import psycopg2
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import argon2

ph = argon2.PasswordHasher()
from logger import get_logger

from SMTPMailer import SMTPMailer

with open("./credentials.txt", "r") as file:
        SMTP_USER = file.readline().strip()
        SMTP_PASS = file.readline().strip()
mailer = SMTPMailer("smtp.strato.com", 587, SMTP_USER, SMTP_PASS)

logger = get_logger("databaseManager", logging.DEBUG)
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
            host="127.0.0.1",
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
        logger.debug("dropping existing tables in 3 seconds...\nPress strg+c to cancel")

        self.drop_db()
        query = read_sql_file("./dbInit.sql")
        logger.debug(f"executing SQL query: {query}")
        try:
            self.cursor.execute(query)
            self.conn.commit()
            self.add_admin_account("Admin", "1234", "testAdmin@t-auer.com")
            self.add_question("Strom und geräte?")
            self.add_question("Lebensmittel?")
            logger.info("Tables initiated successfully")
        except Exception as e:
            logger.error(f"Error creating tables: {e}")
            self.conn.rollback()
            return False
        return True

    def add_question(self, question):
        """
        Inserts a new question into the database.

        Parameters:
        question (str): The question to be added.

        Returns:
        int: The ID of the newly inserted question.
        """
        logger.debug("add_question is called")
        query = "INSERT INTO questions (question) VALUES (%s)"
        logger.debug(f"executing SQL query: {query}")
        try:
            self.cursor.execute(query, (question,))
            self.conn.commit()
            logger.info(f"Question added!")
            return True
        except Exception as e:
            logger.error(f"Error adding question: {e}")
            self.conn.rollback()
            return False
    
    def get_questions(self):
        logger.debug("get_questions is called")
        query = "SELECT id, question FROM questions"
        try:
            self.cursor.execute(query)
            questions = self.cursor.fetchall()
            logger.info(f"Questions retrieved: {questions}")
            questionsDict = {}
            for question in questions:
                questionsDict[question[0]] = question[1]
            return questionsDict
        except Exception as e:
            logger.error(f"Error retrieving questions: {e}")
            self.conn.rollback()
            return []

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
        logger.warning(
            "\nDropping database in 3 Seconds!!!\n\n!!! To cancel press CTRL+C !!!\n"
        )
        for i in range(3, 0, -1):
            print(f"Reset in {i}...")
            time.sleep(1)
        query = "DROP SCHEMA public CASCADE;CREATE SCHEMA public;"
        logger.debug(f"executing SQL query: {query}")
        self.cursor.execute(query)
        logger.warning("Database dropped")
        self.conn.commit()

    

    #########################################################
    def addNewTrustedId(self, id):
        """
        Adds a new trusted ID to the database.

        Parameters:
        id (str): The ID to be added.

        Returns:
        bool: True if the ID was successfully added, False otherwise.
        """
        logger.debug(f"addNewTrustedId is called")
        query = "INSERT INTO trusted_ids (trusted) VALUES (%s);"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query, (id,))
            self.conn.commit()
            logger.info(f"ID {id} added successfully")
        except Exception as e:
            logger.error(f"Error adding ID: {e}")
            self.conn.rollback()
            return False
        return True

    def checkTrustedId(self, id):
        """
        Checks if a given ID is a trusted ID in the database.

        Parameters:
        id (str): The ID to be checked.

        Returns:
        bool: True if the ID is trusted, False otherwise.
        """
        logger.debug(f"checkTrustedId is called")
        query = "SELECT COUNT(*) FROM trusted_ids WHERE trusted = %s;"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query, (id,))
            result = self.cursor.fetchone()
            if result[0] > 0:
                logger.info(f"ID {id} is trusted")
                return True
            else:
                logger.info(f"ID {id} is not trusted")
        except Exception as e:
            logger.error(f"Error checking ID: {e}")
        return False

    def addNewStand(self, data, auth_id):
        # {'lehrername': 'name',
        # 'klasse': 'class',
        # 'baseLocation': 'h',
        # 'raumnummer': '',
        # 'projektName': 'nameprojekt',
        # 'projektBeschreibung': 'descrip',
        # 'email': ''
        # 'mapSelection': {'x': 504, 'y': 114, 'width': 227, 'height': 54},
        # 'questions': {'1': False, '2': True}}
        """
        Adds a new stand to the database.

        Parameters:
        data (dict): The data of the stand to be added.

        Returns:
        bool: True if the stand was successfully added, False otherwise.
        """
        logger.debug(f"addNewStand is called")
        query = """INSERT INTO stand (auth_id, ort, ort_spezifikation, lehrer, klasse, name, beschreibung, email)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (auth_id) 
                    DO UPDATE SET 
                        ort = EXCLUDED.ort,
                        ort_spezifikation = EXCLUDED.ort_spezifikation,
                        lehrer = EXCLUDED.lehrer,
                        klasse = EXCLUDED.klasse,
                        name = EXCLUDED.name,
                        beschreibung = EXCLUDED.beschreibung,
                        email = EXCLUDED.email
                    RETURNING id;"""
        values = (
            auth_id,
            data["baseLocation"],
            (
                str(data["mapSelection"])
                if data["baseLocation"] == "h"
                else data["raumnummer"]
            ),
            data["lehrername"],
            data["klasse"],
            data["projektName"],
            data["projektBeschreibung"],
            data["email"],
        )

        try:
            logger.debug(f"Executing SQL query: {query}")
            logger.debug(f"with data: {values}")
            self.cursor.execute(query, values)
            self.conn.commit()
            last_id = self.cursor.fetchone()[0]
            logger.info(f"Stand added successfully")
            delete_query = "DELETE FROM standQuestions WHERE stand_id = %s"
            self.cursor.execute(delete_query, (last_id,))
            self.conn.commit()
            query = "INSERT INTO standQuestions (stand_id, question_id) VALUES (%s, %s)"
            for key, value in data["questions"].items():
                if value:
                    logger.debug(f"Executing SQL query: {query}")
                    logger.debug(f"with data: {last_id}, {key}")
                    self.cursor.execute(query, (last_id, int(key)))
                    self.conn.commit()
            self.create_new_genehmigungs_entry(last_id, data["email"])
            return True
        except Exception as e:
            logger.error(f"Error adding stand: {e}")
            self.conn.rollback()
            return False

    def get_submitted_data_from_id(self, id):
        """
        Retrieves the submitted data for a given user ID from the database.

        Parameters:
        id (int): The auth_ID of the user.

        Returns:
        dict: The submitted data for the stand.
        """
        logger.debug(f"get_submitted_data_from_id is called")
        query = """SELECT s.ort, s.ort_spezifikation, s.lehrer, s.klasse, s.name, s.beschreibung, ARRAY_AGG(sq.question_id) AS question_ids, g.genehmigt, g.kommentar
                    FROM stand as s
                    LEFT join standQuestions AS sq ON sq.stand_id = s.id
                    join genehmigungen AS g on g.id = s.genehmigungs_id
                    WHERE s.auth_id = %s
                    GROUP BY s.id, g.genehmigt, g.kommentar;"""
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(id,)}")
        try:
            self.cursor.execute(query, (id,))
            result = self.cursor.fetchall()
            if result == []:
                logger.debug(f"No results found")
                return None
            data = [
                (
                    item.replace("'", '"')
                    if isinstance(item, str)
                    else (
                        ""
                        if (item == None)
                        else (
                            ""
                            if item
                            == [
                                None,
                            ]
                            else item
                        )
                    )
                )
                for item in result[0]
            ]
            logger.info(f"Data retrieved successfully")
            return data
        except Exception as e:
            logger.error(f"Error retrieving data: {e}")
            self.conn.rollback()
            return None

    def get_submitted_data_from_stand_id(self, id):
        """
        Retrieves the submitted data for a given user ID from the database.

        Parameters:
        id (int): The auth_ID of the user.

        Returns:
        dict: The submitted data for the stand.
        """
        logger.debug(f"get_submitted_data_from_stand_id is called")
        query = """SELECT s.ort, s.ort_spezifikation, s.lehrer, s.klasse, s.name, s.beschreibung, ARRAY_AGG(sq.question_id) AS question_ids, g.genehmigt, g.kommentar
                    FROM stand as s
                    LEFT join standQuestions AS sq ON sq.stand_id = s.id
                    join genehmigungen AS g on g.id = s.genehmigungs_id
                    WHERE s.genehmigungs_id = %s
                    GROUP BY s.id, g.genehmigt, g.kommentar;"""
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(id,)}")
        try:
            self.cursor.execute(query, (id,))
            result = self.cursor.fetchall()
            if result == []:
                logger.debug(f"No results found")
                return None
            data = [
                (
                    item.replace("'", '"')
                    if isinstance(item, str)
                    else (
                        ""
                        if (item == None)
                        else (
                            ""
                            if item
                            == [
                                None,
                            ]
                            else item
                        )
                    )
                )
                for item in result[0]
            ]
            logger.info(f"Data retrieved successfully")
            return data
        except Exception as e:
            logger.error(f"Error retrieving data: {e}")
            self.conn.rollback()
            return None

    def add_admin_account(self, name, pwd, email):
        """
        Adds a new admin account to the database.

        Parameters:
        name (str): The name of the admin account.
        pwd (str): The password of the admin account.
        email (str): The email of the admin account.

        Returns:
        bool: True if the admin account was successfully added, False otherwise.
        """
        logger.debug(f"add_admin_account is called")
        query = "INSERT INTO admin (name, password, email) VALUES (%s, %s, %s)"
        logger.debug(f"Executing SQL query: {query}")
        pwd = ph.hash(pwd)
        logger.debug(f"with data: {(name, pwd, email)}")
        try:
            self.cursor.execute(query, (name, pwd, email))
            self.conn.commit()
            logger.info(f"Admin account added successfully")
            return True
        except Exception as e:
            logger.error(f"Error adding admin account: {e}")
            self.conn.rollback()
        return False

    def create_new_genehmigungs_entry(self, stand_id, teacher_email):
        """
        Creates a new genehmigungs_entry for a given stand ID.

        Parameters:
        stand_id (int): The ID of the stand.

        Returns:
        bool: True if the genehmigungs_entry was successfully created, False otherwise.
        """
        logger.debug(f"create_new_genehmigungs_entry is called")
        query = "INSERT INTO genehmigungen (id) VALUES (%s)"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(stand_id,)}")
        try:
            self.cursor.execute(query, (stand_id,))
            self.conn.commit()
            logger.info(
                f"Genehmigungs_entry created successfully for stand_id: {stand_id}"
            )
            email_text = """Es gibt einen neuen Stand, der auf Bestätigung wartet..."""
            email_text_teacher = f"""Ihr Stand wurde erfolgreich übertragen und wird demnächst überprüft..."""
            query = "SELECT email FROM admin"
            self.cursor.execute(query)
            emails = self.cursor.fetchall()
            print(emails)
            for email in emails: # emails from all admins
                mailer.send_email(email[0], email_text)
            mailer.send_email(teacher_email, email_text_teacher)
            return True
        except Exception as e:
            logger.error(f"Error creating genehmigungs_entry: {e}")
            self.conn.rollback()

    def authenticateAdmin(self, username, password):
        """
        Authenticates an admin account.

        Parameters:
        username (str): The username of the admin account.
        password (str): The password of the admin account.

        Returns:
        bool: True if the admin account is authenticated, False otherwise.
        """
        logger.debug(f"authenticateAdmin is called")
        query = "SELECT password FROM admin WHERE LOWER(name) = LOWER(%s)"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(username,)}")
        try:
            self.cursor.execute(query, (username,))
            result = self.cursor.fetchone()
            if result == None:
                logger.debug(f"No results found")
                return False

            pwd_hash = result[0]
            if ph.verify(pwd_hash, password):
                print("verify password")
                logger.info(f"Admin account authenticated successfully")
                return True
            else:
                logger.debug(f"Incorrect password")
                return False
        except Exception as e:
            logger.error(f"Error authenticating admin account: {e}")
            self.conn.rollback()
            return False

    def get_pending(self):
        """
        Retrieves all pending stands from the database.

        Returns:
        list: A list of tuples containing the stand IDs and names.
        """
        logger.debug(f"get_pending is called")
        query = "SELECT id FROM genehmigungen WHERE genehmigt IS NULL"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query)
            result = self.cursor.fetchall()
            logger.info(f"Data retrieved successfully")
            return [result[0] for result in result]

        except Exception as e:
            logger.error(f"Error retrieving data: {e}")
            self.conn.rollback()
            return None
    
    def approve_stand(self, stand_id, status, comment):
        """
        Approves a stand and updates the genehmigungs entry.

        Parameters:
        stand_id (int): The ID of the stand to be approved.
        comment (str): The comment for the approval.

        Returns:
        bool: True if the stand was successfully approved, False otherwise.
        """
        logger.debug(f"approve_stand is called")
        query = "UPDATE genehmigungen SET genehmigt = %s, kommentar = %s WHERE id = %s"
        logger.debug(f"Executing SQL query: {query}")
        data = (True if status == "accepted" else False, comment, stand_id)
        logger.debug(f"with data: {data}")
        try:
            self.cursor.execute(query, data)
            self.conn.commit()
            logger.info(f"Stand {stand_id} processed successfully")
            self.notify_approval(stand_id, status, comment)
            return True
        except Exception as e:
            logger.error(f"Error approving stand: {e}")
            self.conn.rollback()
            return False
    
    def notify_approval(self, stand_id, status, comment):
        """
        Sends an email notification to the admin account and the teacher about the stand's approval.

        Parameters:
        stand_id (int): The ID of the stand.
        status (str): The status of the approval ("accepted" or "rejected").
        comment (str): The comment for the approval.
        """
        logger.debug(f"notify_approval is called")
        query = "SELECT email FROM stand WHERE id = %s"
        logger.debug(f"with data: {(stand_id,)}")
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query, (stand_id,))
            result = self.cursor.fetchone()
            email = result[0]
            logger.debug(f"Email retrieved successfully")
            email_text = f"""Der Stand {stand_id} wurde {status}.\nKommentar: {comment}\n\nBitte beachte, das bedeutet nur, dass versucht wird, Ihren Wunsch zu berücksichtigen. Es gibt keinen Anspruch darauf, dass es genau so umgesetzt werden kann!"""
            mailer.send_email(email, email_text)
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            self.conn.rollback()
            return False
        logger.info(f"notify_approval executed successfully")
        return True 
    

    def get_completed(self):
        """
        Retrieves all pending stands from the database.

        Returns:
        list: A list of tuples containing the stand IDs and names.
        """
        logger.debug(f"get_completed is called")
        query = "SELECT id FROM genehmigungen WHERE genehmigt IS true"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query)
            result = self.cursor.fetchall()
            logger.info(f"Data retrieved successfully")
            return [result[0] for result in result]

        except Exception as e:
            logger.error(f"Error retrieving data: {e}")
            self.conn.rollback()
            return None


# db_manager = DatabaseManager()
# db_manager.add_admin_account("Admin", "1234", "testAdmin@t-auer.com")
# db_manager.add_question("Strom und geräte?")
# db_manager.add_question("Lebensmittel?")
# print(db_manager.get_submitted_data_from_id("bypass"))
if __name__ == "__main__":
    db_manager = DatabaseManager()
    db_manager.init_tables()
    # db_manager.add_admin_account("Admin", "1234", "testAdmin@t-auer.com")
    # db_manager.add_question("Strom und geräte?")
    # db_manager.add_question("Lebensmittel?")
    print(db_manager.get_submitted_data_from_id("bypass"))
