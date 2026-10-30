-- ============================================================
-- Deal2Pay AI — Supabase Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: deals
-- Stores every contract/deal extracted from natural language
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_text            TEXT NOT NULL,                          -- Original user input (text or voice transcript)
    client_email        TEXT NOT NULL,
    client_name         TEXT NOT NULL,
    line_items          JSONB NOT NULL DEFAULT '[]'::JSONB,     -- Array of {description, quantity, unit_price}
    total_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    validation_rules    JSONB NOT NULL DEFAULT '[]'::JSONB,     -- Array of {label, rule_type, required}
    paypal_invoice_id   TEXT,                                   -- Populated after PayPal DRAFT creation
    paypal_invoice_url  TEXT,                                   -- Deep link to PayPal sandbox invoice
    audit_status        TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK (audit_status IN ('PENDING', 'IN_PROGRESS', 'APPROVED', 'FAILED')),
    payment_status      TEXT NOT NULL DEFAULT 'DRAFT'
                            CHECK (payment_status IN ('DRAFT', 'DRAFT_LOCKED', 'SENT', 'PAID', 'CANCELLED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: audit_logs
-- One audit record per document inspection attempt
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id             UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    pdf_storage_path    TEXT,                                   -- Supabase Storage path of the uploaded PDF
    overall_pass        BOOLEAN NOT NULL DEFAULT FALSE,
    bounding_boxes      JSONB NOT NULL DEFAULT '[]'::JSONB,     -- Array of BoundingBox objects with % coordinates
    reasoning_log       JSONB NOT NULL DEFAULT '[]'::JSONB,     -- Array of agent reasoning strings
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_deals_payment_status   ON deals(payment_status);
CREATE INDEX IF NOT EXISTS idx_deals_audit_status     ON deals(audit_status);
CREATE INDEX IF NOT EXISTS idx_deals_paypal_invoice   ON deals(paypal_invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_deal_id     ON audit_logs(deal_id);

-- ============================================================
-- AUTO-UPDATE: updated_at trigger for deals table
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER deals_updated_at
    BEFORE UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (recommended for production)
-- Disable for hackathon demo if using service role key only
-- ============================================================
-- ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
