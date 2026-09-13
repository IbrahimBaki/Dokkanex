-- DokkanX V2 inventory foundation.
-- Additive only: V1 product/category CRUD and legacy ERP columns remain intact.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.products
  ADD COLUMN low_stock_threshold numeric(20,6),
  ADD COLUMN metadata_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN archived_at timestamptz,
  ADD CONSTRAINT products_low_stock_threshold_check
    CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);

ALTER TABLE public.stock_movements
  ALTER COLUMN qty_change TYPE numeric(20,6),
  ADD COLUMN movement_type text NOT NULL DEFAULT 'legacy',
  ADD COLUMN client_created_at timestamptz,
  ADD COLUMN posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN server_sequence bigint,
  ADD COLUMN base_balance numeric(20,6),
  ADD COLUMN counted_quantity numeric(20,6),
  ADD COLUMN payload_hash text,
  ADD COLUMN reverses_movement_id uuid;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN (
      'legacy', 'opening', 'manual_add', 'manual_remove', 'stock_count',
      'damage_loss', 'correction', 'purchase', 'sale', 'sale_return', 'purchase_return'
    )),
  ADD CONSTRAINT stock_movements_v2_payload_hash_check
    CHECK (movement_type = 'legacy' OR payload_hash IS NOT NULL),
  ADD CONSTRAINT stock_movements_v2_quantity_check
    CHECK (movement_type = 'legacy' OR movement_type = 'opening' OR qty_change <> 0),
  ADD CONSTRAINT stock_movements_v2_server_sequence_check
    CHECK (movement_type = 'legacy' OR server_sequence IS NOT NULL),
  ADD CONSTRAINT stock_movements_v2_direction_check
    CHECK (
      movement_type = 'legacy'
      OR (movement_type = 'opening' AND qty_change >= 0)
      OR (movement_type = 'manual_add' AND qty_change > 0)
      OR (movement_type IN ('manual_remove', 'damage_loss') AND qty_change < 0)
      OR movement_type IN ('stock_count', 'correction', 'purchase', 'sale', 'sale_return', 'purchase_return')
    ),
  ADD CONSTRAINT stock_movements_stock_count_non_negative_check
    CHECK (movement_type <> 'stock_count' OR counted_quantity >= 0),
  ADD CONSTRAINT stock_movements_stock_count_fields_check
    CHECK (
      (movement_type = 'stock_count' AND base_balance IS NOT NULL AND counted_quantity IS NOT NULL)
      OR
      (movement_type <> 'stock_count' AND base_balance IS NULL AND counted_quantity IS NULL)
    ),
  ADD CONSTRAINT stock_movements_reverses_movement_id_fkey
    FOREIGN KEY (reverses_movement_id) REFERENCES public.stock_movements(id);

CREATE SEQUENCE public.inventory_movement_server_sequence;

CREATE TABLE public.inventory_balances (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_quantity numeric(20,6) NOT NULL,
  initialized_at timestamptz NOT NULL,
  last_movement_id uuid NULL REFERENCES public.stock_movements(id),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

CREATE INDEX inventory_balances_user_quantity_idx
  ON public.inventory_balances (user_id, current_quantity);
CREATE INDEX inventory_balances_user_updated_product_idx
  ON public.inventory_balances (user_id, updated_at, product_id);
CREATE UNIQUE INDEX stock_movements_server_sequence_unique_idx
  ON public.stock_movements (server_sequence) WHERE server_sequence IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_one_opening_per_product_idx
  ON public.stock_movements (product_id) WHERE movement_type = 'opening';
CREATE INDEX stock_movements_user_server_sequence_idx
  ON public.stock_movements (user_id, server_sequence) WHERE server_sequence IS NOT NULL;
CREATE INDEX stock_movements_product_server_sequence_idx
  ON public.stock_movements (product_id, server_sequence) WHERE server_sequence IS NOT NULL;
CREATE INDEX stock_movements_user_product_posted_at_idx
  ON public.stock_movements (user_id, product_id, posted_at DESC);
CREATE INDEX stock_movements_reverses_movement_idx
  ON public.stock_movements (reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.v2_products_metadata_version_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.metadata_version := OLD.metadata_version + 1;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.v2_products_unit_after_initialization_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF OLD.unit IS DISTINCT FROM NEW.unit
     AND EXISTS (SELECT 1 FROM public.inventory_balances WHERE product_id = OLD.id) THEN
    RAISE EXCEPTION 'unit cannot change after stock initialization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER v2_products_metadata_version
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.v2_products_metadata_version_before_update();

CREATE TRIGGER v2_products_unit_guard
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.v2_products_unit_after_initialization_guard();

CREATE OR REPLACE FUNCTION public.v2_normalize_quantity(p_value numeric)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_value numeric(20,6);
BEGIN
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'quantity is required' USING ERRCODE = '22023';
  END IF;
  v_value := p_value::numeric(20,6);
  IF p_value <> v_value THEN
    RAISE EXCEPTION 'quantity supports at most six decimal places' USING ERRCODE = '22023';
  END IF;
  RETURN to_char(v_value, 'FM999999999999990.000000');
END;
$function$;

CREATE OR REPLACE FUNCTION public.v2_inventory_receipt(p_movement_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'status', 'accepted',
    'movement', to_jsonb(m),
    'balance_after', public.v2_normalize_quantity(COALESCE((
      SELECT sum(sm.qty_change)::numeric(20,6)
      FROM public.stock_movements sm
      WHERE sm.product_id = m.product_id
        AND sm.movement_type <> 'legacy'
        AND sm.server_sequence <= m.server_sequence
    ), 0::numeric(20,6))),
    'revision_after', (
      SELECT count(*)
      FROM public.stock_movements sm
      WHERE sm.product_id = m.product_id
        AND sm.movement_type <> 'legacy'
        AND sm.server_sequence <= m.server_sequence
    )
  )
  FROM public.stock_movements m
  WHERE m.id = p_movement_id;
$function$;

-- JSONB text is canonical (key-ordered) in PostgreSQL. Values are normalized
-- before this helper is called, so free text never acts as a delimiter.
CREATE OR REPLACE FUNCTION public.v2_inventory_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.post_inventory_movement(
  p_operation_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_client_created_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_reverses_movement_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.stock_movements%ROWTYPE;
  v_quantity numeric(20,6);
  v_hash text;
  v_payload jsonb;
  v_reason text := COALESCE(NULLIF(btrim(p_reason), ''), p_movement_type);
  v_note text := COALESCE(p_note, '');
  v_client_time text := COALESCE(to_char(p_client_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '');
  v_sequence bigint;
  v_movement public.stock_movements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'operation and product are required' USING ERRCODE = '22023';
  END IF;

  -- Lock order is always operation UUID, then authenticated user. The UUID
  -- lock serializes duplicate attempts (including cross-user collisions); the
  -- user lock serializes sequence allocation and commit order for that user.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 1));

  SELECT * INTO v_existing FROM public.stock_movements WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing.user_id <> v_user_id OR v_existing.product_id <> p_product_id THEN
      RAISE EXCEPTION 'invalid operation' USING ERRCODE = '42501';
    END IF;
    v_quantity := p_quantity::numeric(20,6);
    IF p_quantity <> v_quantity THEN
      RAISE EXCEPTION 'quantity supports at most six decimal places' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object(
      'operation_id', p_operation_id::text, 'user_id', v_user_id::text,
      'product_id', p_product_id::text, 'movement_type', p_movement_type,
      'quantity', public.v2_normalize_quantity(v_quantity), 'client_created_at', v_client_time,
      'reason', v_reason, 'note', v_note, 'reverses_movement_id', COALESCE(p_reverses_movement_id::text, '')
    );
    v_hash := public.v2_inventory_payload_hash(v_payload);
    IF v_existing.payload_hash = v_hash THEN
      RETURN public.v2_inventory_receipt(p_operation_id);
    END IF;
    RAISE EXCEPTION 'operation UUID was reused with a different payload' USING ERRCODE = '22023';
  END IF;

  IF p_movement_type NOT IN ('opening', 'manual_add', 'manual_remove', 'damage_loss', 'correction') THEN
    RAISE EXCEPTION 'unsupported movement type' USING ERRCODE = '22023';
  END IF;
  v_quantity := p_quantity::numeric(20,6);
  IF p_quantity <> v_quantity THEN
    RAISE EXCEPTION 'quantity supports at most six decimal places' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type <> 'opening' AND v_quantity = 0 THEN
    RAISE EXCEPTION 'non-opening movement quantity cannot be zero' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type = 'opening' AND v_quantity < 0 THEN
    RAISE EXCEPTION 'opening quantity cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type = 'manual_add' AND v_quantity <= 0 THEN
    RAISE EXCEPTION 'manual addition quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type IN ('manual_remove', 'damage_loss') AND v_quantity >= 0 THEN
    RAISE EXCEPTION 'removal quantity must be negative' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type = 'correction' AND p_reverses_movement_id IS NULL THEN
    RAISE EXCEPTION 'correction requires a movement reference' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type <> 'correction' AND p_reverses_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'movement reference is only valid for corrections' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object(
    'operation_id', p_operation_id::text, 'user_id', v_user_id::text,
    'product_id', p_product_id::text, 'movement_type', p_movement_type,
    'quantity', public.v2_normalize_quantity(v_quantity), 'client_created_at', v_client_time,
    'reason', v_reason, 'note', v_note, 'reverses_movement_id', COALESCE(p_reverses_movement_id::text, '')
  );
  v_hash := public.v2_inventory_payload_hash(v_payload);

  PERFORM 1 FROM public.products
  WHERE id = p_product_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid product' USING ERRCODE = '42501';
  END IF;

  IF p_reverses_movement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE id = p_reverses_movement_id AND user_id = v_user_id AND product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'invalid correction reference' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.inventory_balances WHERE product_id = p_product_id FOR UPDATE;
  IF p_movement_type = 'opening' THEN
    IF FOUND THEN
      RAISE EXCEPTION 'stock is already initialized' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE product_id = p_product_id AND movement_type <> 'legacy'
    ) THEN
      RAISE EXCEPTION 'inventory history exists without a balance; repair is required'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NOT FOUND THEN
    RAISE EXCEPTION 'stock must be initialized first' USING ERRCODE = '23514';
  END IF;

  v_sequence := nextval('public.inventory_movement_server_sequence');
  INSERT INTO public.stock_movements (
    id, user_id, product_id, qty_change, reason, note, movement_type,
    client_created_at, posted_at, server_sequence, payload_hash, reverses_movement_id
  ) VALUES (
    p_operation_id, v_user_id, p_product_id, v_quantity, v_reason, NULLIF(v_note, ''), p_movement_type,
    p_client_created_at, now(), v_sequence, v_hash, p_reverses_movement_id
  ) RETURNING * INTO v_movement;

  IF p_movement_type = 'opening' THEN
    INSERT INTO public.inventory_balances (
      product_id, user_id, current_quantity, initialized_at, last_movement_id, revision, updated_at
    ) VALUES (
      p_product_id, v_user_id, v_quantity, now(), p_operation_id, 1, now()
    );
  ELSE
    UPDATE public.inventory_balances
    SET current_quantity = current_quantity + v_quantity,
        revision = revision + 1,
        last_movement_id = p_operation_id,
        updated_at = now()
    WHERE product_id = p_product_id;
  END IF;

  RETURN public.v2_inventory_receipt(v_movement.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_stock_count(
  p_operation_id uuid,
  p_product_id uuid,
  p_expected_base_balance numeric,
  p_expected_revision bigint,
  p_counted_quantity numeric,
  p_client_created_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.stock_movements%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_base numeric(20,6);
  v_counted numeric(20,6);
  v_delta numeric(20,6);
  v_hash text;
  v_payload jsonb;
  v_reason text := COALESCE(NULLIF(btrim(p_reason), ''), 'stock_count');
  v_note text := COALESCE(p_note, '');
  v_client_time text := COALESCE(to_char(p_client_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '');
  v_sequence bigint;
  v_movement public.stock_movements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'operation, product, and expected revision are required' USING ERRCODE = '22023';
  END IF;

  -- Keep the same operation-then-user lock order as post_inventory_movement.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 1));

  SELECT * INTO v_existing FROM public.stock_movements WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing.user_id <> v_user_id OR v_existing.product_id <> p_product_id THEN
      RAISE EXCEPTION 'invalid operation' USING ERRCODE = '42501';
    END IF;
    v_base := p_expected_base_balance::numeric(20,6);
    v_counted := p_counted_quantity::numeric(20,6);
    IF p_expected_base_balance <> v_base OR p_counted_quantity <> v_counted THEN
      RAISE EXCEPTION 'quantity supports at most six decimal places' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object(
      'operation_id', p_operation_id::text, 'user_id', v_user_id::text,
      'product_id', p_product_id::text, 'movement_type', 'stock_count',
      'expected_base_balance', public.v2_normalize_quantity(v_base),
      'expected_revision', p_expected_revision, 'counted_quantity', public.v2_normalize_quantity(v_counted),
      'client_created_at', v_client_time, 'reason', v_reason, 'note', v_note
    );
    v_hash := public.v2_inventory_payload_hash(v_payload);
    IF v_existing.payload_hash = v_hash THEN
      RETURN public.v2_inventory_receipt(p_operation_id);
    END IF;
    RAISE EXCEPTION 'operation UUID was reused with a different payload' USING ERRCODE = '22023';
  END IF;

  v_base := p_expected_base_balance::numeric(20,6);
  v_counted := p_counted_quantity::numeric(20,6);
  IF p_expected_base_balance <> v_base OR p_counted_quantity <> v_counted THEN
    RAISE EXCEPTION 'quantity supports at most six decimal places' USING ERRCODE = '22023';
  END IF;
  IF v_counted < 0 THEN
    RAISE EXCEPTION 'physical counted quantity cannot be negative' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object(
    'operation_id', p_operation_id::text, 'user_id', v_user_id::text,
    'product_id', p_product_id::text, 'movement_type', 'stock_count',
    'expected_base_balance', public.v2_normalize_quantity(v_base),
    'expected_revision', p_expected_revision, 'counted_quantity', public.v2_normalize_quantity(v_counted),
    'client_created_at', v_client_time, 'reason', v_reason, 'note', v_note
  );
  v_hash := public.v2_inventory_payload_hash(v_payload);

  PERFORM 1 FROM public.products WHERE id = p_product_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid product' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_balance FROM public.inventory_balances WHERE product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock must be initialized first' USING ERRCODE = '23514';
  END IF;
  IF v_balance.current_quantity <> v_base OR v_balance.revision <> p_expected_revision THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'current_quantity', public.v2_normalize_quantity(v_balance.current_quantity),
      'current_revision', v_balance.revision
    );
  END IF;

  v_delta := v_counted - v_balance.current_quantity;
  IF v_delta = 0 THEN
    -- No receipt row is persisted for a no-change count. Step 3C must mark a
    -- received no_change response succeeded; an unknown-response retry can
    -- safely return no_change again or a typed conflict after later activity.
    RETURN jsonb_build_object(
      'status', 'no_change',
      'current_quantity', public.v2_normalize_quantity(v_balance.current_quantity),
      'current_revision', v_balance.revision
    );
  END IF;
  v_sequence := nextval('public.inventory_movement_server_sequence');
  INSERT INTO public.stock_movements (
    id, user_id, product_id, qty_change, reason, note, movement_type,
    client_created_at, posted_at, server_sequence, base_balance, counted_quantity, payload_hash
  ) VALUES (
    p_operation_id, v_user_id, p_product_id, v_delta, v_reason, NULLIF(v_note, ''), 'stock_count',
    p_client_created_at, now(), v_sequence, v_base, v_counted, v_hash
  ) RETURNING * INTO v_movement;
  UPDATE public.inventory_balances
  SET current_quantity = v_counted,
      revision = revision + 1,
      last_movement_id = p_operation_id,
      updated_at = now()
  WHERE product_id = p_product_id;
  RETURN public.v2_inventory_receipt(v_movement.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_product_metadata(
  p_product_id uuid,
  p_expected_metadata_version bigint,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_key text;
  v_category_id uuid;
  v_threshold numeric(20,6);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL OR p_expected_metadata_version IS NULL OR p_patch IS NULL
     OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'product, expected version, and a non-empty patch are required' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_key NOT IN ('name', 'image_url', 'category_id', 'selling_price', 'low_stock_threshold', 'unit') THEN
      RAISE EXCEPTION 'unsupported product metadata field' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_patch ? 'unit' AND (
    p_patch->>'unit' IS NULL OR p_patch->>'unit' NOT IN ('piece', 'pack', 'box', 'meter', 'kilogram', 'gram', 'liter')
  ) THEN
    RAISE EXCEPTION 'unsupported V2 unit' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'category_id' AND p_patch->>'category_id' IS NOT NULL THEN
    v_category_id := (p_patch->>'category_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_patch ? 'low_stock_threshold' AND p_patch->>'low_stock_threshold' IS NOT NULL THEN
    v_threshold := (p_patch->>'low_stock_threshold')::numeric(20,6);
    IF (p_patch->>'low_stock_threshold')::numeric <> v_threshold THEN
      RAISE EXCEPTION 'threshold supports at most six decimal places' USING ERRCODE = '22023';
    END IF;
    IF v_threshold < 0 THEN
      RAISE EXCEPTION 'threshold cannot be negative' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.products
  SET name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
      image_url = CASE WHEN p_patch ? 'image_url' THEN p_patch->>'image_url' ELSE image_url END,
      category_id = CASE WHEN p_patch ? 'category_id' THEN v_category_id ELSE category_id END,
      selling_price = CASE WHEN p_patch ? 'selling_price' THEN (p_patch->>'selling_price')::numeric ELSE selling_price END,
      low_stock_threshold = CASE WHEN p_patch ? 'low_stock_threshold' THEN v_threshold ELSE low_stock_threshold END,
      unit = CASE WHEN p_patch ? 'unit' THEN p_patch->>'unit' ELSE unit END
  WHERE id = p_product_id
    AND user_id = v_user_id
    AND metadata_version = p_expected_metadata_version
  RETURNING * INTO v_product;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'accepted', 'product', to_jsonb(v_product));
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  RAISE EXCEPTION 'invalid product' USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_product public.products%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_product FROM public.products
  WHERE id = p_product_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid product' USING ERRCODE = '42501';
  END IF;
  IF v_product.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'accepted', 'product', to_jsonb(v_product));
  END IF;
  UPDATE public.products SET archived_at = now()
  WHERE id = p_product_id
  RETURNING * INTO v_product;
  RETURN jsonb_build_object('status', 'accepted', 'product', to_jsonb(v_product));
END;
$function$;

CREATE OR REPLACE FUNCTION public.v2_inventory_balance_drift()
RETURNS TABLE(issue text, product_id uuid, user_id uuid, expected_quantity numeric(20,6), actual_quantity numeric(20,6))
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH canonical AS (
    SELECT product_id,
      sum(qty_change)::numeric(20,6) AS expected_quantity,
      count(DISTINCT user_id) AS owner_count,
      min(user_id::text)::uuid AS movement_user_id
    FROM public.stock_movements
    WHERE movement_type <> 'legacy'
    GROUP BY product_id
  )
  SELECT
    CASE
      WHEN c.product_id IS NULL THEN 'orphan_balance'
      WHEN b.product_id IS NULL THEN 'missing_balance'
      WHEN c.owner_count <> 1 THEN 'movement_owner_conflict'
      WHEN c.movement_user_id IS DISTINCT FROM b.user_id THEN 'ownership_mismatch'
      ELSE 'quantity_mismatch'
    END,
    COALESCE(c.product_id, b.product_id),
    COALESCE(c.movement_user_id, b.user_id),
    c.expected_quantity,
    b.current_quantity
  FROM canonical c
  FULL OUTER JOIN public.inventory_balances b ON b.product_id = c.product_id
  WHERE c.product_id IS NULL
     OR b.product_id IS NULL
     OR c.owner_count <> 1
     OR c.movement_user_id IS DISTINCT FROM b.user_id
     OR c.expected_quantity <> b.current_quantity;
$function$;

CREATE OR REPLACE FUNCTION public.v2_rebuild_inventory_balance(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_total numeric(20,6);
  v_count bigint;
  v_last_movement_id uuid;
  v_product_user_id uuid;
  v_movement_user_id uuid;
  v_owner_count bigint;
BEGIN
  SELECT user_id INTO v_product_user_id FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '22023';
  END IF;
  SELECT
    sum(qty_change)::numeric(20,6), count(*),
    (array_agg(id ORDER BY server_sequence DESC))[1], min(user_id::text)::uuid,
    count(DISTINCT user_id)
  INTO v_total, v_count, v_last_movement_id, v_movement_user_id, v_owner_count
  FROM public.stock_movements
  WHERE product_id = p_product_id AND movement_type <> 'legacy';
  IF v_count = 0 THEN
    DELETE FROM public.inventory_balances WHERE product_id = p_product_id;
    RETURN;
  END IF;
  IF v_owner_count <> 1 OR v_movement_user_id IS DISTINCT FROM v_product_user_id THEN
    RAISE EXCEPTION 'cannot rebuild inventory with ownership corruption' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.inventory_balances (
    product_id, user_id, current_quantity, initialized_at, last_movement_id, revision, updated_at
  ) VALUES (
    p_product_id, v_product_user_id, v_total,
    (SELECT min(posted_at) FROM public.stock_movements WHERE product_id = p_product_id AND movement_type <> 'legacy'),
    v_last_movement_id, v_count, now()
  ) ON CONFLICT (product_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      current_quantity = EXCLUDED.current_quantity,
      initialized_at = EXCLUDED.initialized_at,
      last_movement_id = EXCLUDED.last_movement_id,
      revision = EXCLUDED.revision,
      updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE POLICY inventory_balances_select_own ON public.inventory_balances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON public.inventory_balances TO authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_balances FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.post_inventory_movement(uuid, uuid, text, numeric, timestamptz, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_stock_count(uuid, uuid, numeric, bigint, numeric, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_product_metadata(uuid, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_product(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_inventory_receipt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_inventory_payload_hash(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_products_unit_after_initialization_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_inventory_balance_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_rebuild_inventory_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement(uuid, uuid, text, numeric, timestamptz, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_count(uuid, uuid, numeric, bigint, numeric, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_metadata(uuid, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_product(uuid) TO authenticated;
