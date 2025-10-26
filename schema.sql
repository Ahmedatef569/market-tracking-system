CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin','employee','manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('pending_manager','pending_admin','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('Private','UPA','Military');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE manager_level AS ENUM ('district','line');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    description text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    position text NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    manager_level manager_level,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    area text,
    direct_manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    line_manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    email text,
    phone text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE,
    password text NOT NULL,
    role user_role NOT NULL,
    employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    last_login timestamptz,
    password_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    is_company boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    category text NOT NULL,
    sub_category text,
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    is_company_product boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS products_unique_idx
    ON products (lower(name), company_id, line_id);

CREATE TABLE IF NOT EXISTS accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    account_type account_type NOT NULL,
    owner_employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
    secondary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    tertiary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    secondary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    tertiary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    status approval_status NOT NULL DEFAULT 'pending_manager',
    manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    admin_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    manager_comment text,
    admin_comment text,
    address text,
    governorate text,
    notes text,
    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    rejected_at timestamptz
);

DROP INDEX IF EXISTS accounts_unique_owner_idx;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_unique_name_idx
    ON accounts (lower(name));

CREATE TABLE IF NOT EXISTS doctors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    specialty text,
    phone text,
    email_address text,
    owner_employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
    secondary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    tertiary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    quaternary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    quinary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    secondary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    tertiary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    quaternary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    quinary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL,
    status approval_status NOT NULL DEFAULT 'pending_manager',
    manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    admin_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    manager_comment text,
    admin_comment text,
    created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    rejected_at timestamptz
);

DROP INDEX IF EXISTS doctors_unique_owner_idx;
CREATE UNIQUE INDEX IF NOT EXISTS doctors_unique_name_idx
    ON doctors (lower(name));

CREATE TABLE IF NOT EXISTS cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_code text UNIQUE,
    submitted_by uuid REFERENCES employees(id) ON DELETE SET NULL,
    doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL,
    account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    case_date date NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending_manager',
    manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    admin_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    manager_comment text,
    admin_comment text,
    total_company_units integer NOT NULL DEFAULT 0,
    total_competitor_units integer NOT NULL DEFAULT 0,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    rejected_at timestamptz
);

CREATE TABLE IF NOT EXISTS case_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    company_name text NOT NULL,
    category text,
    sub_category text,
    is_company_product boolean NOT NULL DEFAULT false,
    units integer NOT NULL CHECK (units >= 0),
    sequence smallint NOT NULL DEFAULT 1
);

ALTER TABLE IF EXISTS products
    ADD COLUMN IF NOT EXISTS sub_category text;

ALTER TABLE IF EXISTS case_products
    ADD COLUMN IF NOT EXISTS sub_category text;

ALTER TABLE IF EXISTS doctors
    ADD COLUMN IF NOT EXISTS secondary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS doctors
    ADD COLUMN IF NOT EXISTS tertiary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS doctors
    ADD COLUMN IF NOT EXISTS secondary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS doctors
    ADD COLUMN IF NOT EXISTS tertiary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS accounts
    ADD COLUMN IF NOT EXISTS secondary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS accounts
    ADD COLUMN IF NOT EXISTS tertiary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS accounts
    ADD COLUMN IF NOT EXISTS secondary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS accounts
    ADD COLUMN IF NOT EXISTS tertiary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS case_products_case_idx
    ON case_products (case_id);

CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    message text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_case_unit_totals()
RETURNS trigger AS $$
DECLARE
    target_case uuid;
BEGIN
    target_case := COALESCE(NEW.case_id, OLD.case_id);

    UPDATE cases c
       SET total_company_units = COALESCE(sub.company_units, 0),
           total_competitor_units = COALESCE(sub.competitor_units, 0),
           updated_at = now()
      FROM (
          SELECT
              case_id,
              SUM(CASE WHEN is_company_product THEN units ELSE 0 END) AS company_units,
              SUM(CASE WHEN NOT is_company_product THEN units ELSE 0 END) AS competitor_units
          FROM case_products
          WHERE case_id = target_case
          GROUP BY case_id
      ) sub
     WHERE c.id = sub.case_id;

    IF NOT FOUND THEN
        UPDATE cases
           SET total_company_units = 0,
               total_competitor_units = 0,
               updated_at = now()
         WHERE id = target_case;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_doctors_updated_at ON doctors;
CREATE TRIGGER trg_doctors_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_case_products_totals ON case_products;
CREATE TRIGGER trg_case_products_totals
    AFTER INSERT OR UPDATE OR DELETE ON case_products
    FOR EACH ROW EXECUTE FUNCTION refresh_case_unit_totals();

CREATE OR REPLACE VIEW v_case_details AS
SELECT
    c.id,
    c.case_code,
    c.case_date,
    c.status,
    c.total_company_units,
    c.total_competitor_units,
    c.notes,
    c.created_at,
    c.updated_at,
    d.name AS doctor_name,
    a.name AS account_name,
    a.account_type,
    a.line_id,
    e.id AS submitted_by_id,
    e.first_name || ' ' || e.last_name AS submitted_by_name,
    dm.first_name || ' ' || dm.last_name AS manager_name,
    adm.first_name || ' ' || adm.last_name AS admin_name
FROM cases c
LEFT JOIN doctors d ON c.doctor_id = d.id
LEFT JOIN accounts a ON c.account_id = a.id
LEFT JOIN employees e ON c.submitted_by = e.id
LEFT JOIN employees dm ON c.manager_id = dm.id
LEFT JOIN employees adm ON c.admin_id = adm.id;

CREATE OR REPLACE VIEW v_doctor_details AS
SELECT
    d.id,
    d.name,
    d.specialty,
    d.phone,
    d.email_address,
    d.status,
    d.created_at,
    d.updated_at,
    d.owner_employee_id,
    d.secondary_employee_id,
    d.tertiary_employee_id,
    d.quaternary_employee_id,
    d.quinary_employee_id,
    d.line_id,
    d.secondary_line_id,
    d.tertiary_line_id,
    d.quaternary_line_id,
    d.quinary_line_id,
    e.first_name || ' ' || e.last_name AS owner_name,
    se.first_name || ' ' || se.last_name AS secondary_owner_name,
    te.first_name || ' ' || te.last_name AS tertiary_owner_name,
    qe.first_name || ' ' || qe.last_name AS quaternary_owner_name,
    que.first_name || ' ' || que.last_name AS quinary_owner_name,
    l.name AS line_name,
    ls.name AS secondary_line_name,
    lt.name AS tertiary_line_name,
    lq.name AS quaternary_line_name,
    lqu.name AS quinary_line_name
FROM doctors d
LEFT JOIN employees e ON d.owner_employee_id = e.id
LEFT JOIN employees se ON d.secondary_employee_id = se.id
LEFT JOIN employees te ON d.tertiary_employee_id = te.id
LEFT JOIN employees qe ON d.quaternary_employee_id = qe.id
LEFT JOIN employees que ON d.quinary_employee_id = que.id
LEFT JOIN lines l ON d.line_id = l.id
LEFT JOIN lines ls ON d.secondary_line_id = ls.id
LEFT JOIN lines lt ON d.tertiary_line_id = lt.id
LEFT JOIN lines lq ON d.quaternary_line_id = lq.id
LEFT JOIN lines lqu ON d.quinary_line_id = lqu.id;

CREATE OR REPLACE VIEW v_account_details AS
SELECT
    a.id,
    a.name,
    a.account_type,
    a.status,
    a.created_at,
    a.updated_at,
    a.owner_employee_id,
    a.secondary_employee_id,
    a.tertiary_employee_id,
    a.line_id,
    a.secondary_line_id,
    a.tertiary_line_id,
    e.first_name || ' ' || e.last_name AS owner_name,
    se.first_name || ' ' || se.last_name AS secondary_owner_name,
    te.first_name || ' ' || te.last_name AS tertiary_owner_name,
    l.name AS line_name,
    ls.name AS secondary_line_name,
    lt.name AS tertiary_line_name,
    a.address,
    a.governorate
FROM accounts a
LEFT JOIN employees e ON a.owner_employee_id = e.id
LEFT JOIN employees se ON a.secondary_employee_id = se.id
LEFT JOIN employees te ON a.tertiary_employee_id = te.id
LEFT JOIN lines l ON a.line_id = l.id
LEFT JOIN lines ls ON a.secondary_line_id = ls.id
LEFT JOIN lines lt ON a.tertiary_line_id = lt.id;

WITH line_row AS (
    INSERT INTO lines (name, description)
    VALUES ('Corporate', 'Default corporate line')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id
),
line_id AS (
    SELECT id FROM line_row
),
admin_employee AS (
    INSERT INTO employees (code, first_name, last_name, position, role, manager_level, line_id, area, email)
    SELECT 'ADM-001', 'Ahmed', 'Atef', 'Marketing Manager', 'admin', 'line', id, 'Corporate HQ', 'marketing.manager@example.com'
    FROM line_id
    ON CONFLICT (code) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        position = EXCLUDED.position,
        role = EXCLUDED.role,
        manager_level = EXCLUDED.manager_level,
        line_id = EXCLUDED.line_id,
        area = EXCLUDED.area,
        email = EXCLUDED.email
    RETURNING id
)
INSERT INTO users (username, password, role, employee_id, password_updated_at)
SELECT 'admin', 'admin123', 'admin', id, now()
FROM admin_employee
ON CONFLICT (username) DO UPDATE SET
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    employee_id = EXCLUDED.employee_id,
    password_updated_at = now();
