-- Newer Supabase projects don't grant table access to API roles by default.
-- Only the edge functions (service_role) may touch these tables; anon/authenticated stay locked out.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.spaces, public.items to service_role;
grant usage, select on sequence public.items_seq to service_role;
grant execute on function public.push_items(text, jsonb) to service_role;
