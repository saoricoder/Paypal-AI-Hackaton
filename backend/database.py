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

    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

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


def initialize_database() -> bool:
    """Create the application tables and indexes when they are missing."""
    ddl = """
    CREATE TABLE IF NOT EXISTS deals (
        id UUID PRIMARY KEY,
        raw_text TEXT NOT NULL,
        client_email TEXT NOT NULL,
        client_name TEXT NOT NULL,
        line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        validation_rules JSONB NOT NULL DEFAULT '[]'::JSONB,
        paypal_invoice_id TEXT,
        paypal_invoice_url TEXT,
        audit_status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK (audit_status IN ('PENDING', 'IN_PROGRESS', 'APPROVED', 'FAILED')),
        payment_status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK (payment_status IN ('DRAFT', 'DRAFT_LOCKED', 'SENT', 'PAID', 'CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        pdf_storage_path TEXT,
        overall_pass BOOLEAN NOT NULL DEFAULT FALSE,
        bounding_boxes JSONB NOT NULL DEFAULT '[]'::JSONB,
        reasoning_log JSONB NOT NULL DEFAULT '[]'::JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_deals_payment_status ON deals(payment_status);
    CREATE INDEX IF NOT EXISTS idx_deals_audit_status ON deals(audit_status);
    CREATE INDEX IF NOT EXISTS idx_deals_paypal_invoice ON deals(paypal_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_deal_id ON audit_logs(deal_id);
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(ddl)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        logger.info("Database schema initialized (deals, audit_logs).")
        return True
    except (RuntimeError, psycopg2.Error) as exc:
        logger.error("Could not initialize database schema: %s", exc)
        return False


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
