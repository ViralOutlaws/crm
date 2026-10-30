-- Kundennummern KD-10001 und Belegnummern RE/AN/GS-Jahr-1001.
-- Bestehende Angebots- und Rechnungsnummern (z. B. R007) werden nicht angefasst.
-- Neue Spalten und eine Zähltabelle. Keine Umbenennung vorhandener Spalten.

alter table public.contacts add column if not exists kundennummer text;
alter table public.rechnungen add column if not exists leistung_von date;
alter table public.rechnungen add column if not exists leistung_bis date;
alter table public.rechnungen add column if not exists bezug_nr text;
alter table public.rechnungen add column if not exists bezug_label text;

create table if not exists public.doc_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  year int not null,
  last_value int not null,
  primary key (workspace_id, kind, year),
  constraint doc_counters_kind_chk check (kind in ('kunde', 'rechnung', 'angebot', 'gutschrift'))
);

-- Bestehende Kontakte: KD-10001 aufwärts, je Workspace nach created_at.
with ranked as (
  select id,
    row_number() over (
      partition by workspace_id
      order by created_at nulls last, id
    ) as rn
  from public.contacts
  where workspace_id is not null
    and (kundennummer is null or kundennummer !~ '^KD-[0-9]{5}$')
)
update public.contacts c
set kundennummer = 'KD-' || lpad((10000 + r.rn)::text, 5, '0')
from ranked r
where c.id = r.id;

insert into public.doc_counters (workspace_id, kind, year, last_value)
select workspace_id, 'kunde', 0, max(substring(kundennummer from 4)::int)
from public.contacts
where kundennummer ~ '^KD-[0-9]{5}$'
group by workspace_id
on conflict (workspace_id, kind, year) do update
set last_value = greatest(public.doc_counters.last_value, excluded.last_value);

-- Schon vergebene Nummern im neuen Schema anheben. Altnummern wie R007 zählen nicht.
insert into public.doc_counters (workspace_id, kind, year, last_value)
select workspace_id,
  case
    when nr ~ '^AN-' then 'angebot'
    when nr ~ '^GS-' then 'gutschrift'
    else 'rechnung'
  end,
  substring(nr from '^[A-Z]{2}-([0-9]{4})-')::int,
  max(substring(nr from '-([0-9]+)$')::int)
from (
  select workspace_id, nr from public.angebote
  union all
  select workspace_id, nr from public.rechnungen
) issued
where nr ~ '^(RE|AN|GS)-[0-9]{4}-[0-9]+$'
group by 1, 2, 3
on conflict (workspace_id, kind, year) do update
set last_value = greatest(public.doc_counters.last_value, excluded.last_value);

create unique index if not exists contacts_kundennummer_uidx
  on public.contacts (workspace_id, kundennummer);

-- Vergabe in derselben Transaktion wie das Insert, damit ein Abbruch keine Lücke lässt.
create or replace function public.alloc_kunde_nr(p_ws uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_ws is null then
    raise exception 'Kundennummer ohne Workspace';
  end if;
  insert into public.doc_counters (workspace_id, kind, year, last_value)
  values (p_ws, 'kunde', 0, 10000)
  on conflict (workspace_id, kind, year) do nothing;

  update public.doc_counters
  set last_value = last_value + 1
  where workspace_id = p_ws and kind = 'kunde' and year = 0
  returning last_value into n;

  return 'KD-' || lpad(n::text, 5, '0');
end;
$$;

create or replace function public.alloc_doc_nr(p_ws uuid, p_kind text, p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  prefix text;
  candidate text;
  taken boolean;
  spins int := 0;
begin
  if p_ws is null then
    raise exception 'Belegnummer ohne Workspace';
  end if;
  if p_kind not in ('rechnung', 'angebot', 'gutschrift') then
    raise exception 'Unbekannte Belegart';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Ungültiges Belegjahr';
  end if;
  prefix := case p_kind when 'rechnung' then 'RE' when 'angebot' then 'AN' else 'GS' end;

  insert into public.doc_counters (workspace_id, kind, year, last_value)
  values (p_ws, p_kind, p_year, 1000)
  on conflict (workspace_id, kind, year) do nothing;

  loop
    spins := spins + 1;
    if spins > 50 then
      raise exception 'Keine freie Belegnummer';
    end if;

    update public.doc_counters
    set last_value = last_value + 1
    where workspace_id = p_ws and kind = p_kind and year = p_year
    returning last_value into n;

    candidate := prefix || '-' || p_year::text || '-' || lpad(n::text, 4, '0');
    if p_kind = 'angebot' then
      select exists(
        select 1 from public.angebote
        where workspace_id = p_ws and nr = candidate
      ) into taken;
    else
      select exists(
        select 1 from public.rechnungen
        where workspace_id = p_ws and nr = candidate
      ) into taken;
    end if;
    exit when not taken;
  end loop;

  return candidate;
end;
$$;

create or replace function public.peek_doc_numbers(p_year int default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ws uuid := public.get_my_workspace_id();
  v_year int := coalesce(p_year, extract(year from (now() at time zone 'Europe/Berlin'))::int);
  v_rec int;
  v_ang int;
  v_gut int;
begin
  if v_ws is null then
    raise exception 'Kein Workspace';
  end if;
  select last_value + 1 into v_rec from public.doc_counters
    where workspace_id = v_ws and kind = 'rechnung' and year = v_year;
  select last_value + 1 into v_ang from public.doc_counters
    where workspace_id = v_ws and kind = 'angebot' and year = v_year;
  select last_value + 1 into v_gut from public.doc_counters
    where workspace_id = v_ws and kind = 'gutschrift' and year = v_year;
  return jsonb_build_object(
    'year', v_year,
    'rechnung', coalesce(rec, 1001),
    'angebot', coalesce(ang, 1001),
    'gutschrift', coalesce(gut, 1001)
  );
end;
$$;

create or replace function public.set_next_doc_number(p_kind text, p_next int, p_year int default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid := public.get_my_workspace_id();
  v_year int := coalesce(p_year, extract(year from (now() at time zone 'Europe/Berlin'))::int);
  v_last int;
begin
  if v_ws is null then
    raise exception 'Kein Workspace';
  end if;
  if p_kind not in ('rechnung', 'angebot', 'gutschrift') then
    raise exception 'Unbekannte Belegart';
  end if;
  if p_next is null or p_next < 1001 then
    raise exception 'Die nächste Nummer muss mindestens 1001 sein.';
  end if;

  insert into public.doc_counters (workspace_id, kind, year, last_value)
  values (v_ws, p_kind, v_year, 1000)
  on conflict (workspace_id, kind, year) do nothing;

  select last_value into v_last
  from public.doc_counters
  where workspace_id = v_ws and kind = p_kind and year = v_year
  for update;

  if p_next <= v_last then
    raise exception 'Die nächste Nummer muss über % liegen.', v_last;
  end if;

  update public.doc_counters
  set last_value = p_next - 1
  where workspace_id = v_ws and kind = p_kind and year = v_year;

  return p_next;
end;
$$;

create or replace function public.trg_contacts_kundennummer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
  v_issued int;
begin
  if tg_op = 'UPDATE' then
    new.kundennummer := old.kundennummer;
    return new;
  end if;
  if new.kundennummer ~ '^KD-[0-9]{5}$' then
    v_seq := substring(new.kundennummer from 4)::int;
    select last_value into v_issued
    from public.doc_counters
    where workspace_id = new.workspace_id and kind = 'kunde' and year = 0;
    if v_issued is not null and v_seq <= v_issued then
      return new;
    end if;
  end if;
  new.kundennummer := public.alloc_kunde_nr(new.workspace_id);
  return new;
end;
$$;

create or replace function public.trg_doc_nr()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_year int;
  v_seq int;
  v_issued int;
begin
  if tg_table_name = 'angebote' then
    v_kind := 'angebot';
  elsif new.r_typ = 'gutschrift' then
    v_kind := 'gutschrift';
  else
    v_kind := 'rechnung';
  end if;

  if tg_op = 'UPDATE' then
    if old.nr is not null and btrim(old.nr) <> '' then
      new.nr := old.nr;
    end if;
    return new;
  end if;

  v_year := extract(year from coalesce(new.datum, (now() at time zone 'Europe/Berlin')::date))::int;

  if new.nr is not null and btrim(new.nr) <> '' then
    -- Altnummern wie R0001 bleiben, auch wenn sie doppelt vorkommen.
    -- Neue Belege lassen nr leer, damit hier nicht eine R0008 hängen bleibt.
    if new.nr ~ '^(RE|AN|GS)-[0-9]{4}-[0-9]+$' then
      v_seq := substring(new.nr from '-([0-9]+)$')::int;
      select c.last_value into v_issued
      from public.doc_counters c
      where c.workspace_id = new.workspace_id and c.kind = v_kind and c.year = v_year;
      if v_issued is null or v_seq > v_issued then
        raise exception 'Die Belegnummer wird automatisch vergeben und ist danach fest.';
      end if;
      if tg_table_name = 'angebote' then
        if exists (
          select 1 from public.angebote a
          where a.workspace_id = new.workspace_id and a.nr = new.nr and a.id is distinct from new.id
        ) then
          raise exception 'Diese Belegnummer ist schon vergeben.';
        end if;
      elsif exists (
        select 1 from public.rechnungen r
        where r.workspace_id = new.workspace_id and r.nr = new.nr and r.id is distinct from new.id
      ) then
        raise exception 'Diese Belegnummer ist schon vergeben.';
      end if;
    end if;
    return new;
  end if;

  new.nr := public.alloc_doc_nr(new.workspace_id, v_kind, v_year);
  return new;
end;
$$;

drop trigger if exists trg_contacts_kundennummer on public.contacts;
create trigger trg_contacts_kundennummer
  before insert or update on public.contacts
  for each row execute function public.trg_contacts_kundennummer();

drop trigger if exists trg_angebote_nr on public.angebote;
create trigger trg_angebote_nr
  before insert or update on public.angebote
  for each row execute function public.trg_doc_nr();

drop trigger if exists trg_rechnungen_nr on public.rechnungen;
create trigger trg_rechnungen_nr
  before insert or update on public.rechnungen
  for each row execute function public.trg_doc_nr();

alter table public.doc_counters enable row level security;
drop policy if exists doc_counters_select on public.doc_counters;
create policy doc_counters_select on public.doc_counters
  for select to authenticated
  using (workspace_id = public.get_my_workspace_id());

revoke all on public.doc_counters from anon;
grant select on public.doc_counters to authenticated;
grant all on public.doc_counters to service_role;

revoke all on function public.alloc_kunde_nr(uuid) from public, anon, authenticated;
revoke all on function public.alloc_doc_nr(uuid, text, int) from public, anon, authenticated;
grant execute on function public.alloc_kunde_nr(uuid) to service_role;
grant execute on function public.alloc_doc_nr(uuid, text, int) to service_role;

revoke all on function public.peek_doc_numbers(int) from public, anon;
revoke all on function public.set_next_doc_number(text, int, int) from public, anon;
grant execute on function public.peek_doc_numbers(int) to authenticated, service_role;
grant execute on function public.set_next_doc_number(text, int, int) to authenticated, service_role;

revoke all on function public.trg_contacts_kundennummer() from public, anon;
revoke all on function public.trg_doc_nr() from public, anon;
grant execute on function public.trg_contacts_kundennummer() to authenticated, service_role;
grant execute on function public.trg_doc_nr() to authenticated, service_role;

-- Nur das neue Schema. R0001 darf doppelt bleiben und wird nicht umgeschrieben.
create unique index if not exists angebote_nr_new_uidx
  on public.angebote (workspace_id, nr)
  where nr ~ '^(RE|AN|GS)-[0-9]{4}-[0-9]+$';

create unique index if not exists rechnungen_nr_new_uidx
  on public.rechnungen (workspace_id, nr)
  where nr ~ '^(RE|AN|GS)-[0-9]{4}-[0-9]+$';

create or replace function public.trg_rechnung_archiv_jahr()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(new.archiviert, false)
     and not coalesce(old.archiviert, false)
     and new.datum is not null
     and extract(year from new.datum) = extract(year from (now() at time zone 'Europe/Berlin'))
  then
    raise exception 'Rechnungen des laufenden Jahres bleiben sichtbar';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rechnung_archiv_jahr on public.rechnungen;
create trigger trg_rechnung_archiv_jahr
  before update on public.rechnungen
  for each row execute function public.trg_rechnung_archiv_jahr();

revoke all on function public.trg_rechnung_archiv_jahr() from public, anon;
grant execute on function public.trg_rechnung_archiv_jahr() to authenticated, service_role;
