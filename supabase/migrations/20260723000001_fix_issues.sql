-- ============================================
-- ROUTEMASTER — BUG-FIX MIGRATION
-- ============================================

-- ─────────────────────────────────────────────────────────────────
-- FIX 1: Add all subscription statuses to users.subscription_status CHECK constraint
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_status_check;
ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN (
    'trial', 'trialing', 'active', 'past_due', 
    'cancelled', 'unpaid', 'incomplete'
  ));

-- ─────────────────────────────────────────────────────────────────
-- FIX 2: Prevent supply quantity from going negative
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION deduct_supply_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT current_quantity FROM supplies WHERE id = NEW.supply_id) < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient supply quantity. Cannot deduct % from current stock.', NEW.quantity;
  END IF;

  UPDATE supplies
  SET current_quantity = current_quantity - NEW.quantity
  WHERE id = NEW.supply_id
  AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────
-- FIX 3: Run is_low_stock check on INSERT too
-- ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS supplies_low_stock_check_insert ON supplies;

CREATE TRIGGER supplies_low_stock_check_insert
  BEFORE INSERT ON supplies
  FOR EACH ROW
  EXECUTE FUNCTION check_low_stock();

DROP TRIGGER IF EXISTS supplies_low_stock_check ON supplies;

CREATE TRIGGER supplies_low_stock_check
  BEFORE UPDATE ON supplies
  FOR EACH ROW
  EXECUTE FUNCTION check_low_stock();

-- ─────────────────────────────────────────────────────────────────
-- FIX 4: Tighten anon grants — remove unnecessary GRANT ALL to anon
-- ─────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE users        FROM anon;
REVOKE ALL ON TABLE clients      FROM anon;
REVOKE ALL ON TABLE jobs         FROM anon;
REVOKE ALL ON TABLE routes       FROM anon;
REVOKE ALL ON TABLE supplies     FROM anon;
REVOKE ALL ON TABLE supply_logs  FROM anon;
REVOKE ALL ON TABLE subscriptions FROM anon;

GRANT SELECT ON TABLE users         TO anon;
GRANT SELECT ON TABLE clients       TO anon;
GRANT SELECT ON TABLE jobs          TO anon;
GRANT SELECT ON TABLE routes        TO anon;
GRANT SELECT ON TABLE supplies      TO anon;
GRANT SELECT ON TABLE supply_logs   TO anon;
GRANT SELECT ON TABLE subscriptions TO anon;
