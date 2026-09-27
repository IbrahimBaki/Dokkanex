-- D2: browser-facing catalog and product-image security hardening.
-- This migration is additive with respect to data: it only replaces known
-- overlapping policies and adds validation for new product writes.

-- The baseline has multiple equivalent product/category policies. Replace
-- those known names with a single, explicit authenticated ownership boundary
-- so policy OR-combination cannot accidentally broaden catalog access.
DROP POLICY IF EXISTS "Users see own products" ON public.products;
DROP POLICY IF EXISTS products_delete ON public.products;
DROP POLICY IF EXISTS products_insert ON public.products;
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_update ON public.products;
DROP POLICY IF EXISTS users_own_products_delete ON public.products;
DROP POLICY IF EXISTS users_own_products_insert ON public.products;
DROP POLICY IF EXISTS users_own_products_select ON public.products;
DROP POLICY IF EXISTS users_own_products_update ON public.products;

CREATE POLICY v2_products_select_own ON public.products
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY v2_products_insert_own ON public.products
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY v2_products_update_own ON public.products
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY v2_products_delete_own ON public.products
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users see own categories" ON public.categories;
DROP POLICY IF EXISTS categories_delete ON public.categories;
DROP POLICY IF EXISTS categories_insert ON public.categories;
DROP POLICY IF EXISTS categories_select ON public.categories;
DROP POLICY IF EXISTS categories_update ON public.categories;

CREATE POLICY v2_categories_select_own ON public.categories
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY v2_categories_insert_own ON public.categories
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY v2_categories_update_own ON public.categories
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY v2_categories_delete_own ON public.categories
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.categories FROM anon;

-- Do not migrate through existing cross-owner data silently. A violation must
-- be repaired deliberately before this protection can be deployed.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    WHERE p.category_id IS NOT NULL
      AND c.user_id IS DISTINCT FROM p.user_id
  ) THEN
    RAISE EXCEPTION 'cannot apply product category ownership guard: existing cross-owner product/category rows require manual disposition'
      USING ERRCODE = '23514';
  END IF;
END;
$do$;

CREATE OR REPLACE FUNCTION public.v2_products_category_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.id = NEW.category_id
      AND c.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'product category must belong to the product owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS v2_products_category_owner_guard ON public.products;
CREATE TRIGGER v2_products_category_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.v2_products_category_owner_guard();
REVOKE ALL ON FUNCTION public.v2_products_category_owner_guard() FROM PUBLIC;

-- The baseline Storage policy named "Public Access" is FOR ALL and only
-- checks bucket_id. Preserve public reads for legacy URLs, but replace every
-- browser write/delete permission with an authenticated owner-prefix check.
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY product_images_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-images');
CREATE POLICY product_images_insert_own_prefix ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );
CREATE POLICY product_images_delete_own_prefix ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Keep the diagnostic contract, while including ownership against the product
-- and reporting movement aggregates that are missing a balance.
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
  ), joined AS (
    SELECT
      COALESCE(c.product_id, b.product_id) AS product_id,
      p.user_id AS product_user_id,
      c.expected_quantity,
      c.owner_count,
      c.movement_user_id,
      b.user_id AS balance_user_id,
      b.current_quantity AS actual_quantity,
      c.product_id AS canonical_product_id,
      b.product_id AS balance_product_id
    FROM canonical c
    FULL OUTER JOIN public.inventory_balances b ON b.product_id = c.product_id
    LEFT JOIN public.products p ON p.id = COALESCE(c.product_id, b.product_id)
  )
  SELECT
    CASE
      WHEN product_user_id IS NULL THEN 'orphan_balance'
      WHEN canonical_product_id IS NULL THEN 'orphan_balance'
      WHEN balance_product_id IS NULL THEN 'missing_balance'
      WHEN owner_count <> 1 THEN 'movement_owner_conflict'
      WHEN movement_user_id IS DISTINCT FROM product_user_id THEN 'movement_product_owner_mismatch'
      WHEN balance_user_id IS DISTINCT FROM product_user_id THEN 'balance_product_owner_mismatch'
      WHEN movement_user_id IS DISTINCT FROM balance_user_id THEN 'ownership_mismatch'
      ELSE 'quantity_mismatch'
    END,
    product_id,
    COALESCE(product_user_id, movement_user_id, balance_user_id),
    expected_quantity,
    actual_quantity
  FROM joined
  WHERE product_user_id IS NULL
     OR canonical_product_id IS NULL
     OR balance_product_id IS NULL
     OR owner_count <> 1
     OR movement_user_id IS DISTINCT FROM product_user_id
     OR balance_user_id IS DISTINCT FROM product_user_id
     OR movement_user_id IS DISTINCT FROM balance_user_id
     OR expected_quantity <> actual_quantity;
$function$;

-- Browser-facing RPC grants remain intentionally narrow. Diagnostics and
-- rebuild helpers stay internal-only.
REVOKE ALL ON FUNCTION public.v2_inventory_balance_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_rebuild_inventory_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_inventory_receipt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v2_inventory_payload_hash(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement(uuid, uuid, text, numeric, timestamptz, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_count(uuid, uuid, numeric, bigint, numeric, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_metadata(uuid, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_product(uuid) TO authenticated;
