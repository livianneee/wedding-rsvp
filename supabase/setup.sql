-- Rio & Olivia wedding RSVP: database setup for Supabase.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- Every guest gets a private link: https://<site>/?i=<token>. The token is 128 random bits,
-- so links can't be guessed, and a guest can only ever answer for their own row.
--
-- Who can do what:
--   Guests (publishable key, not signed in): get_invite() and submit_rsvp(), with their token only.
--   Admins (signed in AND listed in public.admins): read every guest, add guests.
--   Anyone else signed in: nothing.

-------------------------------------------------------------------------------
-- 0. Remove the old name-based version (it let anyone answer as anyone).
--    This deletes the old public.rsvps table and any test rows in it.
-------------------------------------------------------------------------------
drop function if exists public.submit_rsvp(text, boolean, integer);
drop table if exists public.rsvps;

-------------------------------------------------------------------------------
-- 1. Guests. One row per invitation (a person or a household).
-------------------------------------------------------------------------------
create table if not exists public.guests (
  id            bigint generated always as identity primary key,
  token         text        not null unique
                  default encode(extensions.gen_random_bytes(16), 'hex'),
  guest_name    text        not null,
  attending     boolean,                         -- null = hasn't answered yet
  pax           smallint,
  submit_count  integer     not null default 0,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  constraint guests_name_length check (char_length(btrim(guest_name)) between 1 and 80),
  constraint guests_pax_matches_answer check (
    (attending is null and pax is null)
    or (attending and pax between 1 and 5)       -- 5 must match maxPax in config.js
    or (not attending and pax = 0)
  )
);

alter table public.guests enable row level security;

-- Nobody touches the table directly; guests and admins go through the functions below.
revoke all on public.guests from anon, authenticated;
grant select on public.guests to authenticated;   -- still filtered by the admin policy below

-------------------------------------------------------------------------------
-- 2. Admins
-------------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can read guests" on public.guests;
create policy "Admins can read guests"
  on public.guests
  for select
  to authenticated
  using ((select public.is_admin()));

-------------------------------------------------------------------------------
-- 3. Guest functions. Both need the private token from the link.
-------------------------------------------------------------------------------
create or replace function public.get_invite(p_token text)
returns table (guest_name text, attending boolean, pax smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select g.guest_name, g.attending, g.pax
  from public.guests g
  where g.token = p_token;
$$;

revoke all on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;

create or replace function public.submit_rsvp(p_token text, p_attending boolean, p_pax integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pax integer := p_pax;
begin
  if p_attending is null then
    raise exception 'Attendance is required' using errcode = '22023';
  end if;

  if p_attending then
    if v_pax is null or v_pax not between 1 and 5 then
      raise exception 'Number of attendees must be 1 to 5' using errcode = '22023';
    end if;
  else
    v_pax := 0;
  end if;

  update public.guests
     set attending    = p_attending,
         pax          = v_pax,
         responded_at = now(),
         submit_count = submit_count + 1
   where token = p_token;

  if not found then
    raise exception 'Unknown invitation' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.submit_rsvp(text, boolean, integer) from public;
grant execute on function public.submit_rsvp(text, boolean, integer) to anon, authenticated;

-------------------------------------------------------------------------------
-- 4. Admin: add guests in bulk. Returns each new guest with their token.
-------------------------------------------------------------------------------
create or replace function public.admin_add_guests(p_names text[])
returns table (guest_name text, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(n), '{}')
    into v_names
    from (
      select regexp_replace(btrim(x), '\s+', ' ', 'g') as n
      from unnest(coalesce(p_names, '{}')) as x
    ) s
   where n <> '';

  if cardinality(v_names) = 0 then
    raise exception 'No names given' using errcode = '22023';
  end if;
  if cardinality(v_names) > 500 then
    raise exception 'Add at most 500 guests at a time' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_names) n where char_length(n) > 80) then
    raise exception 'Each name must be 80 characters or fewer' using errcode = '22023';
  end if;

  return query
    insert into public.guests as g (guest_name)
    select unnest(v_names)
    returning g.guest_name, g.token;
end;
$$;

revoke all on function public.admin_add_guests(text[]) from public, anon;
grant execute on function public.admin_add_guests(text[]) to authenticated;
