-- انشائے نو: ٹیبلیں۔ Supabase کے SQL Editor میں پہلے یہ فائل چلائیں، پھر 002۔

create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;

-- زمرے
create table if not exists categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
  name text not null,
  sort_order int not null default 0
);

-- لکھاری (ای میل کبھی عوام کو نہیں دکھائی جاتی)
create table if not exists writers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null,
  handle text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  bio text not null default '',
  avatar_url text,
  status text not null default 'pending' check (status in ('pending','active','blocked')),
  trusted boolean not null default false,
  published_count int not null default 0,
  created_at timestamptz not null default now()
);

-- تحریریں
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  short_id text not null unique,
  track_token text not null unique,
  writer_id uuid not null references writers(id) on delete restrict,
  title text not null,
  category text not null references categories(slug),
  cover_url text,
  body_original text not null,
  body text not null,
  excerpt text not null default '',
  words int not null default 0,
  read_minutes int not null default 1,
  status text not null default 'submitted'
    check (status in ('submitted','returned','approved','published','rejected')),
  major_edit boolean not null default false,
  editor_note text not null default '',
  likes int not null default 0,
  search_text text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_pub_idx on posts (published_at desc) where status = 'published';
create index if not exists posts_cat_idx on posts (category, published_at desc) where status = 'published';
create index if not exists posts_status_idx on posts (status, created_at desc);
create index if not exists posts_writer_idx on posts (writer_id);
create index if not exists posts_search_idx on posts using gin (search_text extensions.gin_trgm_ops);

-- ہر ایڈٹ کا ورژن (اصل تحریر ہمیشہ محفوظ)
create table if not exists post_versions (
  id bigint generated always as identity primary key,
  post_id uuid not null references posts(id) on delete cascade,
  kind text not null check (kind in ('original','edit')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_versions_idx on post_versions (post_id, created_at desc);

-- ایڈیٹر اور لکھاری کے درمیان پیغامات (نجی لنک والے صفحے پر)
create table if not exists messages (
  id bigint generated always as identity primary key,
  post_id uuid not null references posts(id) on delete cascade,
  sender text not null check (sender in ('writer','editor')),
  body text not null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_idx on messages (post_id, created_at);

-- رابطہ فارم کے پیغامات
create table if not exists contact_messages (
  id bigint generated always as identity primary key,
  name text not null default '',
  email text not null default '',
  body text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ہمارے بارے میں، پرائیویسی وغیرہ
create table if not exists pages (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null,
  body text not null default '',
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  in_footer boolean not null default true,
  is_system boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists page_versions (
  id bigint generated always as identity primary key,
  slug text not null references pages(slug) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- پسند (ایک ڈیوائس سے ایک)
create table if not exists reactions (
  post_id uuid not null references posts(id) on delete cascade,
  device text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, device)
);

-- جعلی بھرتی روکنے کے لیے گنتی
create table if not exists rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_idx on rate_hits (key, at desc);

-- خودکار تازہ وقت
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists posts_updated on posts;
create trigger posts_updated before update on posts for each row execute function set_updated_at();
drop trigger if exists pages_updated on pages;
create trigger pages_updated before update on pages for each row execute function set_updated_at();

-- لکھاری کی شائع شدہ تحریروں کی گنتی ("نیا لکھاری" کے نشان کے لیے)
create or replace function refresh_writer_count() returns trigger language plpgsql as $$
declare wid uuid;
begin
  if tg_op = 'DELETE' then wid := old.writer_id; else wid := new.writer_id; end if;
  update writers
     set published_count = (select count(*) from posts where writer_id = wid and status = 'published')
   where id = wid;
  return null;
end $$;
drop trigger if exists posts_count_trg on posts;
create trigger posts_count_trg after insert or update of status or delete on posts
  for each row execute function refresh_writer_count();

-- ابتدائی ڈیٹا
insert into categories (slug, name, sort_order) values
  ('afsana', 'افسانہ', 1),
  ('nasr', 'نثر', 2),
  ('shairi', 'شاعری', 3),
  ('yaadein', 'یادیں', 4),
  ('mizah', 'مزاح', 5)
on conflict (slug) do nothing;

insert into pages (slug, title, status, in_footer, is_system, sort_order) values
  ('about', 'ہمارے بارے میں', 'draft', true, true, 1),
  ('rules', 'اشاعت کے اصول', 'draft', true, true, 2),
  ('privacy', 'پرائیویسی پالیسی', 'draft', true, true, 3),
  ('terms', 'شرائط', 'draft', true, true, 4),
  ('contact', 'رابطہ', 'published', true, true, 5)
on conflict (slug) do nothing;
