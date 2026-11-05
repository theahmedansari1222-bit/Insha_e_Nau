import type { APIRoute } from 'astro';
import { isAdmin, passwordLogin, setSession } from '../../../lib/adminAuth';
import { clientKey, hit } from '../../../lib/ratelimit';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const WRONG = 'ای میل یا پاسورڈ درست نہیں';

export const POST: APIRoute = async ({ request, cookies, url }) => {
  let d: { email?: string; password?: string };
  try {
    d = await request.json();
  } catch {
    return json({ error: 'درخواست درست نہیں' }, 400);
  }
  if (!(await hit(await clientKey(request, 'login'), 8, 900))) {
    return json({ error: 'بہت زیادہ کوششیں۔ پندرہ منٹ بعد دوبارہ کریں۔' }, 429);
  }
  const email = String(d.email ?? '').trim().toLowerCase();
  const password = String(d.password ?? '');
  if (!email || !password || !isAdmin(email)) return json({ error: WRONG }, 401);

  const session = await passwordLogin(email, password);
  if (!session) return json({ error: WRONG }, 401);

  setSession(cookies, session, url.protocol === 'https:');
  return json({ ok: true });
};
