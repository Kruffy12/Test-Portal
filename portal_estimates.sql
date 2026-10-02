-- ServiCell Staff Portal — insurance / quotation estimates (pending approval)
-- Run once in Supabase SQL Editor (project: lakusziubvqhqhrlkdhd)
-- Estimates reserve a job id; on approve the row is promoted into public.jobs with the same id.

create table if not exists public.job_estimates (
  id integer primary key,
  customer_name text not null,
  device text not null,
  customer_phone text not null default '',
  notes text not null default '',
  issue text not null default '',
  job_type text not null default '',
  priority text not null default 'low',
  invoice_items text not null default '',
  inspection text not null default 'No damage noted',
  estimated_completion text,
  date_received text not null default '',
  device_in_shop boolean not null default true,
  inspection_images text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_estimates_created_at_idx
  on public.job_estimates (created_at desc);

comment on table public.job_estimates is
  'Pending quotations; not visible on public repair tracker until approved into jobs.';

alter table public.job_estimates enable row level security;

drop policy if exists "job_estimates_select_anon" on public.job_estimates;
drop policy if exists "job_estimates_insert_anon" on public.job_estimates;
drop policy if exists "job_estimates_update_anon" on public.job_estimates;
drop policy if exists "job_estimates_delete_anon" on public.job_estimates;

create policy "job_estimates_select_anon"
  on public.job_estimates for select to anon using (true);

create policy "job_estimates_insert_anon"
  on public.job_estimates for insert to anon with check (true);

create policy "job_estimates_update_anon"
  on public.job_estimates for update to anon using (true) with check (true);

create policy "job_estimates_delete_anon"
  on public.job_estimates for delete to anon using (true);
