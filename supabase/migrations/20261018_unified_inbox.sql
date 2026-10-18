-- Sascha AI Unified Inbox MVP
-- Stores user-supplied conversation data by account. No Vinted authentication,
-- scraping, proxy setup or unattended Vinted sync is performed by this migration.
create table if not exists public.inbox_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  vinted_username text check (vinted_username is null or length(vinted_username) <= 80),
  platform text not null default 'vinted' check (platform = 'vinted'),
  connection_status text not null default 'manual' check (connection_status in ('manual','connected','error')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists inbox_accounts_user_idx on public.inbox_accounts (user_id, created_at);

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  external_thread_id text,
  participant_name text not null check (length(trim(participant_name)) between 1 and 120),
  item_title text,
  source_url text,
  last_message_at timestamptz,
  is_unread boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id, account_id),
  constraint inbox_thread_account_owned foreign key (account_id,user_id)
    references public.inbox_accounts(id,user_id) on delete cascade,
  constraint inbox_thread_url_valid check (
    source_url is null or source_url = '' or (
      length(source_url) <= 2048 and
      (source_url like 'https://www.vinted.de/%' or source_url like 'https://vinted.de/%')
    )
  )
);
create index if not exists inbox_threads_owner_updated_idx
  on public.inbox_threads (user_id,last_message_at desc nulls last);
create index if not exists inbox_threads_account_idx on public.inbox_threads (account_id,user_id);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  thread_id uuid not null,
  direction text not null check (direction in ('incoming','outgoing','system')),
  message_text text not null check (length(trim(message_text)) between 1 and 10000),
  external_message_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint inbox_message_thread_owned foreign key (thread_id,user_id,account_id)
    references public.inbox_threads(id,user_id,account_id) on delete cascade
);
create index if not exists inbox_messages_thread_date_idx
  on public.inbox_messages (thread_id,sent_at asc);

alter table public.inbox_accounts enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

grant select,insert,update,delete on public.inbox_accounts to authenticated;
grant select,insert,update,delete on public.inbox_threads to authenticated;
grant select,insert,update,delete on public.inbox_messages to authenticated;

drop policy if exists accounts_own_all on public.inbox_accounts;
create policy accounts_own_all on public.inbox_accounts for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists threads_own_all on public.inbox_threads;
create policy threads_own_all on public.inbox_threads for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists messages_own_all on public.inbox_messages;
create policy messages_own_all on public.inbox_messages for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Do not expose these tables to anonymous public clients.
revoke all on public.inbox_accounts from anon;
revoke all on public.inbox_threads from anon;
revoke all on public.inbox_messages from anon;
