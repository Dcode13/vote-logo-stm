-- HUT ke-56 STM / SMK Negeri 3 Gorontalo · 2026
-- Run once in the Supabase SQL Editor, or via `supabase db push`.
-- No raw tables or per-logo results are readable by anonymous API clients.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists voting_private;

revoke all on schema voting_private from public, anon, authenticated;

create table voting_private.logos (
  id integer primary key check (id between 1 and 14),
  name text not null
);

insert into voting_private.logos (id, name)
select n, 'Logo ' || n::text from generate_series(1, 14) as n;

create table voting_private.settings (
  id boolean primary key default true check (id),
  is_open boolean not null default true
);

insert into voting_private.settings (id, is_open) values (true, true);

create table voting_private.votes (
  id bigint generated always as identity primary key,
  logo_id integer not null references voting_private.logos(id),
  voter_hash text not null unique check (length(voter_hash) = 64),
  created_at timestamptz not null default now()
);

create index votes_logo_id_idx on voting_private.votes(logo_id);

create table voting_private.admins (
  username text primary key,
  password_hash text not null
);

-- Requested initial credentials. Passwords are checked in PostgreSQL, not React.
insert into voting_private.admins (username, password_hash)
values ('admin123', extensions.crypt('admin123', extensions.gen_salt('bf', 10)));

create table voting_private.admin_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  username text not null references voting_private.admins(username) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index admin_sessions_expiry_idx on voting_private.admin_sessions(expires_at);

create table voting_private.admin_login_attempts (
  username_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

alter table voting_private.logos enable row level security;
alter table voting_private.settings enable row level security;
alter table voting_private.votes enable row level security;
alter table voting_private.admins enable row level security;
alter table voting_private.admin_sessions enable row level security;
alter table voting_private.admin_login_attempts enable row level security;

revoke all on all tables in schema voting_private from public, anon, authenticated;
revoke all on all sequences in schema voting_private from public, anon, authenticated;

create or replace function public.get_voting_status(p_voter_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_logo_id integer;
  v_total bigint;
  v_is_open boolean;
begin
  if p_voter_token is not null and p_voter_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'INVALID_VOTER_TOKEN';
  end if;

  if p_voter_token is not null then
    select v.logo_id into v_logo_id
    from voting_private.votes as v
    where v.voter_hash = encode(extensions.digest(p_voter_token, 'sha256'), 'hex');
  end if;

  select count(*) into v_total from voting_private.votes;
  select s.is_open into v_is_open from voting_private.settings as s where s.id = true;

  return jsonb_build_object(
    'totalVotes', v_total,
    'hasVoted', v_logo_id is not null,
    'votedLogoId', v_logo_id,
    'isOpen', coalesce(v_is_open, false)
  );
end;
$$;

create or replace function public.cast_vote(p_logo_id integer, p_voter_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_open boolean;
begin
  if p_logo_id is null or p_logo_id not between 1 and 14 then
    raise exception 'INVALID_LOGO';
  end if;
  if p_voter_token is null or p_voter_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'INVALID_VOTER_TOKEN';
  end if;

  select s.is_open into v_is_open
  from voting_private.settings as s
  where s.id = true
  for share;

  if not coalesce(v_is_open, false) then
    raise exception 'VOTING_CLOSED';
  end if;

  begin
    insert into voting_private.votes (logo_id, voter_hash)
    values (p_logo_id, encode(extensions.digest(p_voter_token, 'sha256'), 'hex'));
  exception when unique_violation then
    raise exception 'ALREADY_VOTED';
  end;

  return public.get_voting_status(p_voter_token);
end;
$$;

create or replace function public.admin_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_password_hash text;
  v_username_hash text;
  v_attempts integer;
  v_token text;
  v_expires_at timestamptz;
begin
  if p_username is null or p_password is null
    or length(p_username) not between 1 and 64
    or octet_length(p_password) not between 1 and 72 then
    return jsonb_build_object('error', 'INVALID_CREDENTIALS');
  end if;

  v_username := lower(btrim(p_username));
  v_username_hash := encode(extensions.digest(v_username, 'sha256'), 'hex');

  -- The UPSERT serializes parallel attempts for the same username. Errors are
  -- returned as JSON so the rate-limit update is committed on failed logins.
  insert into voting_private.admin_login_attempts
    (username_hash, window_started_at, attempt_count)
  values (v_username_hash, now(), 1)
  on conflict (username_hash) do update set
    attempt_count = case
      when voting_private.admin_login_attempts.window_started_at < now() - interval '1 minute' then 1
      else voting_private.admin_login_attempts.attempt_count + 1
    end,
    window_started_at = case
      when voting_private.admin_login_attempts.window_started_at < now() - interval '1 minute' then now()
      else voting_private.admin_login_attempts.window_started_at
    end
  returning attempt_count into v_attempts;

  if v_attempts > 10 then
    return jsonb_build_object('error', 'TOO_MANY_ATTEMPTS');
  end if;

  select a.password_hash into v_password_hash
  from voting_private.admins as a
  where a.username = v_username;

  -- Always evaluate bcrypt, including for unknown usernames.
  if v_password_hash is null then
    perform extensions.crypt(p_password, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    return jsonb_build_object('error', 'INVALID_CREDENTIALS');
  end if;
  if extensions.crypt(p_password, v_password_hash) <> v_password_hash then
    return jsonb_build_object('error', 'INVALID_CREDENTIALS');
  end if;

  delete from voting_private.admin_sessions where expires_at <= now();
  delete from voting_private.admin_login_attempts where window_started_at < now() - interval '1 day';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '8 hours';
  insert into voting_private.admin_sessions (token_hash, username, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_username, v_expires_at);

  return jsonb_build_object('token', v_token, 'expiresAt', v_expires_at);
end;
$$;

create or replace function public.get_admin_results(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_logos jsonb;
  v_total bigint;
begin
  if p_session_token is null or p_session_token !~ '^[a-f0-9]{64}$' then
    raise exception 'SESSION_EXPIRED';
  end if;
  if not exists (
    select 1 from voting_private.admin_sessions as s
    where s.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
      and s.expires_at > now()
  ) then
    raise exception 'SESSION_EXPIRED';
  end if;

  -- Calculate totals and rankings from the same database snapshot.
  select
    coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'votes', r.votes) order by r.id), '[]'::jsonb),
    coalesce(sum(r.votes), 0)::bigint
  into v_logos, v_total
  from (
    select l.id, count(v.id) as votes
    from voting_private.logos as l
    left join voting_private.votes as v on v.logo_id = l.id
    group by l.id
  ) as r;
  return jsonb_build_object('totalVotes', v_total, 'logos', v_logos, 'lastUpdated', now());
end;
$$;

create or replace function public.admin_logout(p_session_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_token is not null and length(p_session_token) = 64 then
    delete from voting_private.admin_sessions as s
    where s.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex');
  end if;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default: remove it explicitly.
revoke all on function public.get_voting_status(text) from public, anon, authenticated;
revoke all on function public.cast_vote(integer, text) from public, anon, authenticated;
revoke all on function public.admin_login(text, text) from public, anon, authenticated;
revoke all on function public.get_admin_results(text) from public, anon, authenticated;
revoke all on function public.admin_logout(text) from public, anon, authenticated;

grant execute on function public.get_voting_status(text) to anon, authenticated;
grant execute on function public.cast_vote(integer, text) to anon, authenticated;
grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.get_admin_results(text) to anon, authenticated;
grant execute on function public.admin_logout(text) to anon, authenticated;

commit;
