-- Additive V2 purchase foundation; dormant ERP purchases are deliberately untouched.
CREATE TABLE public.v2_purchase_documents (id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),purchased_at timestamptz NOT NULL,supplier_name text,reference text,total_amount numeric(20,6) NOT NULL,operation_hash text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.v2_purchase_lines (id uuid PRIMARY KEY,purchase_id uuid NOT NULL REFERENCES public.v2_purchase_documents(id) ON DELETE RESTRICT,user_id uuid NOT NULL REFERENCES auth.users(id),product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,product_name_snapshot text NOT NULL,unit_snapshot text NOT NULL,quantity numeric(20,6) NOT NULL CHECK(quantity>0),unit_cost numeric(20,6) NOT NULL CHECK(unit_cost>=0),line_total numeric(20,6) NOT NULL,movement_id uuid UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.v2_purchase_documents ENABLE ROW LEVEL SECURITY; ALTER TABLE public.v2_purchase_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY v2_purchase_documents_select_own ON public.v2_purchase_documents FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
CREATE POLICY v2_purchase_lines_select_own ON public.v2_purchase_lines FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
REVOKE INSERT,UPDATE,DELETE ON public.v2_purchase_documents,public.v2_purchase_lines FROM anon,authenticated;
REVOKE ALL ON TABLE public.v2_purchase_documents,public.v2_purchase_lines FROM anon;
GRANT SELECT ON TABLE public.v2_purchase_documents,public.v2_purchase_lines TO authenticated;
ALTER TABLE public.stock_movements ADD COLUMN source_type text, ADD COLUMN source_id uuid, ADD COLUMN source_line_id uuid;

CREATE OR REPLACE FUNCTION public.post_purchase_v2(p_purchase_id uuid,p_purchased_at timestamptz,p_supplier_name text,p_reference text,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_user uuid:=auth.uid(); v_hash text; v_existing public.v2_purchase_documents%ROWTYPE; v_line jsonb; v_product public.products%ROWTYPE; v_balance public.inventory_balances%ROWTYPE; v_total numeric(20,6):=0; v_line_total numeric(20,6); v_qty numeric(20,6); v_cost numeric(20,6); v_sequence bigint;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'purchase requires lines' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x GROUP BY x->>'product_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate purchase product' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE (x->>'quantity')::numeric <> (x->>'quantity')::numeric(20,6) OR (x->>'unit_cost')::numeric <> (x->>'unit_cost')::numeric(20,6)) THEN RAISE EXCEPTION 'purchase precision exceeds six decimals' USING ERRCODE='22023'; END IF;
 v_hash:=md5(jsonb_build_object('id',p_purchase_id,'at',p_purchased_at,'supplier',coalesce(btrim(p_supplier_name),''),'reference',coalesce(btrim(p_reference),''),'lines',(SELECT jsonb_agg(jsonb_build_object('line_id',x->>'line_id','product_id',x->>'product_id','movement_id',x->>'movement_id','quantity',to_char((x->>'quantity')::numeric(20,6),'FM99999999999999.000000'),'unit_cost',to_char((x->>'unit_cost')::numeric(20,6),'FM99999999999999.000000')) ORDER BY x->>'product_id',x->>'line_id') FROM jsonb_array_elements(p_lines)x))::text);
 SELECT * INTO v_existing FROM public.v2_purchase_documents WHERE id=p_purchase_id;
 IF FOUND THEN IF v_existing.user_id=v_user AND v_existing.operation_hash=v_hash THEN RETURN jsonb_build_object('status','accepted','purchase_id',p_purchase_id,'total_amount',v_existing.total_amount); END IF; RAISE EXCEPTION 'purchase_idempotency_conflict' USING ERRCODE='P0001'; END IF;
 FOR v_line IN SELECT x FROM jsonb_array_elements(p_lines)x ORDER BY x->>'product_id' LOOP
  v_qty:=(v_line->>'quantity')::numeric(20,6); v_cost:=(v_line->>'unit_cost')::numeric(20,6); IF v_qty<=0 OR v_cost<0 THEN RAISE EXCEPTION 'invalid purchase line' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=(v_line->>'product_id')::uuid AND user_id=v_user AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'invalid product' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_balance FROM public.inventory_balances WHERE product_id=v_product.id AND user_id=v_user FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'stock_not_initialized' USING ERRCODE='23514'; END IF; v_total:=v_total+(v_qty*v_cost);
 END LOOP;
 INSERT INTO public.v2_purchase_documents(id,user_id,purchased_at,supplier_name,reference,total_amount,operation_hash) VALUES(p_purchase_id,v_user,p_purchased_at,p_supplier_name,p_reference,v_total,v_hash);
 FOR v_line IN SELECT x FROM jsonb_array_elements(p_lines)x ORDER BY x->>'product_id' LOOP
  v_qty:=(v_line->>'quantity')::numeric(20,6);v_cost:=(v_line->>'unit_cost')::numeric(20,6);SELECT * INTO v_product FROM public.products WHERE id=(v_line->>'product_id')::uuid;v_line_total:=v_qty*v_cost;v_sequence:=nextval('public.inventory_movement_server_sequence');
  INSERT INTO public.v2_purchase_lines(id,purchase_id,user_id,product_id,product_name_snapshot,unit_snapshot,quantity,unit_cost,line_total,movement_id) VALUES((v_line->>'line_id')::uuid,p_purchase_id,v_user,v_product.id,v_product.name,v_product.unit,v_qty,v_cost,v_line_total,(v_line->>'movement_id')::uuid);
  INSERT INTO public.stock_movements(id,user_id,product_id,qty_change,reason,movement_type,posted_at,server_sequence,payload_hash,source_type,source_id,source_line_id) VALUES((v_line->>'movement_id')::uuid,v_user,v_product.id,v_qty,'purchase','purchase',now(),v_sequence,md5(p_purchase_id::text||v_line::text),'purchase',p_purchase_id,(v_line->>'line_id')::uuid);
  UPDATE public.inventory_balances SET current_quantity=current_quantity+v_qty,revision=revision+1,last_movement_id=(v_line->>'movement_id')::uuid,updated_at=now() WHERE product_id=v_product.id;
 END LOOP;
 RETURN jsonb_build_object('status','accepted','purchase_id',p_purchase_id,'total_amount',v_total);
END;$function$;
REVOKE ALL ON FUNCTION public.post_purchase_v2(uuid,timestamptz,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_purchase_v2(uuid,timestamptz,text,text,jsonb) TO authenticated;
