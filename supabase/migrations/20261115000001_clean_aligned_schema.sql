-- Clean and align Supabase schema for NASA-calibrated heart monitoring,
-- real-time DONKI space weather, and pg_cron + pg_net scheduled sync.

do $$
begin
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
exception when undefined_function then null;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.telemetry_logs
    add column if not exists systolic_bp double precision default 120.0,
    add column if not exists diastolic_bp double precision default 80.0,
    add column if not exists respiration_rate double precision default 14.0,
    add column if not exists battery_level double precision default 98.0,
    add column if not exists telemetry_source text not null default 'simulated',
    add column if not exists orbital_phase text,
    add column if not exists calibration_basis text;

create index if not exists idx_alerts_astro_time on public.alerts(astronaut_id, timestamp desc);

create table if not exists public.space_weather_events (
    event_id text primary key,
    event_type text not null,
    event_time timestamp with time zone not null,
    severity text not null default 'QUIET',
    summary text not null,
    kp_index double precision,
    flare_class text,
    source_location text,
    active_region_num integer,
    cme_speed_kms double precision,
    cme_half_angle double precision,
    cme_longitude double precision,
    cme_latitude double precision,
    earth_impact_eta timestamp with time zone,
    payload jsonb not null default '{}'::jsonb,
    source_url text,
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_space_weather_events_time
    on public.space_weather_events(event_time desc);
create index if not exists idx_space_weather_events_type_time
    on public.space_weather_events(event_type, event_time desc);

create table if not exists public.space_weather_status (
    id text primary key,
    kp_current double precision not null default 0.0,
    storm_level text not null default 'G0_QUIET',
    radiation_storm text not null default 'S0_NONE',
    latest_flare_class text,
    latest_flare_location text,
    latest_flare_time timestamp with time zone,
    active_sep boolean not null default false,
    earth_impact_eta timestamp with time zone,
    summary text not null default 'Awaiting initial NASA DONKI sync.',
    source_mode text not null default 'historical_fallback',
    fetched_at timestamp with time zone not null default timezone('utc'::text, now()),
    payload jsonb not null default '{}'::jsonb
);

insert into public.space_weather_status (id, summary, source_mode)
values ('current', 'Awaiting initial NASA DONKI sync.', 'historical_fallback')
on conflict (id) do nothing;

alter table public.space_weather_events enable row level security;
alter table public.space_weather_status enable row level security;

do $$
begin
    create policy "Public read space_weather_events" on public.space_weather_events for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
    create policy "Public write space_weather_events" on public.space_weather_events for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
    create policy "Public read space_weather_status" on public.space_weather_status for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
    create policy "Public write space_weather_status" on public.space_weather_status for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.space_weather_events;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.space_weather_status;
exception when duplicate_object then null;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.cron_settings (
    key text primary key,
    value text not null,
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

insert into private.cron_settings (key, value)
values
    ('donki_sync_url', ''),
    ('cron_secret', '')
on conflict (key) do nothing;

create or replace function private.invoke_donki_sync()
returns void
language plpgsql
security definer
set search_path = private, extensions, pg_catalog
as $$
declare
    target_url text;
    secret_val text;
    hdrs jsonb;
begin
    select value into target_url from private.cron_settings where key = 'donki_sync_url';
    select value into secret_val from private.cron_settings where key = 'cron_secret';

    if target_url is null or btrim(target_url) = '' then
        return;
    end if;

    if secret_val is not null and btrim(secret_val) <> '' then
        hdrs := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', secret_val);
    else
        hdrs := jsonb_build_object('Content-Type', 'application/json');
    end if;

    perform net.http_post(
        url := btrim(target_url),
        headers := hdrs,
        body := '{}'::jsonb,
        timeout_milliseconds := 8000
    );
end;
$$;

revoke all on function private.invoke_donki_sync() from public, anon, authenticated;

do $$
declare
    jid bigint;
begin
    select jobid into jid from cron.job where jobname = 'telemetry-retention-prune';
    if jid is not null then
        perform cron.unschedule(jid);
    end if;
    perform cron.schedule(
        'telemetry-retention-prune',
        '0 3 * * *',
        'delete from public.telemetry_logs where timestamp < now() - interval ''7 days'''
    );

    select jobid into jid from cron.job where jobname = 'donki-space-weather-sync';
    if jid is not null then
        perform cron.unschedule(jid);
    end if;
    perform cron.schedule(
        'donki-space-weather-sync',
        '*/10 * * * *',
        'select private.invoke_donki_sync()'
    );
end $$;
