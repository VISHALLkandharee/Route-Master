-- Keep stock deductions safe when multiple visits consume the same supply
-- concurrently, and prevent usage logs from linking across user accounts.
CREATE OR REPLACE FUNCTION public.deduct_supply_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Supply usage quantity must be greater than zero.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.jobs AS j
    WHERE j.id = NEW.job_id
      AND j.user_id = NEW.user_id
      AND j.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The selected job is unavailable.'
      USING ERRCODE = '23503';
  END IF;

  -- The conditional update is atomic, so concurrent usage logs cannot
  -- deduct more than the available quantity.
  UPDATE public.supplies AS s
  SET current_quantity = s.current_quantity - NEW.quantity
  WHERE s.id = NEW.supply_id
    AND s.user_id = NEW.user_id
    AND s.deleted_at IS NULL
    AND s.current_quantity >= NEW.quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supply is unavailable or there is not enough stock.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
