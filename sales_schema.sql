-- Sales Expansion Schema for Market Tracking System
-- Safe additive migration: creates NEW sales-related structures only.
-- Existing tables (cases, doctors, accounts, employees, etc.) are not modified.
--
-- Execute in Supabase SQL Editor as one shot.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure existing enum is present when running this file independently
DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('pending_manager','pending_admin','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sales_order_type AS ENUM ('company', 'competitor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Local updated_at helper (isolated from base schema dependencies)
CREATE OR REPLACE FUNCTION sales_touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- TARGET TABLES
-- =========================================================

-- Account target per specialist (value target)
CREATE TABLE IF NOT EXISTS sales_account_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    specialist_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    target_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (target_value >= 0),
    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_account_targets_unique UNIQUE (account_id, specialist_id, line_id)
);

CREATE INDEX IF NOT EXISTS sales_account_targets_specialist_idx
    ON sales_account_targets (specialist_id);
CREATE INDEX IF NOT EXISTS sales_account_targets_line_idx
    ON sales_account_targets (line_id);
CREATE INDEX IF NOT EXISTS sales_account_targets_account_idx
    ON sales_account_targets (account_id);

-- Unit price per product (admin editable)
CREATE TABLE IF NOT EXISTS sales_product_prices (
    product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_product_prices_line_idx
    ON sales_product_prices (line_id);

-- Product target per specialist (units + value snapshot)
CREATE TABLE IF NOT EXISTS sales_product_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    specialist_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    target_units integer NOT NULL DEFAULT 0 CHECK (target_units >= 0),
    unit_price_snapshot numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_snapshot >= 0),
    target_value numeric(14,2) GENERATED ALWAYS AS ((target_units::numeric) * unit_price_snapshot) STORED,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_product_targets_unique UNIQUE (product_id, specialist_id, line_id, effective_from)
);

CREATE INDEX IF NOT EXISTS sales_product_targets_product_idx
    ON sales_product_targets (product_id);
CREATE INDEX IF NOT EXISTS sales_product_targets_specialist_idx
    ON sales_product_targets (specialist_id);
CREATE INDEX IF NOT EXISTS sales_product_targets_line_idx
    ON sales_product_targets (line_id);
CREATE INDEX IF NOT EXISTS sales_product_targets_effective_from_idx
    ON sales_product_targets (effective_from);

-- =========================================================
-- SALES ORDER TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS sales_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code text UNIQUE,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    submitted_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    specialist_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    order_date date NOT NULL,
    order_type sales_order_type NOT NULL DEFAULT 'company',

    status approval_status NOT NULL DEFAULT 'pending_manager',
    manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    admin_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    manager_comment text,
    admin_comment text,

    total_units integer NOT NULL DEFAULT 0 CHECK (total_units >= 0),
    total_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_value >= 0),
    total_company_units integer NOT NULL DEFAULT 0 CHECK (total_company_units >= 0),
    total_company_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_company_value >= 0),
    total_competitor_units integer NOT NULL DEFAULT 0 CHECK (total_competitor_units >= 0),
    total_competitor_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_competitor_value >= 0),

    notes text,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    rejected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_orders_status_idx
    ON sales_orders (status);
CREATE INDEX IF NOT EXISTS sales_orders_line_idx
    ON sales_orders (line_id);
CREATE INDEX IF NOT EXISTS sales_orders_specialist_idx
    ON sales_orders (specialist_id);
CREATE INDEX IF NOT EXISTS sales_orders_submitted_by_idx
    ON sales_orders (submitted_by);
CREATE INDEX IF NOT EXISTS sales_orders_order_date_idx
    ON sales_orders (order_date DESC);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    sequence smallint NOT NULL CHECK (sequence BETWEEN 1 AND 20),

    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    company_name text NOT NULL,
    category text,
    sub_category text,

    is_company_product boolean NOT NULL DEFAULT false,
    units integer NOT NULL CHECK (units > 0),
    unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
    line_total numeric(14,2) GENERATED ALWAYS AS ((units::numeric) * unit_price) STORED,

    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_items_order_sequence_unique UNIQUE (sales_order_id, sequence)
);

CREATE INDEX IF NOT EXISTS sales_order_items_order_idx
    ON sales_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS sales_order_items_product_idx
    ON sales_order_items (product_id);
CREATE INDEX IF NOT EXISTS sales_order_items_company_flag_idx
    ON sales_order_items (is_company_product);

-- =========================================================
-- AGGREGATION TRIGGER (order totals)
-- =========================================================

CREATE OR REPLACE FUNCTION refresh_sales_order_totals()
RETURNS trigger AS $$
DECLARE
    target_order uuid;
BEGIN
    target_order := COALESCE(NEW.sales_order_id, OLD.sales_order_id);

    UPDATE sales_orders so
       SET total_units = COALESCE(agg.total_units, 0),
           total_value = COALESCE(agg.total_value, 0),
           total_company_units = COALESCE(agg.company_units, 0),
           total_company_value = COALESCE(agg.company_value, 0),
           total_competitor_units = COALESCE(agg.competitor_units, 0),
           total_competitor_value = COALESCE(agg.competitor_value, 0),
           updated_at = now()
      FROM (
          SELECT
              sales_order_id,
              SUM(units) AS total_units,
              SUM(line_total) AS total_value,
              SUM(CASE WHEN is_company_product THEN units ELSE 0 END) AS company_units,
              SUM(CASE WHEN is_company_product THEN line_total ELSE 0 END) AS company_value,
              SUM(CASE WHEN NOT is_company_product THEN units ELSE 0 END) AS competitor_units,
              SUM(CASE WHEN NOT is_company_product THEN line_total ELSE 0 END) AS competitor_value
          FROM sales_order_items
          WHERE sales_order_id = target_order
          GROUP BY sales_order_id
      ) agg
     WHERE so.id = agg.sales_order_id;

    IF NOT FOUND THEN
        UPDATE sales_orders
           SET total_units = 0,
               total_value = 0,
               total_company_units = 0,
               total_company_value = 0,
               total_competitor_units = 0,
               total_competitor_value = 0,
               updated_at = now()
         WHERE id = target_order;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_order_items_totals ON sales_order_items;
CREATE TRIGGER trg_sales_order_items_totals
    AFTER INSERT OR UPDATE OR DELETE ON sales_order_items
    FOR EACH ROW EXECUTE FUNCTION refresh_sales_order_totals();

DROP TRIGGER IF EXISTS trg_sales_account_targets_updated_at ON sales_account_targets;
CREATE TRIGGER trg_sales_account_targets_updated_at
    BEFORE UPDATE ON sales_account_targets
    FOR EACH ROW EXECUTE FUNCTION sales_touch_updated_at();

DROP TRIGGER IF EXISTS trg_sales_product_prices_updated_at ON sales_product_prices;
CREATE TRIGGER trg_sales_product_prices_updated_at
    BEFORE UPDATE ON sales_product_prices
    FOR EACH ROW EXECUTE FUNCTION sales_touch_updated_at();

DROP TRIGGER IF EXISTS trg_sales_product_targets_updated_at ON sales_product_targets;
CREATE TRIGGER trg_sales_product_targets_updated_at
    BEFORE UPDATE ON sales_product_targets
    FOR EACH ROW EXECUTE FUNCTION sales_touch_updated_at();

DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON sales_orders;
CREATE TRIGGER trg_sales_orders_updated_at
    BEFORE UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION sales_touch_updated_at();

-- =========================================================
-- SALES VIEWS
-- =========================================================

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
    adm.first_name || ' ' || adm.last_name AS admin_name
FROM sales_orders so
LEFT JOIN lines l ON so.line_id = l.id
LEFT JOIN accounts a ON so.account_id = a.id
LEFT JOIN employees sb ON so.submitted_by = sb.id
LEFT JOIN employees sp ON so.specialist_id = sp.id
LEFT JOIN employees mgr ON so.manager_id = mgr.id
LEFT JOIN employees adm ON so.admin_id = adm.id;

CREATE OR REPLACE VIEW v_sales_account_target_details AS
SELECT
    sat.id,
    sat.account_id,
    a.name AS account_name,
    a.account_type,
    sat.specialist_id,
    e.first_name || ' ' || e.last_name AS specialist_name,
    sat.line_id,
    l.name AS line_name,
    sat.target_value,
    sat.created_at,
    sat.updated_at
FROM sales_account_targets sat
LEFT JOIN accounts a ON sat.account_id = a.id
LEFT JOIN employees e ON sat.specialist_id = e.id
LEFT JOIN lines l ON sat.line_id = l.id;

CREATE OR REPLACE VIEW v_sales_product_target_details AS
SELECT
    spt.id,
    spt.product_id,
    p.name AS product_name,
    p.category,
    p.sub_category,
    spt.specialist_id,
    e.first_name || ' ' || e.last_name AS specialist_name,
    spt.line_id,
    l.name AS line_name,
    spt.target_units,
    spt.unit_price_snapshot,
    spt.target_value,
    spt.effective_from,
    spt.created_at,
    spt.updated_at
FROM sales_product_targets spt
LEFT JOIN products p ON spt.product_id = p.id
LEFT JOIN employees e ON spt.specialist_id = e.id
LEFT JOIN lines l ON spt.line_id = l.id;

COMMIT;

-- =====================================================================
-- OPTIONAL ROLLBACK SCRIPT (run manually only if you need full revert)
-- =====================================================================
-- BEGIN;
-- DROP VIEW IF EXISTS v_sales_product_target_details;
-- DROP VIEW IF EXISTS v_sales_account_target_details;
-- DROP VIEW IF EXISTS v_sales_order_details;
--
-- DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON sales_orders;
-- DROP TRIGGER IF EXISTS trg_sales_product_targets_updated_at ON sales_product_targets;
-- DROP TRIGGER IF EXISTS trg_sales_product_prices_updated_at ON sales_product_prices;
-- DROP TRIGGER IF EXISTS trg_sales_account_targets_updated_at ON sales_account_targets;
-- DROP TRIGGER IF EXISTS trg_sales_order_items_totals ON sales_order_items;
--
-- DROP FUNCTION IF EXISTS refresh_sales_order_totals();
-- DROP FUNCTION IF EXISTS sales_touch_updated_at();
--
-- DROP TABLE IF EXISTS sales_order_items;
-- DROP TABLE IF EXISTS sales_orders;
-- DROP TABLE IF EXISTS sales_product_targets;
-- DROP TABLE IF EXISTS sales_product_prices;
-- DROP TABLE IF EXISTS sales_account_targets;
--
-- DROP TYPE IF EXISTS sales_order_type;
-- COMMIT;
