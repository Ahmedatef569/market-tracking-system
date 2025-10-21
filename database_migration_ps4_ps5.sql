-- SAFE DATABASE MIGRATION SCRIPT
-- Adds Product Specialist 4 and 5 support to existing system
-- This script is designed to run safely on production data without any data loss

-- =====================================================
-- STEP 1: ADD NEW COLUMNS TO DOCTORS TABLE
-- =====================================================

-- Add fourth product specialist columns to doctors table
ALTER TABLE doctors 
ADD COLUMN IF NOT EXISTS quaternary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quaternary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL;

-- Add fifth product specialist columns to doctors table  
ALTER TABLE doctors
ADD COLUMN IF NOT EXISTS quinary_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quinary_line_id uuid REFERENCES lines(id) ON DELETE SET NULL;

-- =====================================================
-- STEP 2: ADD NEW COLUMNS TO ACCOUNTS TABLE
-- =====================================================

-- Accounts table remains with 3 PS only (no changes needed)

-- =====================================================
-- STEP 3: UPDATE DOCTOR DETAILS VIEW
-- =====================================================

-- Drop and recreate the doctor details view with new PS4 and PS5 columns
DROP VIEW IF EXISTS v_doctor_details;

CREATE OR REPLACE VIEW v_doctor_details AS
SELECT
    d.id,
    d.name,
    d.specialty,
    d.phone,
    d.clinic_address,
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

-- =====================================================
-- STEP 4: ACCOUNTS REMAIN UNCHANGED (3 PS ONLY)
-- =====================================================

-- Accounts table and view remain with 3 PS only (no changes needed)

-- =====================================================
-- VERIFICATION QUERIES (OPTIONAL - FOR TESTING)
-- =====================================================

-- Verify new columns were added successfully
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'doctors' 
-- AND column_name IN ('quaternary_employee_id', 'quaternary_line_id', 'quinary_employee_id', 'quinary_line_id')
-- ORDER BY column_name;

-- Verify views were updated successfully  
-- SELECT * FROM v_doctor_details LIMIT 1;
-- SELECT * FROM v_account_details LIMIT 1;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration safely adds PS4 and PS5 support to the database
-- All existing data is preserved
-- New columns default to NULL (no assignments initially)
-- Views are updated to include new PS4 and PS5 information
