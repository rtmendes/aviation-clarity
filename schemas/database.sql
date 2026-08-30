create extension if not exists pgcrypto;
create table if not exists content_topics(id uuid primary key default gen_random_uuid(), title text not null, audience text, pillar text, priority int default 3, status text default 'queued', created_at timestamptz default now());
create table if not exists research_sources(id uuid primary key default gen_random_uuid(), title text, url text, authority_level text, verified_at timestamptz, notes text);
create table if not exists content_assets(id uuid primary key default gen_random_uuid(), topic_id uuid references content_topics(id), type text, status text default 'draft', body text, qa_status text default 'pending', created_at timestamptz default now());
create table if not exists products(id uuid primary key default gen_random_uuid(), name text, audience text, price numeric, status text default 'idea', description text);
create table if not exists agent_runs(id uuid primary key default gen_random_uuid(), agent_name text, input jsonb, output jsonb, status text, created_at timestamptz default now());
