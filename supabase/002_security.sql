-- انشائے نو: حفاظت۔ 001 کے بعد یہ فائل چلائیں۔
-- اصول: عوامی کنجی صرف نیچے بنے "view" پڑھ سکتی ہے۔ ای میل، نجی لنک، اصل متن
-- اور پیغامات تک رسائی صرف سرور کی خفیہ کنجی سے ہے۔

alter table categories       enable row level security;
alter table writers          enable row level security;
alter table posts            enable row level security;
alter table post_versions    enable row level security;
alter table messages         enable row level security;
alter table contact_messages enable row level security;
alter table pages            enable row level security;
alter table page_versions    enable row level security;
alter table reactions        enable row level security;
alter table rate_hits        enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- عوامی مناظر (صرف محفوظ خانے)
create or replace view public_categories as
  select slug, name, sort_order from categories;

create or replace view public_writers as
  select id, handle, name, bio, avatar_url, published_count, created_at
    from writers
   where status = 'active' and handle is not null;

create or replace view public_pages as
  select slug, title, body, description, in_footer, sort_order, updated_at
    from pages
   where status = 'published';

create or replace view public_posts as
  select p.id, p.short_id, p.title, p.category, p.cover_url, p.body, p.excerpt,
         p.words, p.read_minutes, p.likes, p.search_text, p.published_at, p.updated_at,
         w.handle as writer_handle, w.name as writer_name, w.avatar_url as writer_avatar,
         w.bio as writer_bio, (w.published_count < 3) as writer_is_new
    from posts p
    join writers w on w.id = p.writer_id
   where p.status = 'published'
     and p.published_at <= now()
     and w.status = 'active'
     and w.handle is not null;

grant usage on schema public to anon, authenticated;
grant select on public_categories, public_writers, public_pages, public_posts to anon, authenticated;

-- تصاویر کا عوامی ذخیرہ (اپلوڈ صرف سرور کرتا ہے)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
