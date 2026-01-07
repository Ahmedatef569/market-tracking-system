-- DIAGNOSTIC QUERIES FOR CASE PRODUCTS ISSUE
-- Run these in Supabase SQL Editor to diagnose the problem

-- 1. Check recent cases (last 24 hours)
SELECT 
    id,
    case_code,
    case_date,
    total_company_units,
    total_competitor_units,
    created_at,
    status
FROM cases
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 2. Check if those cases have products
SELECT 
    c.case_code,
    c.created_at as case_created,
    COUNT(cp.id) as product_count,
    SUM(cp.units) as total_units
FROM cases c
LEFT JOIN case_products cp ON c.id = cp.case_id
WHERE c.created_at > NOW() - INTERVAL '24 hours'
GROUP BY c.id, c.case_code, c.created_at
ORDER BY c.created_at DESC;

-- 3. Check case_products table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'case_products'
ORDER BY ordinal_position;

-- 4. Check RLS policies on case_products
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'case_products';

-- 5. Check if trigger is active
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'case_products';

-- 6. Check recent case_products inserts (if any)
SELECT 
    id,
    case_id,
    product_name,
    company_name,
    units,
    is_company_product
FROM case_products
WHERE case_id IN (
    SELECT id FROM cases 
    WHERE created_at > NOW() - INTERVAL '24 hours'
)
ORDER BY case_id;

-- 7. Check for any constraints that might be failing
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'case_products';

-- 8. Try a manual insert to test (REPLACE VALUES WITH REAL DATA)
-- Uncomment and modify this to test:
/*
INSERT INTO case_products (
    case_id,
    product_name,
    company_name,
    category,
    sub_category,
    is_company_product,
    units,
    sequence
) VALUES (
    'REPLACE_WITH_RECENT_CASE_ID',
    'Test Product',
    'Test Company',
    'Test Category',
    'Test SubCategory',
    true,
    10,
    1
);
*/

