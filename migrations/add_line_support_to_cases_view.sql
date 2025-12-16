-- Migration: Add line information to v_case_details view
-- This migration updates the v_case_details view to include employee line information
-- for better multi-line support in the admin interface

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
    adm.first_name || ' ' || adm.last_name AS admin_name,
    e.line_id AS employee_line_id,
    l.name AS line_name
FROM cases c
LEFT JOIN doctors d ON c.doctor_id = d.id
LEFT JOIN accounts a ON c.account_id = a.id
LEFT JOIN employees e ON c.submitted_by = e.id
LEFT JOIN lines l ON e.line_id = l.id
LEFT JOIN employees dm ON c.manager_id = dm.id
LEFT JOIN employees adm ON c.admin_id = adm.id;

