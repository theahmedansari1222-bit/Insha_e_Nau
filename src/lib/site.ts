export const SITE = {
  name: 'انشائے نو',
  tagline: 'نئے لکھاریوں کی اردو تحریریں',
  contactEmail: 'inshaenau@gmail.com',
};

// صفحوں کے پتے جو ایڈمن نئے صفحے کے لیے نہیں رکھ سکتا
export const RESERVED_SLUGS = [
  'admin', 'api', 'write', 'search', 'p', 'w', 'c', 's', 'rss', 'rss.xml',
  'sitemap', 'sitemap.xml', 'robots.txt', 'favicon.svg', 'login', '404', '_astro',
];

// لکھاری کے ہینڈل میں یہ الفاظ نہیں چلیں گے
export const RESERVED_HANDLES = [
  'admin', 'administrator', 'support', 'editor', 'inshaenau', 'root', 'staff', 'team', 'help',
];

export const LIMITS = {
  titleMax: 120,
  bioMax: 300,
  bodyMin: 200,
  bodyMax: 30000,
  nameMax: 60,
};
