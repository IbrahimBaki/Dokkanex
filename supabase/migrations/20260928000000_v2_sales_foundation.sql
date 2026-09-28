-- Additive V2 sales foundation. Legacy invoices remain untouched.
CREATE TABLE public.v2_shop_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name text NOT NULL DEFAULT 'DokkanX',
  phone text,
  address text,
  tax_number text,
  logo_url text,
  return_policy text,
  invoice_footer text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_sale_counters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0
);

CREATE TABLE public.v2_sale_documents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  invoice_number text NOT NULL,
  sold_at timestamptz NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  customer_name text,
  notes text,
  subtotal numeric(20,6) NOT NULL,
  discount_amount numeric(20,6) NOT NULL DEFAULT 0,
  total_amount numeric(20,6) NOT NULL,
  profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  operation_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, invoice_number)
);

CREATE TABLE public.v2_sale_lines (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.v2_sale_documents(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK(quantity > 0),
  unit_price numeric(20,6) NOT NULL CHECK(unit_price >= 0),
  discount_amount numeric(20,6) NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
  line_total numeric(20,6) NOT NULL,
  movement_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.v2_shop_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.v2_shop_profiles TO authenticated;
ALTER TABLE public.v2_sale_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_sale_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY v2_shop_profiles_own ON public.v2_shop_profiles FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY v2_sale_documents_select_own ON public.v2_sale_documents FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY v2_sale_lines_select_own ON public.v2_sale_lines FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.v2_sale_documents, public.v2_sale_lines FROM authenticated, anon;
GRANT SELECT ON public.v2_sale_documents, public.v2_sale_lines TO authenticated;

CREATE INDEX v2_sale_documents_user_sold_idx ON public.v2_sale_documents (user_id, sold_at DESC);
CREATE INDEX v2_sale_lines_sale_idx ON public.v2_sale_lines (sale_id);
CREATE INDEX v2_sale_lines_user_product_idx ON public.v2_sale_lines (user_id, product_id);

CREATE OR REPLACE FUNCTION public.post_sale_v2(
  p_sale_id uuid,
  p_sold_at timestamptz,
  p_payment_method text,
  p_customer_name text,
  p_notes text,
  p_profile_snapshot jsonb,
  p_allow_negative boolean,
  p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_user uuid := auth.uid(); v_hash text; v_existing public.v2_sale_documents%ROWTYPE;
  v_line jsonb; v_product public.products%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
  v_qty numeric(20,6); v_price numeric(20,6); v_discount numeric(20,6); v_total numeric(20,6) := 0;
  v_subtotal numeric(20,6) := 0; v_line_total numeric(20,6); v_sequence bigint; v_number bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'sale requires lines' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) x GROUP BY x->>'product_id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'duplicate sale product' USING ERRCODE='22023'; END IF;
  v_hash := md5(jsonb_build_object('id',p_sale_id,'at',p_sold_at,'payment',coalesce(p_payment_method,''),'customer',coalesce(btrim(p_customer_name),''),'notes',coalesce(p_notes,''),'profile',coalesce(p_profile_snapshot,'{}'::jsonb),'negative',p_allow_negative,'lines',p_lines)::text);
  SELECT * INTO v_existing FROM public.v2_sale_documents WHERE id = p_sale_id;
  IF FOUND THEN
    IF v_existing.user_id = v_user AND v_existing.operation_hash = v_hash THEN RETURN jsonb_build_object('status','accepted','sale_id',p_sale_id,'invoice_number',v_existing.invoice_number,'total_amount',v_existing.total_amount); END IF;
    RAISE EXCEPTION 'sale_idempotency_conflict' USING ERRCODE='P0001';
  END IF;
  FOR v_line IN SELECT x FROM jsonb_array_elements(p_lines) x ORDER BY x->>'product_id' LOOP
    v_qty := (v_line->>'quantity')::numeric(20,6); v_price := (v_line->>'unit_price')::numeric(20,6); v_discount := coalesce((v_line->>'discount_amount')::numeric(20,6),0);
    IF v_qty <= 0 OR v_price < 0 OR v_discount < 0 THEN RAISE EXCEPTION 'invalid sale line' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id=(v_line->>'product_id')::uuid AND user_id=v_user AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid product' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_balance FROM public.inventory_balances WHERE product_id=v_product.id AND user_id=v_user FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'stock_not_initialized' USING ERRCODE='23514'; END IF;
    IF NOT p_allow_negative AND v_balance.current_quantity < v_qty THEN RAISE EXCEPTION 'negative_stock_confirmation_required' USING ERRCODE='23514'; END IF;
    v_line_total := (v_qty * v_price) - v_discount; IF v_line_total < 0 THEN RAISE EXCEPTION 'line discount exceeds amount' USING ERRCODE='22023'; END IF;
    v_subtotal := v_subtotal + (v_qty * v_price); v_total := v_total + v_line_total;
  END LOOP;
  INSERT INTO public.v2_sale_counters(user_id,last_number) VALUES(v_user,1) ON CONFLICT(user_id) DO UPDATE SET last_number=public.v2_sale_counters.last_number+1 RETURNING last_number INTO v_number;
  INSERT INTO public.v2_sale_documents(id,user_id,invoice_number,sold_at,payment_method,customer_name,notes,subtotal,discount_amount,total_amount,profile_snapshot,operation_hash)
  VALUES(p_sale_id,v_user,'INV-'||lpad(v_number::text,6,'0'),p_sold_at,coalesce(nullif(btrim(p_payment_method),''),'cash'),nullif(btrim(p_customer_name),''),nullif(btrim(p_notes),''),v_subtotal,v_subtotal-v_total,v_total,coalesce(p_profile_snapshot,'{}'::jsonb),v_hash);
  FOR v_line IN SELECT x FROM jsonb_array_elements(p_lines) x ORDER BY x->>'product_id' LOOP
    v_qty := (v_line->>'quantity')::numeric(20,6); v_price := (v_line->>'unit_price')::numeric(20,6); v_discount := coalesce((v_line->>'discount_amount')::numeric(20,6),0); v_line_total := (v_qty*v_price)-v_discount;
    SELECT * INTO v_product FROM public.products WHERE id=(v_line->>'product_id')::uuid;
    v_sequence := nextval('public.inventory_movement_server_sequence');
    INSERT INTO public.v2_sale_lines(id,sale_id,user_id,product_id,product_name_snapshot,unit_snapshot,quantity,unit_price,discount_amount,line_total,movement_id)
    VALUES((v_line->>'line_id')::uuid,p_sale_id,v_user,v_product.id,v_product.name,v_product.unit,v_qty,v_price,v_discount,v_line_total,(v_line->>'movement_id')::uuid);
    INSERT INTO public.stock_movements(id,user_id,product_id,qty_change,reason,movement_type,posted_at,server_sequence,payload_hash,source_type,source_id,source_line_id)
    VALUES((v_line->>'movement_id')::uuid,v_user,v_product.id,-v_qty,'sale','sale',now(),v_sequence,md5(p_sale_id::text||v_line::text),'sale',p_sale_id,(v_line->>'line_id')::uuid);
    UPDATE public.inventory_balances SET current_quantity=current_quantity-v_qty,revision=revision+1,last_movement_id=(v_line->>'movement_id')::uuid,updated_at=now() WHERE product_id=v_product.id;
  END LOOP;
  RETURN jsonb_build_object('status','accepted','sale_id',p_sale_id,'invoice_number','INV-'||lpad(v_number::text,6,'0'),'total_amount',v_total);
END;$function$;
REVOKE ALL ON FUNCTION public.post_sale_v2(uuid,timestamptz,text,text,text,jsonb,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_sale_v2(uuid,timestamptz,text,text,text,jsonb,boolean,jsonb) TO authenticated;
