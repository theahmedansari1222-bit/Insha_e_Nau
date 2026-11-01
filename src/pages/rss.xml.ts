import type { APIRoute } from 'astro';
import { getFeed, unavailable } from '../lib/data';
import { siteUrl } from '../lib/env';
import { SITE } from '../lib/site';

const x = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  let posts;
  try {
    posts = await getFeed();
  } catch (e) {
    console.error('rss:', e);
    return unavailable();
  }
  const base = siteUrl();
  const items = posts
    .map((p) => {
      const link = `${base}/p/${p.short_id}`;
      return `<item>
<title>${x(p.title)}</title>
<link>${link}</link>
<guid isPermaLink="true">${link}</guid>
<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
<author>${x(p.writer_name)}</author>
<description>${x(p.excerpt)}</description>
</item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${x(SITE.name)}</title>
<link>${base}</link>
<description>${x(SITE.tagline)}</description>
<language>ur</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
