import type { APIRoute } from 'astro';
import { dbAdmin } from '../../../lib/supabase';

// سپابیس کے مفت پلان میں خودکار بیک اپ نہیں ہوتا، اس لیے یہاں سے پورا ڈیٹا ڈاؤن لوڈ کر کے رکھیں
async function fetchAll(table: string): Promise<unknown[]> {
  const db = dbAdmin();
  const out: unknown[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!(locals as Record<string, unknown>).admin) return new Response('لاگ اِن ضروری ہے', { status: 401 });
  try {
    const tables = ['categories', 'writers', 'posts', 'post_versions', 'messages', 'contact_messages', 'pages', 'page_versions'];
    const result: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) result[t] = await fetchAll(t);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(result, null, 1), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="inshaenau-backup-${day}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('export:', e);
    return new Response('بیک اپ تیار نہیں ہو سکا', { status: 500 });
  }
};
