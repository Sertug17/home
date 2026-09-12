create table user_settings (
  owner_key        text primary key,
  country          text,
  display_currency text,
  updated_at       timestamptz not null default now()
);
