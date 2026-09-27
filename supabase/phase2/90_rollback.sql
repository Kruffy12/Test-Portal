-- ServiCell Phase 2 — ROLLBACK. Puts database access back exactly as it was before the switch,
-- using the copy made by 01_backup.sql. Run this, then put the previous frontend back on GitHub.
--
-- Kept on purpose (harmless to the old frontend):
--   jobs.created_by, photo re-links, sc_* tables (they stay locked), audit entries written meanwhile.
-- Anything staff saved after the switch is kept; only passwords and access rules go back.

begin;

-- 1. Old passwords back (the old frontend compares plain text).
update public.users u
set password = b.password
from phase2_backup.users b
where b.username = u.username;

-- 2. Audit log editable again, as before.
drop trigger if exists audit_log_no_change   on public.audit_log;
drop trigger if exists audit_log_no_truncate on public.audit_log;

-- 3. Row-level security back to what each table had (tables created by Phase 2 stay locked).
do $$
declare r record;
begin
  for r in select table_name, rls from phase2_backup._rls loop
    if r.rls then
      execute format('alter table public.%I enable row level security', r.table_name);
    else
      execute format('alter table public.%I disable row level security', r.table_name);
    end if;
  end loop;
end $$;

-- 4. Table, sequence and function grants back.
do $$
declare r record;
begin
  for r in select * from phase2_backup._table_grants loop
    execute format('grant %s on public.%I to %I', r.privilege_type, r.table_name, r.grantee);
  end loop;
  for r in select * from phase2_backup._sequence_grants loop
    execute format('grant %s on sequence public.%I to %I',
                   case r.privilege_type when 'r' then 'select' when 'U' then 'usage' when 'w' then 'update'
                        else r.privilege_type end,
                   r.sequence_name, r.grantee);
  end loop;
end $$;

grant execute on function public.track_repair(bigint, text) to public, anon, authenticated;

alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to public, anon, authenticated;

-- 5. The policies that existed before (Staff Broadcasts + photo storage).
drop policy if exists portal_broadcasts_select_anon on public.portal_broadcasts;
drop policy if exists portal_broadcasts_insert_anon on public.portal_broadcasts;
drop policy if exists portal_broadcasts_update_anon on public.portal_broadcasts;
create policy portal_broadcasts_select_anon on public.portal_broadcasts for select to anon using (true);
create policy portal_broadcasts_insert_anon on public.portal_broadcasts for insert to anon with check (true);
create policy portal_broadcasts_update_anon on public.portal_broadcasts for update to anon using (true) with check (true);

drop policy if exists "Public Select 6fit35_0"                on storage.objects;
drop policy if exists "Allow public uploads to repair-photos" on storage.objects;
drop policy if exists "Allow public updates to repair-photos" on storage.objects;
drop policy if exists "Allow public deletes to repair-photos" on storage.objects;
create policy "Public Select 6fit35_0"                on storage.objects for select to public using (bucket_id = 'repair-photos');
create policy "Allow public uploads to repair-photos" on storage.objects for insert to public with check (bucket_id = 'repair-photos');
create policy "Allow public updates to repair-photos" on storage.objects for update to public using (bucket_id = 'repair-photos');
create policy "Allow public deletes to repair-photos" on storage.objects for delete to public using (bucket_id = 'repair-photos');

-- 6. Everyone signed in under Phase 2 is signed out (the old frontend doesn't use sessions).
delete from public.sc_sessions;

insert into public.audit_log (event, actor) values ('PHASE2_ROLLBACK', 'Phase 2 | access restored to pre-switch rules');

commit;
