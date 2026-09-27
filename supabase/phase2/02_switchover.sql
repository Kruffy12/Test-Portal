-- ServiCell Phase 2 — step 2 of the window. Run only after 01_backup.sql succeeded.
-- One transaction: if any statement fails, nothing is changed.
--
-- After this runs, the browser (anon key) can no longer read or write any table. Everything goes
-- through the `api` Edge Function, which uses the service role and enforces sessions and roles.
-- The public repair tracker (track_repair) stays callable by anyone.

begin;

-- ─── 1. Sessions and login throttling ─────────────────────────────────────────────────────────

create table if not exists public.sc_sessions (
  token_hash  text primary key,
  username    text not null references public.users(username) on update cascade on delete cascade,
  remember    boolean not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  user_agent  text not null default ''
);
create index if not exists sc_sessions_username_idx on public.sc_sessions (username);

create table if not exists public.sc_login_attempts (
  username      text primary key,           -- lower-cased
  failures      integer not null default 0,
  first_failed  timestamptz not null default now(),
  locked_until  timestamptz
);

-- ─── 2. Jobs remember who created them (used for the delete rule) ──────────────────────────────

alter table public.jobs add column if not exists created_by text not null default '';

-- ─── 3. Hash every password that is still plain text (bcrypt) ──────────────────────────────────

update public.users
set password = extensions.crypt(password, extensions.gen_salt('bf', 10))
where password !~ '^\$2[abxy]\$';

-- ─── 4. Auth functions (service role only) ─────────────────────────────────────────────────────

create or replace function public.sc_login(p_username text, p_password text, p_remember boolean, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key     text := lower(trim(coalesce(p_username, '')));
  v_user    users%rowtype;
  v_try     sc_login_attempts%rowtype;
  v_ok      boolean := false;
  v_token   text;
  c_max     constant int := 5;
  c_window  constant interval := interval '15 minutes';
  c_lock    constant interval := interval '15 minutes';
begin
  if v_key = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('success', false);
  end if;

  select * into v_try from sc_login_attempts where username = v_key;
  if found and v_try.locked_until is not null and v_try.locked_until > now() then
    return jsonb_build_object('success', false, 'locked', true,
      'minutes', ceil(extract(epoch from (v_try.locked_until - now())) / 60));
  end if;

  select * into v_user from users where lower(username) = v_key;
  if found then
    v_ok := crypt(p_password, v_user.password) = v_user.password;
  else
    perform crypt(p_password, gen_salt('bf', 10));   -- same work whether or not the name exists
  end if;

  if not v_ok then
    insert into sc_login_attempts as a (username, failures, first_failed)
    values (v_key, 1, now())
    on conflict (username) do update
      set failures     = case when a.first_failed < now() - c_window then 1 else a.failures + 1 end,
          first_failed = case when a.first_failed < now() - c_window then now() else a.first_failed end,
          locked_until = null
    returning * into v_try;

    if v_try.failures >= c_max then
      update sc_login_attempts set locked_until = now() + c_lock, failures = 0 where username = v_key;
      return jsonb_build_object('success', false, 'locked', true, 'minutes', extract(epoch from c_lock) / 60);
    end if;
    return jsonb_build_object('success', false, 'remaining', c_max - v_try.failures);
  end if;

  delete from sc_login_attempts where username = v_key;

  if coalesce(v_user.revoked, false) then
    return jsonb_build_object('success', false, 'revoked', true,
      'error', 'Account suspended. Contact your manager.');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into sc_sessions (token_hash, username, remember, user_agent)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_user.username, coalesce(p_remember, false),
          left(coalesce(p_user_agent, ''), 300));

  return jsonb_build_object(
    'success', true,
    'token', v_token,
    'username', v_user.username,
    'role', v_user.role,
    'displayName', coalesce(v_user.display_name, '')
  );
end $$;

-- Resolves a session token to the signed-in person. Remembered devices stay signed in until they sign
-- out; other sessions end after 12 hours without activity. Suspended accounts lose every session.
create or replace function public.sc_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_s    sc_sessions%rowtype;
  v_u    users%rowtype;
begin
  if coalesce(p_token, '') = '' then
    return jsonb_build_object('valid', false, 'reason', 'none');
  end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_s from sc_sessions where token_hash = v_hash;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select * into v_u from users where username = v_s.username;
  if not found or coalesce(v_u.revoked, false) then
    delete from sc_sessions where username = v_s.username;
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;

  if not v_s.remember and v_s.last_seen < now() - interval '12 hours' then
    delete from sc_sessions where token_hash = v_hash;
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  if v_s.last_seen < now() - interval '5 minutes' then
    update sc_sessions set last_seen = now() where token_hash = v_hash;
  end if;

  return jsonb_build_object(
    'valid', true,
    'username', v_u.username,
    'role', v_u.role,
    'displayName', coalesce(v_u.display_name, ''),
    'tokenHash', v_hash
  );
end $$;

create or replace function public.sc_logout(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from sc_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Changing your password signs out your other devices.
create or replace function public.sc_change_password(p_username text, p_current text, p_new text, p_keep_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user users%rowtype;
begin
  select * into v_user from users where username = p_username;
  if not found then
    return jsonb_build_object('success', false, 'message', 'User not found');
  end if;
  if crypt(coalesce(p_current, ''), v_user.password) <> v_user.password then
    return jsonb_build_object('success', false, 'message', 'Current password incorrect');
  end if;
  if length(coalesce(p_new, '')) < 6 then
    return jsonb_build_object('success', false, 'message', 'New password must be at least 6 characters');
  end if;
  update users set password = crypt(p_new, gen_salt('bf', 10)) where username = p_username;
  delete from sc_sessions where username = p_username and token_hash <> coalesce(p_keep_hash, '');
  return jsonb_build_object('success', true, 'message', 'Password updated');
end $$;

-- A suspended person's sessions stop working at once (sc_session checks `revoked` on every call)
-- and are removed on their next request, so their screen can say why. Restoring clears any that
-- are left, so old devices don't quietly come back.
create or replace function public.sc_set_revoked(p_username text, p_revoked boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update users set revoked = p_revoked where username = p_username;
  if not found then return false; end if;
  if not p_revoked then delete from sc_sessions where username = p_username; end if;
  return true;
end $$;

-- ─── 5. Atomic helpers (fix lost updates when two people save at once) ────────────────────────

create or replace function public.sc_append_job_image(p_job_id bigint, p_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update jobs
  set inspection_images = case
        when coalesce(inspection_images, '') = '' then p_url
        when position(p_url in inspection_images) > 0 then inspection_images
        else inspection_images || ',' || p_url
      end,
      updated_at = now()
  where id = p_job_id;
  return found;
end $$;

create or replace function public.sc_remove_job_image(p_job_id bigint, p_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update jobs
  set inspection_images = coalesce((
        select string_agg(trim(x), ',' order by ord)
        from unnest(string_to_array(coalesce(inspection_images, ''), ',')) with ordinality as t(x, ord)
        where trim(x) <> '' and trim(x) <> trim(p_url)
      ), ''),
      updated_at = now()
  where id = p_job_id;
  return found;
end $$;

create or replace function public.sc_adjust_stock(p_sku text, p_type text, p_qty integer, p_job_id text, p_reason text, p_by text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item inventory%rowtype;
  v_new  integer;
  v_adj  integer := coalesce(p_qty, 0);
begin
  select * into v_item from inventory where sku = p_sku for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Item not found');
  end if;

  v_new := case coalesce(p_type, 'add')
             when 'set'    then v_adj
             when 'remove' then greatest(0, v_item.qty - v_adj)
             else v_item.qty + v_adj
           end;

  update inventory set qty = v_new, last_updated = now(), updated_by = coalesce(p_by, '') where sku = p_sku;
  insert into stock_movements (sku, item_name, type, qty, qty_before, qty_after, job_id, reason, updated_by)
  values (p_sku, v_item.name, coalesce(p_type, 'add'), v_adj, v_item.qty, v_new,
          coalesce(p_job_id, ''), coalesce(p_reason, ''), coalesce(p_by, ''));

  return jsonb_build_object('success', true, 'sku', p_sku, 'newQty', v_new, 'qtyBefore', v_item.qty,
                            'minQty', v_item.min_qty, 'name', v_item.name);
end $$;

create or replace function public.sc_mark_delivered(p_ids uuid[], p_username text)
returns void
language sql
security definer
set search_path = public
as $$
  update notifications
  set delivered_to = array_append(coalesce(delivered_to, '{}'), p_username)
  where id = any(p_ids) and not (p_username = any(coalesce(delivered_to, '{}')));
$$;

-- Numbers orders SO-100, SO-101, … without two people ever getting the same number.
create or replace function public.sc_create_special_order(p_customer text, p_item text, p_quantity integer,
                                                          p_notes text, p_phone text, p_requested_by text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last   integer;
  v_number text;
begin
  perform pg_advisory_xact_lock(hashtext('sc_special_orders'));
  select coalesce(max(nullif(regexp_replace(order_number, '\D', '', 'g'), '')::integer), 99)
    into v_last from special_orders;
  v_number := 'SO-' || (v_last + 1);
  insert into special_orders (order_number, customer, item, quantity, notes, phone, requested_by)
  values (v_number, coalesce(p_customer, ''), coalesce(p_item, ''), greatest(coalesce(p_quantity, 1), 1),
          coalesce(p_notes, ''), coalesce(p_phone, ''), coalesce(p_requested_by, 'Unknown'));
  return v_number;
end $$;

-- ─── 6. Audit log is append-only (nobody can edit or erase entries) ────────────────────────────

create or replace function public.sc_audit_log_readonly()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end $$;

drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.sc_audit_log_readonly();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.sc_audit_log_readonly();

-- ─── 7. Re-link photos that uploaded but never got attached to their job ──────────────────────

do $$
declare
  v_base text;
  r      record;
  v_n    integer := 0;
begin
  select substring(inspection_images from '(https?://[^,]*/storage/v1/object/public/repair-photos/)')
    into v_base
  from jobs where inspection_images like 'http%/repair-photos/%' limit 1;
  if v_base is null then
    raise notice 'No existing photo link found to copy the address from; skipping re-link.';
    return;
  end if;

  -- Only the newest file for a side (front, back, …) the job has no photo of. Older files for a side
  -- that is attached are retakes, not lost photos.
  for r in
    select distinct on (job_id, stage) name, job_id, stage
    from (
      select o.name, o.created_at,
             (regexp_match(o.name, '^job-(\d+)-'))[1]::bigint as job_id,
             (regexp_match(o.name, '^job-\d+-([a-z0-9-]+)-\d{10,}'))[1] as stage
      from storage.objects o
      where o.bucket_id = 'repair-photos' and o.name ~ '^job-\d+-[a-z0-9-]+-\d{10,}'
    ) f
    order by job_id, stage, created_at desc
  loop
    if exists (select 1 from jobs j where j.id = r.job_id
                 and coalesce(j.inspection_images, '') not like '%job-' || r.job_id || '-' || r.stage || '-%')
       and not exists (select 1 from job_inspection_images ji
                         where ji.job_id = r.job_id and ji.image_url like '%job-' || r.job_id || '-' || r.stage || '-%') then
      perform public.sc_append_job_image(r.job_id, v_base || r.name);
      insert into audit_log (event, actor) values ('PHOTO_RELINK', 'Phase 2 | Job #' || r.job_id || ' | ' || r.name);
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'Re-linked % photo(s).', v_n;
end $$;

-- ─── 8. Lock the database to the browser ──────────────────────────────────────────────────────

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Staff Broadcasts were writable by anyone; they now go through the Edge Function too.
drop policy if exists portal_broadcasts_select_anon on public.portal_broadcasts;
drop policy if exists portal_broadcasts_insert_anon on public.portal_broadcasts;
drop policy if exists portal_broadcasts_update_anon on public.portal_broadcasts;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function public.track_repair(bigint, text) to anon, authenticated;

grant execute on function
  public.sc_login(text, text, boolean, text),
  public.sc_session(text),
  public.sc_logout(text),
  public.sc_change_password(text, text, text, text),
  public.sc_set_revoked(text, boolean),
  public.sc_append_job_image(bigint, text),
  public.sc_remove_job_image(bigint, text),
  public.sc_adjust_stock(text, text, integer, text, text, text),
  public.sc_mark_delivered(uuid[], text),
  public.sc_create_special_order(text, text, integer, text, text, text)
to service_role;

-- Photos: viewing stays public (the bucket is public, so links keep working without a policy).
-- Uploading, overwriting, deleting and listing now only happen through the Edge Function.
drop policy if exists "Allow public uploads to repair-photos" on storage.objects;
drop policy if exists "Allow public updates to repair-photos" on storage.objects;
drop policy if exists "Allow public deletes to repair-photos" on storage.objects;
drop policy if exists "Public Select 6fit35_0"                on storage.objects;

insert into audit_log (event, actor) values ('PHASE2_SWITCHOVER', 'Phase 2 | database locked, passwords hashed');

commit;
