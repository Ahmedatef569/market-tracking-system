-- Re-Order (Sales Order Edit) additive migration
-- Safe: only adds columns/index/view extension for sales_orders.
-- Does NOT touch cases/doctors/accounts core data.
-- Run separately after sales_schema.sql

BEGIN;

ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS is_reorder boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reorder_count integer NOT NULL DEFAULT 0 CHECK (reorder_count >= 0),
    ADD COLUMN IF NOT EXISTS reordered_at timestamptz,
    ADD COLUMN IF NOT EXISTS reordered_by uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_orders_is_reorder_idx
    ON sales_orders (is_reorder);

CREATE INDEX IF NOT EXISTS sales_orders_reordered_by_idx
    ON sales_orders (reordered_by);

CREATE OR REPLACE VIEW v_sales_order_details AS
SELECT
    so.id,
    so.order_code,
    so.order_date,
    so.order_type,
    so.status,
    so.total_units,
    so.total_value,
    so.total_company_units,
    so.total_company_value,
    so.total_competitor_units,
    so.total_competitor_value,
    so.notes,
    so.created_at,
    so.updated_at,
    so.submitted_at,
    so.approved_at,
    so.rejected_at,

    so.line_id,
    l.name AS line_name,

    so.account_id,
    a.name AS account_name,
    a.account_type,

    so.submitted_by AS submitted_by_id,
    sb.first_name || ' ' || sb.last_name AS submitted_by_name,

    so.specialist_id,
    sp.first_name || ' ' || sp.last_name AS specialist_name,

    so.manager_id,
    mgr.first_name || ' ' || mgr.last_name AS manager_name,

    so.admin_id,
    adm.first_name || ' ' || adm.last_name AS admin_name,

    so.is_reorder,
    so.reorder_count,
    so.reordered_at,
    so.reordered_by
FROM sales_orders so
LEFT JOIN lines l ON so.line_id = l.id
LEFT JOIN accounts a ON so.account_id = a.id
LEFT JOIN employees sb ON so.submitted_by = sb.id
LEFT JOIN employees sp ON so.specialist_id = sp.id
LEFT JOIN employees mgr ON so.manager_id = mgr.id
LEFT JOIN employees adm ON so.admin_id = adm.id;

COMMIT;

-- ------------------------------------------------------------
-- OPTIONAL ROLLBACK (manual)
-- ------------------------------------------------------------
-- BEGIN;
-- DROP VIEW IF EXISTS v_sales_order_details;
-- ALTER TABLE sales_orders
--     DROP COLUMN IF EXISTS reordered_by,
--     DROP COLUMN IF EXISTS reordered_at,
--     DROP COLUMN IF EXISTS reorder_count,
--     DROP COLUMN IF EXISTS is_reorder;
-- COMMIT;
