-- The existing anonymous catalog save updates this field alongside already-authorized fields.
-- Keep column-level privileges: no table-wide UPDATE or RLS bypass.
grant update(request_rejected_at) on public.titles to anon;
