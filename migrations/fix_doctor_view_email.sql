-- Fix v_doctor_details view to include email_address column
-- This recreates the view to ensure email_address is properly included

DROP VIEW IF EXISTS v_doctor_details CASCADE;

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

