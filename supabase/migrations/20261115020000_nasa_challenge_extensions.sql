-- Extensions for Space Apps Health Monitoring indicators, alert fields, and assessment sync.

alter table public.telemetry_logs
  add column if not exists blood_glucose double precision,
  add column if not exists wbc_k_ul double precision,
  add column if not exists hydration_pct double precision,
  add column if not exists mission_zone text,
  add column if not exists mission_day integer,
  add column if not exists distance_km double precision,
  add column if not exists comms_latency_sec double precision,
  add column if not exists gravity_g double precision,
  add column if not exists shielding_mode text,
  add column if not exists cumulative_dose_msv double precision,
  add column if not exists overall_health_score double precision,
  add column if not exists health_status text,
  add column if not exists iss_latitude double precision,
  add column if not exists iss_longitude double precision,
  add column if not exists iss_altitude_km double precision;

alter table public.alerts
  add column if not exists trigger_metric text,
  add column if not exists recommended_action text,
  add column if not exists hazard_domain text;

create index if not exists idx_alerts_active_astronaut
  on public.alerts (astronaut_id, acknowledged, timestamp desc);

create table if not exists public.crew_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  astronaut_id text not null,
  recorded_at timestamptz not null default now(),
  mood integer,
  energy integer,
  stress integer,
  sleep_hours double precision,
  pain_level integer,
  blood_glucose_mg_dl double precision,
  hydration_ml integer,
  nutrition_quality text,
  immune_symptoms text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_crew_checkins_astronaut_time
  on public.crew_checkins (astronaut_id, recorded_at desc);

create table if not exists public.imaging_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  astronaut_id text not null,
  exam_type text not null,
  recorded_at timestamptz not null default now(),
  severity text not null default 'nominal',
  findings text not null,
  recommended_actions jsonb not null default '[]'::jsonb,
  ground_consult_required boolean not null default false,
  analysis_source text not null default 'protocol-offline',
  thumbnail_data_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_imaging_assessments_astronaut_time
  on public.imaging_assessments (astronaut_id, recorded_at desc);

alter table public.crew_checkins enable row level security;
alter table public.imaging_assessments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crew_checkins' and policyname = 'Public read crew_checkins'
  ) then
    create policy "Public read crew_checkins" on public.crew_checkins for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crew_checkins' and policyname = 'Public write crew_checkins'
  ) then
    create policy "Public write crew_checkins" on public.crew_checkins for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'imaging_assessments' and policyname = 'Public read imaging_assessments'
  ) then
    create policy "Public read imaging_assessments" on public.imaging_assessments for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'imaging_assessments' and policyname = 'Public write imaging_assessments'
  ) then
    create policy "Public write imaging_assessments" on public.imaging_assessments for all using (true) with check (true);
  end if;
end $$;
