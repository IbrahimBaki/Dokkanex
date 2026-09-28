-- Legacy customer RLS policies already enforce user ownership; authenticated users
-- also need the underlying table privileges for the sales customer picker.
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
