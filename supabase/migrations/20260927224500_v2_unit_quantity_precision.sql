-- Enforce the same unit-aware quantity contract at the database boundary.
CREATE OR REPLACE FUNCTION public.v2_validate_stock_movement_unit_precision()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_unit text;
BEGIN
  SELECT unit INTO v_unit FROM public.products WHERE id = NEW.product_id;

  IF v_unit IN ('piece', 'pack', 'box', 'gram') AND NEW.qty_change <> trunc(NEW.qty_change) THEN
    RAISE EXCEPTION 'fractional quantity is not allowed for unit %', v_unit USING ERRCODE = '22023';
  END IF;

  IF v_unit IN ('meter', 'kilogram', 'liter') AND NEW.qty_change <> round(NEW.qty_change, 3) THEN
    RAISE EXCEPTION 'quantity precision exceeds three decimals for unit %', v_unit USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS v2_stock_movement_unit_precision ON public.stock_movements;
CREATE TRIGGER v2_stock_movement_unit_precision
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.v2_validate_stock_movement_unit_precision();
