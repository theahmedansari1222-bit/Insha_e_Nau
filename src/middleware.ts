import { defineMiddleware } from 'astro:middleware';
import { clearSession, COOKIE_AT, COOKIE_RT, isAdmin, refreshSession, setSession, userEmail } from './lib/adminAuth';

const noStoreJson = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// کون سے عوامی صفحے چند سیکنڈ کے لیے کیش ہو سکتے ہیں
function cacheable(path: string): boolean {
  if (path === '/' || path === '/rss.xml' || path === '/sitemap.xml') return true;
  if (/^\/(p|w|c)\/[^/]+$/.test(path)) return true;
  // ایڈمن کے بنائے صفحے (about، privacy...) مگر فارم اور تلاش نہیں
  if (/^\/[a-z0-9-]+$/.test(path) && !['/write', '/search', '/contact'].includes(path)) return true;
  return false;
}

async function resolveAdmin(ctx: Parameters<Parameters<typeof defineMiddleware>[0]>[0]): Promise<string | null> {
  const at = ctx.cookies.get(COOKIE_AT)?.value;
  if (at) {
    const email = await userEmail(at);
    if (isAdmin(email)) return email;
  }
  const rt = ctx.cookies.get(COOKIE_RT)?.value;
  if (rt) {
    const s = await refreshSession(rt);
    if (s) {
      const email = (s.user?.email || (await userEmail(s.access_token)) || '').toLowerCase();
      if (isAdmin(email)) {
        setSession(ctx.cookies, s, ctx.url.protocol === 'https:');
        return email;
      }
    }
  }
  return null;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const inAdmin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');

  if (inAdmin) {
    const isAuthPage = path === '/admin/login' || path === '/api/admin/login' || path === '/api/admin/logout';
    if (!isAuthPage) {
      let email: string | null = null;
      try {
        email = await resolveAdmin(ctx);
      } catch (e) {
        console.error('admin auth:', e);
      }
      if (!email) {
        if (path.startsWith('/api/')) return noStoreJson('لاگ اِن ضروری ہے', 401);
        clearSession(ctx.cookies);
        return ctx.redirect('/admin/login');
      }
      (ctx.locals as Record<string, unknown>).admin = { email };
    }
    const res = await next();
    try {
      res.headers.set('Cache-Control', 'no-store');
    } catch {
      /* ہیڈر بدلا نہیں جا سکا */
    }
    return res;
  }

  // عوامی صفحوں کا مختصر کیش (ایک منٹ): ڈیٹا بیس پر بوجھ کم، صفحہ تیز
  if (ctx.request.method === 'GET' && cacheable(path) && typeof caches !== 'undefined') {
    let cache: Cache | null = null;
    try {
      cache = (caches as unknown as { default: Cache }).default;
    } catch {
      cache = null;
    }
    if (cache) {
      const key = new Request(ctx.url.toString(), { method: 'GET' });
      try {
        const hit = await cache.match(key);
        if (hit) return hit;
      } catch (e) {
        console.error('cache match:', e);
      }
      const res = await next();
      if (res.status === 200 && (res.headers.get('Cache-Control') || '').includes('max-age')) {
        try {
          await cache.put(key, res.clone());
        } catch (e) {
          console.error('cache put:', e);
        }
      }
      return res;
    }
  }
  return next();
});
