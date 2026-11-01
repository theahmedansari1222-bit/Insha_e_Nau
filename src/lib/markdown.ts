// سادہ اور محفوظ رینڈرر: پہلے ہر چیز کو "escape" کرتا ہے، پھر صرف چند ٹیگ بناتا ہے۔
// اس لیے باہر کی کسی لائبریری یا الگ صفائی کی ضرورت نہیں۔
//
// سپورٹ: خالی سطر = نیا پیراگراف، اکیلی سطر = اگلی لائن (شاعری کے لیے)
//   ## عنوان   ### ذیلی عنوان   > اقتباس   - فہرست   --- لکیر
//   **موٹا**   [لنک](https://...)

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function inline(s: string): string {
  return esc(s)
    .replace(
      /\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:|\/)[^\s)]{1,500})\)/g,
      '<a href="$2" rel="noopener nofollow">$1</a>',
    )
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  let kind: 'p' | 'ul' | 'q' | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (kind && buf.length) {
      if (kind === 'p') out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
      else if (kind === 'ul') out.push(`<ul>${buf.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
      else out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
    }
    kind = null;
    buf = [];
  };

  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,2}\s+(.+)$/))) {
      flush();
      out.push(`<h2>${inline(m[1])}</h2>`);
      continue;
    }
    if ((m = line.match(/^#{3}\s+(.+)$/))) {
      flush();
      out.push(`<h3>${inline(m[1])}</h3>`);
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      if (kind !== 'q') flush();
      kind = 'q';
      buf.push(m[1]);
      continue;
    }
    if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      if (kind !== 'ul') flush();
      kind = 'ul';
      buf.push(m[1]);
      continue;
    }
    if (kind !== 'p') flush();
    kind = 'p';
    buf.push(line);
  }
  flush();
  return out.join('\n');
}

// نشانیوں کے بغیر سادہ متن (الفاظ گننے اور خلاصے کے لیے)
export function plainText(src: string): string {
  return src
    .replace(/\r/g, '')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
