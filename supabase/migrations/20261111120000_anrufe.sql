-- Anruf-Cockpit. Nur neue Spalten und Tabellen. Keine Umbenennung, kein Drop.
-- call_leads sind Betriebe, die noch kein Kontakt sind. Ein Anruf legt sie nicht als Kontakt an.
-- Übernehmen setzt converted_contact_id und verknüpft die bestehenden Anrufe.

alter table public.contacts add column if not exists do_not_call boolean not null default false;
alter table public.contacts add column if not exists sperre_seit timestamptz;

create table if not exists public.call_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  firma text not null,
  person text,
  tel text,
  email text,
  note text,
  do_not_call boolean not null default false,
  sperre_seit timestamptz,
  converted_contact_id uuid references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_leads_ws_created_idx
  on public.call_leads (workspace_id, created_at desc);
create index if not exists call_leads_open_idx
  on public.call_leads (workspace_id, created_at desc)
  where converted_contact_id is null;

create table if not exists public.anrufe (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  lead_id uuid references public.call_leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  result text not null,
  objection text,
  note text,
  next_step text,
  next_date date,
  befund text,
  slot1 text,
  slot2 text,
  zeit text,
  wiedervorlage_id uuid references public.wiedervorlagen(id) on delete set null,
  kal_event_id uuid references public.kal_events(id) on delete set null,
  constraint anrufe_result_chk check (
    result in ('Termin', 'Rückruf', 'Kein Interesse', 'Mailbox/nicht erreicht', 'Sperre')
  ),
  constraint anrufe_target_chk check (contact_id is not null or lead_id is not null)
);

create index if not exists anrufe_ws_contact_idx
  on public.anrufe (workspace_id, contact_id, created_at desc);
create index if not exists anrufe_ws_lead_idx
  on public.anrufe (workspace_id, lead_id, created_at desc);

alter table public.call_leads enable row level security;
alter table public.anrufe enable row level security;

do $$
declare t text;
begin
  foreach t in array array['call_leads', 'anrufe']
  loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (workspace_id = public.get_my_workspace_id()) with check (workspace_id = public.get_my_workspace_id())',
      t, t
    );
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- bot-api liest die Sperre und setzt sie. Status und nächster Schritt nur bei Termin oder Rückruf.
grant select (do_not_call, sperre_seit, status, person, naechster_schritt)
  on public.contacts to service_role;
grant update (do_not_call, sperre_seit, status, naechster_schritt, naechster_schritt_text, updated_at)
  on public.contacts to service_role;

-- Rückruf legt eine Wiedervorlage an, Termin einen Kalendereintrag. Bestehende Spalten, nur Insert.
grant insert (id, workspace_id, kontakt_id, text, datum, done)
  on public.wiedervorlagen to service_role;
grant insert (id, workspace_id, titel, datum, zeit, typ, kontakt_id, notiz)
  on public.kal_events to service_role;
