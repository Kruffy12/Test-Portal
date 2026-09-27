-- ServiCell Phase 2 — step 1 of the window: full copy of every table + the current access rules.
-- The free plan has no restorable backups, so this copy is what 90_rollback.sql restores from.
-- The phase2_backup schema is not exposed through the API. It holds the old plain-text passwords,
-- so 99_cleanup_after_confirm.sql drops it once the owner confirms the switch went well.

begin;

create schema if not exists phase2_backup;
revoke all on schema phase2_backup from public, anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists phase2_backup.%I', t);
    execute format('create table phase2_backup.%I as table public.%I', t, t);
  end loop;
end $$;

drop table if exists phase2_backup._table_grants;
create table phase2_backup._table_grants as
  select table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated');

drop table if exists phase2_backup._sequence_grants;
create table phase2_backup._sequence_grants as
  select c.relname as sequence_name, r.rolname as grantee, p.privilege_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) p
  join pg_roles r on r.oid = p.grantee
  where n.nspname = 'public' and c.relkind = 'S' and r.rolname in ('anon', 'authenticated');

drop table if exists phase2_backup._rls;
create table phase2_backup._rls as
  select c.relname as table_name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

drop table if exists phase2_backup._policies;
create table phase2_backup._policies as
  select * from pg_policies where schemaname in ('public', 'storage');

commit;

-- Sanity check: every row count should match its live table.
select t.tablename,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tablename), false, true, '')))[1]::text::int as live_rows,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from phase2_backup.%I', t.tablename), false, true, '')))[1]::text::int as backup_rows
from pg_tables t
where t.schemaname = 'public'
order by 1;
