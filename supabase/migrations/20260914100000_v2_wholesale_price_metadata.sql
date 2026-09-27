-- wholesale_price is the shop purchase cost. cost_price is intentionally untouched.
CREATE OR REPLACE FUNCTION public.update_product_metadata(p_product_id uuid, p_expected_metadata_version bigint, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $function$
DECLARE v_user_id uuid := auth.uid(); v_product public.products%ROWTYPE; v_key text; v_category_id uuid; v_threshold numeric(20,6); v_wholesale numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF p_product_id IS NULL OR p_expected_metadata_version IS NULL OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN RAISE EXCEPTION 'product, expected version, and a non-empty patch are required' USING ERRCODE = '22023'; END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_key NOT IN ('name','image_url','category_id','selling_price','wholesale_price','low_stock_threshold','unit') THEN RAISE EXCEPTION 'unsupported product metadata field' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_patch ? 'unit' AND (p_patch->>'unit' IS NULL OR p_patch->>'unit' NOT IN ('piece','pack','box','meter','kilogram','gram','liter')) THEN RAISE EXCEPTION 'unsupported V2 unit' USING ERRCODE = '22023'; END IF;
  IF p_patch ? 'category_id' AND p_patch->>'category_id' IS NOT NULL THEN v_category_id := (p_patch->>'category_id')::uuid; IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id=v_category_id AND user_id=v_user_id) THEN RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023'; END IF; END IF;
  IF p_patch ? 'low_stock_threshold' AND p_patch->>'low_stock_threshold' IS NOT NULL THEN v_threshold := (p_patch->>'low_stock_threshold')::numeric(20,6); IF (p_patch->>'low_stock_threshold')::numeric <> v_threshold OR v_threshold < 0 THEN RAISE EXCEPTION 'invalid threshold' USING ERRCODE = '22023'; END IF; END IF;
  IF p_patch ? 'wholesale_price' THEN BEGIN v_wholesale := (p_patch->>'wholesale_price')::numeric; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'wholesale_price must be numeric' USING ERRCODE = '22023'; END; IF v_wholesale IS NULL THEN RAISE EXCEPTION 'wholesale_price must be numeric' USING ERRCODE = '22023'; END IF; END IF;
  UPDATE public.products SET name=CASE WHEN p_patch?'name' THEN p_patch->>'name' ELSE name END, image_url=CASE WHEN p_patch?'image_url' THEN p_patch->>'image_url' ELSE image_url END, category_id=CASE WHEN p_patch?'category_id' THEN v_category_id ELSE category_id END, selling_price=CASE WHEN p_patch?'selling_price' THEN (p_patch->>'selling_price')::numeric ELSE selling_price END, wholesale_price=CASE WHEN p_patch?'wholesale_price' THEN v_wholesale ELSE wholesale_price END, low_stock_threshold=CASE WHEN p_patch?'low_stock_threshold' THEN v_threshold ELSE low_stock_threshold END, unit=CASE WHEN p_patch?'unit' THEN p_patch->>'unit' ELSE unit END WHERE id=p_product_id AND user_id=v_user_id AND metadata_version=p_expected_metadata_version RETURNING * INTO v_product;
  IF FOUND THEN RETURN jsonb_build_object('status','accepted','product',to_jsonb(v_product)); END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND user_id=v_user_id) THEN RETURN jsonb_build_object('status','conflict'); END IF;
  RAISE EXCEPTION 'invalid product' USING ERRCODE = '42501';
END; $function$;
