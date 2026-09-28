-- Sale returns reverse stock with a new immutable document; sales are never edited or deleted.
CREATE TABLE public.v2_sale_return_documents (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), sale_id uuid NOT NULL REFERENCES public.v2_sale_documents(id),
  returned_at timestamptz NOT NULL, reason text, total_amount numeric(20,6) NOT NULL, operation_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.v2_sale_return_lines (
  id uuid PRIMARY KEY, return_id uuid NOT NULL REFERENCES public.v2_sale_return_documents(id), sale_line_id uuid NOT NULL REFERENCES public.v2_sale_lines(id),
  user_id uuid NOT NULL REFERENCES auth.users(id), product_id uuid NOT NULL REFERENCES public.products(id), quantity numeric(20,6) NOT NULL CHECK(quantity > 0), movement_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(return_id,sale_line_id)
);
ALTER TABLE public.v2_sale_return_documents ENABLE ROW LEVEL SECURITY; ALTER TABLE public.v2_sale_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY v2_sale_returns_own ON public.v2_sale_return_documents FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
CREATE POLICY v2_sale_return_lines_own ON public.v2_sale_return_lines FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
REVOKE INSERT,UPDATE,DELETE ON public.v2_sale_return_documents,public.v2_sale_return_lines FROM authenticated,anon;
GRANT SELECT ON public.v2_sale_return_documents,public.v2_sale_return_lines TO authenticated;
CREATE INDEX v2_sale_returns_sale_idx ON public.v2_sale_return_documents(user_id,sale_id,returned_at DESC);

CREATE OR REPLACE FUNCTION public.post_sale_return_v2(p_return_id uuid,p_sale_id uuid,p_returned_at timestamptz,p_reason text,p_lines jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE u uuid:=auth.uid(); x jsonb; sl public.v2_sale_lines%ROWTYPE; b public.inventory_balances%ROWTYPE; q numeric(20,6); prior numeric(20,6); total numeric(20,6):=0; seq bigint; h text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'return requires lines' USING ERRCODE='22023'; END IF;
 h:=md5(jsonb_build_object('id',p_return_id,'sale',p_sale_id,'at',p_returned_at,'reason',coalesce(p_reason,''),'lines',p_lines)::text);
 IF EXISTS(SELECT 1 FROM public.v2_sale_return_documents WHERE id=p_return_id AND user_id=u AND operation_hash=h) THEN RETURN jsonb_build_object('status','accepted','return_id',p_return_id); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.v2_sale_documents WHERE id=p_sale_id AND user_id=u) THEN RAISE EXCEPTION 'invalid sale' USING ERRCODE='42501'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  q:=(x->>'quantity')::numeric; IF q<=0 THEN RAISE EXCEPTION 'invalid return quantity' USING ERRCODE='22023'; END IF;
  SELECT * INTO sl FROM public.v2_sale_lines WHERE id=(x->>'sale_line_id')::uuid AND sale_id=p_sale_id AND user_id=u FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'invalid sale line' USING ERRCODE='42501'; END IF;
  SELECT coalesce(sum(rl.quantity),0) INTO prior FROM public.v2_sale_return_lines rl JOIN public.v2_sale_return_documents rd ON rd.id=rl.return_id WHERE rl.sale_line_id=sl.id AND rd.user_id=u;
  IF prior+q>sl.quantity THEN RAISE EXCEPTION 'return exceeds sold quantity' USING ERRCODE='23514'; END IF; total:=total+(q*sl.unit_price)-(q/sl.quantity*sl.discount_amount);
 END LOOP;
 INSERT INTO public.v2_sale_return_documents(id,user_id,sale_id,returned_at,reason,total_amount,operation_hash) VALUES(p_return_id,u,p_sale_id,p_returned_at,nullif(btrim(p_reason),''),total,h);
 FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  q:=(x->>'quantity')::numeric; SELECT * INTO sl FROM public.v2_sale_lines WHERE id=(x->>'sale_line_id')::uuid; SELECT * INTO b FROM public.inventory_balances WHERE product_id=sl.product_id AND user_id=u FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'stock_not_initialized' USING ERRCODE='23514'; END IF;
  seq:=nextval('public.inventory_movement_server_sequence'); INSERT INTO public.v2_sale_return_lines(id,return_id,sale_line_id,user_id,product_id,quantity,movement_id) VALUES((x->>'line_id')::uuid,p_return_id,sl.id,u,sl.product_id,q,(x->>'movement_id')::uuid);
  INSERT INTO public.stock_movements(id,user_id,product_id,qty_change,reason,movement_type,posted_at,server_sequence,payload_hash,source_type,source_id,source_line_id) VALUES((x->>'movement_id')::uuid,u,sl.product_id,q,'sale return','sale_return',now(),seq,md5(p_return_id::text||x::text),'sale_return',p_return_id,(x->>'line_id')::uuid);
  UPDATE public.inventory_balances SET current_quantity=current_quantity+q,revision=revision+1,last_movement_id=(x->>'movement_id')::uuid,updated_at=now() WHERE product_id=sl.product_id;
 END LOOP; RETURN jsonb_build_object('status','accepted','return_id',p_return_id,'total_amount',total);
END;$fn$;
REVOKE ALL ON FUNCTION public.post_sale_return_v2(uuid,uuid,timestamptz,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_sale_return_v2(uuid,uuid,timestamptz,text,jsonb) TO authenticated;
