import type { APIRoute } from 'astro';
import { dbAdmin } from '../../lib/supabase';
import { clientKey, hit } from '../../lib/ratelimit';
import { sha256 } from '../../lib/token';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// پسند: ایک ڈیوائس سے ایک۔ ڈیوائس کی پہچان براؤزر میں بنی بے ترتیب شناخت کا ہیش ہے۔
export const POST: APIRoute = async ({ request }) => {
  let d: { id?: string; device?: string; on?: boolean };
  try {
    d = await request.json();
  } catch {
    return json({ error: 'درخواست درست نہیں' }, 400);
  }
  const sid = String(d.id ?? '');
  const device = String(d.device ?? '');
  if (!/^[a-z0-9]{6,12}$/.test(sid) || device.length < 16 || device.length > 80) {
    return json({ error: 'درخواست درست نہیں' }, 400);
  }
  if (!(await hit(await clientKey(request, 'react'), 60, 3600))) {
    return json({ error: 'تھوڑی دیر بعد کوشش کریں' }, 429);
  }

  const db = dbAdmin();
  const p = await db.from('posts').select('id').eq('short_id', sid).eq('status', 'published').maybeSingle();
  if (!p.data) return json({ error: 'تحریر نہیں ملی' }, 404);

  const who = (await sha256(`dev|${device}`)).slice(0, 32);
  if (d.on) {
    const ins = await db.from('reactions').insert({ post_id: p.data.id, device: who });
    if (ins.error && ins.error.code !== '23505') return json({ error: 'محفوظ نہیں ہو سکا' }, 500);
  } else {
    await db.from('reactions').delete().eq('post_id', p.data.id).eq('device', who);
  }

  const cnt = await db.from('reactions').select('*', { count: 'exact', head: true }).eq('post_id', p.data.id);
  const likes = cnt.count ?? 0;
  await db.from('posts').update({ likes }).eq('id', p.data.id);
  return json({ likes });
};
