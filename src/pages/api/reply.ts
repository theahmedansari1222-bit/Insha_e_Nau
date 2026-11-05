import type { APIRoute } from 'astro';
import { dbAdmin } from '../../lib/supabase';
import { clientKey, hit } from '../../lib/ratelimit';
import { countWords, makeExcerpt, normalizeUrdu, readMinutes, searchKey } from '../../lib/urdu';
import { plainText } from '../../lib/markdown';
import { LIMITS } from '../../lib/site';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const fail = (error: string, status = 400) => json({ error }, status);

// لکھاری کی طرف سے: ایڈیٹر کو پیغام ('message') یا واپس آئی تحریر کی ترمیم ('revise')
export const POST: APIRoute = async ({ request }) => {
  let d: Record<string, unknown>;
  try {
    d = await request.json();
  } catch {
    return fail('درخواست درست نہیں');
  }
  const token = String(d.token ?? '');
  const action = String(d.action ?? '');
  const raw = String(d.body ?? '');
  if (!/^[A-Za-z0-9]{26}$/.test(token)) return fail('لنک درست نہیں', 404);

  if (!(await hit(await clientKey(request, 'reply'), 20, 3600))) {
    return fail('بہت زیادہ پیغامات۔ تھوڑی دیر بعد کوشش کریں۔', 429);
  }

  const db = dbAdmin();
  const found = await db
    .from('posts')
    .select('id,status,title,writers(name)')
    .eq('track_token', token)
    .maybeSingle();
  if (found.error) {
    console.error('reply lookup:', found.error.message);
    return fail('اس وقت درخواست پوری نہیں ہو سکی۔', 500);
  }
  const post = found.data as { id: string; status: string; title: string; writers: { name: string } | null } | null;
  if (!post) return fail('لنک درست نہیں', 404);

  if (action === 'message') {
    const text = normalizeUrdu(raw).slice(0, 1500);
    if (text.length < 2) return fail('پیغام لکھیں');
    const ins = await db.from('messages').insert({ post_id: post.id, sender: 'writer', body: text });
    if (ins.error) return fail('پیغام نہیں بھیجا جا سکا', 500);
    return json({ ok: true });
  }

  if (action === 'revise') {
    if (post.status !== 'returned') return fail('اس وقت ترمیم کی ضرورت نہیں');
    if (raw.length > LIMITS.bodyMax) return fail('تحریر بہت لمبی ہے');
    const body = normalizeUrdu(raw);
    if (body.length < LIMITS.bodyMin) return fail('تحریر بہت مختصر ہے');

    const words = countWords(body);
    const upd = await db
      .from('posts')
      .update({
        body,
        excerpt: makeExcerpt(body),
        words,
        read_minutes: readMinutes(words),
        search_text: searchKey(`${post.title} ${plainText(body)} ${post.writers?.name ?? ''}`),
        status: 'submitted',
      })
      .eq('id', post.id);
    if (upd.error) return fail('ترمیم محفوظ نہیں ہو سکی', 500);

    await db.from('post_versions').insert({ post_id: post.id, kind: 'edit', title: post.title, body });
    await db
      .from('messages')
      .insert({ post_id: post.id, sender: 'writer', body: 'ترمیم شدہ تحریر دوبارہ بھیج دی گئی ہے۔' });
    return json({ ok: true });
  }

  return fail('درخواست درست نہیں');
};
