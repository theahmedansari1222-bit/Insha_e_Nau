import { plainText } from './markdown';

// فون کی بورڈ کے عربی حروف کو اردو حروف میں بدلنا: ي ى ← ی ، ك ← ک ، ه ← ہ
const FIX: Record<string, string> = {
  '\u064A': '\u06CC', // ي → ی
  '\u0649': '\u06CC', // ى → ی
  '\u0643': '\u06A9', // ك → ک
  '\u0647': '\u06C1', // ه → ہ
};

// محفوظ کرنے سے پہلے متن کی صفائی
export function normalizeUrdu(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u064A\u0649\u0643\u0647]/g, (c) => FIX[c])
    .replace(/\u0640/g, '') // کشیدہ
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const toAsciiDigits = (s: string) =>
  s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

export const toUrduDigits = (n: string | number) =>
  String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

// تلاش کی کنجی: اعراب ختم، ہندسے لاطینی، چھوٹے حروف
export function searchKey(s: string): string {
  return toAsciiDigits(normalizeUrdu(s))
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u200C\u200D]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(md: string): number {
  const t = plainText(md);
  return t ? t.split(' ').length : 0;
}

export const readMinutes = (words: number) => Math.max(1, Math.round(words / 160));

const NUM = ['', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو', 'دس'];
export function readLabel(min: number): string {
  const n = min >= 1 && min <= 10 ? NUM[min] : toUrduDigits(min);
  return `${n} منٹ کی تحریر`;
}

export function makeExcerpt(md: string, max = 150): string {
  const t = plainText(md);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut) + '…';
}

const MONTHS = [
  'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون',
  'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر',
];

// پاکستان کے وقت (UTC+5) کے مطابق تاریخ
export function formatDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return `${toUrduDigits(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${toUrduDigits(d.getUTCFullYear())}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ابھی ابھی';
  const m = Math.floor(s / 60);
  if (m < 60) return `${toUrduDigits(m)} منٹ پہلے`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${toUrduDigits(h)} گھنٹے پہلے`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'کل';
  if (d < 7) return `${toUrduDigits(d)} دن پہلے`;
  return formatDate(iso);
}
