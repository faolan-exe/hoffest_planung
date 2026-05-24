import ast
from datetime import datetime, timedelta
import time
import traceback
import threading
import uuid
from contextlib import contextmanager

from flask import json
import logger
import psycopg2
import psycopg2.errors
import psycopg2.pool
from logging import INFO
from datetime import datetime, timedelta, timezone
from logger import get_logger
import argon2

import os


from SMTPMailer import SMTPMailer

ph = argon2.PasswordHasher()

logger = get_logger("databaseManager", INFO)
RESET_DATABASE = False


def read_sql_file(filepath):
    with open(filepath, "r") as file:
        return file.read()


_UNSET = object()

class DatabaseManager:
    TABLE_COUNT = 4
    LOWEST_WEB_ACCESS_LEVEL = 0

    def __init__(self):
        self.CURRENT_DOMAIN = open("DOMAIN.txt", "r").readline().strip()
        self._lock = threading.RLock()
        logger.debug("Initializing database manager")
        
        # Create a thread-safe connection pool (min 5, max 20 connections)
        self.conn_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=5,
            maxconn=20,
            database="hoffest-postgresDB",
            host="127.0.0.1",
            user="admin",
            password="admin",
            port="5432",
        )
        logger.info("Initialized ThreadedConnectionPool with 5-20 connections")
        
        # For compatibility with code that expects self.conn and self.cursor,
        # initialize a single connection for non-concurrent operations
        self.conn = self.conn_pool.getconn()
        self.cursor = self.conn.cursor()
        
        try:
            if not self.check_database_integrity() or RESET_DATABASE:
                self.init_tables()

            self.do_migrations()
        except Exception as e:
            logger.error(f"Error during initialization: {e}", exc_info=True)
            if self.conn:
                self.conn_pool.putconn(self.conn)
            raise

    @contextmanager
    def get_db_connection(self):
        """
        Context manager for getting a database connection from the pool.
        Automatically handles connection lifecycle and returns it to the pool.
        
        Usage:
            with self.get_db_connection() as (conn, cursor):
                cursor.execute(...)
                conn.commit()
        """
        conn = None
        try:
            conn = self.conn_pool.getconn()
            cursor = conn.cursor()
            yield conn, cursor
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            raise e
        finally:
            if conn:
                try:
                    self.conn_pool.putconn(conn)
                except Exception as e:
                    logger.error(f"Error returning connection to pool: {e}")

    def _connect(self):
        """Legacy method - kept for compatibility but uses the pool now."""
        self.conn = self.conn_pool.getconn()
        self.cursor = self.conn.cursor()
        logger.debug("Got connection from pool")

    def _ensure_connected(self):
        """Legacy method - kept for compatibility."""
        # With ThreadedConnectionPool, connections are managed automatically
        if self.conn is not None and not self.conn.closed:
            try:
                self.cursor.execute("SELECT 1")
                return
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                pass
        
        # Return old connection to pool if exists
        if self.conn is not None:
            try:
                self.conn_pool.putconn(self.conn)
            except Exception:
                pass
        
        # Get new connection
        self._connect()

    ################################ INIT FUNCTIONS ###################################
    
    def do_migrations(self):
        """
        Applies any pending database migrations.

        Parameters:
        None

        Returns:
        None
        """
        logger.debug("do_migrations is called")
        try:
            
            query = read_sql_file("./dbscripts/postgres/migrations/migration_001_init.sql")
            logger.debug(f"Executing SQL query: {query}")
            self.cursor.execute(query)
            self.conn.commit()
            query = "SELECT migration_name FROM migrations;"
            logger.debug(f"Executing SQL query: {query}")
            
            self.cursor.execute(query)
            applied_migrations = {row[0] for row in self.cursor.fetchall()}


            migration_files = sorted(
                f
                for f in os.listdir("./dbscripts/postgres/migrations/")
                if f.endswith(".sql")
            )

            for migration_file in migration_files:
                if migration_file not in applied_migrations:
                    logger.info(f"Applying migration: {migration_file}")
                    migration_query = read_sql_file(
                        f"./dbscripts/postgres/migrations/{migration_file}"
                    )
                    logger.debug(f"Executing SQL query: {migration_query}")
                    self.cursor.execute(migration_query)
                    self.conn.commit()
                    logger.info(f"Migration {migration_file} applied successfully")
        except Exception as e:
            logger.critical(f"Error applying migrations: {e}")
            logger.critical(traceback.format_exc())
            self.conn.rollback()
    
    
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
            self.add_admin_account("Admin", "1234", "akhoffest@gmx.de")
            self.add_question("Strom und geräte?")
            self.add_question("Lebensmittel?")
            query = "INSERT INTO email (id, email) VALUES (%s, %s)"
            values = [
                (1, 'Text für EMail 1'),
                (2, 'Text für EMail 2'),
                (3, 'Text für EMail 3'),
                (4, 'Text für EMail 4'),
                (5, 'Text für EMail 5'),
                (10, 'Text für Reminder')
                
            ]
            self.cursor.executemany(query, values)
            self.conn.commit()
            if not self.add_new_status_action("enabled", "0"):
                raise Exception("Failed to add new status action")
            logger.info("Tables initiated successfully")
        except Exception as e:
            self.conn.rollback()
            logger.critical(f"\n\nError creating tables: {e}")
            logger.critical(traceback.format_exc())
            logger.critical("Database could NOT be set up correctly! The appliction will FAIL!!")
            time.sleep(5)
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
    
    def delete_question(self, question_id):
        """
        Archive a question from the database.

        Parameters:
        question_id (int): The ID of the question to be archived.

        Returns:
        bool: True if the question was successfully archived, False otherwise.
        """
        logger.debug("delete_question is called")
        query = "UPDATE questions SET archiviert = true WHERE id = %s"
        logger.debug(f"executing SQL query: {query}")
        try:
            self.cursor.execute(query, (question_id,))
            self.conn.commit()
            logger.info(f"Question {question_id} archived!")
            return True
        except Exception as e:
            logger.error(f"Error deleting question: {e}")
            self.conn.rollback()
            return False
        
    def update_password(self, new_password):
        """
        Changes the password of the admin account.

        Parameters:
        new_password (str): The new password to be set.

        Returns:
        bool: True if the password was successfully changed, False otherwise.
        """
        logger.debug("update_password is called")
        query = "UPDATE admin SET password = %s WHERE LOWER(name) = 'admin'"
        logger.debug(f"executing SQL query: {query}")
        try:
            self.cursor.execute(query, (ph.hash(new_password),))
            self.conn.commit()
            logger.info(f"Password changed successfully!")
            return True
        except Exception as e:
            logger.error(f"Error changing password: {e}")
            self.conn.rollback()
            return False

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
    def get_questions(self):
        logger.debug("get_questions is called")
        query = "SELECT id, question FROM questions WHERE archiviert = false"
        try:
            self.cursor.execute(query)
            questions = self.cursor.fetchall()
            logger.debug(f"Questions retrieved: {questions}")
            questionsDict = {}
            for question in questions:
                questionsDict[question[0]] = question[1]
            return questionsDict
        except Exception as e:
            logger.error(f"Error retrieving questions: {e}")
            self.conn.rollback()
            return []

    def addNewTrustedId(self, id):
        """
        Adds a new trusted ID to the database.

        Parameters:
        id (str): The ID to be added.

        Returns:
        bool: True if the ID was successfully added, False otherwise.
        """
        logger.debug(f"addNewTrustedId is called")
        query = """INSERT INTO trusted_ids (trusted)
                    SELECT %s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM trusted_ids WHERE trusted = %s
                    );
                """
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query, (id,id))
            self.conn.commit()
            logger.info(f"ID {id} added successfully")
        except Exception as e:
            logger.error(f"Error adding ID: {e}")
            self.conn.rollback()
            return False
        return True

    def update_stand_color(self, stand_id, color):
        """
        Updates the color of a stand in the database.

        Parameters:
        stand_id (int): The ID of the stand to be updated.
        color (str): The new color to be set for the stand.

        Returns:
        bool: True if the color was successfully updated, False otherwise.
        """
        logger.debug(f"update_stand_color is called")
        query = "UPDATE stand SET farbe = %s WHERE id = %s"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query, (color, stand_id))
            self.conn.commit()
            logger.info(f"Stand {stand_id} color updated successfully to {color}")
            return True
        except Exception as e:
            logger.error(f"Error updating stand color: {e}")
            self.conn.rollback()
            return False
    
    def update_stand_jahr(self, stand_id, jahr):
        logger.debug(f"update_stand_jahr is called")
        query = "UPDATE stand SET jahr = %s WHERE id = %s"
        try:
            self.cursor.execute(query, (jahr, stand_id))
            self.conn.commit()
            logger.info(f"Stand {stand_id} jahr updated to {jahr}")
            return True
        except Exception as e:
            logger.error(f"Error updating stand jahr: {e}")
            self.conn.rollback()
            return False

    def check_trusted_id(self, id):
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
        logger.debug(f"with data: {(id,)}")
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
        # "reedit": False
        """
        Adds a new stand to the database.

        Parameters:
        data (dict): The data of the stand to be added.

        Returns:
        bool: True if the stand was successfully added, False otherwise.
        """
        
        logger.debug("addNewStand is called")
        reedit = data.get("reedit", False)
        ### check for race conditions
        existingMaps = self.getAllSelectedAreasExceptUserId(auth_id) if reedit else self.getAllSelectedAreas()
        allMaps = [data["mapSelection"] if data["baseLocation"] == "h" else data["raumnummer"], ]
        for map in existingMaps:
            if map[2] == "none":
                continue
            allMaps.append(ast.literal_eval(map[2]))
        seen = set()
        overlap_found = False

        for lst in allMaps:
            for item in lst:
                if item in seen:
                    overlap_found = True
                    break
                seen.add(item)
            if overlap_found:
                break

        if overlap_found:
            logger.error("Overlap found in selected areas")
            return False  # TODO: Auto Update Map Of The User

        email = data.get("email")
        if not email and reedit:
            self.cursor.execute(
                "SELECT email FROM stand WHERE auth_id = %s AND (jahr = %s OR jahr = 0)",
                (auth_id, datetime.now().year)
            )
            row = self.cursor.fetchone()
            email = row[0] if row else ""

        query = """INSERT INTO stand (auth_id, jahr, ort, ort_spezifikation, lehrer, klasse, name, beschreibung, email)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (jahr, auth_id)
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
            datetime.now().year,
            data["baseLocation"],
            str(data["mapSelection"]) if data["baseLocation"] == "h" else data["raumnummer"],
            data["lehrername"],
            data["klasse"],
            data["projektName"],
            data["projektBeschreibung"],
            email,
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
            if reedit:
                data["email"] = self.get_email_from_stand_id(last_id)
            self.create_new_genehmigungs_entry(last_id, data["email"], reedit)
            return True
        except Exception as e:
            logger.error(f"Error adding stand: {e}")
            self.conn.rollback()
            return False
    
    def addNewAdminStand(self, data):
        """
        Adds a new stand to the database.

        Parameters:
        data (dict): The data of the stand to be added.

        Returns:
        bool: True if the stand was successfully added, False otherwise.
        """
                ### check for race conditions
        existingMaps = self.getAllSelectedAreas()
        allMaps = [data["mapSelection"] if data["baseLocation"] == "h" else data["raumnummer"], ]
        for map in existingMaps:
            if map[2] == "none":
                continue
            allMaps.append(ast.literal_eval(map[2]))
        seen = set()
        overlap_found = False

        for lst in allMaps:
            for item in lst:
                if item in seen:
                    overlap_found = True
                    break
                seen.add(item)
            if overlap_found:
                break

        if overlap_found:
            logger.error("Overlap found in selected areas")
            return False
        
        logger.debug("addNewAdminStand is called")
        query = """INSERT INTO stand (auth_id, ort, ort_spezifikation, lehrer, klasse, name, beschreibung, email, jahr)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;"""

        values = (
            "adminAuth" + str(uuid.uuid4()),
            data["baseLocation"],
            str(data["mapSelection"]) if data["baseLocation"] == "h" else data["raumnummer"],
            data["lehrername"],
            data["klasse"],
            data["projektName"],
            data["projektBeschreibung"],
            data["email"],
            0 if data.get("bestaendig") else datetime.now().year,
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
            
            
            query = "INSERT INTO genehmigungen (id, genehmigt, kommentar) VALUES (%s, %s, %s)"
            logger.debug(f"Executing SQL query: {query}")
            logger.debug(f"with data: {(last_id, True, 'Genehmigung vom System automatisch erteilt, da eine administrative Autorisierung vorliegt!')}")

            self.cursor.execute(query, (last_id, True, 'Genehmigung vom System automatisch erteilt, da eine administrative Autorisierung vorliegt!'))
            self.conn.commit()
            logger.info(
                f"Genehmigungs_entry created successfully for stand_id: {last_id}"
            )
 
            return True
        except Exception as e:
            logger.error(f"Error adding stand: {e}")
            self.conn.rollback()
            return False    
    
    def get_email_from_stand_id(self, stand_id):
        """
        Retrieves the email address associated with a given stand ID.

        Parameters:
        stand_id (int): The ID of the stand.

        Returns:
        str: The email address associated with the stand ID.
        """
        logger.debug(f"get_email_from_stand_id is called")
        query = "SELECT email FROM stand WHERE id = %s"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(stand_id,)}")
        try:
            self.cursor.execute(query, (stand_id,))
            result = self.cursor.fetchone()
            if result == None:
                logger.debug(f"No results found")
                return None
            email = result[0]
            logger.info(f"Email retrieved successfully")
            return email
        except Exception as e:
            logger.error(f"Error retrieving email: {e}")
            self.conn.rollback()
            return None
    
    def get_submitted_data_from_id(self, id, year=None):
        """
        Retrieves the submitted data for a given user ID from the database.

        Parameters:
        id (int): The auth_ID of the user.
        year (int): The year to filter by. Defaults to current year. Permanent stands (jahr=0) are always included.

        Returns:
        dict: The submitted data for the stand.
        """
        if year is None:
            year = datetime.now().year
        logger.debug(f"get_submitted_data_from_id is called")
        query = """SELECT s.ort, s.ort_spezifikation, s.lehrer, s.klasse, s.name, s.beschreibung, ARRAY_AGG(sq.question_id) AS question_ids, g.genehmigt, g.kommentar
                    FROM stand as s
                    LEFT join standQuestions AS sq ON sq.stand_id = s.id
                    join genehmigungen AS g on g.id = s.genehmigungs_id
                    WHERE s.auth_id = %s AND (s.jahr = %s OR s.jahr = 0)
                    GROUP BY s.id, g.genehmigt, g.kommentar;"""
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(id,)}")
        try:
            self.cursor.execute(query, (id, year))
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
        query = """SELECT s.ort, s.ort_spezifikation, s.lehrer, s.klasse, s.name, s.beschreibung, ARRAY_AGG(sq.question_id) AS question_ids, g.genehmigt, g.kommentar, s.id, s.jahr
                    FROM stand as s
                    LEFT join standQuestions AS sq ON sq.stand_id = s.id
                    join genehmigungen AS g on g.id = s.genehmigungs_id
                    WHERE s.genehmigungs_id = %s
                    GROUP BY s.id, s.jahr, g.genehmigt, g.kommentar;"""
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(id,)}")
        with self._lock:
            self._ensure_connected()
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

    def create_new_genehmigungs_entry(self, stand_id, teacher_email, reedit):
        """
        Creates a new genehmigungs_entry for a given stand ID.

        Parameters:
        stand_id (int): The ID of the stand.

        Returns:
        bool: True if the genehmigungs_entry was successfully created, False otherwise.
        """
        logger.debug(f"create_new_genehmigungs_entry is called")
        
        if reedit:
            query = "DELETE FROM genehmigungen WHERE id = %s"
            logger.debug(f"Executing SQL query: {query}")
            logger.debug(f"with data: {(stand_id,)}")
            try:
                self.cursor.execute(query, (stand_id,))
                self.conn.commit()
                logger.info(
                    f"old Genehmigungs_entry deleted successfully for stand_id: {stand_id}"
                )
            except Exception as e:
                logger.error(f"Error deleting old genehmigungs_entry: {e}")
                self.conn.rollback()
                return False
        
        query = """INSERT INTO genehmigungen (id) VALUES (%s)
                   ON CONFLICT (id) DO UPDATE SET genehmigt = NULL, kommentar = NULL"""
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(stand_id,)}")
        try:
            self.cursor.execute(query, (stand_id,))
            self.conn.commit()
            logger.info(
                f"Genehmigungs_entry created successfully for stand_id: {stand_id}"
            )

            email_text = self.get_email_text(4)  #email: orga, neuer stand
            email_text_teacher = self.get_email_text(1)  # email: lehrkraft, prozess gestartet
            query = "SELECT email FROM admin"
            self.cursor.execute(query)
            emails = self.cursor.fetchall()
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
                logger.info(f"Admin account authenticated successfully")
                return True
            else:
                logger.debug(f"Incorrect password")
                return False
        except Exception as e:
            logger.error(f"Error authenticating admin account: {e}")
            self.conn.rollback()
            return False

    def get_pending(self, year=None):
        with self._lock:
            self._ensure_connected()
            if year is None:
                query = "SELECT g.id FROM genehmigungen g WHERE g.genehmigt IS NULL"
                self.cursor.execute(query)
            else:
                query = """
                    SELECT g.id FROM genehmigungen g
                    JOIN stand s ON s.genehmigungs_id = g.id
                    WHERE g.genehmigt IS NULL AND (s.jahr = %s OR s.jahr = 0)
                """
                self.cursor.execute(query, (year,))
            return [r[0] for r in self.cursor.fetchall()]
    
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
            if status != "accepted":
                query = "UPDATE stand SET ort_spezifikation = 'none' WHERE id = %s"
                logger.debug(f"Executing SQL query: {query}")
                logger.debug(f"with data: {(stand_id,)}")
                self.cursor.execute(query, (stand_id,))
                self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error approving stand: {e}")
            self.conn.rollback()
            return False
    
    def update_status_action(self, action, value):
        """
        Changes the status of a stand based on the action and value provided.

        Parameters:
        action (str): The action to be performed ("approve" or "reject").
        value (str): The value to be set for the status.

        Returns:
        bool: True if the status was successfully changed, False otherwise.
        """
        logger.debug(f"change_status_action is called")
        query = "INSERT INTO status (action, value) VALUES (%s, %s) ON CONFLICT (action) DO UPDATE SET value = EXCLUDED.value"
        logger.debug(f"Executing SQL query: {query}")
        data = (action, value)
        logger.debug(f"with data: {data}")
        try:
            self.cursor.execute(query, data)
            self.conn.commit()
            logger.info(f"Status changed successfully")
            return True
        except Exception as e:
            logger.error(f"Error changing status: {e}")
            self.conn.rollback()
            return False
    
    def add_new_status_action(self, action, value):
        """
        Adds a new status action to the database.

        Parameters:
        action (str): The action to be added.
        value (str): The value of the action.

        Returns:
        bool: True if the status action was successfully added, False otherwise.
        """
        logger.debug(f"add_new_status_action is called")
        query = "INSERT INTO status (action, value) VALUES (%s, %s)"
        logger.debug(f"Executing SQL query: {query}")
        data = (action, value)
        logger.debug(f"with data: {data}")
        try:
            self.cursor.execute(query, data)
            self.conn.commit()
            logger.info(f"Status action added successfully")
            return True
        except Exception as e:
            logger.error(f"Error adding status action: {e}")
            self.conn.rollback()
            return False
    
    def get_status_action(self, action):
        """
        Retrieves the status action from the database.

        Parameters:
        action (str): The action to be retrieved.

        Returns:
        str: The value of the action.
        """
        logger.debug(f"get_status_action is called")
        query = "SELECT value FROM status WHERE action = %s"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(action,)}")
        try:
            self.cursor.execute(query, (action,))
            result = self.cursor.fetchone()
            if result == None:
                logger.debug(f"No results found")
                return None
            value = result[0]
            logger.info(f"Status action retrieved successfully")
            return value
        except Exception as e:
            logger.error(f"Error retrieving status action: {e}")
            self.conn.rollback()
            return None
    
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
            if status == "accepted":
                email_text = self.get_email_text(2)
                if comment != "" and comment != None:
                    email_text = email_text.replace("|kommentar|", "<span style=\"text-decoration: underline\">Anmerkung:</span><br>"+comment+"<br>")
                else:
                    email_text = email_text.replace("|kommentar|", "")
            else:
                email_text = self.get_email_text(3).replace("|kommentar|", "<span style=\"text-decoration: underline\">Begründung:</span><br>"+comment)  
            mailer.send_email(email, email_text)
        except Exception as e:
            logger.error(f"Error sending email: {e}\n{traceback.format_exc()}")
            self.conn.rollback()
            return False
        logger.info(f"notify_approval executed successfully")
        return True 
    
    def update_email_text(self, email_id, email_text, do_broadcast=False):
        """
        Updates the email text for a given email ID.

        Parameters:
        email_id (int): The ID of the email to be updated.
        email_text (str): The new email text.

        Returns:
        bool: True if the email text was successfully updated, False otherwise.
        """
        logger.debug(f"update_email_text is called")
        query = "UPDATE email SET email = %s WHERE id = %s"
        values = (email_text, email_id)
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {values}")
        try:
            self.cursor.execute(query, values)
            self.conn.commit()
            logger.info(f"Email text updated successfully")
            if email_id == 10 and do_broadcast:
                self.broadcast_text(email_text)
            return True
        except Exception as e:
            logger.error(f"Error updating email text: {e}")
            self.conn.rollback()
            return False
    
    def broadcast_text(self, email_text):
        """
        Sends the email text to all teacher accounts.

        Parameters:
        email_text (str): The email text to be sent.

        Returns:
        bool: True if the email text was successfully sent, False otherwise.
        """
        logger.debug(f"broadcast_text is called")
        query = "SELECT email FROM stand"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query)
            result = self.cursor.fetchall()
            for email in result:
                authID = self.get_auth_id_from_email(email[0])
                dynamic_email_text = email_text.replace("|authID|", authID)
                mailer.send_email(email[0], dynamic_email_text)
            logger.info(f"Email text broadcasted successfully")
            return True
        except Exception as e:
            logger.error(f"Error broadcasting email text: {e}")
            self.conn.rollback()
            return False
    
    def get_auth_id_from_email(self, email):
        """
        gets the auth_id for a given email address.
        """
        logger.debug(f"get_auth_id_from_email is called")
        query = "SELECT auth_id FROM stand WHERE email = %s"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(email,)}")
        try:
            self.cursor.execute(query, (email,))
            result = self.cursor.fetchone()
            if result == None:
                logger.debug(f"No results found")
                return None
            auth_id = result[0]
            logger.info(f"Auth ID retrieved successfully")
            return auth_id
        except Exception as e:
            logger.error(f"Error retrieving auth ID: {e}")
            self.conn.rollback()
            return None

    def get_email_text(self, email_id):
        """
        Retrieves the email text for a given email ID.
        Parameters:
        email_id (int): The ID of the email to be retrieved.
        Returns:
        str: The email text.
        """
        logger.debug(f"get_email_text is called")
        query = "SELECT email FROM email WHERE id = %s"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(email_id,)}")
        try:
            self.cursor.execute(query, (email_id,))
            result = self.cursor.fetchone()
            if result == None:
                logger.debug(f"No results found")
                return None
            email_text = result[0]
            logger.info(f"Email text retrieved successfully")
            return email_text
        except Exception as e:
            logger.error(f"Error retrieving email text: {e}")
            self.conn.rollback()
            return None        

    def get_all_emails(self):
        """
        Retrieves all email texts from the database.

        Returns:
        list: A list of dictionaries containing the email IDs and texts.
        """
        logger.debug("get_all_emails is called")
        query = "SELECT id, email FROM email"
        logger.debug(f"Executing SQL query: {query}")
        try:
            self.cursor.execute(query)
            result = self.cursor.fetchall()
            logger.info("Data retrieved successfully")
            return {row[0]: row[1] for row in result}

        except Exception as e:
            logger.error(f"Error retrieving data: {e}")
            self.conn.rollback()
            return None
    
    def getAllSelectedAreasExceptUserId(self, user_id, year=None):
        """
        Retrieves all selected areas from the database except for a given user ID.

        Parameters:
        user_id (str): The ID of the user to be excluded.

        Returns:
        list: A list of tuples containing the selected areas.
        """
        if year is None:
            year = datetime.now().year
        logger.debug(f"getAllSelectedAreasExceptUserId is called")
        query = "SELECT id, ort, ort_spezifikation FROM stand WHERE auth_id != %s AND (jahr = %s OR jahr = 0)"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(user_id,year)}")
        try:
            self.cursor.execute(query, (user_id, year))
            result = self.cursor.fetchall()
            logger.info("Data retrieved successfully")
            return result

        except Exception as e:
            logger.error(f"Error retrieving data: {e}")
            self.conn.rollback()
            return None
    
    def getAllSelectedAreas(self, year=_UNSET):
        """
        Retrieves all selected areas from the database.

        Returns:
        list: A list of tuples containing the selected areas.
        """
        if year is _UNSET:
            year = datetime.now().year
        logger.debug(f"getAllSelectedAreas is called")
        with self._lock:
            self._ensure_connected()
            try:
                if year is None:
                    query = "SELECT id, ort, ort_spezifikation, farbe FROM stand"
                    self.cursor.execute(query)
                else:
                    query = "SELECT id, ort, ort_spezifikation, farbe FROM stand WHERE (jahr = %s OR jahr = 0)"
                    self.cursor.execute(query, (year,))
                result = self.cursor.fetchall()
                logger.info("Data retrieved successfully")
                return result

            except Exception as e:
                logger.error(f"Error retrieving data: {e}")
                self.conn.rollback()
                return None

    def get_completed(self, year=None):
        with self._lock:
            self._ensure_connected()
            if year is None:
                query = "SELECT g.id FROM genehmigungen g WHERE g.genehmigt IS true"
                self.cursor.execute(query)
            else:
                query = """
                    SELECT g.id FROM genehmigungen g
                    JOIN stand s ON s.genehmigungs_id = g.id
                    WHERE g.genehmigt IS true AND (s.jahr = %s OR s.jahr = 0)
                """
                self.cursor.execute(query, (year,))
            return [r[0] for r in self.cursor.fetchall()]

    def getCurrentBlacklistCells(self):
        """
        Retrieves the current blacklist cells from the database.

        Returns:
        list: A list of tuples containing the blacklist cells.
        """
        logger.debug(f"getCurrentBlacklistCells is called")
        query = "SELECT cell FROM blacklistedCells"
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
        
    def register_failed_login(self, ip_address):
        query = """
        INSERT INTO login_attempts (ip)
        VALUES (%s)
        ON CONFLICT (ip)
        DO UPDATE SET
            counter = CASE
                WHEN login_attempts.first_attempt < NOW() - INTERVAL '15 minutes'
                    THEN 1
                ELSE login_attempts.counter + 1
            END,
            first_attempt = CASE
                WHEN login_attempts.first_attempt < NOW() - INTERVAL '15 minutes'
                    THEN NOW()
                ELSE login_attempts.first_attempt
            END,
            last_attempt = NOW();
        """

        try:
            self.cursor.execute(query, (ip_address,))
            self.conn.commit()
        except Exception as e:
            logger.error(f"Error registering failed login: {e}")
            self.conn.rollback()
            
            
    def is_ip_blocked(self, ip_address):
        query = """
        SELECT counter, first_attempt
        FROM login_attempts
        WHERE ip = %s
        """

        try:
            self.cursor.execute(query, (ip_address,))
            row = self.cursor.fetchone()

            if not row:
                return False

            counter, first_attempt = row

            now_utc = datetime.now(timezone.utc)

            if counter >= 5:
                if first_attempt >= now_utc - timedelta(minutes=15):
                    return True

            return False

        except Exception as e:
            logger.error(f"Error checking IP block: {e}")
            return False

    def getCurrentSocketCells(self):
        """
        Retrieves the current socket cells from the database.

        Returns:
        list: A list of tuples containing the socket cells.
        """
        logger.debug(f"getCurrentSocketCells is called")
        query = "SELECT cell FROM socket_cells"
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

    def update_blacklist_cells(self, cells_json):
        logger.debug("update_blacklist_cells is called")

        cells = set(json.loads(cells_json))

        try:
            self.cursor.execute("BEGIN")
            self.cursor.execute("DELETE FROM blacklistedCells")

            self.cursor.executemany(
                """
                INSERT INTO blacklistedCells (cell)
                VALUES (%s)
                """,
                [(c,) for c in cells]
            )

            self.conn.commit()
            logger.info("Blacklist aktualisiert")
            return True
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Fehler: {e}")
            return False
        
    def update_socket_cells(self, cells_json):
        logger.debug("update_socket_cells is called")

        cells = set(json.loads(cells_json))

        try:
            self.cursor.execute("BEGIN")
            self.cursor.execute("DELETE FROM socket_cells")

            self.cursor.executemany(
                """
                INSERT INTO socket_cells (cell)
                VALUES (%s)
                """,
                [(c,) for c in cells]
            )

            self.conn.commit()
            logger.info("Socket cells aktualisiert")
            return True
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Fehler: {e}")
            return False

        
    



    def update_stand_positions(self, data):
        """
        Updates the positions of the stands in the database.

        Parameters:
        data (list): A list of dictionaries containing the stand IDs and their new positions.

        Returns:
        bool: True if the positions were successfully updated, False otherwise.
        """
        logger.debug(f"updateStandPositions is called")
        data = json.loads(data)
        sorted_data = {}
        for entry in data:
            uid = entry["uid"]
            if uid in sorted_data:
                sorted_data[uid].append(entry["id"])
            else:
                sorted_data[uid] = [entry["id"]]
        query = "UPDATE stand SET ort_spezifikation = %s WHERE id = %s"
        try:
            for key, value in sorted_data.items():
                logger.debug(f"Executing SQL query: {query}")
                logger.debug(f"with data: {(key, value)}")
                self.cursor.execute(query, (json.dumps(value), key))
                self.conn.commit()
            logger.info(f"Stand positions updated successfully")
            return True
        except Exception as e:
            logger.error(f"Error updating stand positions: {e}")
            self.conn.rollback()
            return False

    def get_name_from_email(self, email):
        """
        Retrieves the name associated with a given email address.

        Parameters:
        email (str): The email address to search for.

        Returns:
        str: The name associated with the email address.
        """
        logger.debug(f"get_name_from_email is called")
        query = "SELECT lehrer FROM stand WHERE LOWER(email) = LOWER(%s)"
        logger.debug(f"Executing SQL query: {query}")
        logger.debug(f"with data: {(email,)}")
        try:
            self.cursor.execute(query, (email,))
            result = self.cursor.fetchone()
            if result == None:
                logger.debug(f"No results found")
                return None
            name = result[0]
            logger.info(f"Name retrieved successfully")
            return name
        except Exception as e:
            logger.error(f"Error retrieving name: {e}")
            self.conn.rollback()
            return None
    
    def getMailer(self):
        """
        Returns the mailer API instance.

        Returns:
        SMTPMailer: The mailer API instance.
        """
        return mailer
    

    ####### dienste #############
    
    def _gen_dienste_id(self, prefix):
        """
        Generiert prefixed unique IDs (z.B. 'evt_a1b2c3d4').
        Parameters:
        prefix (str): Prefix-String wie 'evt', 'cat', 'shadow'.
        Returns:
        str: Prefixed ID.
        """
        return f"{prefix}_{uuid.uuid4().hex[:8]}"
    
    
    def get_dienste_state(self):
        """
        Liefert den vollständigen Diensteplan-State für Frontend.
        Returns:
        dict: { day, timeRange, categories, events } im Frontend-Format,
            oder None bei Fehler.
        """
        logger.debug("get_dienste_state is called")
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute("""
                    SELECT day_name, day_date, time_range_start, time_range_end
                    FROM public.diensteplan_config
                    WHERE id = 1
                """)
                cfg_row = cursor.fetchone()
                if not cfg_row:
                    logger.warning("diensteplan_config singleton row missing")
                    return None
                day_name, day_date, t_start, t_end = cfg_row
        
                cursor.execute("""
                    SELECT id, name, color
                    FROM public.diensteplan_categories
                    ORDER BY sort_order, created_at, id
                """)
                categories = [
                    {"id": r[0], "name": r[1], "color": r[2]}
                    for r in cursor.fetchall()
                ]
        
                cursor.execute("""
                    SELECT id, category_id, start_time, end_time, description, is_shadow, slots
                    FROM public.diensteplan_events
                    ORDER BY start_time, id
                """)
                events = []
                for r in cursor.fetchall():
                    events.append({
                        "id": r[0],
                        "categoryId": r[1],
                        "start": r[2].strftime("%H:%M"),
                        "end": r[3].strftime("%H:%M"),
                        "description": r[4] or "",
                        "isShadow": bool(r[5]),
                        "slots": r[6],
                        "assignments": []
                    })
        
                cursor.execute("""
                    SELECT id, event_id, person, klasse
                    FROM public.diensteplan_assignments
                    ORDER BY event_id, created_at, id
                """)
                by_event = {}
                for r in cursor.fetchall():
                    by_event.setdefault(r[1], []).append({
                        "id": r[0],
                        "person": r[2],
                        "class": r[3]
                    })
        
                for ev in events:
                    ev["assignments"] = by_event.get(ev["id"], [])
        
                return {
                    "day": {
                        "name": day_name or "",
                        "date": day_date.isoformat() if day_date else None
                    },
                    "timeRange": {
                        "start": t_start.strftime("%H:%M"),
                        "end": t_end.strftime("%H:%M")
                    },
                    "categories": categories,
                    "events": events
                }
            except Exception as e:
                logger.error(f"Error fetching dienste state: {e}", exc_info=True)
                conn.rollback()
                return None
    
    
    def create_dienste_event(self, category_id, start_time, end_time, person, klasse, description=""):
        """
        Erstellt einen Free-Signup (is_shadow=false, slots=1, eine Assignment).
        Atomic: Event und Assignment werden in einer Transaction angelegt.
        Parameters:
        category_id (str): Existierende Kategorie-ID.
        start_time, end_time (str): 'HH:MM'.
        person, klasse (str): Pflichtfelder.
        description (str): Optional.
        Returns:
        dict: {'ok': True, 'event_id': str} bei Erfolg,
            {'ok': False, 'error': str, 'status': int} bei Fehler.
        """
        logger.debug(f"create_dienste_event called for category {category_id}")
        if not all([category_id, start_time, end_time, person]):
            return {"ok": False, "error": "Pflichtfelder fehlen", "status": 400}
    
        event_id = self._gen_dienste_id("evt")
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute(
                    "SELECT 1 FROM public.diensteplan_categories WHERE id = %s",
                    (category_id,)
                )
                if not cursor.fetchone():
                    conn.rollback()
                    return {"ok": False, "error": "Kategorie nicht gefunden", "status": 400}
        
                cursor.execute("""
                    INSERT INTO public.diensteplan_events
                        (id, category_id, start_time, end_time, description, is_shadow, slots)
                    VALUES (%s, %s, %s, %s, %s, false, 1)
                """, (event_id, category_id, start_time, end_time, description or ""))
        
                cursor.execute("""
                    INSERT INTO public.diensteplan_assignments (event_id, person, klasse)
                    VALUES (%s, %s, %s)
                """, (event_id, person, klasse))
        
                conn.commit()
                logger.info(f"Free-signup event {event_id} created by {person}/{klasse}")
                return {"ok": True, "event_id": event_id}
            except psycopg2.errors.CheckViolation as e:
                logger.warning(f"CheckViolation on create_dienste_event: {e}")
                conn.rollback()
                return {"ok": False, "error": "Validierung fehlgeschlagen", "status": 422}
            except Exception as e:
                logger.error(f"Error creating dienste event: {e}", exc_info=True)
                conn.rollback()
                return {"ok": False, "error": "Internal error", "status": 500}
    
    
    def add_dienste_assignment(self, shadow_id, person, klasse):
        """
        Trägt eine Person in einen Shadow-Slot ein. DB-Trigger fängt Slot-Overflow ab.
        Parameters:
        shadow_id (str): ID eines Shadow-Events.
        person, klasse (str): Pflichtfelder.
        Returns:
        dict: {'ok': True, 'event_id': str} bei Erfolg, sonst Fehler-dict.
        """
        logger.debug(f"add_dienste_assignment called: shadow_id={shadow_id}")
        if not all([shadow_id, person]):
            return {"ok": False, "error": "Pflichtfelder fehlen", "status": 400}
    
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute("""
                    SELECT is_shadow FROM public.diensteplan_events WHERE id = %s
                """, (shadow_id,))
                row = cursor.fetchone()
                if not row:
                    conn.rollback()
                    return {"ok": False, "error": "Event nicht gefunden", "status": 404}
                if not row[0]:
                    conn.rollback()
                    return {"ok": False, "error": "Event ist kein Shadow-Slot", "status": 409}
        
                cursor.execute("""
                    INSERT INTO public.diensteplan_assignments (event_id, person, klasse)
                    VALUES (%s, %s, %s)
                """, (shadow_id, person, klasse))
                conn.commit()
                logger.info(f"Assignment for shadow {shadow_id} added: {person}/{klasse}")
                return {"ok": True, "event_id": shadow_id}
            except psycopg2.errors.CheckViolation as e:
                logger.warning(f"Slot voll oder ähnlich: {e}")
                conn.rollback()
                return {"ok": False, "error": "Slot ist voll", "status": 409}
            except Exception as e:
                logger.error(f"Error adding dienste assignment: {e}", exc_info=True)
                conn.rollback()
                return {"ok": False, "error": "Internal error", "status": 500}
    
    
    def delete_dienste_event(self, event_id):
        """
        Löscht ein Event komplett. Assignments cascaden.
        Parameters:
        event_id (str): ID des zu löschenden Events.
        Returns:
        dict: {'ok': True} bei Erfolg, sonst Fehler-dict.
        """
        logger.debug(f"delete_dienste_event called: {event_id}")
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute(
                    "DELETE FROM public.diensteplan_events WHERE id = %s RETURNING id",
                    (event_id,)
                )
                deleted = cursor.fetchone()
                conn.commit()
                if not deleted:
                    return {"ok": False, "error": "Event nicht gefunden", "status": 404}
                logger.info(f"Event {event_id} deleted")
                return {"ok": True}
            except Exception as e:
                logger.error(f"Error deleting dienste event: {e}", exc_info=True)
                conn.rollback()
                return {"ok": False, "error": "Internal error", "status": 500}
    
    
    def delete_dienste_assignment(self, event_id, index):
        """
        Entfernt eine Assignment per Index aus einem Event.
        Index ist 0-basiert in ORDER BY created_at, id.
        Parameters:
        event_id (str): ID des Events.
        index (int): 0-basierter Index in der Assignment-Liste.
        Returns:
        dict: {'ok': True} bei Erfolg, sonst Fehler-dict.
        """
        logger.debug(f"delete_dienste_assignment called: {event_id}/{index}")
        if index < 0:
            return {"ok": False, "error": "Index ungültig", "status": 400}
    
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute("""
                    DELETE FROM public.diensteplan_assignments
                    WHERE id = (
                        SELECT id FROM public.diensteplan_assignments
                        WHERE event_id = %s
                        ORDER BY created_at, id
                        OFFSET %s LIMIT 1
                    )
                    RETURNING id
                """, (event_id, index))
                deleted = cursor.fetchone()
                conn.commit()
                if deleted is None:
                    return {"ok": False, "error": "Assignment nicht gefunden", "status": 404}
                logger.info(f"Assignment idx {index} of event {event_id} deleted (id={deleted[0]})")
                return {"ok": True}
            except Exception as e:
                logger.error(f"Error deleting dienste assignment: {e}", exc_info=True)
                conn.rollback()
                return {"ok": False, "error": "Internal error", "status": 500}


    def reset_dienste_entries(self):
        """
        Reset: löscht alle Free-Signup-Events und alle Assignments der Shadow-Events.
        Shadow-Event-Struktur (Kategorien, Zeitslots, Slots-Anzahl) bleibt erhalten.
        """
        logger.debug("reset_dienste_entries called")
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute(
                    "DELETE FROM public.diensteplan_events WHERE is_shadow = false"
                )
                deleted_events = cursor.rowcount
                cursor.execute("""
                    DELETE FROM public.diensteplan_assignments
                    WHERE event_id IN (
                        SELECT id FROM public.diensteplan_events WHERE is_shadow = true
                    )
                """)
                deleted_assignments = cursor.rowcount
                conn.commit()
                logger.info(f"reset_dienste_entries: {deleted_events} free-signup events, {deleted_assignments} shadow assignments deleted")
                return {"ok": True, "deleted_events": deleted_events, "deleted_assignments": deleted_assignments}
            except Exception as e:
                logger.error(f"Error in reset_dienste_entries: {e}", exc_info=True)
                conn.rollback()
                return {"ok": False, "error": "Internal error", "status": 500}


    def update_dienste_config(self, day, time_range, categories, shadow_events):
        """
        Atomic Sync der Diensteplan-Konfiguration: Tag/Zeitfenster, Kategorien-Sync,
        Shadow-Event-Sync. Free-Signups (is_shadow=false) und deren Assignments
        bleiben unangetastet. Bei Slot-Reduzierung werden überzählige Assignments
        (neueste zuerst) automatisch entfernt — Frontend hat das vorher confirmed.
        Parameters:
        day (dict): {'name': str, 'date': str|None}.
        time_range (dict): {'start': 'HH:MM', 'end': 'HH:MM'}.
        categories (list): [{id?, name, color}, ...] in gewünschter Reihenfolge.
        shadow_events (list): [{id?, categoryId, start, end, description, slots}, ...].
        Returns:
        dict: {'ok': True} bei Erfolg, sonst Fehler-dict.
        """
        logger.debug("update_dienste_config called")
    
        if not time_range.get("start") or not time_range.get("end"):
            return {"ok": False, "error": "timeRange unvollständig", "status": 400}
    
        with self.get_db_connection() as (conn, cursor):
            try:
                cursor.execute("""
                    UPDATE public.diensteplan_config
                    SET day_name = %s,
                        day_date = %s,
                        time_range_start = %s,
                        time_range_end = %s
                    WHERE id = 1
                """, (
                    day.get("name", ""),
                    day.get("date") or None,
                    time_range["start"],
                    time_range["end"]
                ))
        
                new_categories = []
                for i, cat in enumerate(categories):
                    cat_id = cat.get("id") or self._gen_dienste_id("cat")
                    new_categories.append((cat_id, cat["name"], cat["color"], i))
                new_cat_ids = [c[0] for c in new_categories]
        
                if new_cat_ids:
                    cursor.execute(
                        "DELETE FROM public.diensteplan_categories WHERE id != ALL(%s)",
                        (new_cat_ids,)
                    )
                else:
                    cursor.execute("DELETE FROM public.diensteplan_categories")
        
                for cat_tuple in new_categories:
                    cursor.execute("""
                        INSERT INTO public.diensteplan_categories (id, name, color, sort_order)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET name = EXCLUDED.name,
                            color = EXCLUDED.color,
                            sort_order = EXCLUDED.sort_order
                    """, cat_tuple)
        
                new_shadows = []
                for sh in shadow_events:
                    sh_id = sh.get("id") or self._gen_dienste_id("shadow")
                    slots = max(1, int(sh.get("slots", 1)))
                    new_shadows.append({
                        "id": sh_id,
                        "categoryId": sh.get("categoryId"),
                        "start": sh["start"],
                        "end": sh["end"],
                        "description": sh.get("description", ""),
                        "slots": slots
                    })
                new_shadow_ids = [s["id"] for s in new_shadows]
        
                if new_shadow_ids:
                    cursor.execute("""
                        DELETE FROM public.diensteplan_events
                        WHERE is_shadow = true AND id != ALL(%s)
                    """, (new_shadow_ids,))
                else:
                    cursor.execute("""
                        DELETE FROM public.diensteplan_events
                        WHERE is_shadow = true
                    """)
        
                for sh in new_shadows:
                    cursor.execute("""
                        SELECT count(*) FROM public.diensteplan_assignments
                        WHERE event_id = %s
                    """, (sh["id"],))
                    cnt = cursor.fetchone()[0]
                    if cnt > sh["slots"]:
                        excess = cnt - sh["slots"]
                        cursor.execute("""
                            DELETE FROM public.diensteplan_assignments
                            WHERE id IN (
                                SELECT id FROM public.diensteplan_assignments
                                WHERE event_id = %s
                                ORDER BY created_at DESC, id DESC
                                LIMIT %s
                            )
                        """, (sh["id"], excess))
                        logger.info(f"Trimmed {excess} excess assignments from shadow {sh['id']}")
        
                for sh in new_shadows:
                    cursor.execute("""
                        INSERT INTO public.diensteplan_events
                            (id, category_id, start_time, end_time, description, is_shadow, slots)
                        VALUES (%s, %s, %s, %s, %s, true, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET category_id = EXCLUDED.category_id,
                            start_time = EXCLUDED.start_time,
                            end_time = EXCLUDED.end_time,
                            description = EXCLUDED.description,
                            slots = EXCLUDED.slots
                    """, (
                        sh["id"], sh["categoryId"], sh["start"], sh["end"],
                        sh["description"], sh["slots"]
                    ))
        
                conn.commit()
                logger.info("Dienste config updated successfully")
                return {"ok": True}
            except psycopg2.errors.CheckViolation as e:
                logger.warning(f"Constraint violation on update_dienste_config: {e}")
                conn.rollback()
                return {"ok": False, "error": "Constraint-Verletzung", "status": 422}
            except psycopg2.errors.ForeignKeyViolation as e:
                logger.warning(f"FK violation on update_dienste_config: {e}")
                conn.rollback()
                return {"ok": False, "error": "Kategorie-Referenz ungültig", "status": 422}
            except Exception as e:
                logger.error(f"Error updating dienste config: {e}", exc_info=True)
                conn.rollback()
                return {"ok": False, "error": "Internal error", "status": 500}
    
        


with open("./credentials.txt", "r") as file:
        SMTP_USER = file.readline().strip()
        SMTP_PASS = file.readline().strip()
mailer = SMTPMailer("smtp.strato.com", 587, SMTP_USER, SMTP_PASS, DatabaseManager())






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
