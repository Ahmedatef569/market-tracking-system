-- Target Logic Redesign Schema for Market Tracking System
-- Safe complementary migration to support account-specific product targets and prices.
--
-- This migration is additive and does not modify cases/doctors/accounts/employees data.
-- Existing sales tables remain intact for rollback safety.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- local updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION sales_target_touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- NEW CORE TABLE: account + specialist + product targets
-- =====================================================================
CREATE TABLE IF NOT EXISTS sales_account_product_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    specialist_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    target_units integer NOT NULL DEFAULT 0 CHECK (target_units >= 0),
    target_value numeric(14,2) GENERATED ALWAYS AS ((target_units::numeric) * unit_price) STORED,

    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT sales_account_product_targets_unique
        UNIQUE (account_id, specialist_id, product_id)
);

CREATE INDEX IF NOT EXISTS sales_account_product_targets_account_idx
    ON sales_account_product_targets (account_id);
CREATE INDEX IF NOT EXISTS sales_account_product_targets_specialist_idx
    ON sales_account_product_targets (specialist_id);
CREATE INDEX IF NOT EXISTS sales_account_product_targets_product_idx
    ON sales_account_product_targets (product_id);
CREATE INDEX IF NOT EXISTS sales_account_product_targets_line_idx
    ON sales_account_product_targets (line_id);
CREATE INDEX IF NOT EXISTS sales_account_product_targets_line_specialist_idx
    ON sales_account_product_targets (line_id, specialist_id);

DROP TRIGGER IF EXISTS trg_sales_account_product_targets_updated_at ON sales_account_product_targets;
CREATE TRIGGER trg_sales_account_product_targets_updated_at
    BEFORE UPDATE ON sales_account_product_targets
    FOR EACH ROW EXECUTE FUNCTION sales_target_touch_updated_at();

-- =====================================================================
-- COMPATIBILITY VIEWS (keep frontend computations coherent)
-- =====================================================================

-- account totals derived from account-product target rows
CREATE OR REPLACE VIEW v_sales_account_target_totals AS
SELECT
    t.account_id,
    t.specialist_id,
    t.line_id,
    SUM(t.target_value) AS target_value,
    MIN(t.created_at) AS created_at,
    MAX(t.updated_at) AS updated_at
FROM sales_account_product_targets t
GROUP BY t.account_id, t.specialist_id, t.line_id;

-- product totals derived from account-product target rows
CREATE OR REPLACE VIEW v_sales_product_target_totals AS
SELECT
    t.product_id,
    t.specialist_id,
    t.line_id,
    SUM(t.target_units) AS target_units,
    SUM(t.target_value) AS target_value,
    MIN(t.created_at)::date AS effective_from,
    MIN(t.created_at) AS created_at,
    MAX(t.updated_at) AS updated_at
FROM sales_account_product_targets t
GROUP BY t.product_id, t.specialist_id, t.line_id;

-- detailed view for accounts sub-page matrix rendering
CREATE OR REPLACE VIEW v_sales_account_product_target_details AS
SELECT
    t.id,
    t.account_id,
    a.name AS account_name,
    a.account_type,
    t.specialist_id,
    e.first_name || ' ' || e.last_name AS specialist_name,
    t.line_id,
    l.name AS line_name,
    t.product_id,
    p.name AS product_name,
    p.category,
    p.sub_category,
    p.is_company_product,
    t.unit_price,
    t.target_units,
    t.target_value,
    t.created_at,
    t.updated_at
FROM sales_account_product_targets t
LEFT JOIN accounts a ON t.account_id = a.id
LEFT JOIN employees e ON t.specialist_id = e.id
LEFT JOIN lines l ON t.line_id = l.id
LEFT JOIN products p ON t.product_id = p.id;

COMMIT;

-- =====================================================================
-- OPTIONAL MANUAL ROLLBACK (only if you need to revert this redesign)
-- =====================================================================
-- BEGIN;
-- DROP VIEW IF EXISTS v_sales_account_product_target_details;
-- DROP VIEW IF EXISTS v_sales_product_target_totals;
-- DROP VIEW IF EXISTS v_sales_account_target_totals;
-- DROP TRIGGER IF EXISTS trg_sales_account_product_targets_updated_at ON sales_account_product_targets;
-- DROP TABLE IF EXISTS sales_account_product_targets;
-- DROP FUNCTION IF EXISTS sales_target_touch_updated_at();
-- COMMIT;
