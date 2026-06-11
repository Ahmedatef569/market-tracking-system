-- Transfer an account and its historical ownership to another product specialist.
-- Run after schema.sql, sales_schema.sql, and target_sales_schema.sql.
--
-- The function is transactional: any validation or uniqueness failure rolls back
-- the account edit and every related historical update.

BEGIN;

CREATE OR REPLACE FUNCTION transfer_account_history(
    p_account_id uuid,
    p_new_owner_id uuid,
    p_new_line_id uuid,
    p_name text,
    p_account_type account_type,
    p_secondary_employee_id uuid DEFAULT NULL,
    p_secondary_line_id uuid DEFAULT NULL,
    p_tertiary_employee_id uuid DEFAULT NULL,
    p_tertiary_line_id uuid DEFAULT NULL,
    p_address text DEFAULT NULL,
    p_governorate text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_owner_id uuid;
    v_cases_updated integer := 0;
    v_orders_updated integer := 0;
    v_account_product_targets_updated integer := 0;
    v_legacy_account_targets_updated integer := 0;
BEGIN
    SELECT owner_employee_id
      INTO v_old_owner_id
      FROM accounts
     WHERE id = p_account_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found.';
    END IF;

    IF p_new_owner_id IS NULL THEN
        RAISE EXCEPTION 'A primary product specialist is required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM employees
         WHERE id = p_new_owner_id
           AND role = 'employee'
           AND is_active = true
    ) THEN
        RAISE EXCEPTION 'The new product specialist is missing or inactive.';
    END IF;

    IF p_new_owner_id = p_secondary_employee_id
       OR p_new_owner_id = p_tertiary_employee_id
       OR (
           p_secondary_employee_id IS NOT NULL
           AND p_secondary_employee_id = p_tertiary_employee_id
       ) THEN
        RAISE EXCEPTION 'Product specialists assigned to an account must be unique.';
    END IF;

    IF v_old_owner_id IS DISTINCT FROM p_new_owner_id THEN
        IF EXISTS (
            SELECT 1
              FROM sales_account_product_targets old_target
              JOIN sales_account_product_targets new_target
                ON new_target.account_id = old_target.account_id
               AND new_target.product_id = old_target.product_id
               AND new_target.specialist_id = p_new_owner_id
             WHERE old_target.account_id = p_account_id
               AND old_target.specialist_id = v_old_owner_id
        ) THEN
            RAISE EXCEPTION
                'Transfer blocked: the new specialist already has a target for one or more products in this account.';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM sales_account_targets old_target
              JOIN sales_account_targets new_target
                ON new_target.account_id = old_target.account_id
               AND new_target.specialist_id = p_new_owner_id
               AND new_target.line_id IS NOT DISTINCT FROM old_target.line_id
             WHERE old_target.account_id = p_account_id
               AND old_target.specialist_id = v_old_owner_id
        ) THEN
            RAISE EXCEPTION
                'Transfer blocked: the new specialist already has a matching legacy account target.';
        END IF;

        UPDATE cases
           SET submitted_by = p_new_owner_id
         WHERE account_id = p_account_id
           AND submitted_by = v_old_owner_id;
        GET DIAGNOSTICS v_cases_updated = ROW_COUNT;

        UPDATE sales_orders
           SET specialist_id = p_new_owner_id,
               submitted_by = CASE
                   WHEN submitted_by = v_old_owner_id THEN p_new_owner_id
                   ELSE submitted_by
               END,
               line_id = p_new_line_id
         WHERE account_id = p_account_id
           AND specialist_id = v_old_owner_id;
        GET DIAGNOSTICS v_orders_updated = ROW_COUNT;

        UPDATE sales_account_product_targets
           SET specialist_id = p_new_owner_id,
               line_id = p_new_line_id
         WHERE account_id = p_account_id
           AND specialist_id = v_old_owner_id;
        GET DIAGNOSTICS v_account_product_targets_updated = ROW_COUNT;

        UPDATE sales_account_targets
           SET specialist_id = p_new_owner_id
         WHERE account_id = p_account_id
           AND specialist_id = v_old_owner_id;
        GET DIAGNOSTICS v_legacy_account_targets_updated = ROW_COUNT;
    END IF;

    UPDATE accounts
       SET name = btrim(p_name),
           account_type = p_account_type,
           owner_employee_id = p_new_owner_id,
           secondary_employee_id = p_secondary_employee_id,
           tertiary_employee_id = p_tertiary_employee_id,
           line_id = p_new_line_id,
           secondary_line_id = CASE
               WHEN p_secondary_employee_id IS NULL THEN NULL
               ELSE p_secondary_line_id
           END,
           tertiary_line_id = CASE
               WHEN p_tertiary_employee_id IS NULL THEN NULL
               ELSE p_tertiary_line_id
           END,
           address = NULLIF(btrim(p_address), ''),
           governorate = NULLIF(btrim(p_governorate), '')
     WHERE id = p_account_id;

    RETURN jsonb_build_object(
        'transferred', v_old_owner_id IS DISTINCT FROM p_new_owner_id,
        'old_owner_id', v_old_owner_id,
        'new_owner_id', p_new_owner_id,
        'cases_updated', v_cases_updated,
        'sales_orders_updated', v_orders_updated,
        'account_product_targets_updated', v_account_product_targets_updated,
        'legacy_account_targets_updated', v_legacy_account_targets_updated
    );
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_account_history(
    uuid, uuid, uuid, text, account_type, uuid, uuid, uuid, uuid, text, text
) TO anon, authenticated;

COMMIT;
