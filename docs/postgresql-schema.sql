-- Esquema sugerido para migracion futura a PostgreSQL local

create table fiscal_month (
  id serial primary key,
  month_key varchar(7) unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table execution_account_row (
  id bigserial primary key,
  month_id int not null references fiscal_month(id) on delete cascade,
  account_code varchar(30) not null,
  account_name text not null,
  raw_amount numeric(18,2) not null,
  value_pyg numeric(18,2) not null,
  section_key varchar(80) not null,
  pyg_line_key varchar(80),
  alerts_text text,
  created_at timestamptz not null default now()
);

create table budget_line (
  id bigserial primary key,
  month_id int not null references fiscal_month(id) on delete cascade,
  line_key varchar(80) not null,
  budget numeric(18,2) not null,
  comment text,
  unique(month_id, line_key)
);

create table comparison_line (
  id bigserial primary key,
  month_id int not null references fiscal_month(id) on delete cascade,
  line_key varchar(80) not null,
  budget numeric(18,2),
  real numeric(18,2) not null,
  variation numeric(18,2) not null,
  variation_pct numeric(10,2),
  favorable boolean not null,
  status varchar(20) not null,
  priority varchar(20) not null,
  comment text,
  action_suggested text,
  responsible_suggested text,
  unique(month_id, line_key)
);

create table analysis_note (
  id bigserial primary key,
  month_id int not null references fiscal_month(id) on delete cascade,
  note_type varchar(30) not null, -- summary/findings/action/quality
  content text not null,
  created_at timestamptz not null default now()
);