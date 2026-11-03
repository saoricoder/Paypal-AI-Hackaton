"""
database.py — Deal2Pay AI
Render PostgreSQL connection manager using psycopg2.

All routes import get_db_connection() to obtain a short-lived connection,
execute their queries, and close via a try/finally block (or context manager).

Usage:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ...")
            row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
"""

from __future__ import annotations

import logging
import os

import psycopg2
import psycopg2.extras  # RealDictCursor

logger = logging.getLogger(__name__)


def get_db_connection() -> psycopg2.extensions.connection:
    """
    Open and return a new psycopg2 connection to the Render PostgreSQL instance.

    Reads DATABASE_URL from the environment.  Raises RuntimeError with a clear
    message if the variable is absent, and re-raises psycopg2 errors unchanged
    so callers can decide how to handle them.

    Returns:
        An open psycopg2 connection with RealDictCursor as the default cursor.

    Raises:
        RuntimeError:  DATABASE_URL is not set.
        psycopg2.Error: Connection to the database failed.
    """
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Add it to backend/.env (see .env.example)."
        )

    try:
        conn = psycopg2.connect(
            database_url,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=10,
        )
        return conn
    except psycopg2.Error as exc:
        logger.error("Failed to connect to PostgreSQL: %s", exc)
        raise


def check_db_connectivity() -> bool:
    """
    Health-check helper called at application startup.

    Verifies that:
      1. DATABASE_URL is configured.
      2. A connection can be established.
      3. The required tables (deals, audit_logs) exist and are queryable.

    Returns True on success; logs the problem and returns False on any failure.
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Lightweight existence check — no full table scan
                cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name IN ('deals', 'audit_logs')
                    ORDER BY table_name;
                    """
                )
                found = {row["table_name"] for row in cur.fetchall()}

            missing = {"deals", "audit_logs"} - found
            if missing:
                logger.warning(
                    "Database connectivity OK but missing table(s): %s. "
                    "Run database/schema.sql to initialize the schema.",
                    sorted(missing),
                )
                return False

            logger.info(
                "Database connectivity verified. Tables present: %s", sorted(found)
            )
            return True
        finally:
            conn.close()

    except RuntimeError as exc:
        logger.error("Database configuration error: %s", exc)
        return False
    except psycopg2.Error as exc:
        logger.error(
            "Database connection failed during startup check: %s", exc
        )
        return False
