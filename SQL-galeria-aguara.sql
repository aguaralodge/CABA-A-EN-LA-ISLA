create extension if not exists pgcrypto;

create table if not exists public.galeria (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  descripcion text,
  image_url text not null,
  object_path text not null unique,
  orden integer,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists galeria_orden_idx on public.galeria (orden, created_at desc);

alter table public.galeria enable row level security;

drop policy if exists "galeria read public" on public.galeria;
create policy "galeria read public"
on public.galeria
for select
to anon
using (activa = true);

insert into storage.buckets (id, name, public)
values ('galeria', 'galeria', true)
on conflict (id) do update set public = true;

drop policy if exists "galeria images public read" on storage.objects;
create policy "galeria images public read"
on storage.objects
for select
to anon
using (bucket_id = 'galeria');
