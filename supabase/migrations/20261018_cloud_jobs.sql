-- Sascha AI Cloud: authenticated, owner-scoped analysis queue.
-- Run once in the Supabase SQL editor before starting the cloud worker.
-- No Vinted sessions, proxies or credentials are stored here.
create table if not exists public.cloud_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pant_id text not null,
  job_type text not null default 'analyze_pant' check (job_type = 'analyze_pant'),
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 3),
  lease_until timestamptz,
  worker_id text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists cloud_jobs_owner_date
  on public.cloud_jobs (user_id, created_at desc);
create unique index if not exists cloud_jobs_one_active_per_pant
  on public.cloud_jobs (user_id, pant_id, job_type)
  where status in ('queued','running');
alter table public.cloud_jobs enable row level security;
revoke all on public.cloud_jobs from anon, authenticated;
grant select on public.cloud_jobs to authenticated;
drop policy if exists cloud_jobs_select_own on public.cloud_jobs;
create policy cloud_jobs_select_own on public.cloud_jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- Users cannot submit arbitrary jobs by writing to the table directly.
-- RPC verifies ownership of the item and limits daily jobs to control AI costs.
create or replace function public.enqueue_cloud_analysis_job(p_pant_id text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job uuid;
  v_pant jsonb;
begin
  if v_user is null then
    raise exception 'Bitte anmelden.';
  end if;
  if p_pant_id is null or length(p_pant_id) > 100 or length(trim(p_pant_id)) = 0 then
    raise exception 'Ungültige Artikel-ID.';
  end if;
  select p.data into v_pant from public.pants p
    where p.id::text = p_pant_id and p.user_id = v_user;
  if not found then
    raise exception 'Artikel nicht gefunden.';
  end if;
  if nullif(trim(v_pant->>'artikelnummer'),'') is null then
    raise exception 'Artikelnummer fehlt.';
  end if;
  if coalesce(jsonb_array_length(
    case when jsonb_typeof(v_pant->'images') = 'array'
      then v_pant->'images' else '[]'::jsonb end), 0) = 0 then
    raise exception 'Artikel hat keine Bilder.';
  end if;
  if (select count(*) from public.cloud_jobs
      where user_id = v_user and created_at > now() - interval '24 hours') >= 100 then
    raise exception 'Tageslimit von 100 Cloud-Aufträgen erreicht.';
  end if;
  insert into public.cloud_jobs (user_id,pant_id,job_type)
    values (v_user,p_pant_id,'analyze_pant')
    on conflict (user_id,pant_id,job_type)
       where status in ('queued','running') do nothing
    returning id into v_job;
  return v_job; -- null means already queued or processing
end
$$;
revoke all on function public.enqueue_cloud_analysis_job(text) from public;
grant execute on function public.enqueue_cloud_analysis_job(text) to authenticated;

-- Atomic, lease-based claim. Only the server-side service role may invoke it.
create or replace function public.claim_cloud_analysis_job(p_worker_id text)
returns setof public.cloud_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Nur der Cloud-Worker darf Aufträge übernehmen.';
  end if;
  -- Three expired leases indicate a crashed/stalled job: fail it instead of
  -- leaving it marked running forever.
  update public.cloud_jobs set
    status='failed', error='Worker nach drei Versuchen nicht erreichbar.',
    finished_at=now(), lease_until=null, updated_at=now()
  where status='running' and lease_until < now() and attempts >= 3;
  return query
  with candidate as (
    select j.id from public.cloud_jobs j
    where (j.status='queued'
      or (j.status='running' and j.lease_until < now()))
      and j.attempts < 3
    order by j.created_at asc
    limit 1 for update skip locked
  )
  update public.cloud_jobs j set
    status='running',
    attempts=j.attempts + 1,
    worker_id=p_worker_id,
    started_at=now(),
    lease_until=now()+interval '10 minutes',
    updated_at=now(),
    error=null
  from candidate where j.id=candidate.id
  returning j.*;
end
$$;
revoke all on function public.claim_cloud_analysis_job(text) from public, anon, authenticated;
grant execute on function public.claim_cloud_analysis_job(text) to service_role;
