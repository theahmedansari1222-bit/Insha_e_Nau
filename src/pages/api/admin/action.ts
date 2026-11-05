import type { APIRoute } from 'astro';
import { dbAdmin, mediaUrl } from '../../../lib/supabase';
import { countWords, makeExcerpt, normalizeUrdu, readMinutes, searchKey } from '../../../lib/urdu';
import { plainText } from '../../../lib/markdown';
import { LIMITS, RESERVED_HANDLES, RESERVED_SLUGS } from '../../../lib/site';
import { forget } from '../../../lib/data';
import { UUID } from '../../../lib/admin';

type DB = ReturnType<typeof dbAdmin>;
type D = Record<string, any>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const fail = (error: string, status = 400) => json({ error }, status);
const clean = (s: unknown, max: number) => normalizeUrdu(String(s ?? '')).replace(/[ \t]+/g, ' ').slice(0, max);

export const POST: APIRoute = async ({ request, locals }) => {
  if (!(locals as Record<string, unknown>).admin) return fail('لاگ اِن ضروری ہے', 401);

  let d: D;
  try {
    d = await request.json();
  } catch {
    return fail('درخواست درست نہیں');
  }

  const db = dbAdmin();
  try {
    let res: Response;
    switch (String(d.action)) {
      case 'save':
      case 'publish':
      case 'approve':
      case 'return':
      case 'reject':
      case 'unpublish':
      case 'message':
        res = await postAction(db, d);
        break;
      case 'writer':
        res = await writerAction(db, d);
        break;
      case 'page-save':
        res = await pageSave(db, d);
        break;
      case 'page-delete':
        res = await pageDelete(db, d);
        break;
      case 'contact-done': {
        const id = Number(d.id);
        if (!Number.isInteger(id)) return fail('درخواست درست نہیں');
        await db.from('contact_messages').update({ handled: !!d.handled }).eq('id', id);
        res = json({ ok: true });
        break;
      }
      default:
        res = fail('نامعلوم کارروائی');
    }
    forget();
    return res;
  } catch (e) {
    console.error('admin action:', e);
    return fail('کارروائی پوری نہیں ہو سکی', 500);
  }
};

// لکھاری کی معلومات میں تبدیلی کی جانچ اور تیاری
function writerPatch(w: D | undefined): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};
  if (!w) return { patch };
  if (typeof w.name === 'string' && w.name.trim()) {
    const name = clean(w.name, LIMITS.nameMax);
    if (name.length < 2) return { patch, error: 'لکھاری کا نام بہت چھوٹا ہے' };
    patch.name = name;
  }
  if (typeof w.bio === 'string') patch.bio = normalizeUrdu(w.bio).slice(0, LIMITS.bioMax);
  if (typeof w.handle === 'string' && w.handle.trim()) {
    const h = w.handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) return { patch, error: 'ہینڈل: تین سے بیس حروف، صرف انگریزی چھوٹے حروف، ہندسے اور _' };
    if (RESERVED_HANDLES.includes(h)) return { patch, error: 'یہ ہینڈل محفوظ ہے' };
    patch.handle = h;
  }
  if (typeof w.avatar === 'string' && w.avatar) {
    if (!w.avatar.startsWith(mediaUrl('avatars/'))) return { patch, error: 'تصویر درست نہیں' };
    patch.avatar_url = w.avatar;
  } else if (w.removeAvatar) {
    patch.avatar_url = null;
  }
  return { patch };
}

async function postAction(db: DB, d: D): Promise<Response> {
  const id = String(d.id ?? '');
  if (!UUID.test(id)) return fail('درخواست درست نہیں');

  const found = await db
    .from('posts')
    .select('id,title,body,category,cover_url,status,published_at,writer_id,writers(id,name,handle,status)')
    .eq('id', id)
    .maybeSingle();
  if (found.error || !found.data) return fail('تحریر نہیں ملی', 404);
  const post: any = found.data;
  const writer = post.writers as { id: string; name: string; handle: string | null; status: string };
  const action = String(d.action);
  const note = normalizeUrdu(String(d.note ?? '')).slice(0, 2000);
  const addMessage = (body: string) => db.from('messages').insert({ post_id: id, sender: 'editor', body });

  if (action === 'message') {
    if (note.length < 2) return fail('پیغام لکھیں');
    await addMessage(note);
    return json({ ok: true });
  }

  if (action === 'return' || action === 'reject') {
    if (note.length < 5) return fail(action === 'return' ? 'لکھیں کہ کیا تبدیلی چاہیے' : 'مسترد کرنے کی وجہ لکھیں');
    const u = await db
      .from('posts')
      .update({ status: action === 'return' ? 'returned' : 'rejected', editor_note: note })
      .eq('id', id);
    if (u.error) return fail('محفوظ نہیں ہو سکا', 500);
    await addMessage(note);
    return json({ ok: true });
  }

  if (action === 'unpublish') {
    const u = await db.from('posts').update({ status: 'approved', published_at: null }).eq('id', id);
    if (u.error) return fail('محفوظ نہیں ہو سکا', 500);
    return json({ ok: true });
  }

  // save / approve / publish: متن اور معلومات میں ترمیم کے ساتھ
  const title = clean(d.title, LIMITS.titleMax);
  const bodyRaw = String(d.body ?? '');
  const body = normalizeUrdu(bodyRaw);
  if (title.length < 3) return fail('عنوان لکھیں');
  if (bodyRaw.length > LIMITS.bodyMax) return fail('تحریر بہت لمبی ہے');
  if (body.length < LIMITS.bodyMin) return fail('تحریر بہت مختصر ہے');

  const cat = await db.from('categories').select('slug').eq('slug', String(d.category ?? '')).maybeSingle();
  if (!cat.data) return fail('زمرہ منتخب کریں');

  let cover: string | null = post.cover_url;
  const newCover = String(d.cover ?? '');
  if (newCover) {
    if (!newCover.startsWith(mediaUrl('covers/'))) return fail('تصویر درست نہیں');
    cover = newCover;
  } else if (d.removeCover) {
    cover = null;
  }

  const wp = writerPatch(d.writer);
  if (wp.error) return fail(wp.error);
  const handle = (wp.patch.handle as string | undefined) ?? writer.handle;

  if (action === 'publish') {
    if (!handle) return fail('شائع کرنے سے پہلے لکھاری کا ہینڈل لکھیں');
    if (writer.status === 'blocked') return fail('یہ لکھاری بلاک ہے');
  }
  const major = !!d.major && (action === 'publish' || action === 'save');
  if (major && note.length < 5) return fail('بڑی تبدیلی پر لکھاری کے لیے نوٹ لکھنا ضروری ہے');

  if (Object.keys(wp.patch).length) {
    const wu = await db.from('writers').update(wp.patch).eq('id', writer.id);
    if (wu.error) {
      return wu.error.code === '23505'
        ? fail('یہ ہینڈل پہلے سے کسی اور کا ہے')
        : fail('لکھاری کی معلومات محفوظ نہیں ہوئیں', 500);
    }
  }
  const writerName = (wp.patch.name as string | undefined) ?? writer.name;

  const words = countWords(body);
  const patch: Record<string, unknown> = {
    title,
    category: cat.data.slug,
    cover_url: cover,
    body,
    excerpt: makeExcerpt(body),
    words,
    read_minutes: readMinutes(words),
    search_text: searchKey(`${title} ${plainText(body)} ${writerName}`),
  };
  if (action === 'approve') {
    patch.status = 'approved';
    if (note) patch.editor_note = note;
  }
  if (action === 'publish') {
    patch.status = 'published';
    patch.published_at = post.published_at ?? new Date().toISOString();
    patch.major_edit = major;
    patch.editor_note = note;
  }
  if (action === 'save' && major) {
    patch.major_edit = true;
    patch.editor_note = note;
  }

  const pu = await db.from('posts').update(patch).eq('id', id);
  if (pu.error) {
    console.error('post update:', pu.error.message);
    return fail('محفوظ نہیں ہو سکا', 500);
  }

  if (title !== post.title || body !== post.body) {
    await db.from('post_versions').insert({ post_id: id, kind: 'edit', title, body });
  }
  if (action === 'publish' && writer.status === 'pending') {
    await db.from('writers').update({ status: 'active' }).eq('id', writer.id);
  }
  if (note && (action === 'publish' || major)) await addMessage(note);

  return json({ ok: true });
}

async function writerAction(db: DB, d: D): Promise<Response> {
  const id = String(d.id ?? '');
  if (!UUID.test(id)) return fail('درخواست درست نہیں');
  const cur = await db.from('writers').select('id,handle').eq('id', id).maybeSingle();
  if (!cur.data) return fail('لکھاری نہیں ملا', 404);

  const wp = writerPatch(d);
  if (wp.error) return fail(wp.error);
  const patch = wp.patch;
  if (['pending', 'active', 'blocked'].includes(String(d.status))) patch.status = d.status;
  if (typeof d.trusted === 'boolean') patch.trusted = d.trusted;

  const handle = (patch.handle as string | undefined) ?? cur.data.handle;
  if (patch.status === 'active' && !handle) return fail('ہینڈل کے بغیر لکھاری فعال نہیں ہو سکتا');

  const u = await db.from('writers').update(patch).eq('id', id);
  if (u.error) {
    return u.error.code === '23505' ? fail('یہ ہینڈل پہلے سے کسی اور کا ہے') : fail('محفوظ نہیں ہو سکا', 500);
  }
  return json({ ok: true });
}

async function pageSave(db: DB, d: D): Promise<Response> {
  const isNew = !!d.isNew;
  const slug = String(d.slug ?? '').trim().toLowerCase();
  const title = clean(d.title, 120);
  const body = normalizeUrdu(String(d.body ?? '')).slice(0, 60000);
  const description = clean(d.description, 200);
  const status = d.status === 'published' ? 'published' : 'draft';
  const inFooter = !!d.in_footer;

  if (title.length < 2) return fail('صفحے کا عنوان لکھیں');
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return fail('پتا صرف انگریزی چھوٹے حروف، ہندسوں اور ڈیش (-) میں ہو');

  if (isNew) {
    if (RESERVED_SLUGS.includes(slug)) return fail('یہ پتا استعمال نہیں ہو سکتا');
    const exists = await db.from('pages').select('slug').eq('slug', slug).maybeSingle();
    if (exists.data) return fail('اس پتے کا صفحہ پہلے سے موجود ہے');
    const mx = await db.from('pages').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const next = (((mx.data ?? [])[0] as { sort_order?: number } | undefined)?.sort_order ?? 0) + 1;
    const ins = await db
      .from('pages')
      .insert({ slug, title, body, description, status, in_footer: inFooter, is_system: false, sort_order: next });
    if (ins.error) return fail('صفحہ نہیں بن سکا', 500);
  } else {
    const cur = await db.from('pages').select('title,body').eq('slug', slug).maybeSingle();
    if (!cur.data) return fail('صفحہ نہیں ملا', 404);
    if (cur.data.title !== title || cur.data.body !== body) {
      await db.from('page_versions').insert({ slug, title: cur.data.title, body: cur.data.body });
    }
    const upd = await db
      .from('pages')
      .update({ title, body, description, status, in_footer: inFooter })
      .eq('slug', slug);
    if (upd.error) return fail('محفوظ نہیں ہو سکا', 500);
  }
  return json({ ok: true, slug });
}

async function pageDelete(db: DB, d: D): Promise<Response> {
  const slug = String(d.slug ?? '');
  const cur = await db.from('pages').select('is_system').eq('slug', slug).maybeSingle();
  if (!cur.data) return fail('صفحہ نہیں ملا', 404);
  if (cur.data.is_system) return fail('ضروری صفحہ حذف نہیں ہو سکتا');
  const del = await db.from('pages').delete().eq('slug', slug);
  if (del.error) return fail('حذف نہیں ہو سکا', 500);
  return json({ ok: true });
}
