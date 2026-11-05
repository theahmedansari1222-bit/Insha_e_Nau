import type { APIRoute } from 'astro';
import { dbAdmin } from '../../lib/supabase';
import { clientKey, hit } from '../../lib/ratelimit';
import { normalizeUrdu } from '../../lib/urdu';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  let d: Record<string, unknown>;
  try {
    d = await request.json();
  } catch {
    return json({ error: 'درخواست درست نہیں' }, 400);
  }
  if (String(d.website ?? '')) return json({ error: 'درخواست رد ہوئی' }, 400);

  if (!(await hit(await clientKey(request, 'contact'), 4, 3600))) {
    return json({ error: 'بہت زیادہ پیغامات۔ تھوڑی دیر بعد کوشش کریں۔' }, 429);
  }

  const name = normalizeUrdu(String(d.name ?? '')).slice(0, 60);
  const email = String(d.email ?? '').trim().toLowerCase().slice(0, 120);
  const body = normalizeUrdu(String(d.body ?? '')).slice(0, 3000);
  if (body.length < 5) return json({ error: 'پیغام لکھیں' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'ای میل درست نہیں' }, 400);

  const ins = await dbAdmin().from('contact_messages').insert({ name, email, body });
  if (ins.error) {
    console.error('contact insert:', ins.error.message);
    return json({ error: 'پیغام نہیں بھیجا جا سکا۔ بعد میں کوشش کریں۔' }, 500);
  }
  return json({ ok: true });
};
