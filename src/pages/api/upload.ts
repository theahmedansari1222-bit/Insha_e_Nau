import type { APIRoute } from 'astro';
import { dbAdmin, mediaUrl } from '../../lib/supabase';
import { clientKey, hit } from '../../lib/ratelimit';
import { randomString } from '../../lib/token';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// فائل کا اصل قسم اس کے شروع کے بائٹس سے پہچاننا (نام یا اعلان پر بھروسا نہیں)
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await hit(await clientKey(request, 'upload'), 20, 3600))) {
    return json({ error: 'بہت زیادہ تصاویر بھیجی گئیں۔ ایک گھنٹے بعد کوشش کریں۔' }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'درخواست درست نہیں' }, 400);
  }

  const file = form.get('file');
  const kind = form.get('kind');
  if (!(file instanceof File) || (kind !== 'cover' && kind !== 'avatar')) {
    return json({ error: 'درخواست درست نہیں' }, 400);
  }
  if (file.size > 1_000_000) return json({ error: 'تصویر بہت بڑی ہے' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return json({ error: 'صرف جے پیگ، پی این جی یا ویب پی تصویر چلے گی' }, 415);

  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${kind}s/${randomString(20)}.${ext}`;

  const { error } = await dbAdmin()
    .storage.from('media')
    .upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) {
    console.error('upload:', error.message);
    return json({ error: 'تصویر اپلوڈ نہیں ہو سکی' }, 500);
  }
  return json({ url: mediaUrl(path) });
};
