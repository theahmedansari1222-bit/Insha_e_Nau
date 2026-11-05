// براؤزر (فون) میں ہی تصویر چھوٹی کرنے کا کوڈ، اپلوڈ سے پہلے۔
// اس سے مفت ذخیرہ دیر تک چلتا ہے اور واٹس ایپ کارڈ بھی ہلکا رہتا ہے۔

export type ImageOpts = {
  maxW: number; // زیادہ سے زیادہ چوڑائی (پکسل)
  maxBytes: number; // زیادہ سے زیادہ سائز
  square?: boolean; // پروفائل کی تصویر: بیچ سے چوکور کاٹنا
  ratioRange?: [number, number]; // چوڑائی÷اونچائی کی حد؛ باہر ہو تو بیچ سے کاٹ دیں
};

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('تصویر تیار نہیں ہو سکی'))), 'image/jpeg', q),
  );

export async function prepareImage(file: File, o: ImageOpts): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('یہ تصویر نہیں کھل سکی۔ جے پیگ یا پی این جی چنیں۔');
  }

  let sx = 0;
  let sy = 0;
  let sw = bmp.width;
  let sh = bmp.height;

  if (o.square) {
    const s = Math.min(sw, sh);
    sx = (sw - s) / 2;
    sy = (sh - s) / 2;
    sw = sh = s;
  } else if (o.ratioRange) {
    const [lo, hi] = o.ratioRange;
    const r = sw / sh;
    if (r > hi) {
      const nw = sh * hi;
      sx = (sw - nw) / 2;
      sw = nw;
    } else if (r < lo) {
      const nh = sw / lo;
      sy = (sh - nh) / 2;
      sh = nh;
    }
  }

  const scale = Math.min(1, o.maxW / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // شفاف پی این جی کے پیچھے سفید
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close();

  let q = 0.86;
  let blob = await toBlob(canvas, q);
  while (blob.size > o.maxBytes && q > 0.4) {
    q -= 0.1;
    blob = await toBlob(canvas, q);
  }
  if (blob.size > o.maxBytes) throw new Error('تصویر بہت بڑی ہے۔ کوئی چھوٹی تصویر چنیں۔');
  return blob;
}
