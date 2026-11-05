import { dbAdmin } from './supabase';
import { sha256 } from './token';

// آئی پی کا ہیش (اصل آئی پی محفوظ نہیں کی جاتی)
export async function clientKey(request: Request, action: string): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
  return `${action}:${(await sha256(`inshaenau|${ip}`)).slice(0, 24)}`;
}

// windowSec سیکنڈ میں limit سے زیادہ بار ہو چکا ہو تو false۔
// ڈیٹا بیس میں خرابی ہو تو صارف کو روکا نہیں جاتا (true)، تاکہ سائٹ بند نہ ہو۔
export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const db = dbAdmin();
    const since = new Date(Date.now() - windowSec * 1000).toISOString();
    const { count, error } = await db
      .from('rate_hits')
      .select('*', { count: 'exact', head: true })
      .eq('key', key)
      .gte('at', since);
    if (error) throw new Error(error.message);
    if ((count ?? 0) >= limit) return false;

    const ins = await db.from('rate_hits').insert({ key });
    if (ins.error) throw new Error(ins.error.message);

    // کبھی کبھار پرانا ریکارڈ صاف کرنا
    if (Math.random() < 0.02) {
      await db.from('rate_hits').delete().lt('at', new Date(Date.now() - 2 * 86400_000).toISOString());
    }
    return true;
  } catch (e) {
    console.error('ratelimit:', e);
    return true;
  }
}
