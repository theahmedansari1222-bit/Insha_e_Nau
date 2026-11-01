import type { APIRoute } from 'astro';
import { getSitemapData, unavailable } from '../lib/data';
import { siteUrl } from '../lib/env';

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const day = (iso?: string) => (iso ? `<lastmod>${iso.slice(0, 10)}</lastmod>` : '');

export const GET: APIRoute = async () => {
  let d;
  try {
    d = await getSitemapData();
  } catch (e) {
    console.error('sitemap:', e);
    return unavailable();
  }
  const base = siteUrl();
  const url = (path: string, lastmod?: string) => `<url><loc>${x(base + path)}</loc>${day(lastmod)}</url>`;

  const urls = [
    url('/'),
    ...d.cats.map((c) => url(`/c/${c.slug}`)),
    ...d.pages.map((p) => url(`/${p.slug}`, p.updated_at)),
    ...d.writers.map((w) => url(`/w/${w.handle}`)),
    ...d.posts.map((p) => url(`/p/${p.short_id}`, p.updated_at)),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
};
