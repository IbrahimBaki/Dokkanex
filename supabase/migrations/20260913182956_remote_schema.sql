SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE TABLE "public"."categories" (
  "id"         uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                        NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "user_id"    uuid,
  CONSTRAINT "categories_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."categories"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."customers" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "phone"        text,
  "address"      text,
  "credit_limit" numeric(12,2)            NOT NULL DEFAULT 0,
  "notes"        text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"   timestamp with time zone,
  CONSTRAINT "customers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."customers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."doc_counters" (
  "doc_type"    text    NOT NULL,
  "user_id"     uuid    NOT NULL,
  "last_number" integer NOT NULL DEFAULT 0,
  CONSTRAINT "doc_counters_pkey" PRIMARY KEY (doc_type, user_id)
);

ALTER TABLE "public"."doc_counters"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."invoice_items" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "invoice_id"   uuid                     NOT NULL,
  "product_id"   uuid,
  "product_name" text                     NOT NULL,
  "quantity"     numeric(12,2)            NOT NULL,
  "unit_price"   numeric(12,2)            NOT NULL DEFAULT 0,
  "cost_price"   numeric(12,2)            NOT NULL DEFAULT 0,
  "discount"     numeric(12,2)            NOT NULL DEFAULT 0,
  "line_total"   numeric(12,2)            NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"   timestamp with time zone,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."invoice_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."invoices" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "customer_id"     uuid,
  "invoice_number"  text,
  "invoice_date"    date                     NOT NULL,
  "subtotal"        numeric(12,2)            NOT NULL DEFAULT 0,
  "discount_amount" numeric(12,2)            NOT NULL DEFAULT 0,
  "tax_amount"      numeric(12,2)            NOT NULL DEFAULT 0,
  "total"           numeric(12,2)            NOT NULL DEFAULT 0,
  "paid_amount"     numeric(12,2)            NOT NULL DEFAULT 0,
  "payment_type"    text                     NOT NULL DEFAULT 'cash'::text,
  "status"          text                     NOT NULL DEFAULT 'confirmed'::text,
  "notes"           text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"      timestamp with time zone,
  CONSTRAINT "invoices_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."invoices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ledger_entries" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "party_type" text                     NOT NULL,
  "party_id"   uuid                     NOT NULL,
  "debit"      numeric(12,2)            NOT NULL DEFAULT 0,
  "credit"     numeric(12,2)            NOT NULL DEFAULT 0,
  "ref_type"   text,
  "ref_id"     uuid,
  "entry_date" date                     NOT NULL,
  "note"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."ledger_entries"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "party_type"   text                     NOT NULL,
  "party_id"     uuid,
  "amount"       numeric(12,2)            NOT NULL,
  "direction"    text                     NOT NULL,
  "method"       text                     NOT NULL DEFAULT 'cash'::text,
  "ref_type"     text,
  "ref_id"       uuid,
  "payment_date" date                     NOT NULL,
  "note"         text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"   timestamp with time zone,
  CONSTRAINT "payments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."products" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "name"            text                        NOT NULL,
  "image_url"       text,
  "wholesale_price" numeric                     NOT NULL,
  "selling_price"   numeric                     NOT NULL,
  "category_id"     uuid,
  "created_at"      timestamp without time zone DEFAULT now(),
  "user_id"         uuid,
  "updated_at"      timestamp without time zone DEFAULT now(),
  "sku"             text,
  "cost_price"      numeric(12,2)               NOT NULL DEFAULT 0,
  "quantity"        numeric(12,2)               NOT NULL DEFAULT 0,
  "min_quantity"    numeric(12,2)               NOT NULL DEFAULT 0,
  "unit"            text                        NOT NULL DEFAULT 'piece'::text,
  "is_active"       boolean                     NOT NULL DEFAULT true,
  "deleted_at"      timestamp with time zone,
  CONSTRAINT "products_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."purchase_items" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "purchase_id"  uuid                     NOT NULL,
  "product_id"   uuid,
  "product_name" text                     NOT NULL,
  "quantity"     numeric(12,2)            NOT NULL,
  "unit_price"   numeric(12,2)            NOT NULL DEFAULT 0,
  "line_total"   numeric(12,2)            NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"   timestamp with time zone,
  CONSTRAINT "purchase_items_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."purchase_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."purchases" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "supplier_id"     uuid,
  "purchase_number" text,
  "purchase_date"   date                     NOT NULL,
  "subtotal"        numeric(12,2)            NOT NULL DEFAULT 0,
  "discount_amount" numeric(12,2)            NOT NULL DEFAULT 0,
  "tax_amount"      numeric(12,2)            NOT NULL DEFAULT 0,
  "total"           numeric(12,2)            NOT NULL DEFAULT 0,
  "paid_amount"     numeric(12,2)            NOT NULL DEFAULT 0,
  "payment_type"    text                     NOT NULL DEFAULT 'cash'::text,
  "status"          text                     NOT NULL DEFAULT 'confirmed'::text,
  "notes"           text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"      timestamp with time zone,
  CONSTRAINT "purchases_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."purchases"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."stock_movements" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "product_id" uuid                     NOT NULL,
  "qty_change" numeric(12,2)            NOT NULL,
  "reason"     text                     NOT NULL,
  "ref_type"   text,
  "ref_id"     uuid,
  "note"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."stock_movements"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."suppliers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "name"       text                     NOT NULL,
  "phone"      text,
  "address"    text,
  "notes"      text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."suppliers"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO doc_counters (doc_type, user_id, last_number)
  VALUES ('invoice', NEW.user_id, 1)
  ON CONFLICT (doc_type, user_id)
  DO UPDATE SET last_number = doc_counters.last_number + 1;

  SELECT last_number INTO v_next
  FROM doc_counters
  WHERE doc_type = 'invoice' AND user_id = NEW.user_id;

  NEW.invoice_number := 'INV-' || LPAD(v_next::TEXT, 6, '0');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_purchase_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO doc_counters (doc_type, user_id, last_number)
  VALUES ('purchase', NEW.user_id, 1)
  ON CONFLICT (doc_type, user_id)
  DO UPDATE SET last_number = doc_counters.last_number + 1;

  SELECT last_number INTO v_next
  FROM doc_counters
  WHERE doc_type = 'purchase' AND user_id = NEW.user_id;

  NEW.purchase_number := 'PUR-' || LPAD(v_next::TEXT, 6, '0');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

ALTER TABLE "public"."categories"
  ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."doc_counters"
  ADD CONSTRAINT "doc_counters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."invoice_items"
  ADD CONSTRAINT "invoice_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE "public"."invoice_items"
  ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."ledger_entries"
  ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE "public"."invoice_items"
  ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."purchase_items"
  ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE "public"."purchase_items"
  ADD CONSTRAINT "purchase_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."purchase_items"
  ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;

ALTER TABLE "public"."purchases"
  ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."stock_movements"
  ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE "public"."stock_movements"
  ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."purchases"
  ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);

ALTER TABLE "public"."suppliers"
  ADD CONSTRAINT "suppliers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX customers_user_id_idx ON public.customers USING btree (user_id);

CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items USING btree (invoice_id);

CREATE INDEX invoice_items_user_id_idx ON public.invoice_items USING btree (user_id);

CREATE INDEX invoices_customer_id_idx ON public.invoices USING btree (customer_id);

CREATE INDEX invoices_invoice_date_idx ON public.invoices USING btree (invoice_date);

CREATE INDEX invoices_user_id_idx ON public.invoices USING btree (user_id);

CREATE INDEX ledger_entries_party_id_idx ON public.ledger_entries USING btree (party_id);

CREATE INDEX ledger_entries_user_id_idx ON public.ledger_entries USING btree (user_id);

CREATE INDEX payments_party_id_idx ON public.payments USING btree (party_id);

CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id);

CREATE UNIQUE INDEX products_sku_user_idx ON public.products USING btree (sku, user_id)
  WHERE (sku IS NOT NULL);

CREATE INDEX purchase_items_purchase_id_idx ON public.purchase_items USING btree (purchase_id);

CREATE INDEX purchase_items_user_id_idx ON public.purchase_items USING btree (user_id);

CREATE INDEX purchases_supplier_id_idx ON public.purchases USING btree (supplier_id);

CREATE INDEX purchases_user_id_idx ON public.purchases USING btree (user_id);

CREATE INDEX stock_movements_product_id_idx ON public.stock_movements USING btree (product_id);

CREATE INDEX stock_movements_user_id_idx ON public.stock_movements USING btree (user_id);

CREATE INDEX suppliers_user_id_idx ON public.suppliers USING btree (user_id);

CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN ((new.invoice_number IS NULL))
  EXECUTE FUNCTION public.assign_invoice_number();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_assign_purchase_number
  BEFORE INSERT ON public.purchases
  FOR EACH ROW
  WHEN ((new.purchase_number IS NULL))
  EXECUTE FUNCTION public.assign_purchase_number();

CREATE POLICY "Users see own categories" ON "public"."categories"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "categories_delete" ON "public"."categories"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "categories_insert" ON "public"."categories"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "categories_select" ON "public"."categories"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "categories_update" ON "public"."categories"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "customers_delete" ON "public"."customers"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "customers_insert" ON "public"."customers"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "customers_select" ON "public"."customers"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "customers_update" ON "public"."customers"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "doc_counters_delete" ON "public"."doc_counters"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "doc_counters_insert" ON "public"."doc_counters"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "doc_counters_select" ON "public"."doc_counters"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "doc_counters_update" ON "public"."doc_counters"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "invoice_items_delete" ON "public"."invoice_items"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "invoice_items_insert" ON "public"."invoice_items"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "invoice_items_select" ON "public"."invoice_items"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "invoice_items_update" ON "public"."invoice_items"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "invoices_delete" ON "public"."invoices"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "invoices_insert" ON "public"."invoices"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "invoices_select" ON "public"."invoices"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "invoices_update" ON "public"."invoices"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "ledger_entries_delete" ON "public"."ledger_entries"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "ledger_entries_insert" ON "public"."ledger_entries"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "ledger_entries_select" ON "public"."ledger_entries"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "ledger_entries_update" ON "public"."ledger_entries"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "payments_delete" ON "public"."payments"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "payments_insert" ON "public"."payments"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "payments_select" ON "public"."payments"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "payments_update" ON "public"."payments"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users see own products" ON "public"."products"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "products_delete" ON "public"."products"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "products_insert" ON "public"."products"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "products_select" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "products_update" ON "public"."products"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "users_own_products_delete" ON "public"."products"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "users_own_products_insert" ON "public"."products"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "users_own_products_select" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "users_own_products_update" ON "public"."products"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "purchase_items_delete" ON "public"."purchase_items"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "purchase_items_insert" ON "public"."purchase_items"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "purchase_items_select" ON "public"."purchase_items"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "purchase_items_update" ON "public"."purchase_items"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "purchases_delete" ON "public"."purchases"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "purchases_insert" ON "public"."purchases"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "purchases_select" ON "public"."purchases"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "purchases_update" ON "public"."purchases"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "stock_movements_delete" ON "public"."stock_movements"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "stock_movements_insert" ON "public"."stock_movements"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "stock_movements_select" ON "public"."stock_movements"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "stock_movements_update" ON "public"."stock_movements"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "suppliers_delete" ON "public"."suppliers"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "suppliers_insert" ON "public"."suppliers"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "suppliers_select" ON "public"."suppliers"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "suppliers_update" ON "public"."suppliers"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Public Access" ON "storage"."objects"
  FOR ALL
  TO PUBLIC
  USING ((bucket_id = 'product-images'::text));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."assign_invoice_number"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_purchase_number"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at"() TO PUBLIC, "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "anon", "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."categories" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."customers" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customers" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."customers" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."doc_counters" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."doc_counters" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."doc_counters" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."invoice_items" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_items" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."invoice_items" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."invoices" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."invoices" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."ledger_entries" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ledger_entries" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."ledger_entries" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."payments" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."payments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."products" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."purchase_items" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."purchase_items" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."purchase_items" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."purchases" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."purchases" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."purchases" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."stock_movements" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stock_movements" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."stock_movements" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."suppliers" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."suppliers" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."suppliers" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

