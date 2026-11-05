import type { APIRoute } from 'astro';
import { dbAdmin, mediaUrl } from '../../lib/supabase';
import { clientKey, hit } from '../../lib/ratelimit';
import { shortId, trackToken } from '../../lib/token';
import { countWords, makeExcerpt, normalizeUrdu, readMinutes, searchKey } from '../../lib/urdu';
import { plainText } from '../../lib/markdown';
import { getEnv } from '../../lib/env';
import { LIMITS } from '../../lib/site';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const fail = (error: string, status = 400) => json({ error }, status);

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secret = getEnv().TURNSTILE_SECRET;
  if (!secret) return true; // جانچ لگائی نہ ہو تو چھوڑ دیں
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const d = (await r.json()) as { success?: boolean };
    return !!d.success;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  let d: Record<string, unknown>;
  try {
    d = await request.json();
  } catch {
    return fail('درخواست درست نہیں');
  }
  const raw = (k: string) => String(d[k] ?? '');

  // چھپا ہوا خانہ: انسان نہیں بھرتا، مشینیں بھر دیتی ہیں
  if (raw('website')) return fail('درخواست رد ہوئی');

  if (!(await hit(await clientKey(request, 'submit'), 5, 3600))) {
    return fail('بہت زیادہ تحریریں بھیجی گئی ہیں۔ ایک گھنٹے بعد کوشش کریں۔', 429);
  }
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await turnstileOk(raw('turnstile'), ip))) {
    return fail('انسان ہونے کی جانچ پوری نہیں ہوئی۔ صفحہ دوبارہ کھول کر کوشش کریں۔');
  }

  const email = raw('email').trim().toLowerCase().slice(0, 120);
  const name = normalizeUrdu(raw('name')).replace(/\s+/g, ' ').slice(0, LIMITS.nameMax);
  const bio = normalizeUrdu(raw('bio')).slice(0, LIMITS.bioMax);
  const title = normalizeUrdu(raw('title')).replace(/\s+/g, ' ').slice(0, LIMITS.titleMax);
  const bodyRaw = raw('body');
  const body = normalizeUrdu(bodyRaw);
  const category = raw('category');
  const avatar = raw('avatar');
  const cover = raw('cover');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('درست ای میل لکھیں');
  if (name.length < 2) return fail('اپنا نام لکھیں');
  if (title.length < 3) return fail('تحریر کا عنوان لکھیں');
  if (bodyRaw.length > LIMITS.bodyMax) return fail('تحریر بہت لمبی ہے۔ اسے دو حصوں میں بھیجیں۔');
  if (body.length < LIMITS.bodyMin) return fail('تحریر بہت مختصر ہے');
  if (d.agree_own !== true || d.agree_rules !== true) {
    return fail('دونوں اقرار ضروری ہیں: اپنی تحریر اور اشاعت کے اصول');
  }
  // تصویریں صرف ہمارے اپنے ذخیرے کی ہوں
  if (avatar && !avatar.startsWith(mediaUrl('avatars/'))) return fail('تصویر درست نہیں');
  if (cover && !cover.startsWith(mediaUrl('covers/'))) return fail('تصویر درست نہیں');

  const db = dbAdmin();

  const cat = await db.from('categories').select('slug').eq('slug', category).maybeSingle();
  if (!cat.data) return fail('زمرہ منتخب کریں');

  // لکھاری: پہلے سے ہو تو وہی، ورنہ نیا (منتظر حالت میں)
  const found = await db.from('writers').select('id,status,name').eq('email', email).maybeSingle();
  if (found.error) {
    console.error('writer lookup:', found.error.message);
    return fail('اس وقت تحریر قبول نہیں ہو سکی۔ تھوڑی دیر بعد کوشش کریں۔', 500);
  }
  let writer = found.data;
  if (writer?.status === 'blocked') return fail('اس ای میل سے تحریر نہیں بھیجی جا سکتی', 403);

  if (!writer) {
    const ins = await db
      .from('writers')
      .insert({ email, name, bio, avatar_url: avatar || null })
      .select('id,status,name')
      .single();
    if (ins.error) {
      console.error('writer insert:', ins.error.message);
      return fail('اس وقت تحریر قبول نہیں ہو سکی۔ تھوڑی دیر بعد کوشش کریں۔', 500);
    }
    writer = ins.data;
  } else {
    // ایک ساتھ تین سے زیادہ تحریریں جائزے میں نہ ہوں
    const open = await db
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('writer_id', writer.id)
      .in('status', ['submitted', 'returned']);
    if ((open.count ?? 0) >= 3) {
      return fail('آپ کی تین تحریریں پہلے سے جائزے میں ہیں۔ ان پر فیصلہ ہونے دیں۔');
    }
  }

  const words = countWords(body);
  const token = trackToken();
  let created: { id: string } | null = null;

  for (let i = 0; i < 4 && !created; i++) {
    const ins = await db
      .from('posts')
      .insert({
        short_id: shortId(),
        track_token: token,
        writer_id: writer!.id,
        title,
        category,
        cover_url: cover || null,
        body_original: body,
        body,
        excerpt: makeExcerpt(body),
        words,
        read_minutes: readMinutes(words),
        search_text: searchKey(`${title} ${plainText(body)} ${writer!.name}`),
      })
      .select('id')
      .single();
    if (ins.error) {
      if (ins.error.code === '23505') continue; // مختصر لنک ٹکرایا، دوبارہ
      console.error('post insert:', ins.error.message);
      return fail('اس وقت تحریر قبول نہیں ہو سکی۔ تھوڑی دیر بعد کوشش کریں۔', 500);
    }
    created = ins.data;
  }
  if (!created) return fail('اس وقت تحریر قبول نہیں ہو سکی۔ تھوڑی دیر بعد کوشش کریں۔', 500);

  await db.from('post_versions').insert({ post_id: created.id, kind: 'original', title, body });

  return json({ ok: true, token });
};
