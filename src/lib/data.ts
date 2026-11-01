import { db } from './supabase';
import { searchKey } from './urdu';

export type Category = { slug: string; name: string };
export type FooterPage = { slug: string; title: string };
export type PostCard = {
  short_id: string;
  title: string;
  category: string;
  cover_url: string | null;
  excerpt: string;
  read_minutes: number;
  published_at: string;
  writer_handle: string;
  writer_name: string;
  writer_avatar: string | null;
  writer_is_new: boolean;
};
export type Post = PostCard & {
  body: string;
  words: number;
  likes: number;
  updated_at: string;
  writer_bio: string;
};
export type Writer = {
  id: string;
  handle: string;
  name: string;
  bio: string;
  avatar_url: string | null;
  published_count: number;
};
export type PageRow = { slug: string; title: string; body: string; description: string; updated_at: string };

// چھوٹی یادداشت: ایک ہی سوال بار بار ڈیٹا بیس سے نہ پوچھنا پڑے۔
// صرف کامیاب (اور خالی نہ ہونے والا) جواب یاد رکھتی ہے۔
const store = new Map<string, { t: number; v: unknown }>();

export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  const v = await fn();
  if (v !== null && v !== undefined) {
    if (store.size > 300) store.clear();
    store.set(key, { t: Date.now(), v });
  }
  return v;
}

export function forget(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}

export async function run<T>(
  q: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

export const unavailable = () =>
  new Response('خدمت عارضی طور پر دستیاب نہیں۔ تھوڑی دیر بعد کوشش کریں۔', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30' },
  });

export const PAGE_SIZE = 12;

export function pageNum(url: URL): number {
  const n = parseInt(url.searchParams.get('page') ?? '1', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 1;
}

// زمرے اور نیچے کی پٹی: ڈیٹا بیس نہ ملے تو بھی سائٹ کھلی رہے
export async function getCategories(): Promise<Category[]> {
  try {
    return await memo('categories', 5 * 60_000, () =>
      run<Category[]>(db().from('public_categories').select('slug,name').order('sort_order')),
    );
  } catch (e) {
    console.error('categories:', e);
    return [];
  }
}

export async function getFooterPages(): Promise<FooterPage[]> {
  try {
    return await memo('footer-pages', 5 * 60_000, () =>
      run<FooterPage[]>(
        db().from('public_pages').select('slug,title').eq('in_footer', true).order('sort_order'),
      ),
    );
  } catch (e) {
    console.error('footer pages:', e);
    return [];
  }
}

const CARD =
  'short_id,title,category,cover_url,excerpt,read_minutes,published_at,writer_handle,writer_name,writer_avatar,writer_is_new';

type ListOpts = { category?: string; handle?: string; onlyNew?: boolean; page?: number };
type List = { posts: PostCard[]; hasMore: boolean };

// تحریروں کی فہرست (ہوم، زمرہ، لکھاری)
export async function getPosts(o: ListOpts = {}): Promise<List> {
  const page = o.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  const key = `posts:${o.category ?? ''}:${o.handle ?? ''}:${o.onlyNew ? 1 : 0}:${page}`;
  try {
    return await memo(key, 30_000, async () => {
      let q = db()
        .from('public_posts')
        .select(CARD)
        .order('published_at', { ascending: false })
        .range(from, from + PAGE_SIZE);
      if (o.category) q = q.eq('category', o.category);
      if (o.handle) q = q.eq('writer_handle', o.handle);
      if (o.onlyNew) q = q.eq('writer_is_new', true);
      const rows = await run<PostCard[]>(q);
      return { posts: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
    });
  } catch (e) {
    console.error('posts:', e);
    return { posts: [], hasMore: false };
  }
}

// ایک تحریر۔ نہ ملے تو null، ڈیٹا بیس کی غلطی پر استثنا
export async function getPost(shortId: string): Promise<Post | null> {
  if (!/^[a-z0-9]{6,12}$/.test(shortId)) return null;
  return memo(`post:${shortId}`, 60_000, async () => {
    const { data, error } = await db()
      .from('public_posts')
      .select(`${CARD},body,words,likes,updated_at,writer_bio`)
      .eq('short_id', shortId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Post | null;
  });
}

export async function getRelated(category: string, excludeShortId: string, n = 3): Promise<PostCard[]> {
  try {
    return await memo(`related:${category}:${excludeShortId}`, 120_000, () =>
      run<PostCard[]>(
        db()
          .from('public_posts')
          .select(CARD)
          .eq('category', category)
          .neq('short_id', excludeShortId)
          .order('published_at', { ascending: false })
          .limit(n),
      ),
    );
  } catch (e) {
    console.error('related:', e);
    return [];
  }
}

export async function getWriter(handle: string): Promise<Writer | null> {
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return null;
  return memo(`writer:${handle}`, 60_000, async () => {
    const { data, error } = await db()
      .from('public_writers')
      .select('id,handle,name,bio,avatar_url,published_count')
      .eq('handle', handle)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Writer | null;
  });
}

export async function getPage(slug: string): Promise<PageRow | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  return memo(`page:${slug}`, 60_000, async () => {
    const { data, error } = await db()
      .from('public_pages')
      .select('slug,title,body,description,updated_at')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as PageRow | null;
  });
}

// تلاش: عنوان، متن اور لکھاری کے نام میں۔ اعراب اور حروف کی صفائی کے بعد
export async function searchPosts(term: string, page = 1): Promise<List> {
  const key = searchKey(term).slice(0, 60);
  if (key.length < 2) return { posts: [], hasMore: false };
  const pattern = `%${key.replace(/[\\%_]/g, '\\$&')}%`;
  const from = (page - 1) * PAGE_SIZE;
  try {
    const rows = await run<PostCard[]>(
      db()
        .from('public_posts')
        .select(CARD)
        .ilike('search_text', pattern)
        .order('published_at', { ascending: false })
        .range(from, from + PAGE_SIZE),
    );
    return { posts: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  } catch (e) {
    console.error('search:', e);
    return { posts: [], hasMore: false };
  }
}

// آر ایس ایس کے لیے تازہ تحریریں
export async function getFeed(): Promise<PostCard[]> {
  return memo('feed', 120_000, () =>
    run<PostCard[]>(
      db().from('public_posts').select(CARD).order('published_at', { ascending: false }).limit(30),
    ),
  );
}

// سائٹ میپ کے لیے (ہزار تک؛ زیادہ ہونے پر تقسیم کی جائے گی)
export async function getSitemapData() {
  return memo('sitemap', 10 * 60_000, async () => {
    const [posts, writers, pages, cats] = await Promise.all([
      run<{ short_id: string; updated_at: string }[]>(
        db().from('public_posts').select('short_id,updated_at').order('published_at', { ascending: false }).limit(1000),
      ),
      run<{ handle: string }[]>(db().from('public_writers').select('handle').limit(1000)),
      run<{ slug: string; updated_at: string }[]>(db().from('public_pages').select('slug,updated_at')),
      run<Category[]>(db().from('public_categories').select('slug,name')),
    ]);
    return { posts, writers, pages, cats };
  });
}
