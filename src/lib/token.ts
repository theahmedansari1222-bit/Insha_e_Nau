const SHORT = 'abcdefghjkmnpqrstuvwxyz23456789';
const LONG = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomString(len: number, alphabet = SHORT): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

// تحریر کا مختصر لنک: site.com/p/k8f2x9ab
export const shortId = () => randomString(8);

// لکھاری کا نجی لنک: site.com/s/<یہ>۔ اندازہ لگانا ناممکن حد تک مشکل
export const trackToken = () => randomString(26, LONG);

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
